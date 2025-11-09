# server/algos/quality/psnr_adapter.py
import os
import cv2
import json
import sys
import uuid
import numpy as np
from typing import Tuple, Dict, Any


# ---------- Helpers ----------
def _drop_alpha(img: np.ndarray) -> np.ndarray:
    if img is None or img.ndim != 3:
        return img
    if img.shape[2] == 4:
        return img[:, :, :3]
    return img


def _to_same_dtype(img1: np.ndarray, img2: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
 
    if np.issubdtype(img1.dtype, np.floating) or np.issubdtype(img2.dtype, np.floating):
        return img1.astype(np.float32, copy=False), img2.astype(np.float32, copy=False)
    if img1.dtype == np.uint16 or img2.dtype == np.uint16:
        return img1.astype(np.uint16, copy=False), img2.astype(np.uint16, copy=False)
    return img1.astype(np.uint8, copy=False), img2.astype(np.uint8, copy=False)


def _exact_equal(a: np.ndarray, b: np.ndarray) -> bool:
    return a.shape == b.shape and a.dtype == b.dtype and np.array_equal(a, b)


def _compute_mse(a: np.ndarray, b: np.ndarray) -> float:
    diff = a.astype(np.float64) - b.astype(np.float64)
    return float(np.mean(diff * diff))


def _pick_R_strict(img: np.ndarray) -> float:
   
    if img.dtype == np.uint8:
        return 255.0
    if img.dtype == np.uint16:
        return 65535.0
    # float types
    m = float(np.max(img))
    return 1.0 if m <= 1.0 else 255.0


def _to_luma(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    if img.ndim == 3 and img.shape[2] == 3:
        ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        return ycrcb[:, :, 0]
    raise ValueError(f"Unsupported image format for luma: shape={img.shape}")


# ---------- Main ----------
def run(original_path: str,
        processed_path: str,
        out_root: str = "outputs",
        use_luma: bool = True) -> Tuple[str, Dict[str, Any]]:
    # 1) load
    img1 = cv2.imread(original_path, cv2.IMREAD_UNCHANGED)
    img2 = cv2.imread(processed_path, cv2.IMREAD_UNCHANGED)
    if img1 is None or img2 is None:
        raise FileNotFoundError("Could not read one or both images")

    # 2) drop alpha first
    img1 = _drop_alpha(img1)
    img2 = _drop_alpha(img2)

    # 3) optional luminance conversion (make both comparable in Y)
    if use_luma:
        img1 = _to_luma(img1)
        img2 = _to_luma(img2)

    # 4) shapes must match now (after preprocessing)
    if img1.shape != img2.shape:
        raise ValueError(f"Image shape mismatch after preprocessing: {img1.shape} vs {img2.shape}")

    # 5) unify dtype (conservative promotion) for stable equality & R
    img1, img2 = _to_same_dtype(img1, img2)

    # 5.1) identical? -> PSNR = Infinity
    if _exact_equal(img1, img2):
        mse = 0.0
        R = _pick_R_strict(img1)
        score = float("inf")
    else:
        # 6) choose R by bit-depth/scale, then compute MSE & PSNR
        R = _pick_R_strict(img1)
        mse = _compute_mse(img1, img2)
        if mse == 0.0:
            score = float("inf")
        else:
            score = 10.0 * np.log10((R * R) / mse)

    # 7) write json
    out_dir = os.path.join(out_root, "features", "psnr_outputs")
    os.makedirs(out_dir, exist_ok=True)

    uid = uuid.uuid4().hex[:8]
    stem1 = os.path.splitext(os.path.basename(original_path))[0]
    stem2 = os.path.splitext(os.path.basename(processed_path))[0]
    out_json = os.path.join(out_dir, f"psnr_{stem1}_vs_{stem2}_{uid}.json")

    interpretation = "Higher is better. Infinity for identical images given the same dynamic range."

    data: Dict[str, Any] = {
        "tool": "PSNR",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0],
        },
        "config": {
            "use_luma": use_luma,
            "R": float(R),
        },
        "images": {
            "original": {
                "file_name": os.path.basename(original_path),
                "path": original_path,
                "shape": list(img1.shape),
                "dtype": str(img1.dtype),
            },
            "processed": {
                "file_name": os.path.basename(processed_path),
                "path": processed_path,
                "shape": list(img2.shape),
                "dtype": str(img2.dtype),
            },
        },
        "quality_score": ("Infinity" if (isinstance(score, float) and not np.isfinite(score)) else float(score)),
        # >>> keep at top-level to satisfy tests
        "score_interpretation": interpretation,
        # keep debugging info
        "aux": {
            "mse": float(mse)
        }
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return out_json, data