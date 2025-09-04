# server/algos/feature/orb_adapter.py
import os, sys, json
import numpy as np
import cv2
import uuid

def _kp_dict(kp, desc_row):
    return {
        "x": round(kp.pt[0], 4),
        "y": round(kp.pt[1], 4),
        "size": round(kp.size, 4),
        "angle": round(kp.angle, 4),
        "response": round(kp.response, 6),
        "octave": kp.octave,
        "class_id": kp.class_id,
        "descriptor": desc_row.tolist() if desc_row is not None else None
    }

def run(image_path: str, out_root: str = ".", **params):
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    orb = cv2.ORB_create(
        nfeatures=int(params.get("nfeatures", 500)),
        scaleFactor=float(params.get("scaleFactor", 1.2)),
        nlevels=int(params.get("nlevels", 8)),
        edgeThreshold=int(params.get("edgeThreshold", 31)),
        firstLevel=int(params.get("firstLevel", 0)),
        WTA_K=int(params.get("WTA_K", 2)),
        scoreType=cv2.ORB_FAST_SCORE if str(params.get("scoreType","FAST")).upper()=="FAST" else cv2.ORB_HARRIS_SCORE,
        patchSize=int(params.get("patchSize", 31)),
        fastThreshold=int(params.get("fastThreshold", 20)),
    )

    kps, desc = orb.detectAndCompute(img, None)
    if desc is None:
        desc = np.empty((0, 32), np.uint8)

    kplist = [_kp_dict(k, desc[i] if i < len(desc) else None) for i, k in enumerate(kps or [])]

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if (img.ndim==3 and img.shape[2] in (3,4)) else img

    payload = {
        "tool": "ORB",
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "processed_orb_shape": list(gray.shape),
            "processed_orb_dtype": str(gray.dtype)
        },
        "orb_parameters_used": {
            "nfeatures": orb.getMaxFeatures(),
            "scaleFactor": orb.getScaleFactor(),
            "nlevels": orb.getNLevels(),
            "edgeThreshold": orb.getEdgeThreshold(),
            "firstLevel": orb.getFirstLevel(),
            "WTA_K": orb.getWTA_K(),
            "scoreType": orb.getScoreType(),
            "patchSize": orb.getPatchSize(),
            "fastThreshold": orb.getFastThreshold()
        },
        "num_keypoints": len(kplist),
        "descriptor_dim": 32,
        "keypoints": kplist
    }

    # --- unique stem ป้องกันไฟล์ชนกัน ---
    base = os.path.splitext(os.path.basename(image_path))[0]
    unique_id = uuid.uuid4().hex[:8]
    stem = f"{base}_orb_{unique_id}"

    # --- เคารพ out_root + สร้างโครงสร้างเดียวกับตัวอื่น ๆ ---
    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "orb_outputs")
    os.makedirs(algo_dir, exist_ok=True)

    # --- Save JSON (absolute path) ---
    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4)
    json_path = os.path.abspath(json_path)

    # --- Save Visualization (absolute path) ---
    bgr = img if img.ndim==2 else (cv2.cvtColor(img, cv2.COLOR_BGRA2BGR) if (img.ndim==3 and img.shape[2]==4) else img)
    vis = cv2.drawKeypoints(bgr, kps, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
    vis_path = os.path.join(algo_dir, stem + "_vis.jpg")
    cv2.imwrite(vis_path, vis)
    vis_path = os.path.abspath(vis_path)

    return json_path, vis_path