# server/main.py

import json
import os
import shutil
import tempfile
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .utils_io import save_upload, static_url, ensure_dirs
from .algos.feature.sift_adapter import run as sift_run
from .algos.feature.orb_adapter import run as orb_run
from .algos.feature.surf_adapter import run as surf_run
from .algos.quality.brisque_adapter import run as brisque_run
from .algos.quality.psnr_adapter import run as psnr_run
from .algos.quality.ssim_adapter import compute_ssim
from .algos.matching.bfmatcher_adapter import run as bf_run
from .algos.matching.flannmatcher_adapter import run as flann_run

# cache helpers
from .cache_utils import (
    make_cache_key, feature_paths, metric_json_path, ensure_dir
)

# -------------------------------
# Config paths
# -------------------------------
ROOT = os.path.dirname(os.path.dirname(__file__))
OUT = os.path.join(ROOT, "outputs")
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
    key, subdir, json_p, vis_p = _feature_cached("SIFT", req.image_path, req.params)
    if os.path.exists(json_p):
        return _return_feature("SIFT", json_p, vis_p if os.path.exists(vis_p) else None)

    j, v = sift_run(req.image_path, RESULT_DIR, **(req.params or {}))
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
    key, subdir, json_p, vis_p = _feature_cached("ORB", req.image_path, req.params)
    if os.path.exists(json_p):
        return _return_feature("ORB", json_p, vis_p if os.path.exists(vis_p) else None)

    j, v = orb_run(req.image_path, RESULT_DIR, **(req.params or {}))
    ensure_dir(os.path.dirname(json_p))
    try:
        if os.path.exists(j): os.replace(j, json_p)
        if v and os.path.exists(v): os.replace(v, vis_p)
    except Exception:
        return _return_feature("ORB", j, v)
    return _return_feature("ORB", json_p, vis_p)

@app.post("/api/feature/surf")
def feature_surf(req: FeatureReq):
    key, subdir, json_p, vis_p = _feature_cached("SURF", req.image_path, req.params)
    if os.path.exists(json_p):
        return _return_feature("SURF", json_p, vis_p if os.path.exists(vis_p) else None)

    j, v = surf_run(req.image_path, RESULT_DIR, **(req.params or {}))
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
class QualityReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

@app.post("/api/quality/brisque")
def quality_brisque(req: QualityReq):
    key = make_cache_key("BRISQUE", files=[req.image_path], params=req.params or {})
    out_json = metric_json_path(RESULT_DIR, "brisque_outputs", f"brisque_{key}")
    if os.path.exists(out_json):
        with open(out_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "tool": "BRISQUE",
            "score": data["quality_score"],
            "json_path": out_json,
            "json_url": static_url(out_json, OUT),
        }

    j, _ = brisque_run(req.image_path, RESULT_DIR, **(req.params or {}))
    try:
        if os.path.exists(j):
            os.replace(j, out_json)
    except Exception:
        out_json = j
    with open(out_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        "tool": "BRISQUE",
        "score": data["quality_score"],
        "json_path": out_json,
        "json_url": static_url(out_json, OUT),
    }

@app.post("/api/quality/psnr")
async def quality_psnr(original: UploadFile = File(...), processed: UploadFile = File(...)):
    tmpdir = tempfile.mkdtemp()
    try:
        orig_path = os.path.join(tmpdir, original.filename or "a.bin")
        proc_path = os.path.join(tmpdir, processed.filename or "b.bin")
        with open(orig_path, "wb") as f:
            shutil.copyfileobj(original.file, f)
        with open(proc_path, "wb") as f:
            shutil.copyfileobj(processed.file, f)

        key = make_cache_key("PSNR", files=[orig_path, proc_path], params=None)
        out_json = metric_json_path(OUT, "psnr_outputs", f"psnr_{key}")
        if os.path.exists(out_json):
            with open(out_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {
                "tool": "PSNR",
                "quality_score": data["quality_score"],
                "json_path": out_json,
                "json_url": static_url(out_json, OUT),
                "score_interpretation": data.get("score_interpretation"),
            }

        j, data = psnr_run(orig_path, proc_path, out_root=OUT)
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
            "json_url": static_url(out_json, OUT),
            "score_interpretation": data.get("score_interpretation"),
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

@app.post("/api/quality/ssim")
async def quality_ssim(original: UploadFile = File(...), processed: UploadFile = File(...)):
    tmpdir = tempfile.mkdtemp()
    try:
        orig_path = os.path.join(tmpdir, original.filename or "a.bin")
        proc_path = os.path.join(tmpdir, processed.filename or "b.bin")
        with open(orig_path, "wb") as f:
            f.write(await original.read())
        with open(proc_path, "wb") as f:
            f.write(await processed.read())

        default_ssim_params = {
            'data_range': 255, 'win_size': 11, 'gaussian_weights': True,
            'sigma': 1.5, 'use_sample_covariance': True, 'K1': 0.01, 'K2': 0.03,
            'calculate_on_color': False,
        }
        key = make_cache_key("SSIM", files=[orig_path, proc_path], params=default_ssim_params)
        out_json = metric_json_path(OUT, "ssim_outputs", f"ssim_{key}")
        if os.path.exists(out_json):
            with open(out_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {
                "tool": "SSIM",
                "score": float(data["score"]),
                "json_path": out_json,
                "json_url": static_url(out_json, OUT),
                "message": "Higher is better (1.0 = identical)",
            }

        result = compute_ssim(orig_path, proc_path, out_root=OUT)
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
            "json_url": static_url(out_json, OUT),
            "message": "Higher is better (1.0 = identical)",
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# -------------------------------
# Matching (BFMatcher / FLANN)
# -------------------------------
class BFReq(BaseModel):
    json_a: str
    json_b: str
    norm_type: Optional[str] = None      # 'L2' | 'L1' | 'HAMMING' | 'HAMMING2' | None (AUTO)
    cross_check: Optional[bool] = None   # None = default ตามชนิด descriptor
    lowe_ratio: Optional[float] = None   # ← ให้ None เพื่อ AUTO จริง (ORB=0.8, อื่นๆ=0.75)
    ransac_thresh: Optional[float] = 5.0
    draw_mode: Optional[str] = "good"    # 'good' | 'inliers'

@app.post("/api/match/bf")
def match_bf(req: BFReq):
    # ใช้ "auto" เมื่อ lowe_ratio เป็น None เพื่อแยก cache-key
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

    # cache hit
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

    # run
    try:
        result = bf_run(
            req.json_a,
            req.json_b,
            OUT,
            lowe_ratio=req.lowe_ratio,  # ← ส่ง None ได้ เพื่อให้ adapter auto
            ransac_thresh=params_for_key["ransac_thresh"],
            norm_override=req.norm_type,
            cross_check=req.cross_check,
            draw_mode=params_for_key["draw_mode"],
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # normalize to cache names
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
    index_mode: Optional[str] = "AUTO"   # 'AUTO' | 'KD_TREE' | 'LSH'
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

    # cache hit
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

    # run
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

    # normalize → cache filenames
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