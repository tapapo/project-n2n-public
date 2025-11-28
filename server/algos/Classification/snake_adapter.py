import os
import json
import uuid
from typing import Dict, Any, Tuple, Optional, List

import cv2
import numpy as np

# Try importing skimage (scikit-image)
try:
    from skimage.segmentation import active_contour
    from skimage.filters import gaussian
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False


def _ensure_dir(d: str):
    os.makedirs(d, exist_ok=True)

def _read_json(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        raise FileNotFoundError(f"JSON file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    if img.ndim == 3 and img.shape[2] == 4:
        return cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

def _contour_to_mask(contour_rc: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    # contour_rc is (row, col) -> (y, x)
    # cv2.fillPoly expects (x, y)
    poly = np.round(contour_rc[:, ::-1]).astype(np.int32)
    mask = np.zeros(shape, dtype=np.uint8)
    if len(poly) >= 3:
        cv2.fillPoly(mask, [poly], 255)
    return mask

def _draw_overlay(base: np.ndarray, contour_rc: np.ndarray, color=(0, 0, 255)) -> np.ndarray:
    if base.ndim == 2:
        vis = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
    else:
        vis = base.copy()
        if vis.ndim == 3 and vis.shape[2] == 4:
            vis = vis[:, :, :3]
            
    # contour_rc (y, x) -> pts (x, y)
    pts = np.round(contour_rc[:, ::-1]).astype(np.int32)
    if len(pts) >= 2:
        cv2.polylines(vis, [pts], isClosed=True, color=color, thickness=2, lineType=cv2.LINE_AA)
    return vis

# --- Initialization Helpers ---

def _init_snake_circle(h: int, w: int, cx: Optional[int], cy: Optional[int], r: Optional[int], pts: int) -> np.ndarray:
    if cx is None: cx = w // 2
    if cy is None: cy = h // 2
    if r is None or r <= 0: r = min(h, w) // 3

    s = np.linspace(0, 2 * np.pi, int(max(8, pts)), endpoint=False)
    x = cx + r * np.cos(s)
    y = cy + r * np.sin(s)
    return np.stack([y, x], axis=1).astype(np.float32)

def _init_snake_bbox(h: int, w: int, x1, y1, x2, y2, pts: int) -> np.ndarray:
    # Default bbox: center 60%
    if x1 is None: x1 = w * 0.2
    if y1 is None: y1 = h * 0.2
    if x2 is None: x2 = w * 0.8
    if y2 is None: y2 = h * 0.8
    
    # Create ellipse inside bbox for smooth start
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    rx, ry = abs(x2 - x1) / 2, abs(y2 - y1) / 2
    
    return _init_snake_circle(h, w, cx, cy, min(rx, ry), pts)


def _prepare_image_for_snake(gray: np.ndarray, gaussian_blur_ksize: int) -> np.ndarray:
    if not HAS_SKIMAGE:
        return gray.astype(np.float32) / 255.0
        
    img_float = gray.astype(np.float32) / 255.0
    
    # Apply Gaussian filter if requested (skimage style)
    if gaussian_blur_ksize > 0:
        # sigma approx ksize/3
        sigma = max(1.0, gaussian_blur_ksize / 3.0)
        img_float = gaussian(img_float, sigma=sigma, preserve_range=True)
        
    return img_float


def run(
    image_path: str,
    out_root: str,
    *,
    # Snake dynamics
    alpha: float = 0.015,
    beta: float = 10.0,
    gamma: float = 0.001,
    w_line: float = 0.0,
    w_edge: float = 1.0,
    max_iterations: int = 250,
    convergence: float = 0.1,
    
    # Initialization
    init_mode: str = "circle",
    init_cx: Optional[int] = None,
    init_cy: Optional[int] = None,
    init_radius: Optional[int] = None,
    init_points: int = 400,
    
    from_point_x: Optional[float] = None,
    from_point_y: Optional[float] = None,
    
    bbox_x1: Optional[float] = None,
    bbox_y1: Optional[float] = None,
    bbox_x2: Optional[float] = None,
    bbox_y2: Optional[float] = None,
    
    gaussian_blur_ksize: int = 5,
) -> Tuple[str, Optional[str], Optional[str]]:
    
    # ✅ 1. Validation & Path Resolution
    if image_path.lower().endswith(".json"):
        try:
            data = _read_json(image_path)
            # Check invalid types
            if "matching_tool" in data:
                raise ValueError("Invalid Input: Snake cannot run on Matcher Result JSON.")
            
            # Attempt to extract image path (support Alignment output)
            image_path = (
                data.get("image", {}).get("original_path") or 
                data.get("output", {}).get("aligned_image") or
                image_path
            )
        except (json.JSONDecodeError, FileNotFoundError):
            pass # Proceed if not a valid JSON or file missing (let imread handle)

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    
    gray = _to_gray(img)
    h, w = gray.shape[:2]
    
    # ✅ 2. Initialization Logic
    pts = int(max(8, init_points))
    snake0 = None

    if init_mode == "point" and from_point_x is not None and from_point_y is not None:
        # Circle around clicked point
        r = init_radius if init_radius else 20
        snake0 = _init_snake_circle(h, w, from_point_x, from_point_y, r, pts)
        
    elif init_mode == "bbox":
        snake0 = _init_snake_bbox(h, w, bbox_x1, bbox_y1, bbox_x2, bbox_y2, pts)
        
    else: # Default: Circle at center
        snake0 = _init_snake_circle(h, w, init_cx, init_cy, init_radius, pts)


    # ✅ 3. Run Snake
    if HAS_SKIMAGE:
        fimg = _prepare_image_for_snake(gray, gaussian_blur_ksize)
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
                boundary_condition='periodic'
            )
        except Exception as e:
            print(f"Snake calculation error: {e}. Returning initial contour.")
            snake_rc = snake0
    else:
        print("Warning: scikit-image not installed. Snake will not evolve.")
        snake_rc = snake0 # Fallback: return initial

    # 4. Save Outputs
    out_dir = os.path.join(out_root, "features", "snake_outputs")
    _ensure_dir(out_dir)
    uid = uuid.uuid4().hex[:8]

    mask = _contour_to_mask(snake_rc, shape=(h, w))
    overlay = _draw_overlay(gray, snake_rc)

    json_path = os.path.join(out_dir, f"snake_{uid}.json")
    overlay_path = os.path.join(out_dir, f"snake_overlay_{uid}.png")
    mask_path = os.path.join(out_dir, f"snake_mask_{uid}.png")

    cv2.imwrite(overlay_path, overlay)
    cv2.imwrite(mask_path, mask)

    contour_points_xy: List[List[float]] = [[float(x), float(y)] for (y, x) in snake_rc]

    result: Dict[str, Any] = {
        "tool": "SnakeActiveContour",
        "output_type": "classification",
        "tool_version": {"opencv": cv2.__version__},
        "input_image": {
            "path": image_path,
            "shape": [int(h), int(w)],
            "dtype": str(gray.dtype),
        },
        "parameters": {
            "alpha": float(alpha),
            "beta": float(beta),
            "init_mode": init_mode,
        },
        "output": {
            "contour_points_xy": contour_points_xy,
            "mask_path": mask_path,
            "overlay_path": overlay_path,
            "iterations": int(max_iterations),
            # ✅ เพิ่ม URL เพื่อให้ Frontend ใช้ง่าย
            "overlay_url": f"/static/features/snake_outputs/{os.path.basename(overlay_path)}",
            "mask_url": f"/static/features/snake_outputs/{os.path.basename(mask_path)}",
            "result_image_url": f"/static/features/snake_outputs/{os.path.basename(overlay_path)}"
        }
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return json_path, overlay_path, mask_path