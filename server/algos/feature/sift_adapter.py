# server/algos/feature/sift_adapter.py

import os, sys, json, uuid
import numpy as np
import cv2
from typing import TYPE_CHECKING, Optional, Union

if TYPE_CHECKING:
    import cv2

# โฟลเดอร์เริ่มต้น (fallback) ถ้าไม่ส่ง out_dir มา
BASE_DIR = "/Users/pop/Desktop/project_n2n/outputs/features"

# ---------------- Utils ----------------
def ensure_dir(path: Union[str, os.PathLike]) -> None:
    """สร้างโฟลเดอร์ถ้าไม่มี (รองรับ str/PathLike)"""
    path = os.fspath(path)
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)

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

# ---------------- Main API ----------------
def run(
    image_path: Union[str, os.PathLike],
    out_dir: Optional[Union[str, os.PathLike]] = None,
    **params
):
    # --- normalize paths (รองรับ PathLike) ---
    image_path = os.fspath(image_path)
    base_dir = os.fspath(out_dir) if out_dir is not None else BASE_DIR
    algo_dir = os.path.join(base_dir, "sift_outputs")
    ensure_dir(algo_dir)

    # --- Read image ---
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    # --- Run SIFT ---
    sift = cv2.SIFT_create(
        nfeatures=int(params.get("nfeatures", 0)),
        nOctaveLayers=int(params.get("nOctaveLayers", 3)),
        contrastThreshold=float(params.get("contrastThreshold", 0.04)),
        edgeThreshold=float(params.get("edgeThreshold", 3)),
        sigma=float(params.get("sigma", 1.6)),
    )
    kps, desc = sift.detectAndCompute(img, None)
    if desc is None:
        desc = np.empty((0, 128), np.float32)

    kplist = [_kp_dict(k, desc[i] if i < len(desc) else None) for i, k in enumerate(kps or [])]

    # --- Grayscale for metadata (ไม่เปลี่ยนแหล่งวาด vis) ---
    if img.ndim == 3 and img.shape[2] in (3, 4):
        # ถ้า 3 ช่อง: BGR->GRAY, ถ้า 4 ช่อง: BGRA->GRAY
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.shape[2] == 3 else cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    else:
        gray = img

    payload = {
        "tool": "SIFT",
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "processed_sift_shape": list(gray.shape),
            "processed_sift_dtype": str(gray.dtype)
        },
        "sift_parameters_used": {
            "nfeatures": sift.getNFeatures(),
            "nOctaveLayers": sift.getNOctaveLayers(),
            "contrastThreshold": sift.getContrastThreshold(),
            "edgeThreshold": sift.getEdgeThreshold(),
            "sigma": sift.getSigma()
        },
        "num_keypoints": len(kplist),
        "descriptor_dim": 128,
        "keypoints": kplist,
        "descriptors": desc.tolist()
    }

    # --- unique stem ป้องกันไฟล์ชนกัน ---
    base = os.path.splitext(os.path.basename(image_path))[0]
    unique_id = uuid.uuid4().hex[:8]
    stem = f"{base}_sift_{unique_id}"

    # --- Save JSON ---
    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w") as f:
        json.dump(payload, f, indent=4)

    # --- Save Visualization (วาดบนภาพต้นฉบับที่เหมาะสม) ---
    if img.ndim == 2:
        vis_src = img
    elif img.ndim == 3 and img.shape[2] == 4:
        vis_src = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    else:
        vis_src = img

    vis = cv2.drawKeypoints(
        vis_src, kps, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
    )
    vis_path = os.path.join(algo_dir, stem + "_vis.jpg")
    cv2.imwrite(vis_path, vis)

    return json_path, vis_path