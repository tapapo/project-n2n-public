# server/routers/enhancement.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ✅ แก้ไข: เปลี่ยนการนำเข้าจาก ..main เป็น ..utils_io เพื่อป้องกัน Circular Import
from ..utils_io import resolve_image_path, OUT, RESULT_DIR, static_url

# ✅ แก้ไข: นำเข้าฟังก์ชันจากชื่อไฟล์จริงที่ปรากฏในเครื่อง (จากคำสั่ง ls ของคุณ)
# และใช้โฟลเดอร์ 'enchancement' ตามชื่อจริงในเครื่อง
from server.algos.enchancement.Clahe import run as clahe_run
from server.algos.enchancement.Msrcr import run as msrcr_run
from server.algos.enchancement.Zero import run as zero_run

router = APIRouter()

# --- Schema สำหรับรับข้อมูลจาก Frontend ---
class EnhancementReq(BaseModel):
    image_path: str  # URL หรือ Path จาก Node ก่อนหน้า
    params: Optional[dict] = None

# --- Endpoints ---

@router.post("/clahe")
async def api_clahe(req: EnhancementReq):
    """รัน Contrast Limited Adaptive Histogram Equalization"""
    img_path = resolve_image_path(req.image_path)
    
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # เรียกใช้ฟังก์ชันจาก clahe_adapter.py
        json_p, vis_p = clahe_run(img_path, RESULT_DIR, **(req.params or {}))
        return {
            "status": "success",
            "tool": "CLAHE",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CLAHE Error: {str(e)}")

@router.post("/msrcr")
async def api_msrcr(req: EnhancementReq):
    """รัน Multi-Scale Retinex with Color Restoration"""
    img_path = resolve_image_path(req.image_path)
    
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # เรียกใช้ฟังก์ชันจาก msrcr_adapter.py
        json_p, vis_p = msrcr_run(img_path, RESULT_DIR, **(req.params or {}))
        return {
            "status": "success",
            "tool": "MSRCR",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MSRCR Error: {str(e)}")

@router.post("/zero_dce")
async def api_zero_dce(req: EnhancementReq):
    """รัน Zero-Reference Deep Curve Estimation (AI Low-light Enhancement)"""
    img_path = resolve_image_path(req.image_path)
    
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # เรียกใช้ฟังก์ชันจาก zero_dce_adapter.py
        json_p, vis_p = zero_run(img_path, RESULT_DIR, **(req.params or {}))
        return {
            "status": "success",
            "tool": "ZERO_DCE",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Zero-DCE Error: {str(e)}")