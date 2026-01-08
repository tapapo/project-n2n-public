# server/routers/restoration.py
import os
import json
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..utils_io import resolve_image_path, OUT, RESULT_DIR, static_url

# นำเข้า Adapters
from server.algos.restoration.dncnn import run as dncnn_run
from server.algos.restoration.SwinIR import run as swinir_run
from server.algos.restoration.real import run as real_run 

router = APIRouter()

class RestorationReq(BaseModel):
    image_path: str
    model_path: Optional[str] = None
    params: Optional[dict] = None

# ✅ ฟังก์ชันช่วยอ่าน JSON เพื่อส่งกลับ Frontend
def load_output_json(json_path):
    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

@router.post("/dncnn")
async def api_dncnn(req: RestorationReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        json_p, vis_p = dncnn_run(img_path, RESULT_DIR, model_path=req.model_path, **(req.params or {}))
        
        # ✅ อ่านข้อมูล JSON
        json_data = load_output_json(json_p)

        return {
            "status": "success",
            "tool": "DnCNN",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None,
            "json_data": json_data 
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DnCNN Error: {str(e)}")

@router.post("/swinir")
async def api_swinir(req: RestorationReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        json_p, vis_p = swinir_run(img_path, RESULT_DIR, model_path=req.model_path, **(req.params or {}))
        
        # ✅ อ่านข้อมูล JSON
        json_data = load_output_json(json_p)

        return {
            "status": "success",
            "tool": "SwinIR",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None,
            "json_data": json_data
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
        json_p, vis_p = real_run(img_path, RESULT_DIR, model_path=req.model_path, **(req.params or {}))
        
        # ✅✅ เพิ่มตรงนี้ครับ: อ่าน JSON เพื่อส่งข้อมูลกลับ (ไม่งั้น Frontend ไม่รู้ขนาดภาพ)
        json_data = load_output_json(json_p)
        
        return {
            "status": "success",
            "tool": "Real-ESRGAN",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p and os.path.exists(vis_p) else None,
            "json_data": json_data # ✅ ส่งกลับไปด้วย
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Real-ESRGAN Error: {str(e)}")