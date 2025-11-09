# server/main.py
import json
import os
import shutil
import tempfile
from typing import Optional, Tuple

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
from urllib.parse import urlparse

from .utils_io import save_upload, static_url, ensure_dirs
from .algos.feature.sift_adapter import run as sift_run
from .algos.feature.orb_adapter import run as orb_run
from .algos.feature.surf_adapter import run as surf_run
from .algos.quality.brisque_adapter import run as brisque_run
from .algos.quality.psnr_adapter import run as psnr_run
from .algos.quality.ssim_adapter import compute_ssim
from .algos.matching.bfmatcher_adapter import run as bf_run
from .algos.matching.flannmatcher_adapter import run as flann_run
from .algos.ObjectAlignment.homography_alignment_adapter import run as homography_run
from .algos.ObjectAlignment.AffineTransformEstimation import run as affine_run
from .algos.Classification.otsu_adapter import run as otsu_run  # ✅ Otsu adapter

# cache helpers
from .cache_utils import (
    make_cache_key, feature_paths, metric_json_path, ensure_dir
)

# -------------------------------
# Config paths
# -------------------------------
OUT = os.getenv("N2N_OUT", "/Users/pop/Desktop/project_n2n/outputs")
UPLOAD_DIR = os.path.join(OUT, "uploads")
RESULT_DIR = OUT
ensure_dirs(UPLOAD_DIR, RESULT_DIR)

# -------------------------------
# Helpers
# -------------------------------
def _read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _as_count(x) -> int:
    """รองรับทั้ง list ของ matches หรือจำนวน (int/float/str)"""
    if isinstance(x, list):
        return len(x)
    try:
        return int(x)
    except Exception:
        return 0

# แปลง URL (/static/... หรือ http(s)://.../static/...) -> พาธไฟล์โลคัลใน OUT
def resolve_image_path(p: str) -> str:
    if not p:
        return p
    # ถ้าเป็น URL เต็ม
    if p.startswith("http://") or p.startswith("https://"):
        parsed = urlparse(p)
        path_part = parsed.path or ""
    else:
        path_part = p

    # กรณีเป็นเส้นทางภายใต้ /static/ ให้แมปกลับไป OUT
    if path_part.startswith("/static/"):
        rel = path_part[len("/static/"):]  # ตัด prefix /static/
        return str(Path(OUT, rel))

    # ถ้าพบ /uploads/ ให้ดึงชื่อไฟล์แล้วชี้ไปโฟลเดอร์ UPLOAD_DIR
    if "/uploads/" in path_part:
        name = Path(path_part).name
        return str(Path(UPLOAD_DIR, name))

    # ไม่ใช่ URL/ไม่ใช่เส้นทาง static: ถือว่าเป็นพาธไฟล์อยู่แล้ว
    return p

# -------------------------------
# FastAPI setup
# -------------------------------
app = FastAPI(title="N2N Image API (modular)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# ✅ mount static จาก OUT (จะเสิร์ฟ /static/...)
app.mount("/static", StaticFiles(directory=OUT), name="static")


@app.get("/health")
def health():
    return {"ok": True}

# -------------------------------
# Upload
# -------------------------------
@app.post("/api/upload")
async def api_upload(files: list[UploadFile] = File(...)):
    saved = []
    for f in files:
        path = await save_upload(f, UPLOAD_DIR)
        saved.append({"name": f.filename, "path": path, "url": static_url(path, OUT)})
    return {"files": saved}

# -------------------------------
# Feature (SIFT / ORB / SURF)
# -------------------------------
class FeatureReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

def _feature_cached(tool_name: str, image_path: str, params: Optional[dict]):
    key = make_cache_key(tool_name, files=[image_path], params=params or {})
    subdir = f"{tool_name.lower()}_outputs"
    stem = f"{tool_name.lower()}_{key}"
    json_p, vis_p = feature_paths(RESULT_DIR, subdir, stem)
    return key, subdir, json_p, vis_p

def _return_feature(tool: str, json_path: str, vis_path: Optional[str]):
    return {
        "tool": tool.upper(),
        "json_path": json_path,
        "json_url": static_url(json_path, OUT),
        "vis_url": static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None,
    }

@app.post("/api/feature/sift")
def feature_sift(req: FeatureReq):
    img_path = resolve_image_path(req.image_path)
    key, subdir, json_p, vis_p = _feature_cached("SIFT", img_path, req.params)
    if os.path.exists(json_p):
        return _return_feature("SIFT", json_p, vis_p if os.path.exists(vis_p) else None)

    j, v = sift_run(img_path, RESULT_DIR, **(req.params or {}))
    ensure_dir(os.path.dirname(json_p))
    try:
        if os.path.exists(j):
            os.replace(j, json_p)
        if v and os.path.exists(v):
            os.replace(v, vis_p)
    except Exception:
        return _return_feature("SIFT", j, v)
    return _return_feature("SIFT", json_p, vis_p)

@app.post("/api/feature/orb")
def feature_orb(req: FeatureReq):
    img_path = resolve_image_path(req.image_path)
    key, subdir, json_p, vis_p = _feature_cached("ORB", img_path, req.params)
    if os.path.exists(json_p):
        return _return_feature("ORB", json_p, vis_p if os.path.exists(vis_p) else None)

    j, v = orb_run(img_path, RESULT_DIR, **(req.params or {}))
    ensure_dir(os.path.dirname(json_p))
    try:
        if os.path.exists(j): os.replace(j, json_p)
        if v and os.path.exists(v): os.replace(v, vis_p)
    except Exception:
        return _return_feature("ORB", j, v)
    return _return_feature("ORB", json_p, vis_p)

@app.post("/api/feature/surf")
def feature_surf(req: FeatureReq):
    img_path = resolve_image_path(req.image_path)
    key, subdir, json_p, vis_p = _feature_cached("SURF", img_path, req.params)
    if os.path.exists(json_p):
        return _return_feature("SURF", json_p, vis_p if os.path.exists(vis_p) else None)

    j, v = surf_run(img_path, RESULT_DIR, **(req.params or {}))
    ensure_dir(os.path.dirname(json_p))
    try:
        if os.path.exists(j): os.replace(j, json_p)
        if v and os.path.exists(v): os.replace(v, vis_p)
    except Exception:
        return _return_feature("SURF", j, v)
    return _return_feature("SURF", json_p, vis_p)

# -------------------------------
# Quality (BRISQUE / PSNR / SSIM)
# -------------------------------
from typing import Optional
import hashlib
import tempfile
import shutil
import os
import json
from fastapi import UploadFile, File, HTTPException
from pydantic import BaseModel

class QualityReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

def _sha1_of_file(path: str) -> str:
    """คืนค่า SHA1 ของ 'เนื้อไฟล์' เพื่อให้คีย์คงที่ (ไม่ขึ้นกับ path ชั่วคราว)"""
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

@app.post("/api/quality/brisque")
def quality_brisque(req: QualityReq):
    # แปลง path/url ให้เป็นไฟล์บนดิสก์ก่อน (ฟังก์ชันนี้คุณมีอยู่แล้ว)
    img_path = resolve_image_path(req.image_path)

    # คีย์ = แฮชเนื้อไฟล์ + params (เรียงคีย์)
    h = _sha1_of_file(img_path)
    key = make_cache_key("BRISQUE", files=[h], params=req.params or {})

    out_json = metric_json_path(RESULT_DIR, "brisque_outputs", f"brisque_{key}")
    # ✅ ถ้ามีอยู่แล้ว: อ่าน cache เลย
    if os.path.exists(out_json):
        with open(out_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "tool": "BRISQUE",
            "score": data["quality_score"],
            "json_path": out_json,
            "json_url": static_url(out_json, RESULT_DIR),
            "cache": True,
        }

    # ❌ ยังไม่มี: รัน แล้วค่อยย้ายชื่อให้ deterministic
    j, _ = brisque_run(img_path, RESULT_DIR, **(req.params or {}))
    try:
        if os.path.exists(j):
            os.replace(j, out_json)
        else:
            out_json = j
    except Exception:
        out_json = j

    with open(out_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        "tool": "BRISQUE",
        "score": data["quality_score"],
        "json_path": out_json,
        "json_url": static_url(out_json, RESULT_DIR),
        "cache": False,
    }

@app.post("/api/quality/psnr")
async def quality_psnr(original: UploadFile = File(...), processed: UploadFile = File(...)):
    tmpdir = tempfile.mkdtemp()
    try:
        # 1) เซฟไฟล์อัปโหลดไป temp (ไม่ใช้ path temp ทำคีย์)
        orig_path = os.path.join(tmpdir, original.filename or "a.bin")
        proc_path = os.path.join(tmpdir, processed.filename or "b.bin")
        with open(orig_path, "wb") as f:
            shutil.copyfileobj(original.file, f)
        with open(proc_path, "wb") as f:
            shutil.copyfileobj(processed.file, f)

        # 2) คีย์จากแฮชเนื้อไฟล์ + params ที่คงที่
        h1, h2 = _sha1_of_file(orig_path), _sha1_of_file(proc_path)
        psnr_params = {"use_luma": True}
        key = make_cache_key("PSNR", files=[h1, h2], params=psnr_params)

        out_json = metric_json_path(RESULT_DIR, "psnr_outputs", f"psnr_{key}")
        # ✅ cache hit
        if os.path.exists(out_json):
            with open(out_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {
                "tool": "PSNR",
                "quality_score": data["quality_score"],
                "json_path": out_json,
                "json_url": static_url(out_json, RESULT_DIR),
                "score_interpretation": data.get("score_interpretation"),
                "cache": True,
            }

        # ❌ run แล้วย้ายชื่อให้ deterministic
        j, data = psnr_run(orig_path, proc_path, out_root=RESULT_DIR, use_luma=True)
        try:
            if os.path.exists(j):
                os.replace(j, out_json)
            else:
                out_json = j
        except Exception:
            out_json = j

        return {
            "tool": "PSNR",
            "quality_score": data["quality_score"],
            "json_path": out_json,
            "json_url": static_url(out_json, RESULT_DIR),
            "score_interpretation": data.get("score_interpretation"),
            "cache": False,
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

@app.post("/api/quality/ssim")
async def quality_ssim(original: UploadFile = File(...), processed: UploadFile = File(...)):
    tmpdir = tempfile.mkdtemp()
    try:
        # 1) เซฟไฟล์อัปโหลดไป temp
        orig_path = os.path.join(tmpdir, original.filename or "a.bin")
        proc_path = os.path.join(tmpdir, processed.filename or "b.bin")
        with open(orig_path, "wb") as f:
            f.write(await original.read())
        with open(proc_path, "wb") as f:
            f.write(await processed.read())

        # 2) พารามิเตอร์ที่ "นิ่ง" (อย่าใส่อะไรที่ adapter จะเปลี่ยนอัตโนมัติ)
        default_ssim_params = {
            "data_range": 255,
            "win_size": 11,
            "gaussian_weights": True,
            "sigma": 1.5,
            "use_sample_covariance": True,
            "K1": 0.01,
            "K2": 0.03,
            "calculate_on_color": False,
            # ไม่ใส่ channel_axis / auto-deduced fields ลงใน key
        }

        # 3) คีย์จากแฮชเนื้อไฟล์ + params
        h1, h2 = _sha1_of_file(orig_path), _sha1_of_file(proc_path)
        key = make_cache_key("SSIM", files=[h1, h2], params=default_ssim_params)

        out_json = metric_json_path(RESULT_DIR, "ssim_outputs", f"ssim_{key}")
        # ✅ cache hit
        if os.path.exists(out_json):
            with open(out_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {
                "tool": "SSIM",
                "score": float(data["score"]),
                "json_path": out_json,
                "json_url": static_url(out_json, RESULT_DIR),
                "message": "Higher is better (1.0 = identical)",
                "cache": True,
            }

        # ❌ run แล้วย้ายชื่อให้ deterministic
        result = compute_ssim(
            orig_path, proc_path,
            out_root=RESULT_DIR,
            **default_ssim_params
        )
        try:
            if os.path.exists(result["json_path"]):
                os.replace(result["json_path"], out_json)
            else:
                out_json = result["json_path"]
        except Exception:
            out_json = result["json_path"]

        return {
            "tool": "SSIM",
            "score": float(result["score"]),
            "json_path": out_json,
            "json_url": static_url(out_json, RESULT_DIR),
            "message": "Higher is better (1.0 = identical)",
            "cache": False,
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

# -------------------------------
# Matching (BFMatcher / FLANN)
# -------------------------------
class BFReq(BaseModel):
    json_a: str
    json_b: str
    norm_type: Optional[str] = None
    cross_check: Optional[bool] = None
    lowe_ratio: Optional[float] = None
    ransac_thresh: Optional[float] = 5.0
    draw_mode: Optional[str] = "good"

@app.post("/api/match/bf")
def match_bf(req: BFReq):
    params_for_key = {
        "norm_type": req.norm_type,
        "cross_check": req.cross_check,
        "lowe_ratio": req.lowe_ratio if req.lowe_ratio is not None else "auto",
        "ransac_thresh": req.ransac_thresh if req.ransac_thresh is not None else 5.0,
        "draw_mode": req.draw_mode or "good",
    }
    key = make_cache_key("BF", files=[req.json_a, req.json_b], params=params_for_key)
    stem = f"bf_{key}"
    json_p, vis_p = feature_paths(OUT, "bfmatcher_outputs", stem)

    if os.path.exists(json_p):
        data = _read_json(json_p)
        inliers = int(data.get("inliers", 0))
        good_cnt = _as_count(
            data.get("good_matches", data.get("matching_statistics", {}).get("num_good_matches", 0))
        )
        return {
            "tool": "BFMatcher",
            "description": data.get("matching_statistics", {}).get("summary")
                           or f"{inliers} inliers / {good_cnt} matches",
            "matching_statistics": data.get("matching_statistics", {}),
            "bfmatcher_parameters_used": data.get("bfmatcher_parameters_used", {}),
            "input_features_details": data.get("input_features_details", {}),
            "inputs": data.get("inputs", {}),
            "inliers": inliers,
            "good_matches": good_cnt,
            "vis_url": static_url(vis_p, OUT) if os.path.exists(vis_p) else static_url(data.get("vis_url"), OUT),
            "json_path": json_p,
            "json_url": static_url(json_p, OUT),
        }

    try:
        result = bf_run(
            req.json_a,
            req.json_b,
            OUT,
            lowe_ratio=req.lowe_ratio,
            ransac_thresh=params_for_key["ransac_thresh"],
            norm_override=req.norm_type,
            cross_check=req.cross_check,
            draw_mode=params_for_key["draw_mode"],
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        if result.get("json_path") and os.path.exists(result["json_path"]):
            os.replace(result["json_path"], json_p)
        if result.get("vis_url") and os.path.exists(result["vis_url"]):
            os.replace(result["vis_url"], vis_p)
    except Exception:
        json_p = result.get("json_path", json_p)
        vis_p = result.get("vis_url", vis_p)

    inliers = int(result.get("inliers", 0))
    good_cnt = _as_count(
        result.get("good_matches", result.get("matching_statistics", {}).get("num_good_matches", 0))
    )

    return {
        "tool": "BFMatcher",
        "description": result.get("matching_statistics", {}).get("summary")
                       or f"{inliers} inliers / {good_cnt} matches",
        "matching_statistics": result.get("matching_statistics", {}),
        "bfmatcher_parameters_used": result.get("bfmatcher_parameters_used", {}),
        "input_features_details": result.get("input_features_details", {}),
        "inputs": result.get("inputs", {}),
        "inliers": inliers,
        "good_matches": good_cnt,
        "vis_url": static_url(vis_p, OUT) if os.path.exists(vis_p) else static_url(result.get("vis_url"), OUT),
        "json_path": json_p,
        "json_url": static_url(json_p, OUT),
    }

class FLANNReq(BaseModel):
    json_a: str
    json_b: str
    lowe_ratio: Optional[float] = 0.75
    ransac_thresh: Optional[float] = 5.0
    index_mode: Optional[str] = "AUTO"
    kd_trees: Optional[int] = 5
    search_checks: Optional[int] = 50
    lsh_table_number: Optional[int] = 6
    lsh_key_size: Optional[int] = 12
    lsh_multi_probe_level: Optional[int] = 1
    draw_mode: Optional[str] = "good"
    max_draw: Optional[int] = 50

@app.post("/api/match/flann")
def match_flann(req: FLANNReq):
    params_for_key = {
        "lowe_ratio": req.lowe_ratio if req.lowe_ratio is not None else 0.75,
        "ransac_thresh": req.ransac_thresh if req.ransac_thresh is not None else 5.0,
        "index_mode": req.index_mode or "AUTO",
        "kd_trees": req.kd_trees or 5,
        "search_checks": req.search_checks or 50,
        "lsh_table_number": req.lsh_table_number or 6,
        "lsh_key_size": req.lsh_key_size or 12,
        "lsh_multi_probe_level": req.lsh_multi_probe_level or 1,
        "draw_mode": req.draw_mode or "good",
        "max_draw": req.max_draw if req.max_draw is not None else 50,
    }
    key = make_cache_key("FLANN", files=[req.json_a, req.json_b], params=params_for_key)
    stem = f"flann_{key}"
    json_p, vis_p = feature_paths(OUT, "flannmatcher_outputs", stem)

    if os.path.exists(json_p):
        data = _read_json(json_p)
        inliers = int(data.get("inliers", 0))
        good_cnt = _as_count(
            data.get("good_matches", data.get("matching_statistics", {}).get("num_good_matches", 0))
        )
        return {
            "tool": "FLANNBasedMatcher",
            "description": data.get("matching_statistics", {}).get("summary"),
            "matching_statistics": data.get("matching_statistics", {}),
            "flann_parameters_used": data.get("flann_parameters_used", {}),
            "input_features_details": data.get("input_features_details", {}),
            "inputs": data.get("inputs", {}),
            "inliers": inliers,
            "good_matches": good_cnt,
            "vis_url": static_url(vis_p, OUT) if os.path.exists(vis_p) else static_url(data.get("vis_url"), OUT),
            "json_path": json_p,
            "json_url": static_url(json_p, OUT),
        }

    try:
        result = flann_run(
            req.json_a, req.json_b, OUT,
            lowe_ratio=params_for_key["lowe_ratio"],
            ransac_thresh=params_for_key["ransac_thresh"],
            index_mode=params_for_key["index_mode"],
            kd_trees=params_for_key["kd_trees"],
            search_checks=params_for_key["search_checks"],
            lsh_table_number=params_for_key["lsh_table_number"],
            lsh_key_size=params_for_key["lsh_key_size"],
            lsh_multi_probe_level=params_for_key["lsh_multi_probe_level"],
            draw_mode=params_for_key["draw_mode"],
            max_draw=params_for_key["max_draw"],
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        if result.get("json_path") and os.path.exists(result["json_path"]):
            os.replace(result["json_path"], json_p)
        if result.get("vis_url") and os.path.exists(result["vis_url"]):
            os.replace(result["vis_url"], vis_p)
    except Exception:
        json_p = result.get("json_path", json_p)
        vis_p = result.get("vis_url", vis_p)

    inliers = int(result.get("inliers", 0))
    good_cnt = _as_count(
        result.get("good_matches", result.get("matching_statistics", {}).get("num_good_matches", 0))
    )

    return {
        "tool": "FLANNBasedMatcher",
        "description": result.get("matching_statistics", {}).get("summary"),
        "matching_statistics": result.get("matching_statistics", {}),
        "flann_parameters_used": result.get("flann_parameters_used", {}),
        "input_features_details": result.get("input_features_details", {}),
        "inputs": result.get("inputs", {}),
        "inliers": inliers,
        "good_matches": good_cnt,
        "vis_url": static_url(vis_p, OUT) if os.path.exists(vis_p) else static_url(result.get("vis_url"), OUT),
        "json_path": json_p,
        "json_url": static_url(json_p, OUT),
    }

# -------------------------------
# Alignment
# -------------------------------
class HomographyReq(BaseModel):
    match_json: str
    warp_mode: Optional[str] = "image2_to_image1"
    blend: Optional[bool] = False

@app.post("/api/alignment/homography")
def alignment_homography(req: HomographyReq):
    try:
        result = homography_run(
            req.match_json,
            out_root=OUT,
            warp_mode=req.warp_mode,
            blend=req.blend,
        )
        aligned_path = result.get("output", {}).get("aligned_image")
        if aligned_path:
            result["output"]["aligned_url"] = static_url(aligned_path, OUT)
        if result.get("json_path"):
            result["json_url"] = static_url(result["json_path"], OUT)
        if aligned_path:
            result["output"]["aligned_path"] = aligned_path
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class AffineReq(BaseModel):
    match_json: str
    model: Optional[str] = "affine"
    warp_mode: Optional[str] = "image2_to_image1"
    blend: Optional[bool] = False
    ransac_thresh: Optional[float] = 3.0
    confidence: Optional[float] = 0.99
    refine_iters: Optional[int] = 10

@app.post("/api/alignment/affine")
def alignment_affine(req: AffineReq):
    try:
        result = affine_run(
            match_json_path=req.match_json,
            out_root=OUT,
            model=req.model,
            warp_mode=req.warp_mode,
            blend=req.blend,
            ransac_thresh=req.ransac_thresh,
            confidence=req.confidence,
            refine_iters=req.refine_iters,
        )
        if result.get("output", {}).get("aligned_image"):
            result["output"]["aligned_url"] = static_url(result["output"]["aligned_image"], OUT)
        if result.get("json_path"):
            result["json_url"] = static_url(result["json_path"], OUT)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# -------------------------------
# Classification (Otsu) with cache
# -------------------------------
class OtsuReq(BaseModel):
    image_path: str
    gaussian_blur: Optional[bool] = True
    blur_ksize: Optional[int] = 5
    invert: Optional[bool] = False
    morph_open: Optional[bool] = False
    morph_close: Optional[bool] = False
    morph_kernel: Optional[bool | int] = 3   # รองรับ false/true ผิดพลาด โดยจะ cast ด้านล่าง
    show_histogram: Optional[bool] = False

def _otsu_paths(root: str, stem: str) -> Tuple[str, str, str, str]:
    """
    คืน path แบบ deterministic:
    <root>/features/classification/otsu_outputs/{stem}.json
    <root>/features/classification/otsu_outputs/{stem}.png
    <root>/features/classification/otsu_outputs/{stem}_hist.png
    """
    out_dir = os.path.join(root, "features", "otsu_outputs")
    ensure_dir(out_dir)
    json_p = os.path.join(out_dir, f"{stem}.json")
    bin_p  = os.path.join(out_dir, f"{stem}.png")
    hist_p = os.path.join(out_dir, f"{stem}_hist.png")
    return out_dir, json_p, bin_p, hist_p

def _read_threshold_and_hist(json_path: str):
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            j = json.load(f)
        thr = j.get("threshold_value")
        hist_path = (j.get("output") or {}).get("histogram_path")
        return thr, hist_path
    except Exception:
        return None, None

@app.post("/api/classify/otsu")
def classify_otsu(req: OtsuReq):
    # sanitize morph_kernel (เผื่อมีค่า bool มาจาก front)
    mk = req.morph_kernel
    if isinstance(mk, bool):
        mk = 3
    try:
        mk = int(mk)
    except Exception:
        mk = 3

    img_path = resolve_image_path(req.image_path)

    params_for_key = {
        "gaussian_blur": req.gaussian_blur,
        "blur_ksize": req.blur_ksize,
        "invert": req.invert,
        "morph_open": req.morph_open,
        "morph_close": req.morph_close,
        "morph_kernel": mk,
        "show_histogram": req.show_histogram,
    }
    key = make_cache_key("OTSU", files=[img_path], params=params_for_key)
    stem = f"otsu_{key}"
    out_dir, json_p, bin_p, hist_p = _otsu_paths(RESULT_DIR, stem)

    # ✅ ถ้ามีผลลัพธ์เดิมแล้ว → return cache
    if os.path.exists(json_p) and os.path.exists(bin_p):
        threshold, hist_path = _read_threshold_and_hist(json_p)
        return {
            "tool": "OtsuThreshold",
            "json_path": json_p,
            "json_url": static_url(json_p, OUT),
            "binary_url": static_url(bin_p, OUT),
            "threshold": threshold,
            "histogram_url": static_url(hist_path, OUT) if hist_path and os.path.exists(hist_path) else None,
            "cache": True,
        }

    # ❗ยังไม่มี: รัน adapter (จะเขียนไฟล์แบบสุ่มในโฟลเดอร์เดียวกัน) แล้วเราย้ายเป็นชื่อ deterministic
    try:
        j_tmp, bin_tmp = otsu_run(
            image_path=img_path,
            out_root=RESULT_DIR,
            gaussian_blur=req.gaussian_blur,
            blur_ksize=req.blur_ksize,
            invert=req.invert,
            morph_open=req.morph_open,
            morph_close=req.morph_close,
            morph_kernel=mk,
            show_histogram=req.show_histogram,
        )

        # ย้ายชื่อไฟล์ให้ deterministic
        try:
            if j_tmp and os.path.exists(j_tmp):
                os.replace(j_tmp, json_p)
            if bin_tmp and os.path.exists(bin_tmp):
                os.replace(bin_tmp, bin_p)
        except Exception:
            json_p = j_tmp or json_p
            bin_p  = bin_tmp or bin_p

        threshold, hist_path = _read_threshold_and_hist(json_p)

        return {
            "tool": "OtsuThreshold",
            "json_path": json_p,
            "json_url": static_url(json_p, OUT),
            "binary_url": static_url(bin_p, OUT) if os.path.exists(bin_p) else None,
            "threshold": threshold,
            "histogram_url": static_url(hist_path, OUT) if hist_path and os.path.exists(hist_path) else None,
            "cache": False,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ✅ alias ให้ path เดิมยังใช้ได้
@app.post("/api/classification/otsu")
def classification_otsu(req: OtsuReq):
    return classify_otsu(req)