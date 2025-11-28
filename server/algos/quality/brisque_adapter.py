import os
import sys
import json
import uuid
from typing import Optional, Tuple, Dict, Any

import cv2
import numpy as np


# --- Config ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
MODEL_PATH = os.path.join(PROJECT_ROOT, "server/algos/quality/brisque_models/brisque_model_live.yml")
RANGE_PATH = os.path.join(PROJECT_ROOT, "server/algos/quality/brisque_models/brisque_range_live.yml")


def _to_uint8_gray(img: np.ndarray, image_path: str) -> np.ndarray:
    """
    แปลงภาพเป็น grayscale uint8
    """
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
    """
    แปลงคะแนน BRISQUE เป็นระดับคุณภาพ
    """
    if score < 15:
        return "excellent"
    if score < 25:
        return "good"
    if score < 40:
        return "fair"
    if score < 60:
        return "poor"
    return "very_poor"


def run(image_path: str, out_root: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    """
    ประเมินคุณภาพภาพด้วย BRISQUE (no-reference)
    """
    # ---------------------------------------------------------
    # 1. VALIDATION: ป้องกันการรับไฟล์ JSON จากโหนดอื่น
    # ---------------------------------------------------------
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
        except (json.JSONDecodeError, FileNotFoundError, PermissionError):
            pass

    # ---------------------------------------------------------
    # 2. Resolve absolute image path correctly ✅
    # ---------------------------------------------------------
    abs_path = image_path
    if not os.path.isabs(image_path):
        # เช่น "outputs/foo.png"
        abs_path = os.path.join(PROJECT_ROOT, image_path.lstrip("/"))
    elif image_path.startswith("/outputs/"):
        # เช่น "/outputs/foo.png" → ให้ชี้ไปยัง project_n2n/outputs/foo.png
        abs_path = os.path.join(PROJECT_ROOT, image_path.lstrip("/"))

    print(f"[BRISQUE] Reading image from: {abs_path}")

    # ---------------------------------------------------------
    # 3. Load Image
    # ---------------------------------------------------------
    img = cv2.imread(abs_path, cv2.IMREAD_UNCHANGED)

    if img is None:
        raise ValueError(f"Cannot read image: {abs_path} (File might not be an image or path invalid)")

    gray = _to_uint8_gray(img, abs_path)

    # Guard small images (statistics may be unstable)
    h, w = gray.shape[:2]
    if min(h, w) < 48:
        raise ValueError(f"Image too small for stable BRISQUE (got {w}x{h}); please use >= 48x48. Path={abs_path}")

    # ---------------------------------------------------------
    # 4. Ensure model files exist
    # ---------------------------------------------------------
    if not os.path.exists(MODEL_PATH) or not os.path.exists(RANGE_PATH):
        raise FileNotFoundError(
            "BRISQUE model/range files not found.\n"
            f"MODEL_PATH={MODEL_PATH}\nRANGE_PATH={RANGE_PATH}"
        )

    # ---------------------------------------------------------
    # 5. Compute BRISQUE score
    # ---------------------------------------------------------
    try:
        scorer = cv2.quality.QualityBRISQUE_create(MODEL_PATH, RANGE_PATH)
    except AttributeError as e:
        raise RuntimeError(
            "OpenCV 'quality' module not available. "
            "Please install opencv-contrib-python, not just opencv-python."
        ) from e

    score = float(scorer.compute(gray)[0])
    score_rounded = round(score, 4)
    score_bucket = _interpret_brisque(score)

    # ---------------------------------------------------------
    # 6. Prepare output
    # ---------------------------------------------------------
    if out_root is None:
        out_dir = os.path.join(PROJECT_ROOT, "outputs", "features", "brisque_outputs")
    else:
        out_dir = os.path.join(out_root, "features", "brisque_outputs")
    os.makedirs(out_dir, exist_ok=True)

    base = os.path.splitext(os.path.basename(image_path))[0]
    uid = uuid.uuid4().hex[:8]
    out_json = os.path.join(out_dir, f"{base}_brisque_{uid}.json")

    # ---------------------------------------------------------
    # 7. Save JSON
    # ---------------------------------------------------------
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
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"[BRISQUE] Done. Score={score_rounded}, Bucket={score_bucket}")
    return out_json, data