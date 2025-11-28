import os
import json
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from typing import Optional, Tuple, List
import hashlib

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---- Utils ----
from .utils_io import save_upload, static_url, ensure_dirs
from .cache_utils import make_cache_key, feature_paths, metric_json_path, ensure_dir

# ---- Adapters ----
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

from .algos.Classification.otsu_adapter import run as otsu_run
from .algos.Classification.snake_adapter import run as snake_run


# -------------------------
# Config paths
# -------------------------
OUT = os.getenv("N2N_OUT", "/Users/pop/Desktop/project_n2n/outputs")
UPLOAD_DIR = os.path.join(OUT, "uploads")
RESULT_DIR = OUT
ensure_dirs(UPLOAD_DIR, RESULT_DIR)

# -------------------------
# Helpers
# -------------------------
def _read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _as_count(x) -> int:
    if isinstance(x, list):
        return len(x)
    try:
        return int(x)
    except Exception:
        return 0

def _sha1_of_file(path: str) -> str:
    """คืนค่า SHA1 ของ 'เนื้อไฟล์'"""
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

# แปลง URL (/static/... หรือ http...) -> Local Path
def resolve_image_path(p: str) -> str:
    if not p:
        return p
    
    if p.startswith("http://") or p.startswith("https://"):
        parsed = urlparse(p)
        path_part = parsed.path or ""
    else:
        path_part = p

    if path_part.startswith("/static/"):
        rel = path_part[len("/static/"):] 
        return str(Path(OUT, rel))

    if "/uploads/" in path_part:
        name = Path(path_part).name
        return str(Path(UPLOAD_DIR, name))

    return p


# -------------------------
# FastAPI setup
# -------------------------
app = FastAPI(title="N2N Image API (modular)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=OUT), name="static")


@app.get("/health")
def health():
    return {"ok": True}


# -------------------------
# Upload
# -------------------------
@app.post("/api/upload")
async def api_upload(files: list[UploadFile] = File(...)):
    saved = []
    for f in files:
        path = await save_upload(f, UPLOAD_DIR)
        saved.append({"name": f.filename, "path": path, "url": static_url(path, OUT)})
    return {"files": saved}


# -------------------------
# Feature (SIFT / ORB / SURF)
# -------------------------
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
        if os.path.exists(j): os.replace(j, json_p)
        if v and os.path.exists(v): os.replace(v, vis_p)
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


# -------------------------
# Quality (BRISQUE / PSNR / SSIM)
# -------------------------
class QualityReq(BaseModel):
    image_path: str
    params: Optional[dict] = None


class MetricReq(BaseModel):
    original_path: str
    processed_path: str
    params: Optional[dict] = None


# =========================================================
# 🟢 1. BRISQUE (No-reference Image Quality)
# =========================================================
@app.post("/api/quality/brisque")
def quality_brisque(req: QualityReq):
    # 🔹 แปลง URL หรือ /static/... เป็น path จริง
    img_path = resolve_image_path(req.image_path)

    # 🔹 เรียก adapter (ที่อยู่ใน server/algos/quality/brisque_adapter.py)
    try:
        json_path, data = brisque_run(img_path, out_root=RESULT_DIR)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 🔹 ส่งข้อมูลกลับให้ frontend
    return {
        "tool": "BRISQUE",
        "score": data.get("quality_score"),
        "quality_bucket": data.get("quality_bucket"),
        "json_path": json_path,
        "json_url": static_url(json_path, OUT),
        "message": "Lower score = better perceptual quality",
        "cache": False,
    }


# =========================================================
# 🟠 2. PSNR (Full-reference Metric)
# =========================================================
@app.post("/api/quality/psnr")
def quality_psnr(req: MetricReq):
    # แปลง URL เป็น Path จริง
    p1 = resolve_image_path(req.original_path)
    p2 = resolve_image_path(req.processed_path)

    try:
        # เรียก Adapter ตรงๆ
        json_path, data = psnr_run(p1, p2, out_root=RESULT_DIR, use_luma=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "tool": "PSNR",
        "quality_score": data["quality_score"],
        "json_path": json_path,
        "json_url": static_url(json_path, OUT),
        "score_interpretation": data.get("score_interpretation"),
        "cache": False,
    }


# =========================================================
# 🔵 3. SSIM (Full-reference Metric)
# =========================================================
@app.post("/api/quality/ssim")
def quality_ssim(req: MetricReq):
    p1 = resolve_image_path(req.original_path)
    p2 = resolve_image_path(req.processed_path)

    params = req.params or {}
    default_params = {
        "data_range": 255,
        "win_size": 11,
        "gaussian_weights": True,
        "sigma": 1.5,
        "use_sample_covariance": True,
        "K1": 0.01,
        "K2": 0.03,
        "calculate_on_color": False,
    }
    final_params = {**default_params, **params}

    try:
        result = compute_ssim(p1, p2, out_root=RESULT_DIR, **final_params)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "tool": "SSIM",
        "score": float(result["score"]),
        "json_path": result["json_path"],
        "json_url": static_url(result["json_path"], RESULT_DIR),
        "message": "Higher is better (1.0 = identical)",
        "cache": False,
    }

# -------------------------
# Matching (BFMatcher / FLANN)
# -------------------------
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
        if result.get("json_path") and os.path.exists(result["json_path"]): os.replace(result["json_path"], json_p)
        if result.get("vis_url") and os.path.exists(result["vis_url"]):     os.replace(result["vis_url"], vis_p)
    except Exception:
        json_p = result.get("json_path", json_p)
        vis_p  = result.get("vis_url", vis_p)

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
        if result.get("json_path") and os.path.exists(result["json_path"]): os.replace(result["json_path"], json_p)
        if result.get("vis_url") and os.path.exists(result["vis_url"]):     os.replace(result["vis_url"], vis_p)
    except Exception:
        json_p = result.get("json_path", json_p)
        vis_p  = result.get("vis_url", vis_p)

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


# -------------------------
# Alignment
# -------------------------
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


# -------------------------
# Classification (Otsu)
# -------------------------
class OtsuReq(BaseModel):
    image_path: str
    gaussian_blur: Optional[bool] = True
    blur_ksize: Optional[int] = 5
    invert: Optional[bool] = False
    morph_open: Optional[bool] = False
    morph_close: Optional[bool] = False
    morph_kernel: Optional[bool | int] = 3
    show_histogram: Optional[bool] = False

def _otsu_paths(root: str, stem: str) -> Tuple[str, str, str]:
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
    _, json_p, bin_p, _ = _otsu_paths(RESULT_DIR, stem)

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
        try:
            if j_tmp and os.path.exists(j_tmp): os.replace(j_tmp, json_p)
            if bin_tmp and os.path.exists(bin_tmp): os.replace(bin_tmp, bin_p)
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

@app.post("/api/classification/otsu")
def classification_otsu(req: OtsuReq):
    return classify_otsu(req)


# -------------------------
# Segmentation / Snake (Active Contour)
# -------------------------
class SnakeReq(BaseModel):
    image_path: str

    # snake dynamics
    alpha: float = 0.015
    beta: float = 10.0
    gamma: float = 0.001
    w_line: float = 0.0
    w_edge: float = 1.0
    max_iterations: int = 250
    convergence: float = 0.1

    # init
    init_mode: str = "circle"   # "circle" | "point" | "bbox"
    init_cx: Optional[int] = None
    init_cy: Optional[int] = None
    init_radius: Optional[int] = None
    init_points: int = 400

    # point
    from_point_x: Optional[float] = None
    from_point_y: Optional[float] = None

    # bbox
    bbox_x1: Optional[float] = None
    bbox_y1: Optional[float] = None
    bbox_x2: Optional[float] = None
    bbox_y2: Optional[float] = None

    # preprocessing (เหลือแค่เบลอ)
    gaussian_blur_ksize: int = 5

    class Config:
        extra = "ignore"


def _snake_paths(root: str, stem: str) -> tuple[str, str, str]:
    out_dir = os.path.join(root, "features", "snake_outputs")
    ensure_dir(out_dir)
    json_p    = os.path.join(out_dir, f"{stem}.json")
    overlay_p = os.path.join(out_dir, f"{stem}_overlay.png")
    mask_p    = os.path.join(out_dir, f"{stem}_mask.png")
    return json_p, overlay_p, mask_p


@app.post("/api/segmentation/snake")
def segmentation_snake(req: SnakeReq):
    img_path = resolve_image_path(req.image_path)

    params_for_key = req.model_dump()
    params_for_key["image_path"] = img_path
    key  = make_cache_key("SNAKE", files=[img_path], params=params_for_key)
    stem = f"snake_{key}"
    json_p, overlay_p, mask_p = _snake_paths(RESULT_DIR, stem)

    if os.path.exists(json_p) and (os.path.exists(overlay_p) or os.path.exists(mask_p)):
        try:
            data = _read_json(json_p)
        except Exception:
            data = {"tool": "SnakeActiveContour"}
        return {
            "tool": "SnakeActiveContour",
            "json_path": json_p,
            "json_url": static_url(json_p, OUT),
            "overlay_url": static_url(overlay_p, OUT) if os.path.exists(overlay_p) else None,
            "mask_url": static_url(mask_p, OUT) if os.path.exists(mask_p) else None,
            "cache": True,
            "contour_points": (data.get("output") or {}).get("contour_points_xy"),
            "iterations": (data.get("output") or {}).get("iterations"),
        }

    try:
        j_tmp, overlay_tmp, mask_tmp = snake_run(
            image_path=img_path,
            out_root=RESULT_DIR,

            alpha=req.alpha,
            beta=req.beta,
            gamma=req.gamma,
            w_line=req.w_line,
            w_edge=req.w_edge,
            max_iterations=req.max_iterations,
            convergence=req.convergence,

            init_mode=req.init_mode,
            init_cx=req.init_cx,
            init_cy=req.init_cy,
            init_radius=req.init_radius,
            init_points=req.init_points,

            from_point_x=req.from_point_x,
            from_point_y=req.from_point_y,

            bbox_x1=req.bbox_x1,
            bbox_y1=req.bbox_y1,
            bbox_x2=req.bbox_x2,
            bbox_y2=req.bbox_y2,

            gaussian_blur_ksize=req.gaussian_blur_ksize,
        )

        try:
            if j_tmp and os.path.exists(j_tmp):             os.replace(j_tmp, json_p)
            if overlay_tmp and os.path.exists(overlay_tmp): os.replace(overlay_tmp, overlay_p)
            if mask_tmp and os.path.exists(mask_tmp):       os.replace(mask_tmp, mask_p)
        except Exception:
            json_p    = j_tmp or json_p
            overlay_p = overlay_tmp or overlay_p
            mask_p    = mask_tmp or mask_p

        data = _read_json(json_p)
        return {
            "tool": "SnakeActiveContour",
            "json_path": json_p,
            "json_url": static_url(json_p, OUT),
            "overlay_url": static_url(overlay_p, OUT) if os.path.exists(overlay_p) else None,
            "mask_url": static_url(mask_p, OUT) if os.path.exists(mask_p) else None,
            "cache": False,
            "contour_points": (data.get("output") or {}).get("contour_points_xy"),
            "iterations": (data.get("output") or {}).get("iterations"),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/classify/snake")
def classify_snake(req: SnakeReq):
    return segmentation_snake(req)

@app.post("/api/classification/snake")
def classification_snake(req: SnakeReq):
    return segmentation_snake(req)