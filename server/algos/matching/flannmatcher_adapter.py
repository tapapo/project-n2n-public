# File: server/algos/matching/flannmatcher_adapter.py
import os, json, cv2, sys
import hashlib 
import numpy as np
from typing import Optional, Dict, Any, List, Tuple

# --- Config ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

# ---------- utils ----------
def _read_json(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        raise FileNotFoundError(f"JSON file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

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

def _image_size(img_path: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
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


# ---------- load features ----------
def load_descriptor_data(json_path: str) -> Tuple[List[cv2.KeyPoint], np.ndarray, str, str, Dict[str, Any]]:
    data = _read_json(json_path)

    if "matching_tool" in data:
        raise ValueError(f"Error: Invalid input. Input is a '{data['matching_tool']}' result, expected Feature files.")

    tool = str(data.get("tool", "UNKNOWN")).upper()
    kps_raw = data.get("keypoints", [])
    
    img_path = data.get("image", {}).get("original_path")
    if not img_path:
         img_path = data.get("image", {}).get("file_name")
    
    if img_path:
        img_path = _resolve_image_path(img_path)

    keypoints: List[cv2.KeyPoint] = []
    desc_list: List[Any] = []
    for kp in kps_raw:
        keypoints.append(
            cv2.KeyPoint(
                x=float(kp["x"]), y=float(kp["y"]),
                size=float(kp.get("size", 1.0)),
                angle=float(kp.get("angle", -1)),
                response=float(kp.get("response", 0)),
                octave=int(kp.get("octave", 0)),
                class_id=int(kp.get("class_id", -1)),
            )
        )
        if kp.get("descriptor") is not None:
            desc_list.append(kp["descriptor"])

    extra: Dict[str, Any] = {}

    if tool in ("SIFT", "SURF"):
        descriptors = np.array(desc_list, dtype=np.float32)
        desc_dim = int(data.get("descriptor_dim", 128))
        if descriptors.size == 0:
            descriptors = np.empty((0, desc_dim), dtype=np.float32)

    elif tool == "ORB":
        descriptors = np.array(desc_list, dtype=np.uint8)
        if descriptors.size == 0:
            descriptors = np.empty((0, 32), dtype=np.uint8)
        try:
            extra["WTA_K"] = int(data.get("orb_parameters_used", {}).get("WTA_K"))
        except Exception:
            extra["WTA_K"] = None
    else:
        if desc_list:
             descriptors = np.array(desc_list)
        else:
             descriptors = np.empty((0, 0))

    return keypoints, descriptors, tool, img_path, extra


# ---------- humanizers ----------
def humanize_index_name(index_params: Dict[str, Any]) -> str:
    alg = index_params.get("algorithm")
    if alg == 1:
        trees = index_params.get("trees")
        return f"KD-Tree{f' (trees={trees})' if trees is not None else ''}"
    if alg == 6:
        t = index_params.get("table_number")
        k = index_params.get("key_size")
        m = index_params.get("multi_probe_level")
        extras = []
        if t is not None: extras.append(f"table={t}")
        if k is not None: extras.append(f"key={k}")
        if m is not None: extras.append(f"multi={m}")
        return f"LSH ({', '.join(extras)})" if extras else "LSH"
    return f"Algorithm={alg}"


def humanize_search_name(search_params: Dict[str, Any]) -> str:
    checks = search_params.get("checks")
    return f"checks={checks}" if checks is not None else "default"


# ---------- main ----------
def run(
    json_a: str,
    json_b: str,
    out_root: str,
    *,
    lowe_ratio: Optional[float] = None,
    ransac_thresh: float = 5.0,
    index_mode: Optional[str] = "AUTO",
    kd_trees: int = 5,
    search_checks: int = 50,
    lsh_table_number: int = 6,
    lsh_key_size: int = 12,
    lsh_multi_probe_level: int = 1,
    draw_mode: Optional[str] = "good",
    max_draw: Optional[int] = None,
) -> Dict[str, Any]:

    # 1. Load Data
    kp1, des1, tool1, img1_path, extra1 = load_descriptor_data(json_a)
    kp2, des2, tool2, img2_path, extra2 = load_descriptor_data(json_b)

    if tool1 != tool2 and tool1 != "UNKNOWN" and tool2 != "UNKNOWN":
        raise ValueError(f": Tool mismatch: {tool1} vs {tool2}")

    # 🔥 GUARD CLAUSE: Strict Validation 🔥
    if len(des1) == 0 or len(des2) == 0:
         raise ValueError(f": Descriptor Empty (0 features found)")

    # 1.1 Check WTA_K mismatch for ORB (Simplified Message)
    if tool1 == "ORB" and tool2 == "ORB":
        wta1 = extra1.get("WTA_K")
        wta2 = extra2.get("WTA_K")
        if wta1 is not None and wta2 is not None and wta1 != wta2:
            raise ValueError(f": ORB WTA_K mismatch: {wta1} vs {wta2}")

    # 1.2 Check general descriptor compatibility
    if des1.dtype != des2.dtype:
        raise ValueError(f": Type mismatch: {des1.dtype} vs {des2.dtype}")

    if des1.shape[1] != des2.shape[1]:
        raise ValueError(f": Dimension mismatch: {des1.shape[1]} vs {des2.shape[1]}")


    # 2. Select Index & Validate STRICTLY 
    requested = (index_mode or "AUTO").upper()

    if tool1 in ("SIFT", "SURF"):
        if requested == "LSH":
            raise ValueError(f": Invalid Index: LSH not supported for {tool1}")

    if tool1 == "ORB":
        if requested == "KD_TREE" or "KD" in requested:
            raise ValueError(f": Invalid Index: KD-Tree not supported for ORB")

    if requested == "AUTO":
        index_selected = "KD_TREE" if tool1 in ("SIFT", "SURF") else "LSH"
        index_selected_reason = "auto_by_tool"
    else:
        index_selected = requested
        index_selected_reason = "override_respected"

    # Setup DType & Index Params
    if index_selected == "KD_TREE":
        des1 = des1.astype(np.float32, copy=False)
        des2 = des2.astype(np.float32, copy=False)
        index_params = dict(algorithm=1, trees=int(kd_trees))
    else:
        des1 = des1.astype(np.uint8, copy=False)
        des2 = des2.astype(np.uint8, copy=False)
        t = max(1, int(lsh_table_number))
        k = max(1, int(lsh_key_size))
        m = max(0, int(lsh_multi_probe_level))
        index_params = dict(algorithm=6, table_number=t, key_size=k, multi_probe_level=m)

    search_checks = max(1, int(search_checks))
    search_params = dict(checks=search_checks)

    # Setup Lowe & RANSAC
    eff_ratio = 0.8 if (lowe_ratio is None and tool1 == "ORB") else (0.75 if lowe_ratio is None else float(lowe_ratio))
    if not (0.0 < eff_ratio < 1.0):
        raise ValueError(": lowe_ratio must be between 0 and 1")
    if ransac_thresh <= 0:
        raise ValueError(": ransac_thresh must be > 0")

    # Draw Mode
    mode_in = (draw_mode or "good").lower()
    if mode_in not in ("good", "inliers"):
        mode_in = "good"

    # 3. Output Directory
    if out_root is None:
        out_root = os.path.join(PROJECT_ROOT, "outputs")
        
    out_dir = os.path.join(out_root, "features", "flannmatcher_outputs")
    if not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    # 4. Caching
    config_map = {
        "json1": os.path.basename(json_a),
        "json2": os.path.basename(json_b),
        "index": index_params,
        "search": search_params,
        "lowe": eff_ratio,
        "ransac": ransac_thresh,
        "mode": mode_in,
        "draw": max_draw
    }
    config_str = json.dumps(config_map, sort_keys=True, default=str)
    param_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()[:8]
    stem = f"flann_{param_hash}"
    
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

    # 5. Matching Process
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    raw_matches: List[Any] = []
    good_matches: List[cv2.DMatch] = []

    if des1.shape[0] >= 1 and des2.shape[0] >= 2:
        try:
            knn = flann.knnMatch(des1, des2, k=2)
            raw_matches = knn
            for pair in knn:
                if len(pair) < 2:
                    continue
                m, n = pair
                if m.distance < eff_ratio * n.distance:
                    good_matches.append(m)
            good_matches.sort(key=lambda x: x.distance)
        except Exception as e:
            # Catch internal OpenCV errors (Simplified Message)
            raise RuntimeError(f"[FLANN] 💥 Error: Internal failed: {str(e)}")

    # 6. RANSAC & Homography
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
            for i, m in enumerate(good_matches):
                if i < len(inlier_mask) and inlier_mask[i]:
                    matched_points.append({
                        "queryIdx": m.queryIdx,
                        "trainIdx": m.trainIdx,
                        "pt1": [float(kp1[m.queryIdx].pt[0]), float(kp1[m.queryIdx].pt[1])],
                        "pt2": [float(kp2[m.trainIdx].pt[0]), float(kp2[m.trainIdx].pt[1])],
                        "distance": round(float(m.distance), 4),
                        "inlier": True
                    })
        else:
            homography_reason = "findHomography_failed"
    else:
        homography_reason = "not_enough_good_matches"

    # 7. Visualization
    w1, h1, c1 = _image_size(img1_path)
    w2, h2, c2 = _image_size(img2_path)

    img1 = cv2.imread(img1_path) if img1_path and os.path.exists(img1_path) else None
    img2 = cv2.imread(img2_path) if img2_path and os.path.exists(img2_path) else None

    vis_path_rel = None
    
    if img1 is not None and img2 is not None and len(good_matches) > 0:
        draw_list = good_matches
        if mode_in == "inliers" and inlier_mask is not None:
            draw_list = [m for m, keep in zip(good_matches, inlier_mask) if keep]

        limit = 50 if max_draw is None else (len(draw_list) if max_draw <= 0 else int(max_draw))
        draw_list = draw_list[:limit]

        if len(draw_list) > 0:
            vis = cv2.drawMatches(
                img1, kp1, img2, kp2, draw_list, None,
                flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
            )
            cv2.imwrite(out_vis_path, vis)
            vis_path_rel = f"/static/features/flannmatcher_outputs/{stem}_vis.jpg"

    # 8. Save Result
    matches_output_data = [
        {"queryIdx": m.queryIdx, "trainIdx": m.trainIdx, "distance": round(float(m.distance), 4)}
        for m in good_matches
    ]

    result: Dict[str, Any] = {
        "matching_tool": "FLANNBasedMatcher",
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "flann_parameters_used": {
            "index_mode_requested": requested,
            "index_selected": index_selected,
            "index_selected_reason": index_selected_reason,
            "index_params": index_params,
            "index_name": humanize_index_name(index_params),
            "search_params": search_params,
            "search_name": humanize_search_name(search_params),
            "lowes_ratio_threshold": float(eff_ratio),
            "ransac_thresh": float(ransac_thresh),
            "draw_mode": mode_in,
        },
        "input_features_details": {
            "image1": {
                "original_path": img1_path,
                "file_name": os.path.basename(img1_path) if img1_path else "unknown",
                "feature_tool": tool1,
                "num_keypoints": len(kp1),
                **({"WTA_K": extra1.get("WTA_K")} if tool1 == "ORB" else {}),
            },
            "image2": {
                "original_path": img2_path,
                "file_name": os.path.basename(img2_path) if img2_path else "unknown",
                "feature_tool": tool2,
                "num_keypoints": len(kp2),
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
            "summary": f"{inliers} inliers / {len(good_matches)} good matches (FLANN)",
            "homography_reason": homography_reason,
        },
        "inliers": inliers,
        "inlier_mask": inlier_mask,
        "good_matches": matches_output_data,
        "matched_points": matched_points,
        "vis_url": vis_path_rel,
        "parameters_hash": config_map
    }

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    result["json_path"] = out_json_path
    return result