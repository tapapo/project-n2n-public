import cv2
import numpy as np
import json
import sys
import os
import matplotlib.pyplot as plt

# --- Helper Function: JSON Output for BRISQUE ---
def serialize_brisque_output_to_json(image_path, gray_img_shape, brisque_score, model_path, range_path):
    image_file_name = os.path.basename(image_path)
    
    # Extract model and range file names for better readability in JSON
    model_file_name = os.path.basename(model_path) if model_path else "N/A"
    range_file_name = os.path.basename(range_path) if range_path else "N/A"

    return json.dumps({
        "tool": "BRISQUE",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "image": {
            "original_path": image_path,
            "file_name": image_file_name,
            "processed_shape": list(gray_img_shape),
            "dtype": "uint8"
        },
        "brisque_parameters_used": {
            "model_file": model_file_name,
            "range_file": range_file_name,
            # BRISQUE doesn't have other user-settable params directly
        },
        "quality_score": round(brisque_score, 4),
        "score_interpretation": "Lower score indicates better quality."
    }, indent=4)

# --- Configuration ---
# IMPORTANT: You need to download these files.
# Search for "opencv brisque model yml" or visit:
# https://github.com/opencv/opencv_extra/tree/4.x/testdata/quality
# Place them in a known directory, e.g., 'brisque_models'
# --- Configuration ---
MODEL_PATH = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/tools/QualityAssessment/brisque_models/brisque_model_live.yml"
RANGE_PATH = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/tools/QualityAssessment/brisque_models/brisque_range_live.yml"

# PATH สำหรับภาพ Input และ Output ก็ต้องถูกด้วย
IMAGE_PATH = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/CatA_grayscale.jpg" # Input image to assess
OUTPUT_DIR = "/Users/pop/Desktop/project_n2n/brisque_output" # ตรวจสอบให้แน่ใจว่า output directory ถูกต้อง
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

IMAGE_FILE_NAME = os.path.basename(IMAGE_PATH)
OUTPUT_JSON_PATH = os.path.join(OUTPUT_DIR, IMAGE_FILE_NAME.replace('.jpg', '_brisque_output.json'))

# --- Main BRISQUE Processing ---
def run_brisque_assessment(image_path, model_path, range_path):
    print("\n--- Starting BRISQUE Quality Assessment ---")

    # 1. Load Image
    try:
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Cannot read image (file may not exist or corrupted): {image_path}")

        if len(img.shape) == 3: # If it's a color image, convert to grayscale for BRISQUE
            gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            print(f"[INFO] Converted color image to grayscale: {image_path}")
        elif len(img.shape) == 2:
            gray_img = img # Already grayscale
            print(f"[INFO] Loaded grayscale image: {image_path}")
        else:
            raise ValueError("Unsupported image format. Please provide a standard grayscale or color image.")

    except Exception as e:
        print(f"[ERROR] Image loading or conversion failed: {e}")
        return None, None

    # 2. Check for BRISQUE model and range files
    if not os.path.exists(model_path):
        print(f"[ERROR] BRISQUE model file not found: {model_path}")
        print("Please download 'brisque_model_live.yml' and 'brisque_range_live.yml' and place them in the correct directory.")
        print("You can find them here: https://github.com/opencv/opencv_extra/tree/4.x/testdata/quality")
        return None, None
    if not os.path.exists(range_path):
        print(f"[ERROR] BRISQUE range file not found: {range_path}")
        print("Please download 'brisque_model_live.yml' and 'brisque_range_live.yml' and place them in the correct directory.")
        print("You can find them here: https://github.com/opencv/opencv_extra/tree/4.x/testdata/quality")
        return None, None

    # 3. Create BRISQUE object and compute score
    try:
        # Note: QualityBRISQUE is part of opencv-contrib-python
        brisque_scorer = cv2.quality.QualityBRISQUE_create(model_path, range_path)
        
        # Calculate score (returns tuple: (score_value, ))
        score_tuple = brisque_scorer.compute(gray_img)
        brisque_score = score_tuple[0] # Extract the actual score
        
        print(f"[INFO] BRISQUE Score for '{os.path.basename(image_path)}': {brisque_score:.4f}")
        print("[INFO] (Lower score indicates better quality.)")

        return brisque_score, gray_img.shape

    except AttributeError:
        print("[ERROR] OpenCV 'quality' module (BRISQUE) not found. "
              "Please ensure 'opencv-contrib-python' is installed (pip install opencv-contrib-python).")
        return None, None
    except Exception as e:
        print(f"[ERROR] BRISQUE computation failed: {e}")
        return None, None

# --- Execute BRISQUE ---
if __name__ == "__main__":
    score, img_shape = run_brisque_assessment(IMAGE_PATH, MODEL_PATH, RANGE_PATH)

    if score is not None:
        # Save JSON Output
        json_output = serialize_brisque_output_to_json(IMAGE_PATH, img_shape, score, MODEL_PATH, RANGE_PATH)
        try:
            with open(OUTPUT_JSON_PATH, 'w') as f:
                f.write(json_output)
            print(f"[INFO] JSON saved to: {OUTPUT_JSON_PATH}")
        except IOError as e:
            print(f"[ERROR] Failed to save JSON: {e}")
            sys.exit(1)
        
        # Optional: Display the image
        img_display = cv2.imread(IMAGE_PATH, cv2.IMREAD_UNCHANGED)
        if len(img_display.shape) == 3:
            img_display = cv2.cvtColor(img_display, cv2.COLOR_BGR2RGB) # For matplotlib
        
        plt.figure(figsize=(8, 6))
        plt.imshow(img_display, cmap='gray' if len(img_display.shape) == 2 else None)
        plt.title(f"Image: {os.path.basename(IMAGE_PATH)}\nBRISQUE Score: {score:.4f} (Lower = Better)")
        plt.axis('off')
        plt.show()

    print("\n--- BRISQUE processing complete. ---")