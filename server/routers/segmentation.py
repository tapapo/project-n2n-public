# server/routers/segmentation.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ✅ แก้ไข: นำเข้าเครื่องมือจาก utils_io แทนเพื่อป้องกัน Circular Import
from ..utils_io import resolve_image_path, OUT, RESULT_DIR, _read_json, static_url

# นำเข้า Adapters (ฝั่งคุณ)
from server.algos.Classification.snake_adapter import run as snake_run

# นำเข้า Adapters (ฝั่งเพื่อน - ปรับชื่อตามโครงสร้างโฟลเดอร์จริง)
from server.algos.segmentation.DeepLabv3 import run as deeplab_run
from server.algos.segmentation.UNET import run as unet_run
from server.algos.segmentation.MaskRNN import run as maskrcnn_run

router = APIRouter()

# --- Schemas ---
class SegReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

# --- Endpoints ---

@router.post("/snake")
def api_snake(req: SegReq):
    """ Snake Active Contour (ฝั่งคุณ): หาขอบเขตวัตถุแบบกึ่งอัตโนมัติ """
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")
        
    try:
        json_p, over_p, mask_p = snake_run(img_path, RESULT_DIR, **(req.params or {}))
        return {
            "status": "success",
            "tool": "SNAKE",
            "json_url": static_url(json_p, OUT),
            "overlay_url": static_url(over_p, OUT) if over_p else None,
            "mask_url": static_url(mask_p, OUT) if mask_p else None
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Snake Error: {str(e)}")

@router.post("/deeplab")
async def api_deeplab(req: SegReq):
    """ DeepLabv3+ (ฝั่งเพื่อน): Semantic Segmentation """
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_p, vis_p = deeplab_run(img_path, RESULT_DIR, **(req.params or {}))
        return {
            "status": "success",
            "tool": "DeepLabv3",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DeepLab Error: {str(e)}")

@router.post("/unet")
async def api_unet(req: SegReq):
    """ U-Net (ฝั่งเพื่อน): เหมาะสำหรับการแยกแยะวัตถุที่มีความละเอียดสูง """
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_p, vis_p = unet_run(img_path, RESULT_DIR, **(req.params or {}))
        return {
            "status": "success",
            "tool": "U-Net",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"U-Net Error: {str(e)}")

@router.post("/maskrcnn")
async def api_maskrcnn(req: SegReq):
    """ Mask R-CNN (ฝั่งเพื่อน): Instance Segmentation แยกวัตถุเป็นชิ้นๆ """
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_p, vis_p = maskrcnn_run(img_path, RESULT_DIR, **(req.params or {}))
        return {
            "status": "success",
            "tool": "MaskRCNN",
            "json_url": static_url(json_p, OUT),
            "vis_url": static_url(vis_p, OUT) if vis_p else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mask R-CNN Error: {str(e)}")