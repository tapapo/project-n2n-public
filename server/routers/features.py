# server/routers/features.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ✅ แก้ไข: นำเข้าเครื่องมือจาก utils_io แทนเพื่อป้องกัน Circular Import
from ..utils_io import resolve_image_path, OUT, RESULT_DIR, _read_json, static_url

# นำเข้า Adapters ของหมวด Feature
from server.algos.feature.sift_adapter import run as sift_run
from server.algos.feature.orb_adapter import run as orb_run
from server.algos.feature.surf_adapter import run as surf_run

router = APIRouter()

# --- Schema สำหรับรับข้อมูล ---
class FeatureReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

# --- Endpoints ---

@router.post("/sift")
def feature_sift(req: FeatureReq):
    """SIFT: Scale-Invariant Feature Transform"""
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # รัน SIFT Adapter
        json_path, vis_path = sift_run(img_path, RESULT_DIR, **(req.params or {}))
        
        data = _read_json(json_path)
        return {
            "status": "success",
            "tool": "SIFT",
            "num_keypoints": data.get("num_keypoints"),
            "descriptor_dim": data.get("descriptor_dim"),
            "json_url": static_url(json_path, OUT),
            "vis_url": static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SIFT execution failed: {str(e)}")

@router.post("/orb")
def feature_orb(req: FeatureReq):
    """ORB: Oriented FAST and Rotated BRIEF"""
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # รัน ORB Adapter
        json_path, vis_path = orb_run(img_path, RESULT_DIR, **(req.params or {}))

        data = _read_json(json_path)
        return {
            "status": "success",
            "tool": "ORB",
            "num_keypoints": data.get("num_keypoints"),
            "descriptor_dim": data.get("descriptor_dim"),
            "json_url": static_url(json_path, OUT),
            "vis_url": static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ORB execution failed: {str(e)}")

@router.post("/surf")
def feature_surf(req: FeatureReq):
    """SURF: Speeded-Up Robust Features"""
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # รัน SURF Adapter
        json_path, vis_path = surf_run(img_path, RESULT_DIR, **(req.params or {}))

        data = _read_json(json_path)
        return {
            "status": "success",
            "tool": "SURF",
            "num_keypoints": data.get("num_keypoints"),
            "descriptor_dim": data.get("descriptor_dim"),
            "json_url": static_url(json_path, OUT),
            "vis_url": static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SURF execution failed: {str(e)}")