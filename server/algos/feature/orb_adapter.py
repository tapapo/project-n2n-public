# server/algos/feature/orb_adapter.py

import os, sys, json, uuid
import hashlib 
import numpy as np
import cv2
from typing import TYPE_CHECKING, Optional, Union, Tuple, Dict, Any

if TYPE_CHECKING:
    import cv2

BASE_DIR = os.getenv("N2N_OUT", "outputs")

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
                 raise ValueError(f"Invalid Input: ORB cannot run on '{meta.get('matching_tool')}' result JSON.")
            if "tool" in meta and meta["tool"] in ["SIFT", "SURF", "ORB"]:
                 raise ValueError(f"Invalid Input: ORB cannot run on '{meta['tool']}' feature JSON.")
            
            image_path = (
                meta.get("image", {}).get("original_path") or 
                meta.get("output", {}).get("aligned_image") or
                meta.get("output", {}).get("result_image_url") or
                image_path
            )
        except (json.JSONDecodeError, FileNotFoundError, PermissionError):
            pass 

    image_path = os.fspath(image_path)
    base_dir = os.fspath(out_dir) if out_dir is not None else BASE_DIR
    
    algo_dir = os.path.join(base_dir, "features", "orb_outputs")
    ensure_dir(algo_dir)

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    img_mtime = os.path.getmtime(image_path)

    config_map = {
        "img": os.path.basename(image_path),
        "mtime": img_mtime, 
        "nfeatures": int(params.get("nfeatures", 500)),
        "scaleFactor": float(params.get("scaleFactor", 1.2)),
        "nlevels": int(params.get("nlevels", 8)),
        "edgeThreshold": int(params.get("edgeThreshold", 31)),
        "firstLevel": int(params.get("firstLevel", 0)),
        "WTA_K": int(params.get("WTA_K", 2)),
        "scoreType": str(params.get("scoreType", "FAST")),
        "patchSize": int(params.get("patchSize", 31)),
        "fastThreshold": int(params.get("fastThreshold", 20)),
    }
    
    config_str = json.dumps(config_map, sort_keys=True)
    param_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()[:8]
    
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    stem = f"orb_{base_name}_{param_hash}"
    
    json_path = os.path.join(algo_dir, f"{stem}.json")
    vis_path = os.path.join(algo_dir, f"{stem}_vis.jpg")

    if os.path.exists(json_path) and os.path.exists(vis_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                json.load(f)
            return json_path, vis_path
        except:
            pass 

    orb = cv2.ORB_create(
        nfeatures=config_map["nfeatures"],
        scaleFactor=config_map["scaleFactor"],
        nlevels=config_map["nlevels"],
        edgeThreshold=config_map["edgeThreshold"],
        firstLevel=config_map["firstLevel"],
        WTA_K=config_map["WTA_K"],
        scoreType=cv2.ORB_FAST_SCORE if config_map["scoreType"].upper()=="FAST" else cv2.ORB_HARRIS_SCORE,
        patchSize=config_map["patchSize"],
        fastThreshold=config_map["fastThreshold"],
    )

    kps, desc = orb.detectAndCompute(img, None)
    
    if desc is None:
        desc = np.empty((0, 32), dtype=np.uint8)

    kplist = [_kp_dict(k, desc[i] if i < len(desc) else None) for i, k in enumerate(kps or [])]

    if img.ndim == 3 and img.shape[2] in (3, 4):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.shape[2] == 3 else cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    else:
        gray = img

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
            "scoreType": config_map["scoreType"],
            "patchSize": orb.getPatchSize(),
            "fastThreshold": orb.getFastThreshold()
        },
        "num_keypoints": len(kplist),
        "descriptor_dim": 32,
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