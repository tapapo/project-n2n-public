# server/algos/Classification/snake_adapter.py
import os
import json
import uuid
from typing import Dict, Any, Tuple, Optional, List

import cv2
import numpy as np
from skimage.segmentation import active_contour


# ---------- utils ----------
def _ensure_dir(d: str):
    os.makedirs(d, exist_ok=True)


def _to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    if img.ndim == 3 and img.shape[2] == 4:
        return cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _clamp_int(x: Optional[int], lo: int, hi: int, default: int) -> int:
    try:
        xi = int(x)
        return int(max(lo, min(hi, xi)))
    except Exception:
        return int(default)


def _odd(k: int) -> int:
    k = int(max(1, k))
    return k if k % 2 == 1 else k + 1


def _contour_to_mask(contour_rc: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    """
    contour_rc: (N,2) พิกัด (row, col) = (y, x)
    return uint8 mask 0/255
    """
    poly = np.round(contour_rc[:, ::-1]).astype(np.int32)  # -> (x,y) สำหรับ fillPoly
    mask = np.zeros(shape, dtype=np.uint8)
    if len(poly) >= 3:
        cv2.fillPoly(mask, [poly], 255)
    return mask


def _draw_overlay(base: np.ndarray, contour_rc: np.ndarray, color=(0, 0, 255)) -> np.ndarray:
    """
    วาดเส้นโครงสีแดงบนภาพเทาหรือภาพสี
    """
    if base.ndim == 2:
        vis = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
    else:
        vis = base.copy()
        if vis.ndim == 3 and vis.shape[2] == 4:
            vis = vis[:, :, :3]
    pts = np.round(contour_rc[:, ::-1]).astype(np.int32)  # (x,y)
    if len(pts) >= 2:
        cv2.polylines(vis, [pts], isClosed=True, color=color, thickness=2, lineType=cv2.LINE_AA)
    return vis


# ---------- initial contour generators ----------
def _init_circle(
    h: int,
    w: int,
    cx: Optional[int],
    cy: Optional[int],
    r: Optional[int],
    pts: int,
) -> np.ndarray:
    """
    วงกลมเริ่มต้น
    """
    if cx is None:
        cx = w // 2
    if cy is None:
        cy = h // 2
    if r is None or r <= 0:
        r = max(10, min(h, w) // 4)

    s = np.linspace(0, 2 * np.pi, int(max(8, pts)), endpoint=False)
    x = cx + r * np.cos(s)
    y = cy + r * np.sin(s)
    return np.stack([y, x], axis=1).astype(np.float32)  # (row, col) = (y, x)


def _init_from_point(
    h: int,
    w: int,
    x: float,
    y: float,
    radius: Optional[int],
    pts: int,
) -> np.ndarray:
    """
    วงกลมจาก seed point (x,y) + radius
    """
    x = float(np.clip(x, 0, w - 1))
    y = float(np.clip(y, 0, h - 1))
    if radius is None or radius <= 0:
        radius = max(10, min(h, w) // 6)

    s = np.linspace(0, 2 * np.pi, int(max(8, pts)), endpoint=False)
    xx = x + radius * np.cos(s)
    yy = y + radius * np.sin(s)
    return np.stack([yy, xx], axis=1).astype(np.float32)


def _init_from_bbox(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    pts: int,
) -> np.ndarray:
    """
    สร้าง contour สี่เหลี่ยมปิด จาก bbox (x1,y1,x2,y2)
    """
    x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
    poly = np.array(
        [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
        dtype=np.float32,
    )
    poly = np.vstack([poly, poly[:1]])  # close

    # resample ให้ได้จำนวนจุดใกล้เคียง pts เท่าๆ กันตามเส้นรอบรูป
    seg = np.linalg.norm(poly[1:] - poly[:-1], axis=1)
    L = float(seg.sum())
    target_n = int(max(8, pts))

    if L <= 1e-6:
        # degenerate -> ใช้จุดเดียวซ้ำ
        return np.repeat(poly[:1][:, ::-1], target_n, axis=0).astype(np.float32)

    step = L / target_n
    out = []
    acc = 0.0
    j = 0
    for i in range(target_n):
        target = i * step
        while j < len(seg) - 1 and acc + seg[j] < target:
            acc += seg[j]
            j += 1
        remain = target - acc
        t = float(remain / (seg[j] + 1e-12))
        p = poly[j] * (1.0 - t) + poly[j + 1] * t
        out.append(p)

    poly_rs = np.array(out, dtype=np.float32)
    rc = poly_rs[:, ::-1]  # (x,y) -> (y,x)
    return rc.astype(np.float32)


# ---------- pre-processing ----------
def _prepare_image_for_snake(
    gray: np.ndarray,
    *,
    gaussian_blur_ksize: int = 5,
) -> np.ndarray:
    """
    เตรียมภาพสำหรับ active_contour:
    - ทำ Gaussian blur (ถ้า ksize > 0)
    - แปลงเป็น float32 ช่วง [0,1]
    """
    k = int(max(0, gaussian_blur_ksize))
    if k > 0:
        k = _odd(k)  # บังคับเป็นเลขคี่อย่างน้อย 1
        work = cv2.GaussianBlur(gray, (k, k), 0)
    else:
        work = gray

    f = work.astype(np.float32) / 255.0
    return f


# ---------- main ----------
def run(
    image_path: str,
    out_root: str,
    *,
    # snake dynamics
    alpha: float = 0.015,
    beta: float = 10.0,
    gamma: float = 0.001,
    w_line: float = 0.0,
    w_edge: float = 1.0,
    max_iterations: int = 250,     # external name
    convergence: float = 0.1,

    # init options
    init_mode: str = "circle",      # "circle" | "point" | "bbox"
    init_cx: Optional[int] = None,
    init_cy: Optional[int] = None,
    init_radius: Optional[int] = None,
    init_points: int = 400,

    # point
    from_point_x: Optional[float] = None,
    from_point_y: Optional[float] = None,

    # bbox
    bbox_x1: Optional[float] = None,
    bbox_y1: Optional[float] = None,
    bbox_x2: Optional[float] = None,
    bbox_y2: Optional[float] = None,

    # image pre-processing (เหลือแค่เบลอ)
    gaussian_blur_ksize: int = 5,
) -> Tuple[str, Optional[str], Optional[str]]:
    """
    สร้างโฟลเดอร์: out_root/features/snake_outputs
    เขียนไฟล์: snake_*.json, snake_overlay_*.png, snake_mask_*.png
    คืน: (json_path, overlay_path, mask_path)
    """
    out_dir = os.path.join(out_root, "features", "snake_outputs")
    _ensure_dir(out_dir)
    uid = uuid.uuid4().hex[:8]

    # 1) load
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    gray = _to_gray(img)
    h, w = gray.shape[:2]

    # 2) pre-process for snake energy (Gaussian blur + normalize)
    fimg = _prepare_image_for_snake(
        gray,
        gaussian_blur_ksize=gaussian_blur_ksize,
    )

    # 3) initial contour (in rc = (y,x))
    pts = int(max(8, init_points))
    init_stats: Dict[str, Any] = {"mode": init_mode}

    if init_mode == "circle":
        snake0 = _init_circle(h, w, init_cx, init_cy, init_radius, pts)

    elif init_mode == "point":
        x = float(from_point_x if from_point_x is not None else (w / 2))
        y = float(from_point_y if from_point_y is not None else (h / 2))
        snake0 = _init_from_point(h, w, x, y, init_radius, pts)
        init_stats.update({"x": x, "y": y})

    elif init_mode == "bbox":
        x1 = float(bbox_x1 if bbox_x1 is not None else 0)
        y1 = float(bbox_y1 if bbox_y1 is not None else 0)
        x2 = float(bbox_x2 if bbox_x2 is not None else (w - 1))
        y2 = float(bbox_y2 if bbox_y2 is not None else (h - 1))
        snake0 = _init_from_bbox(x1, y1, x2, y2, pts)
        init_stats.update({"bbox": [x1, y1, x2, y2]})

    else:
        # unknown mode -> circle fallback
        snake0 = _init_circle(h, w, init_cx, init_cy, init_radius, pts)
        init_stats["warning"] = f"unknown init_mode={init_mode} -> circle"

    # 4) run active contour (รองรับต่างเวอร์ชันของ skimage)
    try:
        snake_rc = active_contour(
            image=fimg,
            snake=snake0,
            alpha=float(alpha),
            beta=float(beta),
            gamma=float(gamma),
            w_line=float(w_line),
            w_edge=float(w_edge),
            max_num_iter=int(max_iterations),
            convergence=float(convergence),
        )
    except TypeError:
        try:
            snake_rc = active_contour(
                image=fimg,
                snake=snake0,
                alpha=float(alpha),
                beta=float(beta),
                gamma=float(gamma),
                w_line=float(w_line),
                w_edge=float(w_edge),
                max_num_iter=int(max_iterations),
            )
        except TypeError:
            snake_rc = active_contour(
                fimg,
                snake0,
                alpha=float(alpha),
                beta=float(beta),
                gamma=float(gamma),
                w_line=float(w_line),
                w_edge=float(w_edge),
                max_num_iter=int(max_iterations),
            )

    # 5) outputs
    mask = _contour_to_mask(snake_rc, shape=(h, w))
    overlay = _draw_overlay(gray, snake_rc)

    json_path    = os.path.join(out_dir, f"snake_{uid}.json")
    overlay_path = os.path.join(out_dir, f"snake_overlay_{uid}.png")
    mask_path    = os.path.join(out_dir, f"snake_mask_{uid}.png")

    cv2.imwrite(overlay_path, overlay)
    cv2.imwrite(mask_path, mask)

    # contour -> [(x,y), ...]
    contour_points_xy: List[List[float]] = [[float(x), float(y)] for (y, x) in snake_rc]

    result: Dict[str, Any] = {
        "tool": "SnakeActiveContour",
        "tool_version": {"opencv": cv2.__version__},
        "input_image": {
            "path": image_path,
            "shape": [int(h), int(w)],
            "dtype": str(gray.dtype),
        },
        "parameters": {
            "alpha": float(alpha),
            "beta": float(beta),
            "gamma": float(gamma),
            "w_line": float(w_line),
            "w_edge": float(w_edge),
            "max_iterations": int(max_iterations),
            "convergence": float(convergence),

            "init_mode": init_mode,
            "init_points": int(pts),
            "init_cx": init_cx,
            "init_cy": init_cy,
            "init_radius": init_radius,
            "from_point": [from_point_x, from_point_y] if init_mode == "point" else None,
            "bbox": [bbox_x1, bbox_y1, bbox_x2, bbox_y2] if init_mode == "bbox" else None,

            "gaussian_blur_ksize": int(gaussian_blur_ksize),
        },
        "init_stats": init_stats,
        "output": {
            "contour_points_xy": contour_points_xy,
            "mask_path": mask_path,
            "overlay_path": overlay_path,
            "iterations": int(max_iterations),
        },
        "notes": "Binary mask is 0/255 (uint8). Contour points are (x, y).",
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return json_path, overlay_path, mask_path