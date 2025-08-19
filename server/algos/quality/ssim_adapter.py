# server/algos/quality/ssim_adapter.py
import cv2
import os
import json
import sys
import skimage.metrics
import uuid

# --- Helper ---
def is_color(img):
    return len(img.shape) == 3

def serialize_ssim_output_to_json(original_image_path, processed_image_path,
                                 ssim_score, params_used, color_mode_used,
                                 message, is_color_input):
    try:
        import skimage
        skimage_version = skimage.__version__
    except Exception:
        skimage_version = "N/A"

    return {
        "tool": "SSIM",
        "tool_info": {
            "scikit_image": skimage_version,
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "images": {
            "original": {
                "file_name": os.path.basename(original_image_path),
                "path": original_image_path
            },
            "processed": {
                "file_name": os.path.basename(processed_image_path),
                "path": processed_image_path
            }
        },
        "params_used": params_used,
        "color_mode_used_for_ssim": color_mode_used,
        "score": round(float(ssim_score), 4),
        "score_interpretation": "Higher score (closer to 1.0) indicates better structural similarity.",
        "message": message,
        "is_color_input": is_color_input
    }

# --- Core Function ---
def run_ssim_assessment(original_img_path, processed_img_path, calculate_on_color=False, **ssim_params):
    original_img_raw = cv2.imread(original_img_path, cv2.IMREAD_UNCHANGED)
    processed_img_raw = cv2.imread(processed_img_path, cv2.IMREAD_UNCHANGED)

    if original_img_raw is None or processed_img_raw is None:
        raise FileNotFoundError("Could not load one or both images.")

    is_color_input = is_color(original_img_raw) and is_color(processed_img_raw)
    color_mode_used = "Color (Multi-channel)" if calculate_on_color and is_color_input else "Grayscale"

    if color_mode_used == "Color (Multi-channel)":
        img1, img2 = original_img_raw, processed_img_raw
        ssim_params['channel_axis'] = -1
    else:
        img1 = cv2.cvtColor(original_img_raw, cv2.COLOR_BGR2GRAY) if is_color(original_img_raw) else original_img_raw
        img2 = cv2.cvtColor(processed_img_raw, cv2.COLOR_BGR2GRAY) if is_color(processed_img_raw) else processed_img_raw

    if img1.shape != img2.shape:
        raise ValueError(f"Image shape mismatch: {img1.shape} vs {img2.shape}")

    if 'win_size' in ssim_params and ssim_params['win_size'] % 2 == 0:
        ssim_params['win_size'] += 1

    try:
        ssim_score = skimage.metrics.structural_similarity(img1, img2, **ssim_params)
        message = "SSIM calculation successful."
    except Exception as e:
        raise RuntimeError(f"SSIM calculation failed: {e}")

    return ssim_score, color_mode_used, message, is_color_input

# --- Adapter ---
def compute_ssim(original_file, processed_file, out_root: str = None):
    """
    original_file, processed_file: path ของรูป input
    out_root: root outputs (optional, default จะใช้ ./outputs/features/ssim_outputs)
    """
    ssim_parameters = {
        'data_range': 255,
        'win_size': 11,
        'gaussian_weights': True,
        'sigma': 1.5,
        'use_sample_covariance': True,
        'K1': 0.01,
        'K2': 0.03,
    }

    score, color_mode, message, is_color_input = run_ssim_assessment(
        original_file,
        processed_file,
        calculate_on_color=False,
        **ssim_parameters
    )

    json_result = serialize_ssim_output_to_json(
        original_file,
        processed_file,
        score,
        ssim_parameters,
        color_mode,
        message,
        is_color_input
    )

    # --- Save JSON อัตโนมัติ ---
    if out_root is None:
        out_root = "outputs"

    out_dir = os.path.join(out_root, "features", "ssim_outputs")
    os.makedirs(out_dir, exist_ok=True)

    uid = uuid.uuid4().hex[:8]
    stem_a = os.path.splitext(os.path.basename(original_file))[0]
    stem_b = os.path.splitext(os.path.basename(processed_file))[0]

    json_path = os.path.join(out_dir, f"ssim_{stem_a}_vs_{stem_b}_{uid}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_result, f, indent=2, ensure_ascii=False)

    return {"score": score, "json": json_result, "json_path": json_path}