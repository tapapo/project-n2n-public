# server/routers/matching.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ✅ แก้ไข: นำเข้าเครื่องมือจาก utils_io แทนเพื่อป้องกัน Circular Import
from ..utils_io import resolve_image_path, OUT, static_url

# นำเข้า Adapters ของหมวด Matching
from server.algos.matching.bfmatcher_adapter import run as bf_run
from server.algos.matching.flannmatcher_adapter import run as flann_run

router = APIRouter()

# --- Helpers ---
def _as_count(x) -> int:
    """นับจำนวนรายการเพื่อความปลอดภัยในการแสดงผลสถิติ"""
    if isinstance(x, list):
        return len(x)
    try:
        return int(x)
    except (TypeError, ValueError):
        return 0

# --- Schema สำหรับรับข้อมูล Matching ---
class MatchReq(BaseModel):
    json_a: str  # Path หรือ URL ของไฟล์ JSON จาก Node SIFT/ORB ตัวแรก
    json_b: str  # Path หรือ URL ของไฟล์ JSON จาก Node SIFT/ORB ตัวที่สอง
    # พารามิเตอร์ทั่วไป
    norm_type: Optional[str] = None
    cross_check: Optional[bool] = None
    lowe_ratio: Optional[float] = None
    ransac_thresh: Optional[float] = 5.0
    draw_mode: Optional[str] = "good"
    # พารามิเตอร์เฉพาะสำหรับ FLANN
    index_mode: Optional[str] = "AUTO"
    kd_trees: Optional[int] = 5
    search_checks: Optional[int] = 50
    lsh_table_number: Optional[int] = 6
    lsh_key_size: Optional[int] = 12
    lsh_multi_probe_level: Optional[int] = 1
    max_draw: Optional[int] = 50

# --- Endpoints ---

@router.post("/bf")
def match_bf(req: MatchReq):
    """
    Brute-Force Matcher: จับคู่ Feature โดยการเช็คทุกคู่ความเป็นไปได้
    """
    json_a = resolve_image_path(req.json_a)
    json_b = resolve_image_path(req.json_b)

    try:
        result = bf_run(
            json_a,
            json_b,
            OUT,
            lowe_ratio=req.lowe_ratio,
            ransac_thresh=req.ransac_thresh,
            norm_override=req.norm_type,
            cross_check=req.cross_check,
            draw_mode=req.draw_mode,
        )
        
        inliers = int(result.get("inliers", 0))
        # ดึงจำนวน Good Matches จากสถิติที่ Adapter คืนมา
        stats = result.get("matching_statistics", {})
        good_cnt = _as_count(result.get("good_matches", stats.get("num_good_matches", 0)))

        return {
            "status": "success",
            "tool": "BFMatcher",
            "description": stats.get("summary") or f"{inliers} inliers / {good_cnt} matches",
            "matching_statistics": stats,
            "vis_url": static_url(result.get("vis_url"), OUT),
            "json_url": static_url(result.get("json_path"), OUT),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"BF Matcher failed: {str(e)}")

@router.post("/flann")
def match_flann(req: MatchReq):
    """
    FLANN Matcher: จับคู่แบบรวดเร็วโดยใช้อัลกอริทึม Nearest Neighbors
    """
    json_a = resolve_image_path(req.json_a)
    json_b = resolve_image_path(req.json_b)

    try:
        result = flann_run(
            json_a, json_b, OUT,
            lowe_ratio=req.lowe_ratio or 0.75,
            ransac_thresh=req.ransac_thresh or 5.0,
            index_mode=req.index_mode,
            kd_trees=req.kd_trees,
            search_checks=req.search_checks,
            lsh_table_number=req.lsh_table_number,
            lsh_key_size=req.lsh_key_size,
            lsh_multi_probe_level=req.lsh_multi_probe_level,
            draw_mode=req.draw_mode,
            max_draw=req.max_draw,
        )

        return {
            "status": "success",
            "tool": "FLANNBasedMatcher",
            "matching_statistics": result.get("matching_statistics", {}),
            "vis_url": static_url(result.get("vis_url"), OUT),
            "json_url": static_url(result.get("json_path"), OUT),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"FLANN Matcher failed: {str(e)}")