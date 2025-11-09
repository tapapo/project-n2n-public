# server/algos/alignment/homography_adapter.py
import os
import cv2
import json
import numpy as np
from typing import Dict, Any

# ใช้ helpers เดิม
from ...cache_utils import make_cache_key, ensure_dir


def run(
    match_json_path: str,
    out_root: str,
    warp_mode: str = "image2_to_image1",
    blend: bool = False,
) -> Dict[str, Any]:
    """
    คำนวณ Homography จาก matcher JSON (ต้องมี matched_points)
    แล้ว warp ภาพ จากนั้นเซฟผลไว้ที่:
        <out_root>/features/homographyadapter_outputs/homography_<hash>.{jpg,json}

    - ใช้ชื่อไฟล์แบบ deterministic จาก hash ของ (match_json_path, warp_mode, blend)
    - ถ้าไฟล์มีอยู่แล้วจะอ่าน JSON เดิมกลับคืน
    """

    # ====== Target directory (ตามที่ผู้ใช้ต้องการ) ======
    out_dir = os.path.join(out_root, "features", "homographyadapter_outputs")
    ensure_dir(out_dir)

    # ====== ทำ hash key ให้ชื่อไฟล์คงที่ ======
    key = make_cache_key(
        "HOMOGRAPHY_ADAPTER",
        files=[match_json_path],
        params={"warp_mode": warp_mode, "blend": blend},
    )
    stem = f"homography_{key}"
    out_img = os.path.join(out_dir, f"{stem}.jpg")
    out_json = os.path.join(out_dir, f"{stem}.json")

    # ====== cache hit ======
    if os.path.exists(out_img) and os.path.exists(out_json):
        with open(out_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        # sync path เผื่อเคยย้ายไฟล์
        data.setdefault("output", {})["aligned_image"] = out_img
        data["json_path"] = out_json
        return data

    # ====== โหลด matcher JSON ======
    with open(match_json_path, "r", encoding="utf-8") as f:
        match_data = json.load(f)

    # ต้องมี original_path ของ image1/2
    try:
        img1_path = match_data["input_features_details"]["image1"]["original_path"]
        img2_path = match_data["input_features_details"]["image2"]["original_path"]
    except Exception:
        raise ValueError("Matcher JSON ไม่มี input_features_details.image{1,2}.original_path")

    matched_points = match_data.get("matched_points")
    if not (matched_points and len(matched_points) >= 4):
        raise ValueError("Matcher JSON ไม่มี matched_points ≥ 4 (กรุณาอัปเดต matcher adapter ให้บันทึก matched_points)")

    pts1 = np.float32([m["pt1"] for m in matched_points]).reshape(-1, 1, 2)
    pts2 = np.float32([m["pt2"] for m in matched_points]).reshape(-1, 1, 2)

    # ====== คำนวณ Homography: pts2 -> pts1 (image2 -> image1) ======
    H, mask = cv2.findHomography(pts2, pts1, cv2.RANSAC, 5.0)
    if H is None:
        raise RuntimeError("Cannot compute homography matrix.")
    inliers = int(np.sum(mask)) if mask is not None else 0

    # ====== อ่านภาพ ======
    img1 = cv2.imread(img1_path)
    img2 = cv2.imread(img2_path)
    if img1 is None or img2 is None:
        raise RuntimeError("Cannot read one or both input images.")

    # ====== Warp ======
    if warp_mode == "image2_to_image1":
        h, w = img1.shape[:2]
        aligned = cv2.warpPerspective(img2, H, (w, h))
        base_for_blend = img1
    else:
        H_inv = np.linalg.inv(H)
        h2, w2 = img2.shape[:2]
        aligned = cv2.warpPerspective(img1, H_inv, (w2, h2))
        base_for_blend = img2

    if blend:
        if aligned.shape[:2] != base_for_blend.shape[:2]:
            aligned = cv2.resize(aligned, (base_for_blend.shape[1], base_for_blend.shape[0]))
        aligned = cv2.addWeighted(base_for_blend, 0.5, aligned, 0.5, 0)

    # ====== Save ======
    cv2.imwrite(out_img, aligned)

    result = {
        "alignment_tool": "RANSAC + Homography",
        "tool_version": cv2.__version__,
        "warp_mode": warp_mode,
        "blend": blend,
        "num_inliers": inliers,
        "homography_matrix": H.tolist(),
        "input_images": {"image1": img1_path, "image2": img2_path},
        "inputs": {"match_json": match_json_path},
        "output": {"aligned_image": out_img},
        "cache_key": key,
        "json_path": out_json,
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return result