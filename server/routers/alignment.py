# server/routers/alignment.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ✅ แก้ไข: นำเข้าเครื่องมือจาก utils_io แทนเพื่อป้องกัน Circular Import
from ..utils_io import resolve_image_path, OUT, _read_json, static_url

# นำเข้า Adapters (ตรวจสอบว่า Path ของไฟล์ adapter ถูกต้องตามโฟลเดอร์จริง)
from server.algos.ObjectAlignment.homography_alignment_adapter import run as homography_run
from server.algos.ObjectAlignment.AffineTransformEstimation import run as affine_run

router = APIRouter()

# --- Schemas ---

class HomographyReq(BaseModel):
    match_json: str
    warp_mode: Optional[str] = "image2_to_image1"
    blend: Optional[bool] = False

class AffineReq(BaseModel):
    match_json: str
    model: Optional[str] = "affine"
    warp_mode: Optional[str] = "image2_to_image1"
    blend: Optional[bool] = False
    ransac_thresh: Optional[float] = 3.0
    confidence: Optional[float] = 0.99
    refine_iters: Optional[int] = 10

# --- Endpoints ---

@router.post("/homography")
def alignment_homography(req: HomographyReq):
    """
    คำนวณ Homography Matrix และทำการ Warp ภาพเพื่อให้ภาพสองใบซ้อนทับกัน
    """
    # ดึง Local Path จริงจาก URL ที่ส่งมาจาก Frontend
    match_json_path = resolve_image_path(req.match_json)
    
    if not os.path.exists(match_json_path):
        raise HTTPException(status_code=404, detail=f"Match JSON not found: {req.match_json}")

    try:
        # รันอัลกอริทึม
        result = homography_run(
            match_json_path,
            out_root=OUT,
            warp_mode=req.warp_mode,
            blend=req.blend,
        )

        # แปลงผลลัพธ์ที่เป็น Local Path ให้เป็น URL สำหรับให้ Frontend แสดงผล
        if result.get("output", {}).get("aligned_image"):
            result["output"]["aligned_url"] = static_url(result["output"]["aligned_image"], OUT)
        
        if result.get("json_path"):
            result["json_url"] = static_url(result["json_path"], OUT)
            
        return {
            "status": "success",
            "tool": "HomographyAlignment",
            **result
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Homography failed: {str(e)}")


@router.post("/affine")
def alignment_affine(req: AffineReq):
    """
    คำนวณ Affine Transformation (Translation, Rotation, Scale, Shear)
    """
    match_json_path = resolve_image_path(req.match_json)
    
    if not os.path.exists(match_json_path):
        raise HTTPException(status_code=404, detail=f"Match JSON not found: {req.match_json}")

    try:
        result = affine_run(
            match_json_path=match_json_path,
            out_root=OUT,
            model=req.model,
            warp_mode=req.warp_mode,
            blend=req.blend,
            ransac_thresh=req.ransac_thresh,
            confidence=req.confidence,
            refine_iters=req.refine_iters,
        )

        # แปลงผลลัพธ์เป็น URL
        if result.get("output", {}).get("aligned_image"):
            result["output"]["aligned_url"] = static_url(result["output"]["aligned_image"], OUT)
        
        if result.get("json_path"):
            result["json_url"] = static_url(result["json_path"], OUT)
            
        return {
            "status": "success",
            "tool": "AffineAlignment",
            **result
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Affine failed: {str(e)}")