import cv2
import numpy as np
import json
import os
import uuid

# Helper: อ่าน JSON
def _read_json(path: str):
    if not os.path.exists(path):
        raise FileNotFoundError(f"JSON file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

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

    # ✅ VALIDATION: เช็คว่าเป็นไฟล์ Matcher จริงไหม
    if "matching_tool" not in data:
        raise ValueError("Invalid input: Input file is not a Matcher result.")

    # 2. ดึงข้อมูล Path รูปภาพ (พร้อม Fallback)
    details = data.get("input_features_details", {})
    img1_info = details.get("image1", {})
    img2_info = details.get("image2", {})

    path1 = img1_info.get("original_path")
    path2 = img2_info.get("original_path")

    if not path1 or not path2:
         # Fallback: ลองหาจาก file_name
         path1 = path1 or img1_info.get("file_name")
         path2 = path2 or img2_info.get("file_name")
         
         if not path1 or not path2:
            raise ValueError("Matcher JSON missing 'original_path'. Please re-run Feature & Matcher nodes.")

    # 3. โหลดรูปภาพ
    img1 = cv2.imread(path1)
    img2 = cv2.imread(path2)
    
    if img1 is None: raise FileNotFoundError(f"Cannot read image1: {path1}")
    if img2 is None: raise FileNotFoundError(f"Cannot read image2: {path2}")

    # 4. ดึงจุดที่ Match กัน (matched_points)
    matched_points = data.get("matched_points", [])
    
    # เช็คว่ามี matched_points ไหม (ถ้าไฟล์เก่าอาจจะไม่มี)
    if not matched_points:
         # ลอง fallback ไปใช้ good_matches แบบเดิม (ถ้าจำเป็น) หรือแจ้งเตือน
         raise ValueError("JSON missing 'matched_points'. Please re-run Matcher node.")

    src_pts = []
    dst_pts = []
    
    target_img = None
    source_img = None
    
    # จัดเตรียมจุดตาม Warp Mode
    for mp in matched_points:
        pt1 = mp["pt1"]
        pt2 = mp["pt2"]
        
        if warp_mode == "image2_to_image1":
            src_pts.append(pt2) # img2 ขยับ
            dst_pts.append(pt1) # img1 นิ่ง
            target_img = img1
            source_img = img2
        else:
            src_pts.append(pt1) # img1 ขยับ
            dst_pts.append(pt2) # img2 นิ่ง
            target_img = img2
            source_img = img1

    # Affine ต้องการอย่างน้อย 3 จุด
    if len(src_pts) < 3:
        raise ValueError(f"Not enough points for Affine (need 3+, found {len(src_pts)})")

    src_pts = np.float32(src_pts).reshape(-1, 1, 2)
    dst_pts = np.float32(dst_pts).reshape(-1, 1, 2)

    # 5. คำนวณ Affine Transform
    method = cv2.RANSAC
    if model == "partial":
        # 4 DoF (Rotation + Scale + Translation)
        M, inliers_mask = cv2.estimateAffinePartial2D(
            src_pts, dst_pts, 
            method=method, 
            ransacReprojThreshold=ransac_thresh, 
            confidence=confidence,
            refineIters=refine_iters
        )
        tool_used = "AffinePartial2D"
    else:
        # 6 DoF (Full Affine: +Shear)
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

    # Blend (Optional)
    if blend:
        aligned = cv2.addWeighted(target_img, 0.5, aligned, 0.5, 0)

    # 7. Save Result
    # ใช้โครงสร้างโฟลเดอร์แบบเดียวกับ adapter อื่นๆ
    out_dir = os.path.join(out_root, "alignment", "affine_outputs")
    os.makedirs(out_dir, exist_ok=True)
    
    unique_id = uuid.uuid4().hex[:8]
    out_img_name = f"aligned_affine_{unique_id}.jpg"
    out_img_path = os.path.join(out_dir, out_img_name)
    
    cv2.imwrite(out_img_path, aligned)

    out_json_name = f"affine_{unique_id}.json"
    out_json_path = os.path.join(out_dir, out_json_name)

    result = {
        "tool": "AffineAlignment",
        "model": model,
        "warp_mode": warp_mode,
        "blend": blend,
        "num_inliers": inliers_count,
        "affine_matrix": M.tolist(),
        "output": {
            "aligned_image": out_img_path,
            # ✅ เพิ่ม URL สำหรับ Frontend
            "aligned_url": f"/static/alignment/affine_outputs/{out_img_name}"
        }
    }

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    result["json_path"] = out_json_path
    return result