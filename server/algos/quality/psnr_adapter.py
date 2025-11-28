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


def _validate_is_image(path: str, label: str):
    if path.lower().endswith(".json"):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            tool = meta.get("tool") or meta.get("matching_tool") or meta.get("alignment_tool")
            if tool:
                raise ValueError(
                    f"Invalid Input for '{label}': Received a '{tool}' result file. "
                    "PSNR requires an Image file, not a JSON result."
                )
        except (json.JSONDecodeError, FileNotFoundError, PermissionError):
            pass


# ---------- Main ----------
def run(original_path: str,
        processed_path: str,
        out_root: str = "outputs",
        use_luma: bool = True) -> Tuple[str, Dict[str, Any]]:
    
    # ✅ 1. Validate Inputs
    _validate_is_image(original_path, "Input 1 (Original)")
    _validate_is_image(processed_path, "Input 2 (Processed)")

    # 2. Load Images
    img1 = cv2.imread(original_path, cv2.IMREAD_UNCHANGED)
    img2 = cv2.imread(processed_path, cv2.IMREAD_UNCHANGED)

    if img1 is None:
        raise FileNotFoundError(f"Cannot read image 1: {original_path}")
    if img2 is None:
        raise FileNotFoundError(f"Cannot read image 2: {processed_path}")

    # 3. Drop alpha
    img1 = _drop_alpha(img1)
    img2 = _drop_alpha(img2)

    # 4. Optional luminance conversion
    if use_luma:
        try:
            img1 = _to_luma(img1)
            img2 = _to_luma(img2)
        except Exception as e:
            raise ValueError(f"Luma conversion failed: {e}")

    # 5. Shape check
    if img1.shape != img2.shape:
        raise ValueError(f"Image shape mismatch: {img1.shape} vs {img2.shape}. Images must have same dimensions for PSNR.")

    # 6. Unify dtype
    img1, img2 = _to_same_dtype(img1, img2)

    # 7. Compute PSNR
    if _exact_equal(img1, img2):
        mse = 0.0
        R = _pick_R_strict(img1)
        score = float("inf")
    else:
        R = _pick_R_strict(img1)
        mse = _compute_mse(img1, img2)
        if mse == 0.0:
            score = float("inf")
        else:
            score = 10.0 * np.log10((R * R) / mse)

    # 8. Save JSON
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
        "score_interpretation": interpretation,
        "aux": {
            "mse": float(mse)
        }
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return out_json, data