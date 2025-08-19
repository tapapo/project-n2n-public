import os, json, cv2, sys, uuid
import numpy as np

def load_descriptor_data(json_path):
    """โหลด keypoints และ descriptors จากไฟล์ JSON (SIFT/SURF/ORB)"""
    with open(json_path, 'r') as f:
        data = json.load(f)

    tool_name = data.get('tool', 'UNKNOWN').upper()
    keypoints_data = data['keypoints']

    keypoints = []
    descriptors_list = []
    for kp in keypoints_data:
        keypoints.append(cv2.KeyPoint(
            x=float(kp['x']),
            y=float(kp['y']),
            size=float(kp.get('size', 1.0)),
            angle=float(kp.get('angle', -1)),
            response=float(kp.get('response', 0)),
            octave=int(kp.get('octave', 0)),
            class_id=int(kp.get('class_id', -1))
        ))
        if kp.get("descriptor") is not None:
            descriptors_list.append(kp["descriptor"])

    # dtype และ dimension ของ descriptor
    if tool_name in ["SIFT", "SURF"]:
        descriptors = np.array(descriptors_list, dtype=np.float32)
        desc_dim = 128
        norm_type, norm_str = cv2.NORM_L2, "L2"
    elif tool_name == "ORB":
        descriptors = np.array(descriptors_list, dtype=np.uint8)
        desc_dim = 32
        norm_type, norm_str = cv2.NORM_HAMMING, "HAMMING"
    else:
        raise ValueError(f"Unsupported descriptor tool: {tool_name}")

    if descriptors.size == 0:
        descriptors = np.empty((0, desc_dim), dtype=descriptors.dtype)

    return keypoints, descriptors, tool_name, data["image"]["original_path"], norm_type, norm_str


def run(json_a, json_b, out_root, lowe_ratio=0.75, ransac_thresh=5.0):
    """BFMatcher + Homography (optional) + Save JSON"""
    kp1, des1, tool1, img_path1, norm_type, norm_str = load_descriptor_data(json_a)
    kp2, des2, tool2, img_path2, _, _ = load_descriptor_data(json_b)

    if tool1 != tool2:
        raise ValueError(f"Descriptor type mismatch: {tool1} vs {tool2}")

    # เลือก crossCheck ตาม tool
    use_cross_check = True if tool1 == "ORB" else False
    bf = cv2.BFMatcher(norm_type, crossCheck=use_cross_check)

    raw_matches, good_matches = [], []

    if use_cross_check:
        matches = bf.match(des1, des2)
        raw_matches = matches
        good_matches = sorted(matches, key=lambda x: x.distance)
    else:
        if des1.shape[0] >= 2 and des2.shape[0] >= 2:
            matches = bf.knnMatch(des1, des2, k=2)
            raw_matches = matches
            for m, n in matches:
                if m.distance < lowe_ratio * n.distance:
                    good_matches.append(m)
            good_matches = sorted(good_matches, key=lambda x: x.distance)

    # RANSAC inliers
    inliers = 0
    if len(good_matches) >= 4:
        pts_a = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        pts_b = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(pts_a, pts_b, cv2.RANSAC, ransac_thresh)
        inliers = int(mask.sum()) if mask is not None else 0

    # โหลดรูป + visualization
    img1 = cv2.imread(img_path1)
    img2 = cv2.imread(img_path2)
    vis_path = None
    if img1 is not None and img2 is not None and len(good_matches) > 0:
        vis = cv2.drawMatches(img1, kp1, img2, kp2, good_matches[:50], None,
                              flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
        out_vis_dir = os.path.join(out_root, "features", "bfmatcher_outputs", "visuals")
        os.makedirs(out_vis_dir, exist_ok=True)
        vis_path = os.path.join(out_vis_dir, f"bf_vis_{uuid.uuid4().hex[:8]}.jpg")
        cv2.imwrite(vis_path, vis)

    # เตรียม output JSON
    out_dir = os.path.join(out_root, "features", "bfmatcher_outputs")
    os.makedirs(out_dir, exist_ok=True)

    out_json = os.path.join(out_dir, f"bfmatcher_{tool1.lower()}_{uuid.uuid4().hex[:8]}.json")

    # ✅ ตัด good_matches เหลือแค่ 10 อันแรก
    matches_output_data = [
    {"queryIdx": m.queryIdx, "trainIdx": m.trainIdx, "distance": round(m.distance, 4)}
    for m in good_matches
    ]

    result = {
        "matching_tool": "BFMatcher",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "bfmatcher_parameters_used": {
            "norm_type": norm_str,
            "cross_check": use_cross_check,
            "lowes_ratio_threshold": lowe_ratio if not use_cross_check else None,
            "ransac_thresh": ransac_thresh
        },
        "input_features_details": {
            "image1": {
                "original_path": img_path1,
                "file_name": os.path.basename(img_path1),
                "feature_tool": tool1,
                "num_keypoints": len(kp1),
                "descriptor_shape": list(des1.shape)
            },
            "image2": {
                "original_path": img_path2,
                "file_name": os.path.basename(img_path2),
                "feature_tool": tool2,
                "num_keypoints": len(kp2),
                "descriptor_shape": list(des2.shape)
            }
        },
        "matching_statistics": {
            "num_raw_matches": len(raw_matches),
            "num_good_matches": len(good_matches),
            "num_inliers": inliers,
            "summary": f"{inliers} inliers / {len(good_matches)} good matches"
        },
        # ✅ เผื่อ frontend เก่าที่เรียก result["inliers"]
        "inliers": inliers,
        "good_matches": matches_output_data,
        "vis_url": vis_path
    }

    with open(out_json, "w") as f:
        json.dump(result, f, indent=2)
    result["json_path"] = out_json
    return result