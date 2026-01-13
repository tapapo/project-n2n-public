# server/routers/restoration.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ✅ แก้ไข: นำเข้าเครื่องมือจาก utils_io แทนเพื่อป้องกัน Circular Import
from ..utils_io import resolve_image_path, OUT, RESULT_DIR, static_url

# นำเข้า Adapters (ตรวจสอบชื่อไฟล์ .py ในเครื่องเพื่อนอีกครั้งเพื่อความแม่นยำ)
# แนะนำให้ใช้ชื่อไฟล์ตัวเล็กตามมาตรฐาน Python หรือตามที่ ls เจอ
from server.algos.restoration.dncnn import run as dncnn_run
from server.algos.restoration.SwinIR import run as swinir_run
from server.algos.restoration.real import run as real_run 

router = APIRouter()

# --- Schema ---
class RestorationReq(BaseModel):
    image_path: str
    model_path: Optional[str] = None
    params: Optional[dict] = None

# --- Endpoints ---

@router.post("/dncnn")
async def api_dncnn(req: RestorationReq):
    """
    DnCNN: กำจัดสัญญาณรบกวน (Denoising) โดยใช้ Deep Learning
    """
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # เรียกใช้ฟังก์ชัน run ของเพื่อน
        # หากเพื่อนไม่ได้ใช้ชื่อ run ให้เปลี่ยนเป็นฟังก์ชันที่เพื่อนเตรียมไว้
        json_p, vis_p = dncnn_run(img_path, RESULT_DIR, model_path=req.model_path, **(req.params or {}))
        return {
            "status": "success",
            "tool": "DnCNN",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DnCNN Error: {str(e)}")

@router.post("/swinir")
async def api_swinir(req: RestorationReq):
    """
    SwinIR: การคืนสภาพภาพประสิทธิภาพสูงโดยใช้ Swin Transformer
    """
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        json_p, vis_p = swinir_run(img_path, RESULT_DIR, model_path=req.model_path, **(req.params or {}))
        return {
            "status": "success",
            "tool": "SwinIR",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SwinIR Error: {str(e)}")

@router.post("/realesrgan")
async def api_realesrgan(req: RestorationReq):
    """
    Real-ESRGAN: เพิ่มความละเอียดภาพ (Super-Resolution) ให้คมชัด
    """
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # ตรวจสอบว่าไฟล์ real.py ของเพื่อนมีฟังก์ชัน run ที่รับพารามิเตอร์เหมือนตัวอื่นหรือไม่
        json_p, vis_p = real_run(img_path, RESULT_DIR, model_path=req.model_path, **(req.params or {}))
        return {
            "status": "success",
            "tool": "Real-ESRGAN",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Real-ESRGAN Error: {str(e)}")