import cv2
import numpy as np
import json
import os
import uuid

def _read_json(path: str):
    if not os.path.exists(path):
        raise FileNotFoundError(f"JSON file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def run(match_json_path: str, out_root: str, warp_mode: str = "image2_to_image1", blend: bool = False):
    # 1. อ่านข้อมูลจาก Matcher JSON
    data = _read_json(match_json_path)

    # ✅ VALIDATION
    if "matching_tool" not in data:
        raise ValueError("Invalid input: Input file is not a Matcher result.")

    # 2. ดึงข้อมูล Path รูปภาพ
    details = data.get("input_features_details", {})
    img1_info = details.get("image1", {})
    img2_info = details.get("image2", {})

    path1 = img1_info.get("original_path")
    path2 = img2_info.get("original_path")

    if not path1 or not path2:
        # Fallback
        path1 = path1 or img1_info.get("file_name")
        path2 = path2 or img2_info.get("file_name")
        
        if not path1 or not path2:
            raise ValueError("Matcher JSON missing 'original_path'. Please re-run Feature & Matcher nodes.")

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
    
    # กำหนดค่าเริ่มต้นกัน Pylance บ่น
    target_img = img1 
    source_img = img2 
    
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

    if len(src_pts) < 4:
        raise ValueError(f"Not enough points for Homography (need 4+, found {len(src_pts)})")

    src_pts = np.float32(src_pts).reshape(-1, 1, 2)
    dst_pts = np.float32(dst_pts).reshape(-1, 1, 2)

    # 5. คำนวณ Homography
    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    
    inliers_count = int(mask.sum()) if mask is not None else 0

    if H is None:
         raise RuntimeError("Cannot compute homography matrix.")

    # 6. Warp Image
    # ✅ กำหนดค่าเริ่มต้นกัน error 'not defined'
    base_for_blend = target_img 

    if warp_mode == "image2_to_image1":
        h, w = img1.shape[:2]
        aligned = cv2.warpPerspective(img2, H, (w, h))
        base_for_blend = img1
    else:
        # image1 -> image2 (Inverse)
        try:
            H_inv = np.linalg.inv(H)
        except np.linalg.LinAlgError:
            raise RuntimeError("Homography matrix is singular (cannot invert).")
            
        h2, w2 = img2.shape[:2]
        aligned = cv2.warpPerspective(img1, H_inv, (w2, h2))
        base_for_blend = img2

    # Blend
    if blend:
        if aligned.shape[:2] != base_for_blend.shape[:2]:
             # Resize aligned to match base (เผื่อมีเศษ pixel ต่างกัน)
             aligned = cv2.resize(aligned, (base_for_blend.shape[1], base_for_blend.shape[0]))
             
        aligned = cv2.addWeighted(base_for_blend, 0.5, aligned, 0.5, 0)

    # 7. Save Result
    out_dir = os.path.join(out_root, "alignment", "homography_outputs")
    os.makedirs(out_dir, exist_ok=True)
    
    unique_id = uuid.uuid4().hex[:8]
    out_img_name = f"aligned_homo_{unique_id}.jpg"
    out_img_path = os.path.join(out_dir, out_img_name)
    
    cv2.imwrite(out_img_path, aligned)

    out_json_name = f"homography_{unique_id}.json"
    out_json_path = os.path.join(out_dir, out_json_name)

    result = {
        "tool": "HomographyAlignment",
        "warp_mode": warp_mode,
        "blend": blend,
        "num_inliers": inliers_count,
        "homography_matrix": H.tolist(),
        "output": {
            "aligned_image": out_img_path,
            "aligned_url": f"/static/alignment/homography_outputs/{out_img_name}"
        }
    }

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    result["json_path"] = out_json_path
    return result