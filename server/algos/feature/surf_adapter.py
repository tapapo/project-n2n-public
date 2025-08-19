import os
import json
import cv2
import numpy as np
import uuid

BASE_DIR = "/Users/pop/Desktop/project_n2n/outputs/features"

def ensure_dir(path: str):
    if not os.path.exists(path):
        os.makedirs(path)

def _to_gray(img):
    if img.ndim == 2:
        return img
    if img.ndim == 3 and img.shape[2] == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if img.ndim == 3 and img.shape[2] == 4:
        return cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

def _draw_keypoints(bgr, kps):
    return cv2.drawKeypoints(bgr, kps, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)

def _serialize(image_path, gray_shape, kps, desc, surf) -> dict:
    data = []
    if kps is not None and desc is not None and len(kps) == desc.shape[0]:
        for i, kp in enumerate(kps):
            data.append({
                "x": round(kp.pt[0], 4),
                "y": round(kp.pt[1], 4),
                "size": round(kp.size, 4),
                "angle": round(float(kp.angle), 4),
                "response": round(float(kp.response), 6),
                "octave": int(kp.octave),
                "class_id": int(kp.class_id),
                "descriptor": desc[i].tolist()
            })

    desc_dim = (desc.shape[1] if desc is not None and desc.ndim == 2 and desc.shape[0] > 0
                else (128 if surf.getExtended() else 64))

    return {
        "tool": "SURF",
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "processed_shape": list(gray_shape),
        },
        "surf_parameters_used": {
            "hessianThreshold": surf.getHessianThreshold(),
            "nOctaves": surf.getNOctaves(),
            "nOctaveLayers": surf.getNOctaveLayers(),
            "extended": bool(surf.getExtended()),
            "upright": bool(surf.getUpright()),
        },
        "num_keypoints": len(data),
        "descriptor_dim": desc_dim,
        "keypoints": data
    }

def run(image_path: str, out_root: str = None, **params) -> tuple[str, str]:
    if not hasattr(cv2, "xfeatures2d") or not hasattr(cv2.xfeatures2d, "SURF_create"):
        raise RuntimeError("SURF not available. Install 'opencv-contrib-python'.")

    # load image
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")

    # keep BGR for visualization
    if img.ndim == 2:
        bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.ndim == 3 and img.shape[2] == 4:
        bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    else:
        bgr = img
    gray = _to_gray(img)

    # create SURF with params
    surf = cv2.xfeatures2d.SURF_create(
        hessianThreshold=float(params.get("hessianThreshold", 200)),
        nOctaves=int(params.get("nOctaves", 4)),
        nOctaveLayers=int(params.get("nOctaveLayers", 3)),
        extended=bool(params.get("extended", False)),
        upright=bool(params.get("upright", False)),
    )

    kps, desc = surf.detectAndCompute(img, None)

    # SURF descriptors ต้องเป็น float32
    if desc is None:
        desc_dim = 128 if surf.getExtended() else 64
        desc = np.empty((0, desc_dim), dtype=np.float32)
    elif desc.dtype != np.float32:
        desc = desc.astype(np.float32)

    vis = _draw_keypoints(bgr, kps or [])

    # --- output dir ตามโครงสร้างใหม่ ---
    algo_dir = os.path.join(BASE_DIR, "surf_outputs")
    ensure_dir(algo_dir)

    # unique stem ป้องกันชื่อไฟล์ชนกัน
    base = os.path.splitext(os.path.basename(image_path))[0]
    unique_id = uuid.uuid4().hex[:8]
    stem = f"{base}_surf_{unique_id}"

    json_path = os.path.join(algo_dir, f"{stem}.json")
    vis_path  = os.path.join(algo_dir, f"{stem}_vis.jpg")

    # save
    payload = _serialize(image_path, gray.shape, kps or [], desc, surf)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    cv2.imwrite(vis_path, vis)

    return json_path, vis_path