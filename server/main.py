import json
import os
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import cv2

from .utils_io import save_upload, static_url, ensure_dirs
from .algos.feature.sift_adapter import run as sift_run
from .algos.feature.orb_adapter import run as orb_run
from .algos.feature.surf_adapter import run as surf_run
from .algos.quality.brisque_adapter import run as brisque_run
from .algos.quality.psnr_adapter import run as psnr_run
from .algos.quality.ssim_adapter import compute_ssim
from .algos.matching.bfmatcher_adapter import run as bf_run
from .algos.matching.flannmatcher_adapter import run as flann_run


# -------------------------------
# Config paths
# -------------------------------
ROOT = os.path.dirname(os.path.dirname(__file__))
OUT = os.path.join(ROOT, "outputs")
UPLOAD_DIR = os.path.join(OUT, "uploads")
RESULT_DIR = os.path.join(OUT, "results")
ensure_dirs(UPLOAD_DIR, RESULT_DIR)

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
# Feature (SIFT/ORB/SURF)
# -------------------------------
class FeatureReq(BaseModel):
    image_path: str
    params: dict = {}

@app.post("/api/feature/sift")
def feature_sift(req: FeatureReq):
    j, v = sift_run(req.image_path, RESULT_DIR, **req.params)
    return {"tool": "SIFT", "json_path": j, "json_url": static_url(j, OUT), "vis_url": static_url(v, OUT)}

@app.post("/api/feature/orb")
def feature_orb(req: FeatureReq):
    j, v = orb_run(req.image_path, RESULT_DIR, **req.params)
    return {"tool": "ORB", "json_path": j, "json_url": static_url(j, OUT), "vis_url": static_url(v, OUT)}

@app.post("/api/feature/surf")
def feature_surf(req: FeatureReq):
    j, v = surf_run(req.image_path, RESULT_DIR, **req.params)
    return {"tool": "SURF", "json_path": j, "json_url": static_url(j, OUT), "vis_url": static_url(v, OUT)}

# -------------------------------
# Quality (BRISQUE, PSNR, SSIM)
# -------------------------------
class QualityReq(BaseModel):
    image_path: str
    params: dict = {}

@app.post("/api/quality/brisque")
def quality_brisque(req: QualityReq):
    j, _ = brisque_run(req.image_path, RESULT_DIR, **req.params)
    with open(j) as f:
        data = json.load(f)
    return {
        "tool": "BRISQUE",
        "score": data["quality_score"],
        "json_path": j,
        "json_url": static_url(j, OUT),
    }

@app.post("/api/quality/psnr")
async def quality_psnr(original: UploadFile = File(...), processed: UploadFile = File(...)):
    tmpdir = tempfile.mkdtemp()
    orig_path = os.path.join(tmpdir, original.filename)
    proc_path = os.path.join(tmpdir, processed.filename)

    with open(orig_path, "wb") as f:
        shutil.copyfileobj(original.file, f)
    with open(proc_path, "wb") as f:
        shutil.copyfileobj(processed.file, f)

    try:
        j, data = psnr_run(orig_path, proc_path, out_root=OUT)  # ✅ adapter save JSON
        return {
            "tool": "PSNR",
            "quality_score": data["quality_score"],
            "json_path": j,
            "json_url": static_url(j, OUT),
            "score_interpretation": data["score_interpretation"],
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/quality/ssim")
async def quality_ssim(original: UploadFile = File(...), processed: UploadFile = File(...)):
    try:
        # --- save temp uploads ---
        tmpdir = tempfile.mkdtemp()
        orig_path = os.path.join(tmpdir, original.filename)
        proc_path = os.path.join(tmpdir, processed.filename)

        with open(orig_path, "wb") as f:
            f.write(await original.read())
        with open(proc_path, "wb") as f:
            f.write(await processed.read())

        # --- run SSIM adapter (จะ save JSON อัตโนมัติ) ---
        result = compute_ssim(orig_path, proc_path, out_root=OUT)

        return {
            "tool": "SSIM",
            "score": float(result["score"]),
            "json_path": result["json_path"],
            "json_url": static_url(result["json_path"], OUT),
            "message": "Higher is better (1.0 = identical)"
        }
    except Exception as e:
        return {"error": str(e)}

# -------------------------------
# Matching (BFMatcher)
# -------------------------------
class BFReq(BaseModel):
    json_a: str
    json_b: str
    lowe_ratio: float = 0.75
    ransac_thresh: float = 5.0

@app.post("/api/match/bf")
def match_bf(req: BFReq):
    result = bf_run(
        req.json_a, req.json_b, OUT,  
        lowe_ratio=req.lowe_ratio,
        ransac_thresh=req.ransac_thresh
    )

    inliers = int(result.get("inliers", 0))
    good_matches = result.get("good_matches", [])
    good_count = len(good_matches) if isinstance(good_matches, list) else int(good_matches)

    summary = f"{inliers} inliers / {good_count} matches"

    return {
        "tool": "BFMatcher",
        "description": summary,
        "matching_statistics": result.get("matching_statistics", {}),
        "inliers": inliers,
        "good_matches": good_count,
        "vis_url": static_url(result["vis_url"], OUT),
        "json_path": result.get("json_path"),
        "json_url": static_url(result["json_path"], OUT) if result.get("json_path") else None
    }


class FLANNReq(BaseModel):
    json_a: str
    json_b: str
    lowe_ratio: float = 0.75
    ransac_thresh: float = 5.0

@app.post("/api/match/flann")
def match_flann(req: FLANNReq):
    result = flann_run(
        req.json_a, req.json_b, OUT,   # 👈 ส่ง out_root เข้าไป
        lowe_ratio=req.lowe_ratio,
        ransac_thresh=req.ransac_thresh
    )
    inliers = int(result.get("inliers", 0))
    good_matches = result.get("good_matches", [])
    good_count = len(good_matches) if isinstance(good_matches, list) else int(good_matches)

    return {
        "tool": "FLANNBasedMatcher",
        "description": f"{inliers} inliers / {good_count} matches",
        "matching_statistics": result.get("matching_statistics", {}),
        "inliers": inliers,
        "good_matches": good_count,
        "vis_url": static_url(result["vis_url"], OUT),
        "json_path": result.get("json_path"),
        "json_url": static_url(result["json_path"], OUT) if result.get("json_path") else None
    }