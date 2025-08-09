import cv2
import numpy as np
import matplotlib.pyplot as plt
import json
import os
import sys

def serialize_orb_output_to_json(image_path, processed_gray_img, keypoints, descriptors, orb_params):
    orb_data = []
    if keypoints is not None and descriptors is not None:
        for i, kp in enumerate(keypoints):
            orb_data.append({
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
        "tool": "ORB",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "image": {
            "original_path": image_path,
            "file_name": image_file_name,
            "processed_orb_shape": list(processed_gray_img.shape),
            "processed_orb_dtype": str(processed_gray_img.dtype)
        },
        "orb_parameters_used": {
            "nfeatures": orb_params.getMaxFeatures(),
            "scaleFactor": orb_params.getScaleFactor(),
            "nlevels": orb_params.getNLevels(),
            "edgeThreshold": orb_params.getEdgeThreshold(),
            "firstLevel": orb_params.getFirstLevel(),
            "WTA_K": orb_params.getWTA_K(),
            "scoreType": orb_params.getScoreType(),
            "patchSize": orb_params.getPatchSize(),
            "fastThreshold": orb_params.getFastThreshold()
        },
        "num_keypoints": len(orb_data),
        "descriptor_dim": descriptors.shape[1] if descriptors is not None and descriptors.shape[0] > 0 else 32,
        "keypoints": orb_data
    }, indent=4)

image_path = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/BallB.jpg"
output_dir = "/Users/pop/Desktop/project_n2n/orb_output"
os.makedirs(output_dir, exist_ok=True)
image_file = os.path.basename(image_path)
output_json_path = os.path.join(output_dir, os.path.splitext(image_file)[0] + '_orb_output.json')

try:
    img_original = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img_original is None:
        raise ValueError(f"Cannot read image: {image_path}")
    print(f"[INFO] Loaded image: {image_path} (Shape: {img_original.shape}, Dtype: {img_original.dtype})")
except Exception as e:
    print(f"[ERROR] {e}")
    sys.exit(1)

orb = cv2.ORB_create(
    nfeatures=500,
    scaleFactor=1.2,
    nlevels=8,
    edgeThreshold=31,
    firstLevel=0,
    WTA_K=2,
    scoreType=cv2.ORB_FAST_SCORE,
    patchSize=31,
    fastThreshold=20
)

print("\n[INFO] Running ORB...")
keypoints, descriptors = orb.detectAndCompute(img_original, None)

if keypoints is None or len(keypoints) == 0:
    print("[WARNING] No keypoints found.")
    descriptors = np.empty((0, 32), dtype=np.uint8)
    keypoints = []
else:
    print(f"[INFO] Keypoints: {len(keypoints)}")
    print(f"[INFO] Descriptors shape: {descriptors.shape}")

if descriptors is not None and descriptors.dtype != np.uint8:
    descriptors = descriptors.astype(np.uint8)

if len(img_original.shape) == 3:
    if img_original.shape[2] == 3:
        processed_gray_img = cv2.cvtColor(img_original, cv2.COLOR_BGR2GRAY)
    elif img_original.shape[2] == 4:
        processed_gray_img = cv2.cvtColor(img_original, cv2.COLOR_BGRA2GRAY)
    else:
        processed_gray_img = img_original[:, :, 0]
elif len(img_original.shape) == 2:
    processed_gray_img = img_original.copy()
else:
    print("[ERROR] Unsupported image format for grayscale conversion.")
    processed_gray_img = np.array([])

json_output = serialize_orb_output_to_json(
    image_path,
    processed_gray_img,
    keypoints,
    descriptors,
    orb
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
        print("[ERROR] Unsupported image format for visualization.")
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
        plt.title(f"ORB Keypoints ({len(keypoints)} points) - {os.path.basename(image_path)}")
        plt.axis('off')
        plt.show()
else:
    print("[INFO] No keypoints to visualize.")

print("\n--- ORB Image-to-Descriptor process completed. ---")
