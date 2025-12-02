import os
import sys
import json
import hashlib # ✅ ใช้ Hash
from typing import Optional, Tuple, Dict, Any

import cv2
import numpy as np


# --- Config ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
MODEL_PATH = os.path.join(PROJECT_ROOT, "server/algos/quality/brisque_models/brisque_model_live.yml")
RANGE_PATH = os.path.join(PROJECT_ROOT, "server/algos/quality/brisque_models/brisque_range_live.yml")


def _ensure_dir(d: str):
    os.makedirs(d, exist_ok=True)

def _to_uint8_gray(img: np.ndarray, image_path: str) -> np.ndarray:
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    if img.ndim == 2:
        gray = img
    elif img.ndim == 3:
        ch = img.shape[2]
        if ch == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        elif ch == 4:
            gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
        else:
            raise ValueError(f"Unsupported channel count ({ch}) in image: {image_path}")
    else:
        raise ValueError(f"Unsupported image shape {img.shape}: {image_path}")

    if gray.dtype == np.uint8:
        return gray
    if gray.dtype == np.uint16:
        return (gray / 257).astype(np.uint8)
    if gray.dtype in (np.float32, np.float64):
        gmin, gmax = float(gray.min()), float(gray.max())
        if gmax > gmin:
            out = (gray - gmin) / (gmax - gmin)
            return np.clip(out * 255.0, 0, 255).astype(np.uint8)
        return np.zeros_like(gray, dtype=np.uint8)

    return gray.astype(np.uint8)


def _interpret_brisque(score: float) -> str:
    if score < 15: return "excellent"
    if score < 25: return "good"
    if score < 40: return "fair"
    if score < 60: return "poor"
    return "very_poor"


def run(image_path: str, out_root: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    
    # 1. Validation
    if image_path.lower().endswith(".json"):
        try:
            with open(image_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            tool = meta.get("tool") or meta.get("matching_tool") or meta.get("alignment_tool")
            if tool:
                raise ValueError(
                    f"Invalid Input: Received a '{tool}' result file. "
                    "BRISQUE requires an Image file, not a JSON result."
                )
            # Fallback path extraction
            image_path = (
                meta.get("image", {}).get("original_path") or 
                meta.get("output", {}).get("aligned_image") or
                image_path
            )
        except (json.JSONDecodeError, FileNotFoundError, PermissionError):
            pass

    # 2. Resolve Path
    abs_path = os.path.abspath(image_path)
    if not os.path.exists(abs_path):
         # Try resolving relative to project root if absolute check fails
         potential_path = os.path.join(PROJECT_ROOT, image_path.lstrip("/"))
         if os.path.exists(potential_path):
             abs_path = potential_path

    # 3. Prepare Output
    if out_root is None:
        out_root = os.path.join(PROJECT_ROOT, "outputs")
        
    out_dir = os.path.join(out_root, "features", "brisque_outputs")
    _ensure_dir(out_dir)

    # ✅ 4. Generate Hash (Deduplication)
    # เนื่องจาก BRISQUE ไม่มีพารามิเตอร์ปรับแต่ง เรา Hash จากชื่อรูปและ Path ของ Model
    config_map = {
        "img": os.path.basename(abs_path),
        "model": "default_live",
        "ver": "1.0"
    }
    config_str = json.dumps(config_map, sort_keys=True)
    param_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()[:8]
    
    base_name = os.path.splitext(os.path.basename(abs_path))[0]
    stem = f"brisque_{base_name}_{param_hash}"
    out_json = os.path.join(out_dir, f"{stem}.json")

    # ✅ 5. Check Cache (ถ้ามีไฟล์แล้ว อ่านตอบกลับเลย ไม่ต้องคำนวณใหม่)
    if os.path.exists(out_json):
        try:
            with open(out_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            return out_json, data
        except Exception:
            pass # ถ้าไฟล์เสีย คำนวณใหม่

    # 6. Compute Logic
    img = cv2.imread(abs_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {abs_path}")

    gray = _to_uint8_gray(img, abs_path)

    h, w = gray.shape[:2]
    if min(h, w) < 48:
        raise ValueError(f"Image too small for stable BRISQUE (got {w}x{h}); please use >= 48x48.")

    if not os.path.exists(MODEL_PATH) or not os.path.exists(RANGE_PATH):
        raise FileNotFoundError(f"BRISQUE model files not found at {MODEL_PATH}")

    try:
        scorer = cv2.quality.QualityBRISQUE_create(MODEL_PATH, RANGE_PATH)
    except AttributeError as e:
        raise RuntimeError("OpenCV 'quality' module not available.") from e

    score = float(scorer.compute(gray)[0])
    score_rounded = round(score, 4)
    score_bucket = _interpret_brisque(score)

    # 7. Save JSON
    data: Dict[str, Any] = {
        "tool": "BRISQUE",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0],
        },
        "image": {
            "original_path": abs_path,
            "file_name": os.path.basename(abs_path),
            "processed_shape": [int(h), int(w)],
            "dtype": "uint8",
            "channels": 1,
        },
        "brisque_parameters_used": {
            "model_file": os.path.basename(MODEL_PATH),
            "range_file": os.path.basename(RANGE_PATH),
            "note": "Lower score = better perceptual quality",
        },
        "quality_score": score_rounded,
        "quality_bucket": score_bucket,
        "parameters_hash": config_map # เก็บค่า Hash ไว้ดูเล่น
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return out_json, data