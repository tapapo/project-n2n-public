# server/routers/quality.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..utils_io import resolve_image_path, OUT, RESULT_DIR, static_url

from server.algos.quality.brisque_adapter import run as brisque_run
from server.algos.quality.psnr_adapter import run as psnr_run
from server.algos.quality.ssim_adapter import compute_ssim

router = APIRouter()


class QualityReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

class MetricReq(BaseModel):
    original_path: str
    processed_path: str
    params: Optional[dict] = None


@router.post("/brisque")
def quality_brisque(req: QualityReq):
    
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_path, data = brisque_run(img_path, out_root=RESULT_DIR)
        return {
            "status": "success",
            "tool": "BRISQUE",
            "score": data.get("quality_score"),
            "quality_bucket": data.get("quality_bucket"),
            "json_url": static_url(json_path, OUT),
            "message": "Lower score = better perceptual quality",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/psnr")
def quality_psnr(req: MetricReq):
   
    p1 = resolve_image_path(req.original_path)
    p2 = resolve_image_path(req.processed_path)
    
    if not os.path.exists(p1) or not os.path.exists(p2):
        raise HTTPException(status_code=404, detail="Original or Processed image not found")

    try:
        json_path, data = psnr_run(p1, p2, out_root=RESULT_DIR, use_luma=True)
        return {
            "status": "success",
            "tool": "PSNR",
            "quality_score": data["quality_score"],
            "score_interpretation": data.get("score_interpretation"),
            "json_url": static_url(json_path, OUT),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/ssim")
def quality_ssim(req: MetricReq):
    
    p1 = resolve_image_path(req.original_path)
    p2 = resolve_image_path(req.processed_path)
    
    if not os.path.exists(p1) or not os.path.exists(p2):
        raise HTTPException(status_code=404, detail="Original or Processed image not found")

    params = req.params or {}
    default_params = {
        "data_range": 255, "win_size": 11, "gaussian_weights": True,
        "sigma": 1.5, "use_sample_covariance": True, "K1": 0.01, "K2": 0.03,
        "calculate_on_color": False,
    }
    final_params = {**default_params, **params}

    try:
        result = compute_ssim(p1, p2, out_root=RESULT_DIR, **final_params)
        return {
            "status": "success",
            "tool": "SSIM",
            "score": float(result["score"]),
            "json_url": static_url(result["json_path"], OUT),
            "message": "Higher is better (1.0 = identical)",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))