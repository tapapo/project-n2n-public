import cv2
import numpy as np
import matplotlib.pyplot as plt
import json
import os
import sys

def serialize_surf_output_to_json(image_path, processed_gray_img, keypoints, descriptors, surf_params):
    surf_data = []
    if keypoints is not None and descriptors is not None:
        for i, kp in enumerate(keypoints):
            surf_data.append({
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
        "tool": "SURF",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "image": {
            "original_path": image_path,
            "file_name": image_file_name,
            "processed_surf_shape": list(processed_gray_img.shape),
            "processed_surf_dtype": str(processed_gray_img.dtype)
        },
        "surf_parameters_used": {
            "hessianThreshold": surf_params.getHessianThreshold(),
            "nOctaves": surf_params.getNOctaves(),
            "nOctaveLayers": surf_params.getNOctaveLayers(),
            "extended": surf_params.getExtended(),
            "upright": surf_params.getUpright()
        },
        "num_keypoints": len(surf_data),
        "descriptor_dim": descriptors.shape[1] if descriptors is not None and descriptors.shape[0] > 0 else (128 if surf_params.getExtended() else 64),
        "keypoints": surf_data
    }, indent=4)

image_path = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/CatA.jpg"
output_dir = "/Users/pop/Desktop/project_n2n/surf_outputs"
os.makedirs(output_dir, exist_ok=True)
image_file = os.path.basename(image_path)
output_json_path = os.path.join(output_dir, os.path.splitext(image_file)[0] + '_surf_output.json')

try:
    img_original = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img_original is None:
        raise ValueError(f"Cannot read image: {image_path}")
    print(f"[INFO] Loaded image: {image_path} (Shape: {img_original.shape}, Dtype: {img_original.dtype})")
except Exception as e:
    print(f"[ERROR] {e}")
    sys.exit(1)

try:
    surf = cv2.xfeatures2d.SURF_create(
        hessianThreshold=400,
        nOctaves=4,
        nOctaveLayers=3,
        extended=False,
        upright=False
    )
except AttributeError:
    print("[ERROR] SURF not available. Install 'opencv-contrib-python'")
    sys.exit(1)

print("\n[INFO] Running SURF...")
keypoints, descriptors = surf.detectAndCompute(img_original, None)

if keypoints is None or len(keypoints) == 0:
    print("[WARNING] No keypoints found.")
    descriptor_dim_default = 128 if surf.getExtended() else 64
    descriptors = np.empty((0, descriptor_dim_default), dtype=np.float32)
    keypoints = []
else:
    print(f"[INFO] Keypoints: {len(keypoints)}")
    print(f"[INFO] Descriptors shape: {descriptors.shape}")

if descriptors is not None and descriptors.dtype != np.float32:
    descriptors = descriptors.astype(np.float32)

if len(img_original.shape) == 3:
    if img_original.shape[2] == 3:
        processed_gray_img_for_json = cv2.cvtColor(img_original, cv2.COLOR_BGR2GRAY)
    elif img_original.shape[2] == 4:
        processed_gray_img_for_json = cv2.cvtColor(img_original, cv2.COLOR_BGRA2GRAY)
    else:
        processed_gray_img_for_json = img_original[:, :, 0]
elif len(img_original.shape) == 2:
    processed_gray_img_for_json = img_original.copy()
else:
    print("[ERROR] Unsupported image format for grayscale conversion.")
    processed_gray_img_for_json = np.array([])

json_output = serialize_surf_output_to_json(
    image_path,
    processed_gray_img_for_json,
    keypoints,
    descriptors,
    surf
)

try:
    with open(output_json_path, 'w') as f:
        f.write(json_output)
    print(f"[INFO] JSON saved to: {output_json_path}")
except IOError as e:
    print(f"[ERROR] {e}")
    sys.exit(1)

try:
    parsed_json = json.loads(json_output)
    if parsed_json["num_keypoints"] > 0:
        sample_kp = parsed_json["keypoints"][0].copy()
        sample_kp["descriptor"] = sample_kp["descriptor"][:5]
        print("\n[INFO] First keypoint sample:")
        print(json.dumps(sample_kp, indent=4) + " ...")
except Exception as e:
    print(f"[ERROR] Preview failed: {e}")

if len(keypoints) > 0:
    if len(img_original.shape) == 2:
        img_for_visualization = cv2.cvtColor(img_original, cv2.COLOR_GRAY2BGR)
    elif len(img_original.shape) == 3:
        if img_original.shape[2] == 3:
            img_for_visualization = img_original.copy()
        elif img_original.shape[2] == 4:
            img_for_visualization = cv2.cvtColor(img_original, cv2.COLOR_BGRA2BGR)
        else:
            img_for_visualization = cv2.cvtColor(img_original[:, :, 0], cv2.COLOR_GRAY2BGR)
    else:
        img_for_visualization = None

    if img_for_visualization is not None:
        img_with_keypoints = cv2.drawKeypoints(
            img_for_visualization, keypoints, None,
            flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
        )

        plt.figure(figsize=(12, 8))
        if len(img_with_keypoints.shape) == 3:
            plt.imshow(cv2.cvtColor(img_with_keypoints, cv2.COLOR_BGR2RGB))
        else:
            plt.imshow(img_with_keypoints, cmap='gray')
        plt.title(f"SURF Keypoints ({len(keypoints)} points) - {os.path.basename(image_path)}")
        plt.axis('off')
        plt.show()
else:
    print("[INFO] No keypoints to visualize.")

print("\n--- SURF Image-to-Descriptor process completed. ---")
