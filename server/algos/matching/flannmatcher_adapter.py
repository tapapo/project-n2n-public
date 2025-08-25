import os, json, cv2, sys, uuid
import numpy as np
from typing import Optional, Dict, Any, List, Tuple

def _read_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_descriptor_data(json_path: str) -> Tuple[List[cv2.KeyPoint], np.ndarray, str, str]:
    data = _read_json(json_path)
    tool = str(data.get("tool", "UNKNOWN")).upper()
    kps_raw = data.get("keypoints", [])
    img_path = data.get("image", {}).get("original_path")
    if not img_path:
        raise ValueError("Missing image.original_path in feature JSON")

    kps: List[cv2.KeyPoint] = []
    desc_list: List[Any] = []
    for kp in kps_raw:
        kps.append(cv2.KeyPoint(
            x=float(kp["x"]), y=float(kp["y"]),
            size=float(kp.get("size", 1.0)),
            angle=float(kp.get("angle", -1)),
            response=float(kp.get("response", 0)),
            octave=int(kp.get("octave", 0)),
            class_id=int(kp.get("class_id", -1)),
        ))
        if kp.get("descriptor") is not None:
            desc_list.append(kp["descriptor"])

    if tool in ("SIFT", "SURF"):
        desc = np.array(desc_list, dtype=np.float32)
        if desc.size == 0:
            desc = np.empty((0, 128), dtype=np.float32)
    elif tool == "ORB":
        desc = np.array(desc_list, dtype=np.uint8)
        if desc.size == 0:
            desc = np.empty((0, 32), dtype=np.uint8)
    else:
        raise ValueError(f"Unsupported descriptor tool: {tool}")

    return kps, desc, tool, img_path

# ---------- humanizers ----------
def humanize_index_name(index_params: Dict[str, Any]) -> str:
    alg = str(index_params.get("algorithm"))
    if alg in ("1", "KD_TREE", "KDTREE"):
        trees = index_params.get("trees")
        return f"KD-Tree{f' (trees={trees})' if trees is not None else ''}"
    if alg in ("6", "LSH"):
        t = index_params.get("table_number")
        k = index_params.get("key_size")
        m = index_params.get("multi_probe_level")
        extra = ", ".join([f"table={t}", f"key={k}", f"multi={m}"])
        return f"LSH ({extra})"
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
    lowe_ratio: float = 0.75,
    ransac_thresh: float = 5.0,
    index_mode: Optional[str] = "AUTO",     # 'AUTO' | 'KD_TREE' | 'LSH'
    kd_trees: int = 5,
    search_checks: int = 50,
    lsh_table_number: int = 6,
    lsh_key_size: int = 12,
    lsh_multi_probe_level: int = 1,
    draw_mode: Optional[str] = "good",      # 'good' | 'inliers'
    max_draw: Optional[int] = None,         # 0=all, None=50
) -> Dict[str, Any]:

    kp1, des1, tool1, img1_path = load_descriptor_data(json_a)
    kp2, des2, tool2, img2_path = load_descriptor_data(json_b)
    if tool1 != tool2:
        raise ValueError(f"Descriptor type mismatch: {tool1} vs {tool2}")

    # --- select index ---
    requested = (index_mode or "AUTO").upper()
    if requested == "AUTO":
        index_selected = "KD_TREE" if tool1 in ("SIFT", "SURF") else "LSH"
        index_selected_reason = "auto_by_tool"
    else:
        if requested == "KD_TREE" and tool1 == "ORB":
            raise ValueError("Incompatible index: KD_TREE requires float descriptors (SIFT/SURF); ORB must use LSH.")
        elif requested == "LSH" and tool1 in ("SIFT", "SURF"):
            raise ValueError("Incompatible index: LSH is for ORB (binary); SIFT/SURF must use KD_TREE.")
        elif requested in ("KD_TREE", "LSH"):
            index_selected = requested
            index_selected_reason = "override_respected"
        else:
            raise ValueError(f"Invalid index_mode: {requested}. Use AUTO, KD_TREE or LSH.")

    index_params: Dict[str, Any]
    if index_selected == "KD_TREE":
        index_params = dict(algorithm=1, trees=int(kd_trees))
    else:
        index_params = dict(
            algorithm=6,
            table_number=int(lsh_table_number),
            key_size=int(lsh_key_size),
            multi_probe_level=int(lsh_multi_probe_level),
        )

    search_checks = max(1, int(search_checks))
    search_params = dict(checks=search_checks)

    flann = cv2.FlannBasedMatcher(index_params, search_params)

    # --- match ---
    raw_matches: List[Any] = []
    good_matches: List[cv2.DMatch] = []
    if des1.shape[0] >= 2 and des2.shape[0] >= 2:
        knn = flann.knnMatch(des1, des2, k=2)
        raw_matches = knn
        for pair in knn:
            if len(pair) == 2:
                m, n = pair
                if m.distance < lowe_ratio * n.distance:
                    good_matches.append(m)
        good_matches.sort(key=lambda x: x.distance)

    # --- ransac ---
    inliers = 0
    mask_vec = None
    if len(good_matches) >= 4:
        pts_a = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        pts_b = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(pts_a, pts_b, cv2.RANSAC, ransac_thresh)
        inliers = int(mask.sum()) if mask is not None else 0
        mask_vec = mask.ravel().tolist() if mask is not None else None

    # --- visualization + sizes ---
    vis_path = None
    img1 = cv2.imread(img1_path)
    img2 = cv2.imread(img2_path)
    h1=w1=h2=w2=None
    if img1 is not None: h1, w1 = img1.shape[:2]
    if img2 is not None: h2, w2 = img2.shape[:2]

    if img1 is not None and img2 is not None and len(good_matches) > 0:
        which = (draw_mode or "good").lower()
        draw_list = good_matches
        if which == "inliers" and mask_vec is not None:
            draw_list = [m for m, keep in zip(good_matches, mask_vec) if keep]
        limit = 50 if max_draw is None else max(0, int(max_draw))
        if limit > 0:
            draw_list = draw_list[:limit]
        if draw_list:
            vis = cv2.drawMatches(
                img1, kp1, img2, kp2, draw_list, None,
                flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
            )
            vis_dir = os.path.join(out_root, "features", "flannmatcher_outputs", "visuals")
            os.makedirs(vis_dir, exist_ok=True)
            vis_path = os.path.join(vis_dir, f"flann_vis_{uuid.uuid4().hex[:8]}.jpg")
            cv2.imwrite(vis_path, vis)

    # --- json out ---
    out_dir = os.path.join(out_root, "features", "flannmatcher_outputs")
    os.makedirs(out_dir, exist_ok=True)
    out_json = os.path.join(out_dir, f"flannmatcher_{tool1.lower()}_{uuid.uuid4().hex[:8]}.json")

    summary = f"{inliers} inliers / {len(good_matches)} good matches"
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
            "lowes_ratio_threshold": float(lowe_ratio),
            "ransac_thresh": float(ransac_thresh),
            "draw_mode": (draw_mode or "good").lower(),
            "max_draw": None if max_draw is None else int(max_draw),
        },
        "input_features_details": {
            "image1": {"file_name": os.path.basename(img1_path), "feature_tool": tool1, "num_keypoints": len(kp1)},
            "image2": {"file_name": os.path.basename(img2_path), "feature_tool": tool2, "num_keypoints": len(kp2)},
        },
        "inputs": {
            "image1": {"file_name": os.path.basename(img1_path), "width": w1, "height": h1},
            "image2": {"file_name": os.path.basename(img2_path), "width": w2, "height": h2},
        },
        "matching_statistics": {
            "num_raw_matches": len(raw_matches),
            "num_good_matches": len(good_matches),
            "num_inliers": inliers,
            "summary": summary,
        },
        "inliers": inliers,
        "good_matches": len(good_matches),
        "vis_url": vis_path,
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    result["json_path"] = out_json
    return result