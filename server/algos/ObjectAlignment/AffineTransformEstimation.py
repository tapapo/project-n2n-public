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

# ✅ Helper: Smart Path Resolution (ยกชุดมาจาก Homography)
def _resolve_file_path(path: str) -> str:
    if not path: return path
    
    # 1. เช็คว่าเป็น Path จริงในเครื่องอยู่แล้วหรือไม่
    if os.path.exists(path): return path
    
    # 2. จัดการกับ Path ของ Template (/static/...)
    if path.startswith("/static/"):
        clean_path = path.replace("/static/", "", 1).lstrip("/")
        
        # ลองหาใน outputs
        candidate_outputs = os.path.join(PROJECT_ROOT, "outputs", clean_path)
        if os.path.exists(candidate_outputs): return candidate_outputs
            
        # ลองหาใน static
        candidate_static = os.path.join(PROJECT_ROOT, "static", clean_path)
        if os.path.exists(candidate_static): return candidate_static

    # 3. ค้นหาแบบกวาด (เผื่อไฟล์ย้ายที่)
    filename = os.path.basename(path)
    search_dirs = [
        os.path.join(PROJECT_ROOT, "outputs", "samples", "json", "matching"),
        os.path.join(PROJECT_ROOT, "outputs", "samples", "json", "alignment"),
        os.path.join(PROJECT_ROOT, "outputs", "samples"),
        os.path.join(PROJECT_ROOT, "outputs", "uploads"),
        os.path.join(PROJECT_ROOT, "outputs"),
        os.path.join(PROJECT_ROOT, "features", "affine_outputs"), # เพิ่มโฟลเดอร์ของ Affine เอง
    ]

    for d in search_dirs:
        candidate = os.path.join(d, filename)
        if os.path.exists(candidate): return candidate

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
    # ✅ 1. ใช้ Smart Resolver กับ JSON Path
    real_match_json = _resolve_file_path(match_json_path)
    data = _read_json(real_match_json)

    # Validation
    if "matching_tool" not in data:
        raise ValueError("Invalid input: Input file is not a Matcher result.")

    # 2. ดึงข้อมูล Path รูปภาพ
    details = data.get("input_features_details", {})
    img1_info = details.get("image1", {})
    img2_info = details.get("image2", {})

    raw_path1 = img1_info.get("original_path") or img1_info.get("file_name")
    raw_path2 = img2_info.get("original_path") or img2_info.get("file_name")

    # ✅ 3. ใช้ Smart Resolver กับรูปภาพด้วย
    path1 = _resolve_file_path(raw_path1)
    path2 = _resolve_file_path(raw_path2)

    if not path1 or not os.path.exists(path1):
        raise FileNotFoundError(f"Cannot find image 1: {raw_path1} (Resolved: {path1})")
    if not path2 or not os.path.exists(path2):
        raise FileNotFoundError(f"Cannot find image 2: {raw_path2} (Resolved: {path2})")

    # 4. โหลดรูปภาพ
    img1 = cv2.imread(path1)
    img2 = cv2.imread(path2)
    
    if img1 is None: raise FileNotFoundError(f"Cannot read image1: {path1}")
    if img2 is None: raise FileNotFoundError(f"Cannot read image2: {path2}")

    # 5. ดึงจุดที่ Match กัน
    matched_points = data.get("matched_points", [])
    if not matched_points:
         raise ValueError("JSON missing 'matched_points'. Please re-run Matcher node.")

    src_pts = []
    dst_pts = []
    
    target_img = None
    source_img = None
    
    for mp in matched_points:
        pt1 = mp["pt1"]
        pt2 = mp["pt2"]
        
        if warp_mode == "image2_to_image1":
            src_pts.append(pt2); dst_pts.append(pt1)
            target_img = img1; source_img = img2
        else:
            src_pts.append(pt1); dst_pts.append(pt2)
            target_img = img2; source_img = img1

    if len(src_pts) < 3:
        raise ValueError(f"Not enough points for Affine (need 3+, found {len(src_pts)})")

    src_pts = np.float32(src_pts).reshape(-1, 1, 2)
    dst_pts = np.float32(dst_pts).reshape(-1, 1, 2)

    # 6. คำนวณ Affine Transform
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

    # 7. Save Result & Smart Cache
    if out_root is None:
        out_root = os.path.join(PROJECT_ROOT, "outputs")
        
    out_dir = os.path.join(out_root, "features", "affine_outputs")
    _ensure_dir(out_dir)
    
    # ✅ Generate Hash (จาก Params เท่านั้น ไม่ใส่ Time)
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

    # ✅ Check Cache: ถ้ามีไฟล์เดิม ให้ใช้ไฟล์เดิม
    if os.path.exists(out_json_path) and os.path.exists(out_img_path):
         try:
            with open(out_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["json_path"] = out_json_path
            return data
         except:
            pass

    # 8. ถ้าไม่มี Cache ค่อย Warp จริง
    h, w = target_img.shape[:2]
    aligned = cv2.warpAffine(source_img, M, (w, h))

    if blend:
        if aligned.shape[:2] != target_img.shape[:2]:
             aligned = cv2.resize(aligned, (target_img.shape[1], target_img.shape[0]))
        aligned = cv2.addWeighted(target_img, 0.5, aligned, 0.5, 0)

    cv2.imwrite(out_img_path, aligned)
    vis_url = f"/static/features/affine_outputs/{out_img_name}"

    result = {
        "tool": "AffineAlignment",
        "model": model,
        "warp_mode": warp_mode,
        "blend": blend,
        "num_inliers": inliers_count,
        "affine_matrix": M.tolist(),
        "output": {
            "aligned_image": out_img_path,
            "aligned_url": vis_url,
            "result_image_url": vis_url
        },
        "parameters_hash": config_map
    }

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    result["json_path"] = out_json_path
    return result