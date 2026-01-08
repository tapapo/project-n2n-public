import cv2
import numpy as np
import json
import os
import hashlib 
# import time  <-- ไม่ต้องใช้แล้ว
from typing import Dict, Any

# --- Config ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

def _read_json(path: str):
    if not os.path.exists(path):
        raise FileNotFoundError(f"JSON file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# ✅ Helper: Smart Path Resolution (ยังเก็บไว้นะครับ เพราะจำเป็นสำหรับ Template)
def _resolve_file_path(path: str) -> str:
    if not path: return path
    if os.path.exists(path): return path
    
    if path.startswith("/static/"):
        clean_path = path.replace("/static/", "", 1).lstrip("/")
        candidate_outputs = os.path.join(PROJECT_ROOT, "outputs", clean_path)
        if os.path.exists(candidate_outputs): return candidate_outputs
        candidate_static = os.path.join(PROJECT_ROOT, "static", clean_path)
        if os.path.exists(candidate_static): return candidate_static

    filename = os.path.basename(path)
    search_dirs = [
        os.path.join(PROJECT_ROOT, "outputs", "samples", "json", "matching"),
        os.path.join(PROJECT_ROOT, "outputs", "samples", "json", "alignment"),
        os.path.join(PROJECT_ROOT, "outputs", "samples"),
        os.path.join(PROJECT_ROOT, "outputs", "uploads"),
        os.path.join(PROJECT_ROOT, "outputs"),
    ]

    for d in search_dirs:
        candidate = os.path.join(d, filename)
        if os.path.exists(candidate): return candidate

    return path

def run(
    match_json_path: str, 
    out_root: str, 
    warp_mode: str = "image2_to_image1", 
    blend: bool = False
):
    # 1. Resolve Path
    real_match_json = _resolve_file_path(match_json_path)
    data = _read_json(real_match_json)

    if "matching_tool" not in data:
        raise ValueError("Invalid input: Not a Matcher result.")

    # 2. Images
    details = data.get("input_features_details", {})
    img1_info = details.get("image1", {})
    img2_info = details.get("image2", {})

    path1 = _resolve_file_path(img1_info.get("original_path") or img1_info.get("file_name"))
    path2 = _resolve_file_path(img2_info.get("original_path") or img2_info.get("file_name"))

    if not path1 or not os.path.exists(path1): raise FileNotFoundError(f"Image 1 not found")
    if not path2 or not os.path.exists(path2): raise FileNotFoundError(f"Image 2 not found")

    img1 = cv2.imread(path1)
    img2 = cv2.imread(path2)
    
    # 3. Points
    matched_points = data.get("matched_points", [])
    if not matched_points:
         raise ValueError("JSON missing 'matched_points'. Please Re-Run Matcher Node.")

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

    if len(src_pts) < 4:
        raise ValueError(f"Not enough points (found {len(src_pts)})")

    src_pts = np.float32(src_pts).reshape(-1, 1, 2)
    dst_pts = np.float32(dst_pts).reshape(-1, 1, 2)

    # 4. Homography
    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    inliers_count = int(mask.sum()) if mask is not None else 0
    if H is None: raise RuntimeError("Cannot compute homography.")

    # 5. Save Logic (Smart Cache กลับมาแล้ว)
    if out_root is None:
        out_root = os.path.join(PROJECT_ROOT, "outputs")
    
    out_dir = os.path.join(out_root, "features", "homography_outputs")
    os.makedirs(out_dir, exist_ok=True)

    # ✅ คำนวณ Hash จาก Params เท่านั้น (เอา Time ออก)
    config_map = {
        "match_json": os.path.basename(match_json_path),
        "warp": warp_mode,
        "blend": blend
        # ไม่มี "ts" แล้ว
    }
    config_str = json.dumps(config_map, sort_keys=True)
    param_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()[:8]
    
    base_match = os.path.splitext(os.path.basename(match_json_path))[0]
    stem = f"homo_{base_match}_{param_hash}"
    
    out_img_name = f"{stem}.jpg"
    out_json_name = f"{stem}.json"
    
    out_img_path = os.path.join(out_dir, out_img_name)
    out_json_path = os.path.join(out_dir, out_json_name)

    # ✅ Check Cache: ถ้ามีไฟล์เดิมอยู่แล้ว ให้ใช้ไฟล์เดิมเลย (ไม่รกเครื่อง)
    if os.path.exists(out_json_path) and os.path.exists(out_img_path):
        print(f"⚡ [Homography] Cache Hit: {out_img_name}")
        try:
            with open(out_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["json_path"] = out_json_path
            return data
        except:
            pass # ถ้าอ่าน JSON พัง ก็ให้ทำใหม่ข้างล่าง

    print(f"⚙️ [Homography] Computing New Result...")
    h_target, w_target = target_img.shape[:2]
    aligned = cv2.warpPerspective(source_img, H, (w_target, h_target))
    
    if blend:
        if aligned.shape[:2] != target_img.shape[:2]:
             aligned = cv2.resize(aligned, (w_target, h_target))
        aligned = cv2.addWeighted(target_img, 0.5, aligned, 0.5, 0)

    cv2.imwrite(out_img_path, aligned)
    vis_url = f"/static/features/homography_outputs/{out_img_name}"

    result = {
        "tool": "HomographyAlignment",
        "warp_mode": warp_mode,
        "blend": blend,
        "num_inliers": inliers_count,
        "homography_matrix": H.tolist(),
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