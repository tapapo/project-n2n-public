# server/routers/classification.py
import os
import json
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ✅ แก้ไข: นำเข้าเครื่องมือจาก utils_io แทนเพื่อป้องกัน Circular Import
from ..utils_io import resolve_image_path, OUT, _read_json, RESULT_DIR, static_url

# นำเข้า Adapters (ใช้ Absolute Import เพื่อความปลอดภัยในการรันแบบ Package)
from server.algos.Classification.otsu_adapter import run as otsu_run
from server.algos.Classification.snake_adapter import run as snake_run

router = APIRouter()

# --- Schemas ---

class OtsuReq(BaseModel):
    image_path: str
    gaussian_blur: Optional[bool] = True
    blur_ksize: Optional[int] = 5
    invert: Optional[bool] = False
    morph_open: Optional[bool] = False
    morph_close: Optional[bool] = False
    morph_kernel: Optional[int] = 3
    show_histogram: Optional[bool] = False

class SnakeReq(BaseModel):
    image_path: str
    alpha: float = 0.015
    beta: float = 10.0
    gamma: float = 0.001
    w_line: float = 0.0
    w_edge: float = 1.0
    max_iterations: int = 250
    convergence: float = 0.1
    init_mode: str = "circle"
    init_cx: Optional[int] = None
    init_cy: Optional[int] = None
    init_radius: Optional[int] = None
    init_points: int = 400
    # รองรับพิกัดจาก Frontend สำหรับการวาดจุดเริ่มต้น
    from_point_x: Optional[float] = None
    from_point_y: Optional[float] = None
    bbox_x1: Optional[float] = None
    bbox_y1: Optional[float] = None
    bbox_x2: Optional[float] = None
    bbox_y2: Optional[float] = None
    gaussian_blur_ksize: int = 5

# --- Endpoints ---

@router.post("/otsu")
def classify_otsu(req: OtsuReq):
    """
    Otsu Thresholding: แยกวัตถุออกจากพื้นหลังโดยการคำนวณค่าขีดจำกัดอัตโนมัติ
    """
    img_path = resolve_image_path(req.image_path)
    
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        # เรียกใช้งาน Otsu Adapter
        json_path, bin_path = otsu_run(
            image_path=img_path,
            out_root=RESULT_DIR,
            gaussian_blur=req.gaussian_blur,
            blur_ksize=req.blur_ksize,
            invert=req.invert,
            morph_open=req.morph_open,
            morph_close=req.morph_close,
            morph_kernel=req.morph_kernel,
            show_histogram=req.show_histogram,
        )
        
        data = _read_json(json_path)
        return {
            "status": "success",
            "tool": "OtsuThreshold",
            "json_path": json_path,
            "json_url": static_url(json_path, OUT),
            "binary_url": static_url(bin_path, OUT) if bin_path else None,
            "threshold": data.get("threshold_value"),
            "histogram_url": static_url(data.get("output", {}).get("histogram_path"), OUT) if data.get("output") else None,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Otsu failed: {str(e)}")


@router.post("/snake")
def classify_snake(req: SnakeReq):
    """
    Snake Active Contour: อัลกอริทึมหารูปทรงของขอบวัตถุโดยใช้พลังงานภายในและภายนอก
    """
    img_path = resolve_image_path(req.image_path)

    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        # รัน Snake Adapter โดยส่งพารามิเตอร์ทั้งหมดจาก request
        # ใช้ model_dump() แทน dict() (สำหรับ Pydantic v2)
        params = req.model_dump(exclude={"image_path"})
        
        json_path, overlay_path, mask_path = snake_run(
            image_path=img_path,
            out_root=RESULT_DIR,
            **params
        )

        data = _read_json(json_path)
        return {
            "status": "success",
            "tool": "SnakeActiveContour",
            "json_path": json_path,
            "json_url": static_url(json_path, OUT),
            "overlay_url": static_url(overlay_path, OUT),
            "mask_url": static_url(mask_path, OUT),
            "contour_points": (data.get("output") or {}).get("contour_points_xy"),
            "iterations": (data.get("output") or {}).get("iterations"),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Snake failed: {str(e)}")