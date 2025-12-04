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
# 🚀 Config paths (Deploy-Ready)
# -------------------------
# หาตำแหน่งไฟล์ main.py แล้วถอยออก 1 ชั้นเพื่อเจอ root โปรเจกต์
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR) 

# ใช้ Environment Variable ถ้ามี ถ้าไม่มีให้ใช้ folder 'outputs' ในโปรเจกต์
OUT = os.getenv("N2N_OUT", os.path.join(PROJECT_ROOT, "outputs"))

UPLOAD_DIR = os.path.join(OUT, "uploads")
RESULT_DIR = OUT # Adapter จะไปสร้าง subfolder เอง (เช่น features/sift_outputs)
ensure_dirs(UPLOAD_DIR, RESULT_DIR)

# -------------------------
# Helpers
# -------------------------
def _read_json(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _as_count(x) -> int:
    if isinstance(x, list): return len(x)
    try: return int(x)
    except: return 0

# ✅ ฟังก์ชันพระเอก: แปลง URL (/static/... หรือ http...) -> Local Path
def resolve_image_path(p: str) -> str:
    if not p: return p
    
    if p.startswith("http://") or p.startswith("https://"):
        parsed = urlparse(p)
        path_part = parsed.path or ""
    else:
        path_part = p

    # ⚠️ NEW: Logic นี้สำคัญมากสำหรับ Template!
    # แปลง /static/samples/xyz.jpg -> .../outputs/samples/xyz.jpg
    if path_part.startswith("/static/"):
        rel = path_part[len("/static/"):] 
        full_path = os.path.join(OUT, rel.lstrip("/"))
        return str(full_path)

    if "/uploads/" in path_part:
        name = Path(path_part).name
        return str(Path(UPLOAD_DIR, name))

    # กรณีเป็น Path เต็มอยู่แล้ว
    return p


# -------------------------
# FastAPI setup
# -------------------------
app = FastAPI(title="N2N Image API (Deploy Ready)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files เพื่อให้ Frontend ดึงรูปได้
app.mount("/static", StaticFiles(directory=OUT), name="static")


@app.get("/health")
def health():
    return {"status": "ok", "output_dir": OUT}


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

@app.post("/api/feature/sift")
def feature_sift(req: FeatureReq):
    img_path = resolve_image_path(req.image_path)
    # รัน Adapter ตรงๆ (Adapter จะจัดการ Hash/Cache เอง)
    json_path, vis_path = sift_run(img_path, RESULT_DIR, **(req.params or {}))
    
    data = _read_json(json_path)
    return {
        "tool": "SIFT",
        "num_keypoints": data.get("num_keypoints"),
        "descriptor_dim": data.get("descriptor_dim"),
        "sift_parameters_used": data.get("sift_parameters_used"),
        "json_path": json_path,
        "json_url": static_url(json_path, OUT),
        "vis_url": static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None,
    }

@app.post("/api/feature/orb")
def feature_orb(req: FeatureReq):
    img_path = resolve_image_path(req.image_path)
    json_path, vis_path = orb_run(img_path, RESULT_DIR, **(req.params or {}))

    data = _read_json(json_path)
    return {
        "tool": "ORB",
        "num_keypoints": data.get("num_keypoints"),
        "descriptor_dim": data.get("descriptor_dim"),
        "orb_parameters_used": data.get("orb_parameters_used"),
        "json_path": json_path,
        "json_url": static_url(json_path, OUT),
        "vis_url": static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None,
    }

@app.post("/api/feature/surf")
def feature_surf(req: FeatureReq):
    img_path = resolve_image_path(req.image_path)
    json_path, vis_path = surf_run(img_path, RESULT_DIR, **(req.params or {}))

    data = _read_json(json_path)
    return {
        "tool": "SURF",
        "num_keypoints": data.get("num_keypoints"),
        "descriptor_dim": data.get("descriptor_dim"),
        "surf_parameters_used": data.get("surf_parameters_used"),
        "json_path": json_path,
        "json_url": static_url(json_path, OUT),
        "vis_url": static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None,
    }


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

@app.post("/api/quality/brisque")
def quality_brisque(req: QualityReq):
    img_path = resolve_image_path(req.image_path)
    try:
        json_path, data = brisque_run(img_path, out_root=RESULT_DIR)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "tool": "BRISQUE",
        "score": data.get("quality_score"),
        "quality_bucket": data.get("quality_bucket"),
        "json_path": json_path,
        "json_url": static_url(json_path, OUT),
        "message": "Lower score = better perceptual quality",
    }

@app.post("/api/quality/psnr")
def quality_psnr(req: MetricReq):
    p1 = resolve_image_path(req.original_path)
    p2 = resolve_image_path(req.processed_path)
    try:
        json_path, data = psnr_run(p1, p2, out_root=RESULT_DIR, use_luma=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "tool": "PSNR",
        "quality_score": data["quality_score"],
        "json_path": json_path,
        "json_url": static_url(json_path, OUT),
        "score_interpretation": data.get("score_interpretation"),
    }

@app.post("/api/quality/ssim")
def quality_ssim(req: MetricReq):
    p1 = resolve_image_path(req.original_path)
    p2 = resolve_image_path(req.processed_path)
    params = req.params or {}
    
    default_params = {
        "data_range": 255, "win_size": 11, "gaussian_weights": True,
        "sigma": 1.5, "use_sample_covariance": True, "K1": 0.01, "K2": 0.03,
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
    }


# -------------------------
# Matching (BFMatcher / FLANN)
# -------------------------
class MatchReq(BaseModel):
    json_a: str
    json_b: str
    # Params
    norm_type: Optional[str] = None
    cross_check: Optional[bool] = None
    lowe_ratio: Optional[float] = None
    ransac_thresh: Optional[float] = 5.0
    draw_mode: Optional[str] = "good"
    # Flann
    index_mode: Optional[str] = "AUTO"
    kd_trees: Optional[int] = 5
    search_checks: Optional[int] = 50
    lsh_table_number: Optional[int] = 6
    lsh_key_size: Optional[int] = 12
    lsh_multi_probe_level: Optional[int] = 1
    max_draw: Optional[int] = 50

@app.post("/api/match/bf")
def match_bf(req: MatchReq):
    # ✅ FIX: ใช้ resolve_image_path
    json_a = resolve_image_path(req.json_a)
    json_b = resolve_image_path(req.json_b)

    try:
        result = bf_run(
            json_a,
            json_b,
            OUT,
            lowe_ratio=req.lowe_ratio,
            ransac_thresh=req.ransac_thresh,
            norm_override=req.norm_type,
            cross_check=req.cross_check,
            draw_mode=req.draw_mode,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    inliers = int(result.get("inliers", 0))
    good_cnt = _as_count(result.get("good_matches", result.get("matching_statistics", {}).get("num_good_matches", 0)))

    return {
        "tool": "BFMatcher",
        "description": result.get("matching_statistics", {}).get("summary") or f"{inliers} inliers / {good_cnt} matches",
        "matching_statistics": result.get("matching_statistics", {}),
        "vis_url": static_url(result.get("vis_url"), OUT),
        "json_path": result.get("json_path"),
        "json_url": static_url(result.get("json_path"), OUT),
    }

@app.post("/api/match/flann")
def match_flann(req: MatchReq):
    # ✅ FIX: ใช้ resolve_image_path
    json_a = resolve_image_path(req.json_a)
    json_b = resolve_image_path(req.json_b)

    try:
        result = flann_run(
            json_a, json_b, OUT,
            lowe_ratio=req.lowe_ratio or 0.75,
            ransac_thresh=req.ransac_thresh or 5.0,
            index_mode=req.index_mode,
            kd_trees=req.kd_trees,
            search_checks=req.search_checks,
            lsh_table_number=req.lsh_table_number,
            lsh_key_size=req.lsh_key_size,
            lsh_multi_probe_level=req.lsh_multi_probe_level,
            draw_mode=req.draw_mode,
            max_draw=req.max_draw,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    inliers = int(result.get("inliers", 0))
    good_cnt = _as_count(result.get("good_matches", result.get("matching_statistics", {}).get("num_good_matches", 0)))

    return {
        "tool": "FLANNBasedMatcher",
        "description": result.get("matching_statistics", {}).get("summary"),
        "matching_statistics": result.get("matching_statistics", {}),
        "vis_url": static_url(result.get("vis_url"), OUT),
        "json_path": result.get("json_path"),
        "json_url": static_url(result.get("json_path"), OUT),
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
    # ✅ FIX: ใช้ resolve_image_path
    match_json = resolve_image_path(req.match_json)
    
    try:
        result = homography_run(
            match_json,
            out_root=OUT,
            warp_mode=req.warp_mode,
            blend=req.blend,
        )
        if result.get("output", {}).get("aligned_image"):
            result["output"]["aligned_url"] = static_url(result["output"]["aligned_image"], OUT)
        if result.get("json_path"):
            result["json_url"] = static_url(result["json_path"], OUT)
            
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
    # ✅ FIX: ใช้ resolve_image_path
    match_json = resolve_image_path(req.match_json)
    
    try:
        result = affine_run(
            match_json_path=match_json,
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

@app.post("/api/classify/otsu")
def classify_otsu(req: OtsuReq):
    img_path = resolve_image_path(req.image_path)
    
    try:
        # รัน Adapter (Hash/Cache handled inside)
        json_path, bin_path = otsu_run(
            image_path=img_path,
            out_root=RESULT_DIR,
            gaussian_blur=req.gaussian_blur,
            blur_ksize=req.blur_ksize,
            invert=req.invert,
            morph_open=req.morph_open,
            morph_close=req.morph_close,
            morph_kernel=int(req.morph_kernel) if isinstance(req.morph_kernel, (int, str)) else 3,
            show_histogram=req.show_histogram,
        )
        
        data = _read_json(json_path)
        return {
            "tool": "OtsuThreshold",
            "json_path": json_path,
            "json_url": static_url(json_path, OUT),
            "binary_url": static_url(bin_path, OUT) if bin_path else None,
            "threshold": data.get("threshold_value"),
            "histogram_url": static_url(data.get("output", {}).get("histogram_path"), OUT),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# -------------------------
# Segmentation / Snake
# -------------------------
class SnakeReq(BaseModel):
    image_path: str
    alpha: float = 0.015
    beta: float = 10.0
    gamma: float = 0.001
    w_line: float = 0.0
    w_edge: float = 1.0
    max_iterations: int = 250
    convergence: float = 0.1
    init_mode: str = "circle"
    init_cx: Optional[int] = None
    init_cy: Optional[int] = None
    init_radius: Optional[int] = None
    init_points: int = 400
    from_point_x: Optional[float] = None
    from_point_y: Optional[float] = None
    bbox_x1: Optional[float] = None
    bbox_y1: Optional[float] = None
    bbox_x2: Optional[float] = None
    bbox_y2: Optional[float] = None
    gaussian_blur_ksize: int = 5

    class Config:
        extra = "ignore"

@app.post("/api/segmentation/snake")
def segmentation_snake(req: SnakeReq):
    img_path = resolve_image_path(req.image_path)

    try:
        # รัน Adapter (Hash/Cache handled inside)
        json_path, overlay_path, mask_path = snake_run(
            image_path=img_path,
            out_root=RESULT_DIR,
            **req.model_dump(exclude={"image_path"})
        )

        data = _read_json(json_path)
        return {
            "tool": "SnakeActiveContour",
            "json_path": json_path,
            "json_url": static_url(json_path, OUT),
            "overlay_url": static_url(overlay_path, OUT),
            "mask_url": static_url(mask_path, OUT),
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