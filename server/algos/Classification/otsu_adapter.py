# server/algos/Classification/otsu_adapter.py
import os
import json
import uuid
from typing import Dict, Any, Tuple, Optional

import cv2
import numpy as np


def _ensure_dir(d: str):
    os.makedirs(d, exist_ok=True)


def _to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _apply_morph(bin_img: np.ndarray, open_it: bool, close_it: bool, k: int) -> np.ndarray:
    if k is None or k < 1:
        k = 3
    k = int(k // 2 * 2 + 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    out = bin_img.copy()
    if open_it:
        out = cv2.morphologyEx(out, cv2.MORPH_OPEN, kernel)
    if close_it:
        out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, kernel)
    return out


def _draw_histogram(gray: np.ndarray, thresh_val: int, out_path: str):
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    h, w = 180, 320
    canvas = np.full((h, w, 3), 255, np.uint8)
    maxv = float(hist.max()) or 1.0

    xs = np.linspace(0, w - 1, 256).astype(int)
    vals = (hist / maxv * (h - 20)).astype(int)
    for x, v in zip(xs, vals):
        cv2.line(canvas, (x, h - 10), (x, h - 10 - int(v)), (90, 90, 90), 1)

    tx = int(thresh_val / 255.0 * (w - 1))
    cv2.line(canvas, (tx, 0), (tx, h), (0, 0, 255), 2)
    cv2.putText(canvas, f"T={thresh_val}", (tx + 6, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 180), 1, cv2.LINE_AA)

    cv2.imwrite(out_path, canvas)


def run(
    image_path: str,
    out_root: str,
    *,
    gaussian_blur: bool = True,
    blur_ksize: int = 5,
    invert: bool = False,
    morph_open: bool = False,
    morph_close: bool = False,
    morph_kernel: int = 3,
    show_histogram: bool = False,
) -> Tuple[str, Optional[str]]:
    """
    เขียนผลลัพธ์ไปที่:
    out_root / features / otsu_outputs
    """
    out_dir = os.path.join(out_root, "features", "otsu_outputs")
    _ensure_dir(out_dir)
    uid = uuid.uuid4().hex[:8]

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    gray = _to_gray(img)

    if gaussian_blur:
        k = int(blur_ksize // 2 * 2 + 1) if blur_ksize else 5
        gray_blur = cv2.GaussianBlur(gray, (k, k), 0)
    else:
        gray_blur = gray

    flag = cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY
    tval, binary = cv2.threshold(gray_blur, 0, 255, flag | cv2.THRESH_OTSU)
    tval = int(round(tval))

    if morph_open or morph_close:
        binary = _apply_morph(binary, morph_open, morph_close, morph_kernel)

    bin_name = f"otsu_binary_{uid}.png"
    json_name = f"otsu_result_{uid}.json"
    hist_name = f"otsu_hist_{uid}.png"

    bin_path = os.path.join(out_dir, bin_name)
    json_path = os.path.join(out_dir, json_name)
    hist_path = os.path.join(out_dir, hist_name)

    cv2.imwrite(bin_path, binary)

    hist_path_out = None
    if show_histogram:
        _draw_histogram(gray_blur, tval, hist_path)
        if os.path.exists(hist_path):
            hist_path_out = hist_path

    H, W = int(gray.shape[0]), int(gray.shape[1])
    result: Dict[str, Any] = {
        "tool": "OtsuThreshold",
        "tool_version": cv2.__version__,
        "input_image": {
            "path": image_path,
            "shape": [H, W],
            "dtype": str(gray.dtype),
        },
        "parameters": {
            "gaussian_blur": bool(gaussian_blur),
            "blur_ksize": int(blur_ksize),
            "invert": bool(invert),
            "morph_open": bool(morph_open),
            "morph_close": bool(morph_close),
            "morph_kernel": int(morph_kernel),
            "show_histogram": bool(show_histogram),
        },
        "threshold_value": tval,
        "output": {
            "binary_mask_path": bin_path,
            "binary_mask_shape": [int(binary.shape[0]), int(binary.shape[1])],
            "histogram_path": hist_path_out,
        },
        "notes": "Binary image is 0/255 (uint8).",
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return json_path, bin_path