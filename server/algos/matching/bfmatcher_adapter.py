# server/algos/matching/bfmatcher_adapter.py
import os, json, cv2, sys, uuid
import numpy as np
from typing import Tuple, Optional, Any, Dict, List


def _norm_from_str(s: Optional[str]) -> Optional[int]:
    """
    แปลงสตริงเป็นรหัส norm ของ OpenCV
    คืน None เมื่อเป็น AUTO/DEFAULT หรือ None
    """
    if s is None:
        return None
    s2 = s.strip().upper()
    if s2 in ("AUTO", "DEFAULT"):
        return None
    if s2 in ("L2", "NORM_L2"):
        return cv2.NORM_L2
    if s2 in ("L1", "NORM_L1"):
        return cv2.NORM_L1
    if s2 in ("HAMMING", "NORM_HAMMING"):
        return cv2.NORM_HAMMING
    if s2 in ("HAMMING2", "NORM_HAMMING2"):
        return cv2.NORM_HAMMING2
    return None


def _norm_to_str(code: int) -> str:
    if code == cv2.NORM_L2:
        return "L2"
    if code == cv2.NORM_L1:
        return "L1"
    if code == cv2.NORM_HAMMING:
        return "HAMMING"
    if code == cv2.NORM_HAMMING2:
        return "HAMMING2"
    return str(code)


def _read_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_descriptor_data(json_path: str):
    """
    อ่านไฟล์ feature JSON แล้วสร้าง:
        keypoints: list[cv2.KeyPoint]
        descriptors: np.ndarray
        tool_name: str ("SIFT", "SURF", "ORB")
        img_path: str
        default_norm: int
        extra: dict  (เก็บ WTA_K ถ้าเป็น ORB)
    """
    data = _read_json(json_path)

    tool_name = str(data.get("tool", "UNKNOWN")).upper()
    keypoints_data = data.get("keypoints", [])
    image_dict = data.get("image", {}) or {}

    keypoints: List[cv2.KeyPoint] = []
    descriptors_list: List[Any] = []

    for kp in keypoints_data:
        keypoints.append(
            cv2.KeyPoint(
                x=float(kp["x"]),
                y=float(kp["y"]),
                size=float(kp.get("size", 1.0)),
                angle=float(kp.get("angle", -1)),
                response=float(kp.get("response", 0)),
                octave=int(kp.get("octave", 0)),
                class_id=int(kp.get("class_id", -1)),
            )
        )
        if kp.get("descriptor") is not None:
            descriptors_list.append(kp["descriptor"])

    extra: Dict[str, Any] = {}

    if tool_name in ("SIFT", "SURF"):
        descriptors = np.array(descriptors_list, dtype=np.float32)
        # ถ้าไม่มี descriptor ให้คง shape ถูกต้อง (เดา dim จากข้อมูล/ค่า default)
        # SIFT -> 128, SURF -> 64/128 (ระบุใน payload ผ่าน descriptor_dim)
        desc_dim = int(data.get("descriptor_dim", 128))
        if descriptors.size == 0:
            descriptors = np.empty((0, desc_dim), dtype=np.float32)
        default_norm = cv2.NORM_L2

    elif tool_name == "ORB":
        descriptors = np.array(descriptors_list, dtype=np.uint8)
        if descriptors.size == 0:
            descriptors = np.empty((0, 32), dtype=np.uint8)

        # อ่าน WTA_K ที่ใช้จริง (ถ้ามี)
        wta_k = None
        try:
            wta_k = int(data.get("orb_parameters_used", {}).get("WTA_K"))
        except Exception:
            wta_k = None

        # default norm ตาม WTA_K
        #   - 2  -> HAMMING
        #   - 3/4 -> HAMMING2
        if wta_k in (3, 4):
            default_norm = cv2.NORM_HAMMING2
        else:
            default_norm = cv2.NORM_HAMMING  # รวมกรณี None → fallback = 2
        extra["WTA_K"] = wta_k

    else:
        raise ValueError(f"Unsupported descriptor tool: {tool_name}")

    img_path = image_dict.get("original_path")
    if not img_path:
        raise ValueError("Missing image.original_path in feature JSON")

    return keypoints, descriptors, tool_name, img_path, default_norm, extra


def _validate_norm(tool: str, norm_code: int):
    if tool in ("SIFT", "SURF") and norm_code not in (cv2.NORM_L1, cv2.NORM_L2):
        raise ValueError(f"Invalid norm '{_norm_to_str(norm_code)}' for {tool}. Use L2 or L1.")
    if tool == "ORB" and norm_code not in (cv2.NORM_HAMMING, cv2.NORM_HAMMING2):
        raise ValueError(f"Invalid norm '{_norm_to_str(norm_code)}' for ORB. Use HAMMING/HAMMING2.")


def _image_size(img_path: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        return None, None, None
    h, w = img.shape[:2]
    c = 1 if img.ndim == 2 else img.shape[2]
    return w, h, c


def run(
    json_a: str,
    json_b: str,
    out_root: str,
    lowe_ratio: Optional[float] = None,
    ransac_thresh: float = 5.0,
    norm_override: Optional[str] = None,
    cross_check: Optional[bool] = None,
    draw_mode: Optional[str] = "good",  # "good" | "inliers"
):
    # --- load ---
    kp1, des1, tool1, img_path1, default_norm1, extra1 = load_descriptor_data(json_a)
    kp2, des2, tool2, img_path2, default_norm2, extra2 = load_descriptor_data(json_b)

    # ไม่รองรับ cross-descriptor: บังคับชนิดเหมือนกัน
    if tool1 != tool2:
        raise ValueError(f"Descriptor type mismatch: {tool1} vs {tool2}")

    # --- ORB: ตรวจ WTA_K และกำหนด default norm ให้ตรงกัน ---
    if tool1 == "ORB":
        wta1 = extra1.get("WTA_K")
        wta2 = extra2.get("WTA_K")

        # ถ้าทราบทั้งคู่และไม่เท่ากัน → error พร้อมคำแนะนำ
        if (wta1 is not None) and (wta2 is not None) and (wta1 != wta2):
            raise ValueError(
                f"ORB WTA_K mismatch: image1={wta1}, image2={wta2}. "
                f"Make both WTA_K equal (both 2 or both 3/4). "
                f"If you cannot change WTA_K, set a valid norm_type explicitly: "
                f"HAMMING for WTA_K=2, HAMMING2 for WTA_K=3/4."
            )

        # ใช้ค่า default_norm ให้ตรงกัน (กรณีฝั่งใดฝั่งหนึ่งเป็น 3/4 ก็ใช้ HAMMING2)
        if wta1 in (3, 4) or wta2 in (3, 4):
            default_norm1 = default_norm2 = cv2.NORM_HAMMING2
        else:
            default_norm1 = default_norm2 = cv2.NORM_HAMMING

    # --- ตัดสินใจ norm ที่ใช้จริง ---
    if norm_override is not None:
        parsed = _norm_from_str(norm_override)
        # อนุญาต AUTO/DEFAULT โดยไม่ error (ตีความว่าไม่ override)
        if parsed is None and str(norm_override).strip().upper() not in ("AUTO", "DEFAULT"):
            raise ValueError(
                f"Unknown norm_override '{norm_override}'. "
                f"Use one of: L2, L1, HAMMING, HAMMING2, AUTO."
            )
        desired_norm = parsed if parsed is not None else default_norm1
    else:
        desired_norm = default_norm1

    _validate_norm(tool1, desired_norm)

    # --- validate พารามิเตอร์ ---
    if ransac_thresh <= 0:
        raise ValueError("ransac_thresh must be > 0")

    # --- ตัดสินใจ cross-check ---
    # None → default: ORB=True, อื่นๆ=False
    use_cross_check = bool(cross_check) if cross_check is not None else (tool1 == "ORB")

    # --- กำหนด Lowe's ratio ที่ใช้จริง ---
    # ตรวจช่วงค่าเฉพาะเมื่อจะใช้งานจริง (cross_check=False)
    if (not use_cross_check) and (lowe_ratio is not None) and not (0.0 < lowe_ratio < 1.0):
        raise ValueError("lowe_ratio must be in (0,1)")

    if use_cross_check:
        effective_lowe_ratio: Optional[float] = None  # ปิด Lowe เมื่อใช้ cross-check
    else:
        if tool1 == "ORB" and (_norm_from_str(norm_override) is None):
            # ORB (ไม่ได้ override norm / หรือส่ง AUTO/DEFAULT) → default 0.8 ถ้าไม่ส่งเอง
            effective_lowe_ratio = 0.8 if lowe_ratio is None else lowe_ratio
        else:
            # SIFT/SURF หรือ ORB ที่ override norm → default 0.75 ถ้าไม่ส่งเอง
            effective_lowe_ratio = 0.75 if lowe_ratio is None else lowe_ratio

    # --- สะสาง draw_mode ให้ปลอดภัย ---
    mode_in = (draw_mode or "good").lower()
    if mode_in not in ("good", "inliers"):
        mode_in = "good"

    bf = cv2.BFMatcher(desired_norm, crossCheck=use_cross_check)

    # --- matching ---
    raw_matches, good_matches = [], []

    if use_cross_check:
        # แบบ 1-1
        if des1.size > 0 and des2.size > 0:
            matches = bf.match(des1, des2)
            raw_matches = matches
            good_matches = sorted(matches, key=lambda x: x.distance)
        else:
            raw_matches = []
            good_matches = []
    else:
        # แบบ KNN + Lowe
        if des1.shape[0] >= 1 and des2.shape[0] >= 1:
            assert effective_lowe_ratio is not None, "internal: ratio must be decided for KNN"
            matches = bf.knnMatch(des1, des2, k=2)
            raw_matches = matches
            for pair in matches:
                if len(pair) < 2:
                    continue
                m, n = pair
                if m.distance < effective_lowe_ratio * n.distance:
                    good_matches.append(m)
            good_matches = sorted(good_matches, key=lambda x: x.distance)
        else:
            raw_matches = []
            good_matches = []

    # --- RANSAC / inliers ---
    inliers = 0
    inlier_mask = None
    homography_reason = None
    if len(good_matches) >= 4:
        pts_a = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        pts_b = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(pts_a, pts_b, cv2.RANSAC, ransac_thresh)
        if mask is not None:
            inliers = int(mask.sum())
            inlier_mask = mask.ravel().tolist()
        else:
            homography_reason = "findHomography_failed"
    else:
        homography_reason = "not_enough_good_matches"

    # --- sizes ---
    w1, h1, c1 = _image_size(img_path1)
    w2, h2, c2 = _image_size(img_path2)

    # --- visualization (ตาม draw_mode) ---
    vis_path = None
    img1 = cv2.imread(img_path1)
    img2 = cv2.imread(img_path2)
    if img1 is not None and img2 is not None and len(good_matches) > 0:
        draw_list = good_matches
        if mode_in == "inliers" and inlier_mask is not None:
            draw_list = [m for m, flag in zip(good_matches, inlier_mask) if flag]

        if len(draw_list) > 0:
            vis = cv2.drawMatches(
                img1, kp1, img2, kp2, draw_list[:50], None,
                flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
            )
            out_vis_dir = os.path.join(out_root, "features", "bfmatcher_outputs", "visuals")
            os.makedirs(out_vis_dir, exist_ok=True)
            vis_path = os.path.join(out_vis_dir, f"bf_vis_{uuid.uuid4().hex[:8]}.jpg")
            cv2.imwrite(vis_path, vis)

    # --- JSON out ---
    out_dir = os.path.join(out_root, "features", "bfmatcher_outputs")
    os.makedirs(out_dir, exist_ok=True)
    out_json = os.path.join(out_dir, f"bfmatcher_{tool1.lower()}_{uuid.uuid4().hex[:8]}.json")

    matches_output_data = [
        {"queryIdx": m.queryIdx, "trainIdx": m.trainIdx, "distance": round(float(m.distance), 4)}
        for m in good_matches
    ]

    result = {
        "matching_tool": "BFMatcher",
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "bfmatcher_parameters_used": {
            "norm_type": _norm_to_str(desired_norm),
            "cross_check": use_cross_check,
            "lowes_ratio_threshold": (effective_lowe_ratio if not use_cross_check else None),
            "ransac_thresh": ransac_thresh,
            "draw_mode": mode_in,
        },
        "input_features_details": {
            "image1": {
                "original_path": img_path1,
                "file_name": os.path.basename(img_path1),
                "feature_tool": tool1,
                "num_keypoints": len(kp1),
                "descriptor_shape": list(des1.shape),
                **({"WTA_K": extra1.get("WTA_K")} if tool1 == "ORB" else {}),
            },
            "image2": {
                "original_path": img_path2,
                "file_name": os.path.basename(img_path2),
                "feature_tool": tool2,
                "num_keypoints": len(kp2),
                "descriptor_shape": list(des2.shape),
                **({"WTA_K": extra2.get("WTA_K")} if tool2 == "ORB" else {}),
            },
        },
        "inputs": {
            "image1": {"width": w1, "height": h1, "channels": c1},
            "image2": {"width": w2, "height": h2, "channels": c2},
        },
        "matching_statistics": {
            "num_raw_matches": len(raw_matches),
            "num_good_matches": len(good_matches),
            "num_inliers": inliers,
            "summary": f"{inliers} inliers / {len(good_matches)} good matches",
            "homography_reason": homography_reason,
        },
        "inliers": inliers,
        "inlier_mask": inlier_mask,
        "good_matches": matches_output_data,
        "vis_url": vis_path,
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    result["json_path"] = out_json
    return result