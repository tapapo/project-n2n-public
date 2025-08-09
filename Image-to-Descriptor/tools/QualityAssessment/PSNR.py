import cv2
import numpy as np
import json
import sys
import os
import matplotlib.pyplot as plt


# --- Helper Functions for Image Type Checks ---
def is_grayscale(img):
    """Checks if a NumPy image array is grayscale (2D)."""
    return len(img.shape) == 2

def is_color(img):
    """Checks if a NumPy image array is color (3D with 3 or 4 channels)."""
    return len(img.shape) == 3 and (img.shape[2] == 3 or img.shape[2] == 4)

# --- Helper Function: JSON Output for PSNR ---
def serialize_psnr_output_to_json(original_image_path, processed_image_path,
                                   original_img_shape, processed_img_shape,
                                   psnr_score, data_range, color_mode_used, message=""):
    """
    Serializes PSNR assessment results to a JSON string.
    Includes information about the color mode used for PSNR calculation.
    """
    # ไม่ต้องดึงเวอร์ชั่น skimage แล้ว
    # skimage_version = "N/A"
    # if 'skimage' in sys.modules:
    #     try:
    #         skimage_version = skimage.__version__
    #     except AttributeError:
    #         pass

    return json.dumps({
        "tool": "PSNR",
        "tool_version": {
            # "scikit_image": skimage_version, # ลบออก
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "images": {
            "original_image": {
                "path": original_image_path,
                "file_name": os.path.basename(original_image_path),
                "shape": list(original_img_shape),
                "dtype": "uint8"
            },
            "processed_image": {
                "path": processed_image_path,
                "file_name": os.path.basename(processed_image_path),
                "shape": list(processed_img_shape),
                "dtype": "uint8"
            }
        },
        "psnr_parameters_used": {
            "data_range": data_range,
            "color_mode_used_for_psnr": color_mode_used
        },
        "quality_score": round(psnr_score, 4) if np.isfinite(psnr_score) else str(psnr_score), # จัดการค่า infinity ใน JSON
        "score_interpretation": "Higher score indicates better quality (lower noise/distortion).",
        "message": message
    }, indent=4)


# --- Custom PSNR Function using NumPy (compatible with OpenCV arrays) ---
def calculate_psnr_custom(img1, img2, data_range=255):
    """
    Calculates PSNR (Peak Signal-to-Noise Ratio) between two images.
    Handles both grayscale and color images.
    """
    if img1.shape != img2.shape:
        raise ValueError("Image dimensions must be identical for PSNR calculation.")

    # Convert to float for accurate subtraction to avoid overflow issues with uint8
    img1_float = img1.astype(np.float64)
    img2_float = img2.astype(np.float64)

    # Calculate Mean Squared Error (MSE)
    # For color images, MSE is calculated over all channels
    mse = np.mean((img1_float - img2_float) ** 2)

    if mse == 0:
        return float('inf') # Images are identical, PSNR is infinite

    # Calculate PSNR
    psnr_val = 10 * np.log10((data_range ** 2) / mse)
    return psnr_val

# --- Main PSNR Processing Function ---
def run_psnr_assessment(original_img_path, processed_img_path, data_range=255):
    """
    Performs PSNR quality assessment on two image files after strict validation.
    Compares color-to-color if both are color, otherwise converts both to grayscale.
    """
    print("\n--- Starting PSNR Quality Assessment ---")

    # 1. Load Images
    try:
        original_img_raw = cv2.imread(original_img_path, cv2.IMREAD_UNCHANGED)
        processed_img_raw = cv2.imread(processed_img_path, cv2.IMREAD_UNCHANGED)

        if original_img_raw is None:
            raise FileNotFoundError(f"Cannot read original image (file may not exist or corrupted): {original_img_path}")
        if processed_img_raw is None:
            raise FileNotFoundError(f"Cannot read processed image (file may not exist or corrupted): {processed_img_path}")

        orig_raw_shape = original_img_raw.shape
        proc_raw_shape = processed_img_raw.shape

        print(f"[INFO] Loaded original image: {os.path.basename(original_img_path)} (Shape: {orig_raw_shape}, Dtype: {original_img_raw.dtype})")
        print(f"[INFO] Loaded processed image: {os.path.basename(processed_img_path)} (Shape: {proc_raw_shape}, Dtype: {processed_img_raw.dtype})")

    except FileNotFoundError as fnfe:
        print(f"[ERROR] Image loading failed: {fnfe}")
        raise
    except Exception as e:
        print(f"[ERROR] Unexpected error during image loading: {e}")
        raise

    # 2. Prepare images for PSNR calculation (handle color vs. grayscale)
    original_img_for_psnr = None
    processed_img_for_psnr = None
    color_mode_used = ""
    message = ""

    try:
        if is_color(original_img_raw) and is_color(processed_img_raw):
            # If both are color images, prepare them for color PSNR
            # Ensure both have 3 channels (remove alpha if present)
            if original_img_raw.shape[2] == 4:
                original_img_raw = original_img_raw[:, :, :3] # Remove alpha channel
                print("[INFO] Original image (RGBA) converted to RGB for color PSNR.")
            if processed_img_raw.shape[2] == 4:
                processed_img_raw = processed_img_raw[:, :, :3] # Remove alpha channel
                print("[INFO] Processed image (RGBA) converted to RGB for color PSNR.")

            # Ensure uint8 for both
            if original_img_raw.dtype != np.uint8:
                original_img_raw = original_img_raw.astype(np.uint8)
                print(f"[INFO] Original image dtype converted to uint8 for color PSNR.")
            if processed_img_raw.dtype != np.uint8:
                processed_img_raw = processed_img_raw.astype(np.uint8)
                print(f"[INFO] Processed image dtype converted to uint8 for color PSNR.")

            original_img_for_psnr = original_img_raw
            processed_img_for_psnr = processed_img_raw
            color_mode_used = "Color (MSE over all channels)" # เปลี่ยนคำอธิบาย
            print("[INFO] Performing PSNR on Color images (calculating MSE over all channels).")

        else:
            # If not both color, convert both to grayscale
            print("[INFO] Image color modes differ or are grayscale. Converting both to grayscale for PSNR.")
            if is_color(original_img_raw):
                original_img_for_psnr = cv2.cvtColor(original_img_raw, cv2.COLOR_BGR2GRAY)
            elif is_grayscale(original_img_raw):
                original_img_for_psnr = original_img_raw
            else:
                raise ValueError(f"Unsupported image format for original image '{os.path.basename(original_img_path)}'. Must be 2D (grayscale) or 3D (color).")

            if is_color(processed_img_raw):
                processed_img_for_psnr = cv2.cvtColor(processed_img_raw, cv2.COLOR_BGR2GRAY)
            elif is_grayscale(processed_img_raw):
                processed_img_for_psnr = processed_img_raw
            else:
                raise ValueError(f"Unsupported image format for processed image '{os.path.basename(processed_img_path)}'. Must be 2D (grayscale) or 3D (color).")

            # Ensure uint8 for grayscale images
            if original_img_for_psnr.dtype != np.uint8:
                original_img_for_psnr = original_img_for_psnr.astype(np.uint8)
                print(f"[INFO] Original grayscale image dtype converted to uint8 for PSNR.")
            if processed_img_for_psnr.dtype != np.uint8:
                processed_img_for_psnr = processed_img_for_psnr.astype(np.uint8)
                print(f"[INFO] Processed grayscale image dtype converted to uint8 for PSNR.")

            color_mode_used = "Grayscale"

        # 3. Validate Dimensions (CRITICAL for PSNR)
        if original_img_for_psnr.shape != processed_img_for_psnr.shape:
            raise ValueError(
                f"Image dimensions mismatch after processing to {color_mode_used}: "
                f"Original ({original_img_for_psnr.shape}) vs "
                f"Processed ({processed_img_for_psnr.shape}). "
                "They must be identical (same width, height, and channels if color) for PSNR calculation."
            )

        if original_img_for_psnr.dtype != processed_img_for_psnr.dtype:
             raise ValueError("Final dtype mismatch after conversion. This indicates an unexpected internal issue.")

        print(f"[INFO] Images prepared for PSNR calculation: Original ({original_img_for_psnr.shape[1]}x{original_img_for_psnr.shape[0]}, {original_img_for_psnr.dtype}), Processed ({processed_img_for_psnr.shape[1]}x{processed_img_for_psnr.shape[0]}, {processed_img_for_psnr.dtype}).")

    except ValueError as ve:
        print(f"[ERROR] Image preprocessing or validation failed: {ve}")
        raise
    except Exception as e:
        print(f"[ERROR] Unexpected error during image conversion or validation: {e}")
        raise

    # 4. Compute PSNR using custom function
    psnr_score = 0.0
    try:
        psnr_score = calculate_psnr_custom(original_img_for_psnr, processed_img_for_psnr, data_range=data_range)

        if np.isinf(psnr_score):
            message = "PSNR is infinite because the images are identical (MSE is zero). This indicates perfect quality."
            print(f"[INFO] PSNR Score: Infinite dB (Mode: {color_mode_used}) - {message}")
        else:
            message = "PSNR calculation successful."
            print(f"[INFO] PSNR Score: {psnr_score:.4f} dB (Mode: {color_mode_used})")
        print("[INFO] (Higher score indicates better quality.)")

        return psnr_score, orig_raw_shape, proc_raw_shape, original_img_for_psnr, processed_img_for_psnr, color_mode_used, message

    except Exception as e:
        print(f"[ERROR] PSNR computation failed: {e}")
        raise

# --- Main Execution Block ---
if __name__ == "__main__":
    # --- Configuration: SET YOUR IMAGE PATHS HERE ---
    ORIGINAL_IMAGE_PATH = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/CatA.jpg"
    PROCESSED_IMAGE_PATH = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/CatA_grayscale.jpg" # หรือรูปอื่นที่ต้องการทดสอบ

    OUTPUT_DIR = "/Users/pop/Desktop/project_n2n/psnr_output"
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    OUTPUT_JSON_PATH = os.path.join(OUTPUT_DIR, "psnr_result.json")

    # --- Run PSNR Assessment ---
    print("\n--- Running PSNR Assessment ---")
    try:
        psnr_score, orig_shape, proc_shape, img_proc_for_vis_orig, img_proc_for_vis_proc, color_mode_used, message = run_psnr_assessment(
            ORIGINAL_IMAGE_PATH, PROCESSED_IMAGE_PATH, data_range=255
        )

        json_result = serialize_psnr_output_to_json(
            ORIGINAL_IMAGE_PATH, PROCESSED_IMAGE_PATH,
            orig_shape, proc_shape,
            psnr_score, data_range=255,
            color_mode_used=color_mode_used,
            message=message
        )
        with open(OUTPUT_JSON_PATH, 'w') as f:
            f.write(json_result)
        print(f"[INFO] JSON result saved to: {OUTPUT_JSON_PATH}")

        # --- Visualization ---
        if np.isinf(psnr_score):
             psnr_display = "Infinity"
        else:
             psnr_display = f"{psnr_score:.2f}"

        fig, axes = plt.subplots(1, 2, figsize=(14, 7))

        if color_mode_used.startswith("Color"): # เช็คด้วย startswith เพราะเปลี่ยน string
            axes[0].imshow(cv2.cvtColor(img_proc_for_vis_orig, cv2.COLOR_BGR2RGB))
            axes[1].imshow(cv2.cvtColor(img_proc_for_vis_proc, cv2.COLOR_BGR2RGB))
            axes[0].set_title(f"Original (Color)\n{os.path.basename(ORIGINAL_IMAGE_PATH)}")
            axes[1].set_title(f"Processed (Color)\n{os.path.basename(PROCESSED_IMAGE_PATH)}\nPSNR: {psnr_display} dB")
        else: # Grayscale
            axes[0].imshow(img_proc_for_vis_orig, cmap='gray')
            axes[1].imshow(img_proc_for_vis_proc, cmap='gray')
            axes[0].set_title(f"Original (Grayscale)\n{os.path.basename(ORIGINAL_IMAGE_PATH)}")
            axes[1].set_title(f"Processed (Grayscale)\n{os.path.basename(PROCESSED_IMAGE_PATH)}\nPSNR: {psnr_display} dB")

        axes[0].axis('off')
        axes[1].axis('off')

        plt.tight_layout()
        plt.show()

    except FileNotFoundError as fnfe:
        print(f"[FINAL ERROR] One or both image files were not found: {fnfe}")
    except ValueError as ve:
        print(f"[FINAL ERROR] Image validation failed: {ve}")
    except ImportError as ie:
        print(f"[FINAL ERROR] Required library not found: {ie}")
    except Exception as e:
        print(f"[FINAL ERROR] An unexpected error occurred during PSNR process: {e}")

    print("\n--- PSNR processing complete. ---")