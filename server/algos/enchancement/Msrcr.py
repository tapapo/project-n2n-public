import os
import sys
import json
import uuid
import cv2
import numpy as np

def msrcr(img, sigma_list=(15, 80, 250), G=5, b=25, alpha=125, beta=46):
    """
    Simple MSRCR implementation.
    img: input BGR image (uint8)
    sigma_list: scales for Gaussian blur
    Returns enhanced image (uint8)
    """
    img = img.astype(np.float32) + 1.0  # prevent log(0)
    img_retinex = np.zeros_like(img)

    for sigma in sigma_list:
        blur = cv2.GaussianBlur(img, (0, 0), sigma)
        img_retinex += np.log(img) - np.log(blur)
    
    img_retinex /= len(sigma_list)
    
    # Color restoration
    img_sum = np.sum(img, axis=2, keepdims=True)
    img_cr = beta * (np.log(alpha * img) - np.log(img_sum))
    
    img_msrcr = G * (img_retinex * img_cr + b)
    img_msrcr = np.clip(img_msrcr, 0, 255).astype(np.uint8)
    return img_msrcr

def run(image_path: str, out_root: str = ".", **params):
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    
    if img.ndim == 3 and img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

    if img.ndim != 3 or img.shape[2] != 3:
        raise ValueError(f"MSRCR requires a BGR color image")

    # Parameters
    sigma_list = params.get("sigma_list", (15, 80, 250))
    G = float(params.get("G", 5))
    b = float(params.get("b", 25))
    alpha = float(params.get("alpha", 125))
    beta = float(params.get("beta", 46))

    enhanced = msrcr(img, sigma_list, G, b, alpha, beta)

    # Payload
    payload = {
        "tool": "MSRCR",
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img.shape), # บันทึก Shape ที่ใช้คำนวณจริง (3 channels)
            "enhanced_shape": list(enhanced.shape),
            "dtype": str(enhanced.dtype)
        },
        "msrcr_parameters_used": {
            "sigma_list": sigma_list,
            "G": G,
            "b": b,
            "alpha": alpha,
            "beta": beta
        }
    }

    # Unique stem
    base = os.path.splitext(os.path.basename(image_path))[0]
    unique_id = uuid.uuid4().hex[:8]
    stem = f"{base}_msrcr_{unique_id}"

    # Output directories
    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "msrcr_outputs")
    os.makedirs(algo_dir, exist_ok=True)

    # Save JSON
    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4)
    json_path = os.path.abspath(json_path)

    # Save visualization
    vis_path = os.path.join(algo_dir, stem + "_vis.jpg")
    cv2.imwrite(vis_path, enhanced)
    vis_path = os.path.abspath(vis_path)

    return json_path, vis_path