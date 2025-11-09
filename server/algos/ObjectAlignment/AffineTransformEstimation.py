# server/algos/alignment/AffineTransformEstimation.py
import os
import cv2
import json
import numpy as np
from typing import Dict, Any

from ...cache_utils import make_cache_key, ensure_dir


def run(
    match_json_path: str,
    out_root: str,
    model: str = "affine",                # "affine" (6 DOF) | "partial" (similarity)
    warp_mode: str = "image2_to_image1",  # "image2_to_image1" | "image1_to_image2"
    blend: bool = False,
    ransac_thresh: float = 3.0,
    confidence: float = 0.99,
    refine_iters: int = 10,
) -> Dict[str, Any]:
    """
    🧭 Affine Transform Estimation
    =========================================
    ประมาณการการแปลงเชิงเส้น (Linear Transformation)
    ระหว่างภาพ 2 ภาพจากจุดคู่ (matched_points)

    ✅ ใช้ได้กับ matcher JSON ที่มี matched_points
    ✅ รองรับ 2 โหมด:
        - model="affine"   → cv2.estimateAffine2D()  (6 DOF)
        - model="partial"  → cv2.estimateAffinePartial2D() (similarity transform)
    ✅ ใช้ RANSAC เพื่อตัด outliers

    Output:
        <out_root>/features/affinetransformestimation_outputs/affine_<hash>.jpg
        <out_root>/features/affinetransformestimation_outputs/affine_<hash>.json
    """

    # ---------- เตรียม directory ----------
    out_dir = os.path.join(out_root, "features", "affinetransformestimation_outputs")
    ensure_dir(out_dir)

    # ---------- สร้าง hash key ----------
    key = make_cache_key(
        "AFFINE_TRANSFORM",
        files=[match_json_path],
        params={
            "model": model,
            "warp_mode": warp_mode,
            "blend": blend,
            "ransac_thresh": ransac_thresh,
            "confidence": confidence,
            "refine_iters": refine_iters,
        },
    )
    stem = f"affine_{key}"
    out_img = os.path.join(out_dir, f"{stem}.jpg")
    out_json = os.path.join(out_dir, f"{stem}.json")

    # ---------- ถ้ามี cache เดิม ----------
    if os.path.exists(out_img) and os.path.exists(out_json):
        with open(out_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("output", {})["aligned_image"] = out_img
        data["json_path"] = out_json
        return data

    # ---------- โหลด matcher JSON ----------
    with open(match_json_path, "r", encoding="utf-8") as f:
        match_data = json.load(f)

    try:
        img1_path = match_data["input_features_details"]["image1"]["original_path"]
        img2_path = match_data["input_features_details"]["image2"]["original_path"]
    except Exception:
        raise ValueError("Matcher JSON ไม่มี input_features_details.image{1,2}.original_path")

    matched_points = match_data.get("matched_points")
    if not (matched_points and len(matched_points) >= 3):
        raise ValueError("ต้องมี matched_points อย่างน้อย 3 จุดสำหรับ affine transform")

    pts1 = np.float32([m["pt1"] for m in matched_points]).reshape(-1, 1, 2)
    pts2 = np.float32([m["pt2"] for m in matched_points]).reshape(-1, 1, 2)

    # ---------- ประมาณการ Affine Transform ----------
    if model.lower() == "partial":
        M, mask = cv2.estimateAffinePartial2D(
            pts2, pts1,
            method=cv2.RANSAC,
            ransacReprojThreshold=ransac_thresh,
            confidence=confidence,
            refineIters=refine_iters,
        )
        model_used = "Similarity Transform (estimateAffinePartial2D)"
    else:
        M, mask = cv2.estimateAffine2D(
            pts2, pts1,
            method=cv2.RANSAC,
            ransacReprojThreshold=ransac_thresh,
            confidence=confidence,
            refineIters=refine_iters,
        )
        model_used = "Full Affine Transform (estimateAffine2D)"

    if M is None:
        raise RuntimeError("ไม่สามารถคำนวณ affine matrix ได้")

    inliers = int(mask.sum()) if mask is not None else 0

    # ---------- โหลดภาพ ----------
    img1 = cv2.imread(img1_path)
    img2 = cv2.imread(img2_path)
    if img1 is None or img2 is None:
        raise RuntimeError("ไม่สามารถอ่านภาพได้")

    # ---------- Warp ----------
    if warp_mode == "image2_to_image1":
        h, w = img1.shape[:2]
        aligned = cv2.warpAffine(img2, M, (w, h))
        base_for_blend = img1
    else:
        M33 = np.vstack([M, [0, 0, 1]])  # ทำเป็น 3x3 ก่อนกลับเมทริกซ์
        M_inv = np.linalg.inv(M33)[0:2, :]
        h2, w2 = img2.shape[:2]
        aligned = cv2.warpAffine(img1, M_inv, (w2, h2))
        base_for_blend = img2

    if blend:
        if aligned.shape[:2] != base_for_blend.shape[:2]:
            aligned = cv2.resize(aligned, (base_for_blend.shape[1], base_for_blend.shape[0]))
        aligned = cv2.addWeighted(base_for_blend, 0.5, aligned, 0.5, 0)

    # ---------- Save ----------
    cv2.imwrite(out_img, aligned)

    result = {
        "alignment_tool": model_used,
        "tool_version": cv2.__version__,
        "model": model.lower(),
        "warp_mode": warp_mode,
        "blend": blend,
        "ransac_reproj_threshold": ransac_thresh,
        "confidence": confidence,
        "refine_iters": refine_iters,
        "num_inliers": inliers,
        "affine_matrix": M.tolist(),
        "input_images": {"image1": img1_path, "image2": img2_path},
        "inputs": {"match_json": match_json_path},
        "output": {"aligned_image": out_img},
        "cache_key": key,
        "json_path": out_json,
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return result