import os
import cv2
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..utils_io import resolve_image_path, OUT, static_url
from server.algos.ObjectAlignment.homography_alignment_adapter import run as homography_run
from server.algos.ObjectAlignment.AffineTransformEstimation import run as affine_run

router = APIRouter()

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

# ✅ ฟังก์ชันช่วยอ่านขนาดรูป (ปรับปรุงใหม่)
def inject_shape_info(result_dict, out_root):
    try:
        # ลองหา path ของรูปผลลัพธ์
        output_data = result_dict.get("output", {})
        rel_path = output_data.get("aligned_image")
        
        if rel_path:
            full_path = os.path.join(out_root, rel_path)
            if os.path.exists(full_path):
                # อ่านรูปเพื่อเอาขนาดจริง
                img = cv2.imread(full_path)
                if img is not None:
                    # ✅ แก้ไข 1: เอา shape เต็มๆ (รวม channel) [H, W, C]
                    # เพื่อให้ Node ถัดไปรู้ว่าเป็นภาพสี (ถ้ามี 3 channels)
                    shape = list(img.shape) 
                    
                    if "output" not in result_dict:
                        result_dict["output"] = {}
                    
                    # ✅ แก้ไข 2: ใส่ aligned_shape และ image_shape (มาตรฐานที่ Enhancement ใช้)
                    result_dict["output"]["aligned_shape"] = shape
                    result_dict["output"]["shape"] = shape
                    
                    # ใส่ที่ Root level ด้วย เพื่อความชัวร์ในการดึงข้อมูล
                    result_dict["image_shape"] = shape
                    result_dict["channels"] = shape[2] if len(shape) > 2 else 1
                    
    except Exception as e:
        print(f"Error reading shape: {e}")
    return result_dict

@router.post("/homography")
def alignment_homography(req: HomographyReq):
    match_json_path = resolve_image_path(req.match_json)
    if not os.path.exists(match_json_path):
        raise HTTPException(status_code=404, detail=f"Match JSON not found: {req.match_json}")

    try:
        result = homography_run(
            match_json_path,
            out_root=OUT,
            warp_mode=req.warp_mode,
            blend=req.blend,
        )

        # 1. ยัดข้อมูล Shape
        result = inject_shape_info(result, OUT)

        # 2. สร้าง URL
        aligned_url = ""
        if result.get("output", {}).get("aligned_image"):
            aligned_url = static_url(result["output"]["aligned_image"], OUT)
            result["output"]["aligned_url"] = aligned_url
        
        if result.get("json_path"):
            result["json_url"] = static_url(result["json_path"], OUT)

        return {
            "status": "success",
            "tool": "HomographyAlignment",
            # ✅ แก้ไข 3: ส่ง output_image กลับไปด้วย (Node Enhancement มองหา key นี้)
            "output_image": aligned_url,
            "vis_url": aligned_url, # เผื่อบางโหนดใช้ vis_url
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Homography failed: {str(e)}")


@router.post("/affine")
def alignment_affine(req: AffineReq):
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

        # 1. ยัดข้อมูล Shape
        result = inject_shape_info(result, OUT)

        # 2. สร้าง URL
        aligned_url = ""
        if result.get("output", {}).get("aligned_image"):
            aligned_url = static_url(result["output"]["aligned_image"], OUT)
            result["output"]["aligned_url"] = aligned_url
        
        if result.get("json_path"):
            result["json_url"] = static_url(result["json_path"], OUT)
            
        return {
            "status": "success",
            "tool": "AffineAlignment",
            # ✅ แก้ไข 3: ส่ง output_image/vis_url กลับไปด้วย
            "output_image": aligned_url,
            "vis_url": aligned_url,
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Affine failed: {str(e)}")