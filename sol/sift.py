import cv2
import numpy as np
import matplotlib.pyplot as plt
import json
import os
import sys

# Helper Function: JSON Output for SIFT
def serialize_sift_output_to_json(image_path, gray_img, keypoints, descriptors, sift_params):
    
    sift_data = []
    if keypoints is not None and descriptors is not None:
        for i, kp in enumerate(keypoints):
            sift_data.append({
                "x": round(kp.pt[0], 4),
                "y": round(kp.pt[1], 4),
                "size": round(kp.size, 4),
                "angle": round(kp.angle, 4),
                "response": round(kp.response, 6),
                "octave": kp.octave,
                "class_id": kp.class_id,
                "descriptor": descriptors[i].tolist()
            })

    image_file_name = os.path.basename(image_path)

    return json.dumps({
        "tool": "SIFT",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "image": {
            "original_path": image_path,
            "file_name": image_file_name,
            "shape": list(gray_img.shape),
            "dtype": str(gray_img.dtype)
        },
        "sift_parameters_used": {
            "nfeatures": sift_params.getNFeatures(),
            "nOctaveLayers": sift_params.getNOctaveLayers(),
            "contrastThreshold": sift_params.getContrastThreshold(),
            "edgeThreshold": sift_params.getEdgeThreshold(),
            "sigma": sift_params.getSigma()
        },
        "num_keypoints": len(sift_data),
        "descriptor_dim": 128,
        "keypoints": sift_data
    }, indent=4)

# Helper Function: JSON Output for Edge Data
def serialize_edge_output_to_json(image_path, edge_image, edge_points_data):
    image_file_name = os.path.basename(image_path)
    
    return json.dumps({
        "tool": "Edge Detection (Canny)",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "image": {
            "original_path": image_path,
            "file_name": image_file_name,
            "shape": list(edge_image.shape),
            "dtype": str(edge_image.dtype)
        },
        "edge_points_count": len(edge_points_data),
        "edge_points": edge_points_data
    }, indent=4)

# Config: Input & Output Paths
image_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'image', '03_grayscale.jpg'
)
output_dir = "sift_and_edge_outputs" # เปลี่ยนชื่อโฟลเดอร์สำหรับ output
os.makedirs(output_dir, exist_ok=True)

# Load Image
try:
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"File not found: {image_path}")
    
    # Load image as is (without forcing grayscale immediately)
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED) # Load as is to check channels

    if img is None:
        raise ValueError("Image file is unreadable or corrupted.")

    # Check if the image is already grayscale (2 dimensions)
    if len(img.shape) == 2:
        gray_img = img
        print(f"[INFO] Image loaded as grayscale: {image_path}")
    elif len(img.shape) == 3 and img.shape[2] == 3: # Check for 3 channels (color image)
        raise ValueError("Input image must be grayscale. Color images are not accepted.")
    else: # Handle other unexpected image formats
        raise ValueError("Unsupported image format. Please provide a grayscale image.")

    print(f"[INFO] Image size: {gray_img.shape[1]}x{gray_img.shape[0]}")

except (FileNotFoundError, ValueError) as e:
    print(f"[ERROR] {e}")
    sys.exit(1)

# --- SIFT Feature Extraction ---
sift = cv2.SIFT_create(
    nfeatures=0,
    nOctaveLayers=3,
    contrastThreshold=0.04,
    edgeThreshold=10,
    sigma=1.6
)

print("\n--- Running SIFT Feature Extraction ---")
keypoints, descriptors = sift.detectAndCompute(gray_img, None)

if keypoints is None or len(keypoints) == 0:
    print("[WARNING] No SIFT keypoints found.")
    descriptors = np.empty((0, 128), dtype=np.float32)
    keypoints = []
else:
    print(f"[INFO] SIFT Keypoints detected: {len(keypoints)}")
    print(f"[INFO] SIFT Descriptors shape: {descriptors.shape}")

if descriptors is not None and descriptors.dtype != np.float32:
    print("[WARNING] SIFT Descriptor dtype is not float32. May cause downstream issues.")

# Save SIFT JSON Output
json_output_sift = serialize_sift_output_to_json(image_path, gray_img, keypoints, descriptors, sift)
base_name = os.path.splitext(os.path.basename(image_path))[0]
output_path_sift = os.path.join(output_dir, f"{base_name}_sift_output.json")

try:
    with open(output_path_sift, 'w') as f:
        f.write(json_output_sift)
    print(f"[INFO] SIFT JSON saved to: {output_path_sift}")
except IOError as e:
    print(f"[ERROR] Failed to save SIFT JSON: {e}")
    sys.exit(1)

# Preview SIFT JSON Sample (Optional)
parsed_json_sift = json.loads(json_output_sift)
if parsed_json_sift["num_keypoints"] > 0:
    print("\n[INFO] First SIFT keypoint sample:")
    print(json.dumps(parsed_json_sift["keypoints"][0], indent=4))
else:
    print("[INFO] No SIFT keypoints to display.")

# --- Edge Detection (Canny) ---
print("\n--- Running Edge Detection (Canny) ---")
# ปรับค่า threshold1 และ threshold2 ได้ตามความเหมาะสม
# ค่าทั่วไปคือ (100, 200) หรือ (50, 150) ลองปรับดูเพื่อให้ได้ขอบที่คมชัดที่สุด
edge_image = cv2.Canny(gray_img, 100, 200) 
print(f"[INFO] Edge image generated. Shape: {edge_image.shape}")

# Extract edge points (x, y, intensity)
edge_points_data = []
height, width = edge_image.shape

# Optimized way to get edge points using np.argwhere
# This returns (y, x) coordinates where intensity > 0
edge_coords = np.argwhere(edge_image > 0)

for y_coord, x_coord in edge_coords:
    intensity = int(edge_image[y_coord, x_coord]) # Cast to int for JSON compatibility
    edge_points_data.append({
        "x": int(x_coord),
        "y": int(y_coord),
        "intensity": intensity
    })

print(f"[INFO] Found {len(edge_points_data)} edge points.")

# Save Edge Data JSON Output
json_output_edge = serialize_edge_output_to_json(image_path, edge_image, edge_points_data)
output_path_edge = os.path.join(output_dir, f"{base_name}_edge_output.json")

try:
    with open(output_path_edge, 'w', encoding='utf-8') as f:
        f.write(json_output_edge)
    print(f"[INFO] Edge JSON saved to: {output_path_edge}")
except IOError as e:
    print(f"[ERROR] Failed to save Edge JSON: {e}")
    sys.exit(1)

# Preview Edge JSON Sample (Optional)
parsed_json_edge = json.loads(json_output_edge)
if parsed_json_edge["edge_points_count"] > 0:
    print("\n[INFO] First 5 edge points sample:")
    # แสดงแค่ 5 จุดแรก เนื่องจากจุดขอบอาจมีจำนวนมาก
    print(json.dumps(parsed_json_edge["edge_points"][:5], indent=4))
else:
    print("[INFO] No edge points to display.")

# --- Visualization ---
# SIFT Keypoints Visualization
if len(keypoints) > 0:
    img_bgr_for_sift_vis = cv2.cvtColor(gray_img, cv2.COLOR_GRAY2BGR)
    img_sift_vis = cv2.drawKeypoints(
        img_bgr_for_sift_vis, keypoints, None,
        flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
    )
    plt.figure(figsize=(10, 7))
    plt.imshow(cv2.cvtColor(img_sift_vis, cv2.COLOR_BGR2RGB))
    plt.title(f"SIFT Keypoints ({len(keypoints)} points)")
    plt.axis('off')
    plt.show()

# Edge Image Visualization
if edge_image is not None and np.any(edge_image): # Check if edge_image has any edges
    plt.figure(figsize=(10, 7))
    plt.imshow(edge_image, cmap='gray') # Display grayscale edge image
    plt.title(f"Canny Edges ({len(edge_points_data)} points)")
    plt.axis('off')
    plt.show()
else:
    print("[INFO] No edges to display in visualization.")

print("\nDone: SIFT and Edge Detection processes completed successfully.")