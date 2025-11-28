# server/algos/feature/surf_adapter.py

import os, sys, json, uuid
import numpy as np
import cv2
from typing import TYPE_CHECKING, Optional, Union, Tuple

if TYPE_CHECKING:
    import cv2

# โฟลเดอร์เริ่มต้น
BASE_DIR = os.getenv("N2N_OUT", "outputs")

# ---------------- Utils ----------------
def ensure_dir(path: Union[str, os.PathLike]) -> None:
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
        "octave": int(kp.octave),
        "class_id": int(kp.class_id),
        "descriptor": desc_row.tolist() if desc_row is not None else None
    }

# ---------------- Main API ----------------
def run(
    image_path: Union[str, os.PathLike],
    out_dir: Optional[Union[str, os.PathLike]] = None,
    **params
) -> Tuple[str, str]:
    
    # เช็คก่อนว่ามี SURF ไหม (อยู่ใน opencv-contrib-python)
    if not hasattr(cv2, "xfeatures2d") or not hasattr(cv2.xfeatures2d, "SURF_create"):
        raise RuntimeError("SURF not available. Please install 'opencv-contrib-python' (pip install opencv-contrib-python).")

    # --- normalize paths ---
    image_path = os.fspath(image_path)
    base_dir = os.fspath(out_dir) if out_dir is not None else BASE_DIR
    
    algo_dir = os.path.join(base_dir, "features", "surf_outputs")
    ensure_dir(algo_dir)
    
    vis_dir = os.path.join(algo_dir, "visuals")
    ensure_dir(vis_dir)

    # --- Read image ---
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    # --- Run SURF ---
    surf = cv2.xfeatures2d.SURF_create(
        hessianThreshold=float(params.get("hessianThreshold", 100)),
        nOctaves=int(params.get("nOctaves", 4)),
        nOctaveLayers=int(params.get("nOctaveLayers", 3)),
        extended=bool(params.get("extended", False)),
        upright=bool(params.get("upright", False)),
    )

    kps, desc = surf.detectAndCompute(img, None)

    # Handle descriptors
    if desc is None:
        desc_dim = 128 if surf.getExtended() else 64
        desc = np.empty((0, desc_dim), dtype=np.float32)
    elif desc.dtype != np.float32:
        desc = desc.astype(np.float32)

    kplist = [_kp_dict(k, desc[i] if i < len(desc) else None) for i, k in enumerate(kps or [])]

    # --- Metadata (Gray shape) ---
    if img.ndim == 3 and img.shape[2] in (3, 4):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.shape[2] == 3 else cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    else:
        gray = img

    payload = {
        "tool": "SURF",
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "processed_shape": list(gray.shape),
            "processed_dtype": str(gray.dtype)
        },
        "surf_parameters_used": {
            "hessianThreshold": surf.getHessianThreshold(),
            "nOctaves": surf.getNOctaves(),
            "nOctaveLayers": surf.getNOctaveLayers(),
            "extended": bool(surf.getExtended()),
            "upright": bool(surf.getUpright()),
        },
        "num_keypoints": len(kplist),
        "descriptor_dim": desc.shape[1] if desc.shape[0] > 0 else (128 if surf.getExtended() else 64),
        "keypoints": kplist,
        "descriptors": desc.tolist()
    }

    # --- Generate Unique Filename ---
    unique_id = uuid.uuid4().hex[:8]
    stem = f"surf_{unique_id}"

    # --- Save JSON ---
    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    # --- Save Visualization ---
    # เตรียมภาพสีสำหรับวาด keypoints
    if img.ndim == 2:
        vis_src = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.ndim == 3 and img.shape[2] == 4:
        vis_src = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    else:
        vis_src = img.copy()

    vis = cv2.drawKeypoints(
        vis_src, kps, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
    )
    
    vis_path = os.path.join(vis_dir, stem + "_vis.jpg")
    cv2.imwrite(vis_path, vis)

    return json_path, vis_path