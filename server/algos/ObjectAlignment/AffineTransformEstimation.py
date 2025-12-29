# project_n2n/server/algos/ObjectAlignment/AffineTransformEstimation.py
import cv2
import numpy as np
import json
import os
import hashlib
from typing import Dict, Any

# --- Config ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

def _ensure_dir(d: str):
    os.makedirs(d, exist_ok=True)

def _read_json(path: str):
    if not os.path.exists(path):
        raise FileNotFoundError(f"JSON file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# Helper to resolve image paths
def _resolve_image_path(path: str) -> str:
    if os.path.exists(path):
        return path
    # Try relative to project root
    rel_path = os.path.join(PROJECT_ROOT, path.lstrip("/"))
    if os.path.exists(rel_path):
        return rel_path
    return path

def run(
    match_json_path: str, 
    out_root: str, 
    model: str = "affine", 
    warp_mode: str = "image2_to_image1", 
    blend: bool = False,
    ransac_thresh: float = 3.0,
    confidence: float = 0.99,
    refine_iters: int = 10
):
    # 1. อ่านข้อมูลจาก Matcher JSON
    data = _read_json(match_json_path)

    # Validation
    if "matching_tool" not in data:
        raise ValueError("Invalid input: Input file is not a Matcher result.")

    # 2. ดึงข้อมูล Path รูปภาพ
    details = data.get("input_features_details", {})
    img1_info = details.get("image1", {})
    img2_info = details.get("image2", {})

    path1 = _resolve_image_path(img1_info.get("original_path") or img1_info.get("file_name"))
    path2 = _resolve_image_path(img2_info.get("original_path") or img2_info.get("file_name"))

    if not path1 or not os.path.exists(path1):
        raise FileNotFoundError(f"Cannot find image 1: {path1}")
    if not path2 or not os.path.exists(path2):
        raise FileNotFoundError(f"Cannot find image 2: {path2}")

    # 3. โหลดรูปภาพ
    img1 = cv2.imread(path1)
    img2 = cv2.imread(path2)
    
    if img1 is None: raise FileNotFoundError(f"Cannot read image1: {path1}")
    if img2 is None: raise FileNotFoundError(f"Cannot read image2: {path2}")

    # 4. ดึงจุดที่ Match กัน
    matched_points = data.get("matched_points", [])
    if not matched_points:
         raise ValueError("JSON missing 'matched_points'. Please re-run Matcher node.")

    src_pts = []
    dst_pts = []
    
    target_img = None
    source_img = None
    
    # จัดเตรียมจุด
    for mp in matched_points:
        pt1 = mp["pt1"]
        pt2 = mp["pt2"]
        
        if warp_mode == "image2_to_image1":
            src_pts.append(pt2)
            dst_pts.append(pt1)
            target_img = img1
            source_img = img2
        else:
            src_pts.append(pt1)
            dst_pts.append(pt2)
            target_img = img2
            source_img = img1

    if len(src_pts) < 3:
        raise ValueError(f"Not enough points for Affine (need 3+, found {len(src_pts)})")

    src_pts = np.float32(src_pts).reshape(-1, 1, 2)
    dst_pts = np.float32(dst_pts).reshape(-1, 1, 2)

    # 5. คำนวณ Affine Transform
    method = cv2.RANSAC
    if model == "partial":
        M, inliers_mask = cv2.estimateAffinePartial2D(
            src_pts, dst_pts, 
            method=method, 
            ransacReprojThreshold=ransac_thresh, 
            confidence=confidence,
            refineIters=refine_iters
        )
        tool_used = "AffinePartial2D"
    else:
        M, inliers_mask = cv2.estimateAffine2D(
            src_pts, dst_pts, 
            method=method, 
            ransacReprojThreshold=ransac_thresh, 
            confidence=confidence,
            refineIters=refine_iters
        )
        tool_used = "Affine2D"

    inliers_count = int(inliers_mask.sum()) if inliers_mask is not None else 0

    if M is None:
         raise ValueError(f"Affine estimation failed ({tool_used}). Try adjusting RANSAC threshold.")

    # 6. Warp Image
    h, w = target_img.shape[:2]
    aligned = cv2.warpAffine(source_img, M, (w, h))

    if blend:
        if aligned.shape[:2] != target_img.shape[:2]:
             aligned = cv2.resize(aligned, (target_img.shape[1], target_img.shape[0]))
        aligned = cv2.addWeighted(target_img, 0.5, aligned, 0.5, 0)

    # 7. Save Result
    if out_root is None:
        out_root = os.path.join(PROJECT_ROOT, "outputs")
        
    # ✅ แก้ไข Path: ไปลง features/affine_outputs แทน alignment/
    out_dir = os.path.join(out_root, "features", "affine_outputs")
    _ensure_dir(out_dir)
    
    # ✅ Generate Hash
    config_map = {
        "match_json": os.path.basename(match_json_path),
        "model": model,
        "warp": warp_mode,
        "blend": blend,
        "ransac": ransac_thresh,
        "conf": confidence,
        "iters": refine_iters
    }
    config_str = json.dumps(config_map, sort_keys=True)
    param_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()[:8]
    
    base_match = os.path.splitext(os.path.basename(match_json_path))[0]
    stem = f"affine_{base_match}_{param_hash}"
    
    out_img_name = f"{stem}.jpg"
    out_json_name = f"{stem}.json"
    
    out_img_path = os.path.join(out_dir, out_img_name)
    out_json_path = os.path.join(out_dir, out_json_name)

    # Check Cache
    if os.path.exists(out_json_path) and os.path.exists(out_img_path):
         try:
            with open(out_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Update paths in cached json just in case
            return {"json_path": out_json_path, **data}
         except:
            pass

    cv2.imwrite(out_img_path, aligned)

    result = {
        "tool": "AffineAlignment",
        "model": model,
        "warp_mode": warp_mode,
        "blend": blend,
        "num_inliers": inliers_count,
        "affine_matrix": M.tolist(),
        "output": {
            "aligned_image": out_img_path,
            # ✅ URL แก้ให้ตรงกับ Path ใหม่ (features/)
            "aligned_url": f"/static/features/affine_outputs/{out_img_name}",
            "result_image_url": f"/static/features/affine_outputs/{out_img_name}"
        },
        "parameters_hash": config_map
    }

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    result["json_path"] = out_json_path
    return result