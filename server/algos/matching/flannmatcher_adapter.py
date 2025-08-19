import os, json, cv2, sys, uuid
import numpy as np


def load_descriptor_data(json_path):
    """โหลด keypoints และ descriptors จากไฟล์ JSON (SIFT/SURF/ORB)"""
    with open(json_path, 'r') as f:
        data = json.load(f)

    tool_name = data.get('tool', 'UNKNOWN').upper()
    keypoints_data = data['keypoints']

    keypoints, descriptors_list = [], []
    for kp in keypoints_data:
        keypoints.append(cv2.KeyPoint(
            x=float(kp['x']), y=float(kp['y']),
            size=float(kp.get('size', 1.0)),
            angle=float(kp.get('angle', -1)),
            response=float(kp.get('response', 0)),
            octave=int(kp.get('octave', 0)),
            class_id=int(kp.get('class_id', -1))
        ))
        if kp.get("descriptor") is not None:
            descriptors_list.append(kp["descriptor"])

    if tool_name in ["SIFT", "SURF"]:
        descriptors = np.array(descriptors_list, dtype=np.float32)
        norm_type, flann_algorithm = cv2.NORM_L2, "KD_TREE"
    elif tool_name == "ORB":
        descriptors = np.array(descriptors_list, dtype=np.uint8)
        norm_type, flann_algorithm = cv2.NORM_HAMMING, "LSH"
    else:
        raise ValueError(f"Unsupported descriptor tool: {tool_name}")

    # กรณี descriptor ว่าง
    if descriptors.size == 0:
        desc_dim = 128 if tool_name in ["SIFT", "SURF"] else 32
        descriptors = np.empty((0, desc_dim), dtype=descriptors.dtype)

    return keypoints, descriptors, tool_name, data["image"]["original_path"], norm_type, flann_algorithm


def run(json_a, json_b, out_root, lowe_ratio=0.75, ransac_thresh=5.0):
    """FLANN-based Matcher + Homography"""
    kp1, des1, tool1, img_path1, norm_type, algo1 = load_descriptor_data(json_a)
    kp2, des2, tool2, img_path2, _, algo2 = load_descriptor_data(json_b)

    if tool1 != tool2:
        raise ValueError(f"Descriptor type mismatch: {tool1} vs {tool2}")

    # --- เลือก FLANN parameters ---
    if tool1 in ["SIFT", "SURF"]:
        index_params = dict(algorithm=1, trees=5)  # KD-Tree
    else:  # ORB ใช้ LSH
        index_params = dict(algorithm=6, table_number=6,
                            key_size=12, multi_probe_level=1)

    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)

    # --- Matching ---
    raw_matches, good_matches = [], []
    if des1.shape[0] >= 2 and des2.shape[0] >= 2:
        matches = flann.knnMatch(des1, des2, k=2)
        raw_matches = matches
        for mn in matches:
            if len(mn) == 2:  # ✅ ป้องกัน unpack error
                m, n = mn
                if m.distance < lowe_ratio * n.distance:
                    good_matches.append(m)

        good_matches = sorted(good_matches, key=lambda x: x.distance)

    # --- RANSAC inliers ---
    inliers = 0
    if len(good_matches) >= 4:
        pts_a = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        pts_b = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(pts_a, pts_b, cv2.RANSAC, ransac_thresh)
        inliers = int(mask.sum()) if mask is not None else 0

    # --- Visualization ---
    img1, img2 = cv2.imread(img_path1), cv2.imread(img_path2)
    vis_path = None
    if img1 is not None and img2 is not None and len(good_matches) > 0:
        vis = cv2.drawMatches(img1, kp1, img2, kp2, good_matches[:50], None,
                              flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
        out_vis_dir = os.path.join(out_root, "features", "flannmatcher_outputs", "visuals")
        os.makedirs(out_vis_dir, exist_ok=True)
        vis_path = os.path.join(out_vis_dir, f"flann_vis_{uuid.uuid4().hex[:8]}.jpg")
        cv2.imwrite(vis_path, vis)

    # --- Save JSON ---
    out_dir = os.path.join(out_root, "features", "flannmatcher_outputs")
    os.makedirs(out_dir, exist_ok=True)
    out_json = os.path.join(out_dir, f"flannmatcher_{tool1.lower()}_{uuid.uuid4().hex[:8]}.json")

    matches_output_data = [
        {"queryIdx": m.queryIdx, "trainIdx": m.trainIdx, "distance": round(m.distance, 4)}
        for m in good_matches[:10]
    ]

    result = {
        "matching_tool": "FLANNBasedMatcher",
        "flann_parameters_used": {
            "index_params": index_params,
            "search_params": search_params,
            "lowes_ratio_threshold": lowe_ratio,
            "ransac_thresh": ransac_thresh
        },
        "input_features_details": {
            "image1": {"file_name": os.path.basename(img_path1), "num_keypoints": len(kp1)},
            "image2": {"file_name": os.path.basename(img_path2), "num_keypoints": len(kp2)},
        },
        "matching_statistics": {
            "num_raw_matches": len(raw_matches),
            "num_good_matches": len(good_matches),
            "num_inliers": inliers,
            "summary": f"{inliers} inliers / {len(good_matches)} good matches"
        },
        "inliers": inliers,
        "good_matches": matches_output_data,
        "vis_url": vis_path
    }

    with open(out_json, "w") as f:
        json.dump(result, f, indent=2)

    return result