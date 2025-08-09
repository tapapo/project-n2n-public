import cv2
import numpy as np
import json
import sys
import os
import matplotlib.pyplot as plt
import skimage.metrics

# --- Helper Functions ---
def is_color(img):
    """
    Checks if an image is color (has 3 dimensions).
    """
    return len(img.shape) == 3

def serialize_ssim_output_to_json(original_image_path, processed_image_path,
                                 ssim_score, params_used, color_mode_used,
                                 message, is_color_input):
    """
    Serializes SSIM output into a JSON string.
    """
    skimage_version = "N/A"
    try:
        skimage_version = skimage.__version__
    except AttributeError:
        pass

    output_data = {
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
        "score": round(ssim_score, 4),
        "score_interpretation": "Higher score (closer to 1.0) indicates better structural similarity.",
        "message": message,
        "is_color_input": is_color_input
    }
    return json.dumps(output_data, indent=4)


def run_ssim_assessment(original_img_path, processed_img_path, calculate_on_color=False, **ssim_params):
    """
    Runs SSIM assessment on two images.
    Returns: ssim_score, original_img, processed_img, color_mode_used, message
    """
    print("\n--- Starting SSIM Quality Assessment ---")

    original_img_raw = cv2.imread(original_img_path, cv2.IMREAD_UNCHANGED)
    processed_img_raw = cv2.imread(processed_img_path, cv2.IMREAD_UNCHANGED)

    if original_img_raw is None or processed_img_raw is None:
        raise FileNotFoundError("Could not load one or both images.")

    is_color_input = is_color(original_img_raw) and is_color(processed_img_raw)
    
    color_mode_used = "Color (Multi-channel)" if calculate_on_color and is_color_input else "Grayscale"
    
    if color_mode_used == "Color (Multi-channel)":
        img1 = original_img_raw
        img2 = processed_img_raw
        ssim_params['channel_axis'] = -1
    else:
        # Convert to grayscale for calculation
        img1 = cv2.cvtColor(original_img_raw, cv2.COLOR_BGR2GRAY) if is_color(original_img_raw) else original_img_raw
        img2 = cv2.cvtColor(processed_img_raw, cv2.COLOR_BGR2GRAY) if is_color(processed_img_raw) else processed_img_raw
    
    if img1.shape != img2.shape:
        raise ValueError(f"Image shape mismatch: {img1.shape} vs {img2.shape}")

    if 'win_size' in ssim_params and ssim_params['win_size'] % 2 == 0:
        ssim_params['win_size'] += 1
        print(f"[WARN] win_size must be odd. Adjusted to {ssim_params['win_size']}")

    try:
        ssim_score = skimage.metrics.structural_similarity(img1, img2, **ssim_params)
        message = "SSIM calculation successful."
    except Exception as e:
        message = f"SSIM calculation failed: {e}"
        raise

    print(f"[INFO] SSIM Score: {ssim_score:.4f} ({color_mode_used})")
    
    return ssim_score, original_img_raw, processed_img_raw, img1, img2, color_mode_used, message, is_color_input

# === Main Execution ===
if __name__ == "__main__":
    # --- Hardcoded Paths (as requested) ---
    ORIGINAL_IMAGE_PATH = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/CatA.jpg"
    PROCESSED_IMAGE_PATH = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/CatA_grayscale.jpg"
    OUTPUT_DIR = "/Users/pop/Desktop/project_n2n/ssim_output"

    # --- SSIM Parameters (Adjust here) ---
    ssim_parameters = {
        'data_range': 255,
        'win_size': 11,
        'gaussian_weights': True,
        'sigma': 1.5,
        'use_sample_covariance': True,
        'K1': 0.01,
        'K2': 0.03,
    }

    # Decide whether to calculate on color or grayscale
    calculate_on_color = False
    
    # Set output JSON file path
    output_base_name = os.path.splitext(os.path.basename(PROCESSED_IMAGE_PATH))[0]
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    OUTPUT_JSON_PATH = os.path.join(OUTPUT_DIR, f"{output_base_name}_ssim.json")

    try:
        ssim_score, img_orig_raw, img_proc_raw, img_orig_ssim, img_proc_ssim, color_mode, message, is_color_input = run_ssim_assessment(
            ORIGINAL_IMAGE_PATH,
            PROCESSED_IMAGE_PATH,
            calculate_on_color=calculate_on_color,
            **ssim_parameters
        )

        json_result = serialize_ssim_output_to_json(
            ORIGINAL_IMAGE_PATH,
            PROCESSED_IMAGE_PATH,
            ssim_score,
            ssim_parameters,
            color_mode,
            message,
            is_color_input
        )

        with open(OUTPUT_JSON_PATH, 'w') as f:
            f.write(json_result)
        print(f"[INFO] JSON result saved to: {OUTPUT_JSON_PATH}")

        # === Visualization ===
        fig, axes = plt.subplots(1, 2, figsize=(14, 7))
        ssim_display = f"{ssim_score:.4f}"

        if is_color_input:
            axes[0].imshow(cv2.cvtColor(img_orig_raw, cv2.COLOR_BGR2RGB))
            axes[1].imshow(cv2.cvtColor(img_proc_raw, cv2.COLOR_BGR2RGB))
        else:
            axes[0].imshow(img_orig_ssim, cmap='gray')
            axes[1].imshow(img_proc_ssim, cmap='gray')

        axes[0].set_title(f"Original\n{os.path.basename(ORIGINAL_IMAGE_PATH)}")
        axes[1].set_title(f"Processed\n{os.path.basename(PROCESSED_IMAGE_PATH)}\nSSIM: {ssim_display}")
        for ax in axes:
            ax.axis('off')
        plt.tight_layout()
        plt.show()

    except Exception as e:
        print(f"[FINAL ERROR] {e}")

    print("\n--- SSIM processing complete ---")