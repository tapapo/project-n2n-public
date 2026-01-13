import os, json, cv2, sys, uuid
import hashlib 
import numpy as np
from typing import Tuple, Optional, Any, Dict, List

# --- Config ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

def _norm_from_str(s: Optional[str]) -> Optional[int]:
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
    if not os.path.exists(path):
        raise FileNotFoundError(f"JSON file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
        
# ✅ Helper to resolve image paths (Smart Version)
def _resolve_image_path(path: str) -> str:
    if not path: return path
    if os.path.exists(path): return path
    
    filename = os.path.basename(path)
    search_dirs = [
        os.path.join(PROJECT_ROOT, "outputs", "samples"),
        os.path.join(PROJECT_ROOT, "outputs", "uploads"),
        os.path.join(PROJECT_ROOT, "outputs"),
    ]

    for d in search_dirs:
        candidate = os.path.join(d, filename)
        if os.path.exists(candidate):
            return candidate
            
    rel_path = os.path.join(PROJECT_ROOT, path.lstrip("/"))
    if os.path.exists(rel_path): return rel_path
    
    return path

def load_descriptor_data(json_path: str):
    data = _read_json(json_path)

    if "matching_tool" in data:
        raise ValueError(f"Invalid input: Input is a '{data['matching_tool']}' result. BFMatcher requires Feature files (SIFT/SURF/ORB).")
    
    if "tool" not in data and "keypoints" not in data:
         raise ValueError("Invalid input: JSON missing 'tool' and 'keypoints'.")

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
        desc_dim = int(data.get("descriptor_dim", 128))
        if descriptors.size == 0:
            descriptors = np.empty((0, desc_dim), dtype=np.float32)
        default_norm = cv2.NORM_L2

    elif tool_name == "ORB":
        descriptors = np.array(descriptors_list, dtype=np.uint8)
        if descriptors.size == 0:
            descriptors = np.empty((0, 32), dtype=np.uint8)

        wta_k = None
        try:
            wta_k = int(data.get("orb_parameters_used", {}).get("WTA_K"))
        except Exception:
            wta_k = None

        if wta_k in (3, 4):
            default_norm = cv2.NORM_HAMMING2
        else:
            default_norm = cv2.NORM_HAMMING
        extra["WTA_K"] = wta_k

    else:
        if descriptors_list:
             descriptors = np.array(descriptors_list)
             default_norm = cv2.NORM_L2
        else:
             raise ValueError(f"Unsupported descriptor tool: {tool_name}")

    img_path = image_dict.get("original_path")
    if not img_path and image_dict.get("file_name"):
        img_path = image_dict.get("file_name")
    
    if img_path:
        img_path = _resolve_image_path(img_path)
        
    return keypoints, descriptors, tool_name, img_path, default_norm, extra


def _validate_norm(tool: str, norm_override: Optional[str], resolved_norm: int):
    """
    ตรวจสอบความเข้ากันได้ของ Tool และ Norm (Strict Mode)
    """
    tool = tool.upper()
    norm_str = str(norm_override).upper() if norm_override else "AUTO"

    # กฎของ SIFT/SURF (Float features)
    if tool in ("SIFT", "SURF"):
        if "HAMMING" in norm_str or resolved_norm in (cv2.NORM_HAMMING, cv2.NORM_HAMMING2):
             raise ValueError(
                 f"Configuration Error: You selected '{norm_str}' (Binary Distance) for '{tool}' (Float Features). "
                 f"Please select 'L2' or 'L1'."
             )

    # กฎของ ORB (Binary features)
    if tool == "ORB":
        if "L" in norm_str or resolved_norm in (cv2.NORM_L1, cv2.NORM_L2):
             raise ValueError(
                 f"Configuration Error: You selected '{norm_str}' (Euclidean Distance) for '{tool}' (Binary Features). "
                 f"ORB works best with 'HAMMING' or 'HAMMING2'."
             )


def _image_size(img_path: Optional[str]) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    if not img_path: return None, None, None
    real_path = _resolve_image_path(img_path)
    if not os.path.exists(real_path):
        return None, None, None
    img = cv2.imread(real_path, cv2.IMREAD_UNCHANGED)
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
    draw_mode: Optional[str] = "good",
):
    # 1. Load Data
    kp1, des1, tool1, img_path1, default_norm1, extra1 = load_descriptor_data(json_a)
    kp2, des2, tool2, img_path2, default_norm2, extra2 = load_descriptor_data(json_b)

    if tool1 != tool2:
        raise ValueError(f"Mismatch: Input 1 is '{tool1}' but Input 2 is '{tool2}'. They must be the same.")

    # ORB handling
    if tool1 == "ORB":
        wta1 = extra1.get("WTA_K")
        wta2 = extra2.get("WTA_K")
        if (wta1 is not None) and (wta2 is not None) and (wta1 != wta2):
            raise ValueError(f"ORB WTA_K mismatch: {wta1} vs {wta2}")
        if wta1 in (3, 4) or wta2 in (3, 4):
            default_norm1 = default_norm2 = cv2.NORM_HAMMING2
        else:
            default_norm1 = default_norm2 = cv2.NORM_HAMMING

    # Determine norm
    parsed_norm = _norm_from_str(norm_override)
    if parsed_norm is None and norm_override and str(norm_override).strip().upper() not in ("AUTO", "DEFAULT"):
         # ถ้า parse ไม่ได้และไม่ใช่ AUTO ถือว่าผิด
         raise ValueError(f"Unknown norm_override '{norm_override}'")

    desired_norm = parsed_norm if parsed_norm is not None else default_norm1

    # 🔥 VALIDATE STRICTLY: เรียกยามเฝ้าประตู
    _validate_norm(tool1, norm_override, desired_norm)

    if ransac_thresh <= 0:
        raise ValueError("ransac_thresh must be > 0")

    use_cross_check = bool(cross_check) if cross_check is not None else (tool1 == "ORB")

    if (not use_cross_check) and (lowe_ratio is not None) and not (0.0 < lowe_ratio < 1.0):
        raise ValueError("lowe_ratio must be in (0,1)")

    if use_cross_check:
        effective_lowe_ratio: Optional[float] = None
    else:
        effective_lowe_ratio = 0.75 if lowe_ratio is None else lowe_ratio

    mode_in = (draw_mode or "good").lower()
    if mode_in not in ("good", "inliers"):
        mode_in = "good"

    # 2. Matching
    bf = cv2.BFMatcher(desired_norm, crossCheck=use_cross_check)

    raw_matches, good_matches = [], []
    if use_cross_check:
        if des1.size > 0 and des2.size > 0:
            matches = bf.match(des1, des2)
            raw_matches = matches
            good_matches = sorted(matches, key=lambda x: x.distance)
    else:
        if des1.shape[0] >= 1 and des2.shape[0] >= 1:
            matches = bf.knnMatch(des1, des2, k=2)
            raw_matches = matches
            for pair in matches:
                if len(pair) < 2:
                    continue
                m, n = pair
                if m.distance < effective_lowe_ratio * n.distance:
                    good_matches.append(m)
            good_matches = sorted(good_matches, key=lambda x: x.distance)

    # 3. Homography
    inliers = 0
    inlier_mask = None
    homography_reason = None
    matched_points = []
    
    if len(good_matches) >= 4:
        pts_a = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        pts_b = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(pts_a, pts_b, cv2.RANSAC, ransac_thresh)
        if mask is not None:
            inliers = int(mask.sum())
            inlier_mask = mask.ravel().tolist()
            for (m, flag) in zip(good_matches, inlier_mask):
                if flag: 
                    matched_points.append({
                        "pt1": [float(kp1[m.queryIdx].pt[0]), float(kp1[m.queryIdx].pt[1])],
                        "pt2": [float(kp2[m.trainIdx].pt[0]), float(kp2[m.trainIdx].pt[1])],
                    })
        else:
            homography_reason = "findHomography_failed"
    else:
        homography_reason = "not_enough_good_matches"

    # 4. Prepare Output Dir
    if out_root is None:
        out_root = os.path.join(PROJECT_ROOT, "outputs")
        
    out_dir = os.path.join(out_root, "features", "bfmatcher_outputs")
    def _ensure_dir(path: str):
        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)
    _ensure_dir(out_dir)
    
    # Generate Hash
    config_map = {
        "json1": os.path.basename(json_a),
        "json2": os.path.basename(json_b),
        "norm": desired_norm,
        "cross": use_cross_check,
        "lowe": effective_lowe_ratio,
        "ransac": ransac_thresh,
        "mode": mode_in
    }
    config_str = json.dumps(config_map, sort_keys=True, default=str)
    param_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()[:8]
    stem = f"bf_{param_hash}"
    
    out_json_path = os.path.join(out_dir, f"{stem}.json")
    out_vis_path = os.path.join(out_dir, f"{stem}_vis.jpg")

    if os.path.exists(out_json_path) and os.path.exists(out_vis_path):
         try:
            with open(out_json_path, "r", encoding="utf-8") as f:
                d = json.load(f)
            d["json_path"] = out_json_path
            return d
         except:
            pass

    # 5. Visualization
    w1, h1, c1 = _image_size(img_path1)
    w2, h2, c2 = _image_size(img_path2)
    
    vis_path_rel = None
    if img_path1 and img_path2:
        img1 = cv2.imread(_resolve_image_path(img_path1))
        img2 = cv2.imread(_resolve_image_path(img_path2))
        
        if img1 is not None and img2 is not None and len(good_matches) > 0:
            draw_list = good_matches
            matches_mask = inlier_mask if (mode_in == "inliers" and inlier_mask) else None
            
            vis = cv2.drawMatches(
                img1, kp1, img2, kp2, draw_list[:200], None, 
                matchesMask=matches_mask[:200] if matches_mask else None,
                flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
            )
            
            cv2.imwrite(out_vis_path, vis)
            vis_path_rel = f"/static/features/bfmatcher_outputs/{stem}_vis.jpg"

    # 6. Save JSON
    result = {
        "matching_tool": "BFMatcher",
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "bfmatcher_parameters_used": {
            "norm_type": _norm_to_str(desired_norm),
            "cross_check": use_cross_check,
            "lowes_ratio_threshold": effective_lowe_ratio,
            "ransac_thresh": ransac_thresh,
            "draw_mode": mode_in,
        },
        "input_features_details": {
            "image1": {
                "original_path": img_path1,
                "file_name": os.path.basename(img_path1) if img_path1 else "unknown",
                "feature_tool": tool1,
                "num_keypoints": len(kp1),
            },
            "image2": {
                "original_path": img_path2,
                "file_name": os.path.basename(img_path2) if img_path2 else "unknown",
                "feature_tool": tool2,
                "num_keypoints": len(kp2),
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
        "matched_points": matched_points, 
        "vis_url": vis_path_rel,
        "parameters_hash": config_map
    }

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    result["json_path"] = out_json_path
    return result