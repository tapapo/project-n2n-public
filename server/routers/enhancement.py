import os
import json
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ✅ นำเข้า Utils
from ..utils_io import resolve_image_path, OUT, RESULT_DIR, static_url

# ✅ นำเข้า Algorithm (ตรวจสอบ path ให้ตรงกับเครื่องของคุณ)
from server.algos.enchancement.Clahe import run as clahe_run
from server.algos.enchancement.Msrcr import run as msrcr_run
from server.algos.enchancement.Zero import run as zero_run

router = APIRouter()

# --- Schema ---
class EnhancementReq(BaseModel):
    image_path: str 
    params: Optional[dict] = None

# --- Helper function ---
def extract_shape(json_data):
    """
    ดึงข้อมูล shape จาก JSON เพื่อส่งกลับไปให้ Frontend ใช้ Validation
    """
    img_data = json_data.get('image', {})
    # พยายามหาจากหลายๆ key ที่เป็นไปได้
    shape = img_data.get('processed_shape') or img_data.get('shape') or img_data.get('original_shape')
    
    if not shape:
        shape = json_data.get('output', {}).get('shape')
        
    return shape

# --- Endpoints ---

@router.post("/clahe")
async def api_clahe(req: EnhancementReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # 1. รัน CLAHE
        json_p, vis_p = clahe_run(img_path, RESULT_DIR, **(req.params or {}))
        
        # 2. อ่านไฟล์ JSON ผลลัพธ์
        with open(json_p, 'r', encoding='utf-8') as f:
            json_content = json.load(f)

        # 3. ดึง Shape
        shape = extract_shape(json_content)

        return {
            "status": "success",
            "tool": "CLAHE",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT),
            "image_shape": shape,  # ✅ ส่งกลับให้ Frontend เช็ค
            "json_data": json_content 
        }
    except Exception as e:
        # ✅ ส่งข้อความ Error จาก Algorithm ตรงๆ เพื่อไม่ให้ข้อความซ้ำซ้อนที่ Frontend
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/msrcr")
async def api_msrcr(req: EnhancementReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        # 1. รัน MSRCR
        json_p, vis_p = msrcr_run(img_path, RESULT_DIR, **(req.params or {}))
        
        # 2. อ่านไฟล์ JSON
        with open(json_p, 'r', encoding='utf-8') as f:
            json_content = json.load(f)
            
        # 3. ดึง Shape
        shape = extract_shape(json_content)

        return {
            "status": "success",
            "tool": "MSRCR",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT),
            "image_shape": shape,
            "json_data": json_content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/zero_dce")
async def api_zero_dce(req: EnhancementReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        # 1. รัน Zero-DCE
        json_p, vis_p = zero_run(img_path, RESULT_DIR, **(req.params or {}))
        
        # 2. อ่านไฟล์ JSON
        with open(json_p, 'r', encoding='utf-8') as f:
            json_content = json.load(f)

        # 3. ดึง Shape
        shape = extract_shape(json_content)

        return {
            "status": "success",
            "tool": "ZERO_DCE",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT),
            "image_shape": shape,
            "json_data": json_content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))