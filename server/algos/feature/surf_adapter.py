# project_n2n/server/algos/feature/surf_adapter.py
import os
import sys
import json
import hashlib 
import numpy as np
import cv2
from typing import TYPE_CHECKING, Optional, Union, Tuple, Dict, Any

if TYPE_CHECKING:
    import cv2

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

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

def _resolve_image_path(path: str) -> str:
    if not path: return path
    if os.path.exists(path): return path
    rel_path = os.path.join(PROJECT_ROOT, path.lstrip("/"))
    if os.path.exists(rel_path): return rel_path
    return path

def run(
    image_path: Union[str, os.PathLike],
    out_dir: Optional[Union[str, os.PathLike]] = None,
    **params
) -> Tuple[str, str]:
    
    image_path_str = os.fspath(image_path)
    if image_path_str.lower().endswith(".json"):
        try:
            with open(image_path_str, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            
            if "matching_tool" in meta:
                 raise ValueError(f"Invalid Input: SURF cannot run on '{meta.get('matching_tool')}' result JSON.")
            if "tool" in meta and meta["tool"] in ["SIFT", "SURF", "ORB"]:
                 raise ValueError(f"Invalid Input: SURF cannot run on '{meta['tool']}' feature JSON.")
            
            image_path = (
                meta.get("image", {}).get("original_path") or 
                meta.get("output", {}).get("aligned_image") or
                meta.get("output", {}).get("result_image_url") or
                image_path
            )
        except (json.JSONDecodeError, FileNotFoundError, PermissionError):
            pass 

    image_path = _resolve_image_path(os.fspath(image_path))

    if not hasattr(cv2, "xfeatures2d") or not hasattr(cv2.xfeatures2d, "SURF_create"):
        raise RuntimeError("SURF not available. Please install 'opencv-contrib-python'.")

    if out_dir is None:
        out_dir = os.path.join(PROJECT_ROOT, "outputs")
    
    algo_dir = os.path.join(out_dir, "features", "surf_outputs")
    ensure_dir(algo_dir)

    hessian = float(params.get("hessianThreshold", 100))
    n_octaves = int(params.get("nOctaves", 4))
    n_layers = int(params.get("nOctaveLayers", 3))
    extended = bool(params.get("extended", False))
    upright = bool(params.get("upright", False))

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    
    img_mtime = os.path.getmtime(image_path)

    config_map = {
        "img": os.path.basename(image_path),
        "mtime": img_mtime,
        "hessian": hessian,
        "octaves": n_octaves,
        "layers": n_layers,
        "extended": extended,
        "upright": upright
    }
    config_str = json.dumps(config_map, sort_keys=True)
    param_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()[:8]

    base_name = os.path.splitext(os.path.basename(image_path))[0]
    stem = f"surf_{base_name}_{param_hash}"

    json_path = os.path.join(algo_dir, f"{stem}.json")
    vis_path = os.path.join(algo_dir, f"{stem}_vis.jpg")

    if os.path.exists(json_path) and os.path.exists(vis_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                json.load(f)
            return json_path, vis_path
        except:
            pass

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    surf = cv2.xfeatures2d.SURF_create(
        hessianThreshold=hessian,
        nOctaves=n_octaves,
        nOctaveLayers=n_layers,
        extended=extended,
        upright=upright,
    )

    kps, desc = surf.detectAndCompute(img, None)

    if desc is None:
        desc_dim = 128 if surf.getExtended() else 64
        desc = np.empty((0, desc_dim), dtype=np.float32)
    elif desc.dtype != np.float32:
        desc = desc.astype(np.float32)

    kplist = [_kp_dict(k, desc[i] if i < len(desc) else None) for i, k in enumerate(kps or [])]

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
        "descriptors": desc.tolist(),
        "parameters_hash": config_map
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    if img.ndim == 2:
        vis_src = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.ndim == 3 and img.shape[2] == 4:
        vis_src = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    else:
        vis_src = img.copy()

    vis = cv2.drawKeypoints(
        vis_src, kps, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
    )
    
    cv2.imwrite(vis_path, vis)

    return json_path, vis_path