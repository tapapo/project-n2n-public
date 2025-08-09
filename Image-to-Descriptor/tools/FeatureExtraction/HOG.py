import cv2
import numpy as np
import json
import sys
import matplotlib.pyplot as plt
import os

# --- Global HOG Parameters ---
HOG_CONFIG = {
    "winSize": (96, 160),
    "blockSize": (16, 16),
    "blockStride": (8, 8),
    "cellSize": (8, 8),
    "nbins": 9,
    "derivAperture": 1,
    "winSigma": -1.0,
    "histogramNormType": cv2.HOGDescriptor_L2Hys,
    "L2HysThreshold": 0.2,
    "gammaCorrection": True,
    "nlevels": 64,
    "signedGradient": False
}

def load_grayscale_image(image_path: str) -> np.ndarray:
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found at: {image_path}")
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}. File might be corrupted or an unsupported format.")
    if len(img.shape) == 2:
        return img  # already grayscale
    elif len(img.shape) == 3 and img.shape[2] == 3:
        raise ValueError(f"Input image '{os.path.basename(image_path)}' is color. Grayscale required.")
    else:
        raise ValueError(f"Unsupported image format for '{os.path.basename(image_path)}'.")

def compute_hog_descriptor(image: np.ndarray, hog_params: dict) -> tuple[np.ndarray, cv2.HOGDescriptor]:
    hog = cv2.HOGDescriptor(
        _winSize=hog_params["winSize"],
        _blockSize=hog_params["blockSize"],
        _blockStride=hog_params["blockStride"],
        _cellSize=hog_params["cellSize"],
        _nbins=hog_params["nbins"],
        _derivAperture=hog_params["derivAperture"],
        _winSigma=hog_params["winSigma"],
        _histogramNormType=hog_params["histogramNormType"],
        _L2HysThreshold=hog_params["L2HysThreshold"],
        _gammaCorrection=hog_params["gammaCorrection"],
        _nlevels=hog_params["nlevels"],
        _signedGradient=hog_params["signedGradient"]
    )
    descriptor = hog.compute(image)
    return (descriptor.astype(np.float32) if descriptor is not None else np.empty((0,), dtype=np.float32)), hog

def serialize_hog_to_json(image_path: str, resized_gray_shape: tuple, descriptor: np.ndarray,
                          hog_object: cv2.HOGDescriptor, original_image_shape: tuple,
                          orientation_processed: str = "original") -> str:
    
    norm_type_map = {0: "L2Hys", 1: "L1", 2: "L1sqrt", 3: "L2"}
    hog_parameters_dict = {}
    for key in HOG_CONFIG.keys():
        value = getattr(hog_object, key)
        if key == "histogramNormType":
            hog_parameters_dict[key] = norm_type_map.get(value, f"Unknown ({value})")
        else:
            hog_parameters_dict[key] = value

    return json.dumps({
        "tool": "HOG",
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": original_image_shape,
            "resized_shape": resized_gray_shape,
            "dtype": "uint8",
            "orientation_processed": orientation_processed
        },
        "hog_parameters_used": hog_parameters_dict,
        "descriptor_dim": len(descriptor),
        "hog_descriptor": descriptor.tolist() if descriptor.size > 0 else []
    }, indent=4)

def visualize_hog(image: np.ndarray, hog_descriptor: np.ndarray, hog_object: cv2.HOGDescriptor, scale: int = 4) -> np.ndarray:
    vis_img = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    vis_img = cv2.resize(vis_img, (hog_object.winSize[0]*scale, hog_object.winSize[1]*scale), interpolation=cv2.INTER_LINEAR)

    cells_x_per_block = hog_object.blockSize[0] // hog_object.cellSize[0]
    cells_y_per_block = hog_object.blockSize[1] // hog_object.cellSize[1]
    blocks_x_in_window = (hog_object.winSize[0] - hog_object.blockSize[0]) // hog_object.blockStride[0] + 1
    blocks_y_in_window = (hog_object.winSize[1] - hog_object.blockSize[1]) // hog_object.blockStride[1] + 1
    bins_per_block = cells_x_per_block * cells_y_per_block * hog_object.nbins

    for by in range(blocks_y_in_window):
        for bx in range(blocks_x_in_window):
            block_descriptor_start_idx = (by * blocks_x_in_window + bx) * bins_per_block
            for cy in range(cells_y_per_block):
                for cx in range(cells_x_per_block):
                    cell_x_orig = bx * hog_object.blockStride[0] + cx * hog_object.cellSize[0]
                    cell_y_orig = by * hog_object.blockStride[1] + cy * hog_object.cellSize[1]
                    center_x_scaled = int((cell_x_orig + hog_object.cellSize[0] / 2) * scale)
                    center_y_scaled = int((cell_y_orig + hog_object.cellSize[1] / 2) * scale)

                    cell_histogram_start_idx = block_descriptor_start_idx + (cy * cells_x_per_block + cx) * hog_object.nbins
                    if cell_histogram_start_idx + hog_object.nbins > len(hog_descriptor) or cell_histogram_start_idx < 0:
                        continue
                    hist = hog_descriptor[cell_histogram_start_idx:cell_histogram_start_idx + hog_object.nbins]

                    for b, val in enumerate(hist):
                        if val < 0.01:
                            continue
                        angle_step = 180 / hog_object.nbins if not hog_object.signedGradient else 360 / hog_object.nbins
                        angle = np.deg2rad(b * angle_step)
                        length = int(hog_object.cellSize[0] / 2 * scale * val * 3.0)
                        dx = int(length * np.cos(angle))
                        dy = int(length * np.sin(angle))
                        cv2.line(vis_img, (center_x_scaled - dx, center_y_scaled - dy),
                                 (center_x_scaled + dx, center_y_scaled + dy), (0, 255, 0), 1)
    return vis_img

def main():
    image_path = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/03_grayscale.jpg"
    output_dir = "/Users/pop/Desktop/project_n2n/hog_output"
    os.makedirs(output_dir, exist_ok=True)
    image_file = os.path.basename(image_path)

    print("\n--- Starting HOG Feature Extraction ---")

    try:
        gray_img = load_grayscale_image(image_path)
        print(f"[INFO] Image loaded: '{image_path}' (Original: {gray_img.shape[1]}x{gray_img.shape[0]})")
    except (FileNotFoundError, ValueError) as e:
        print(f"[ERROR] Image loading failed: {e}")
        sys.exit(1)

    resized_img = cv2.resize(gray_img, HOG_CONFIG["winSize"], interpolation=cv2.INTER_AREA)
    print(f"[INFO] Image resized to: {resized_img.shape[1]}x{resized_img.shape[0]}")

    descriptor, hog_object = compute_hog_descriptor(resized_img, HOG_CONFIG)

    if descriptor.size == 0:
        print("[WARNING] HOG descriptor is empty.")
    else:
        print(f"[INFO] HOG descriptor computed. Dimension: {len(descriptor)}")
        print(f"[INFO] First 10 values: {descriptor.flatten()[:10]}")

    if descriptor.size > 0:
        hog_vis = visualize_hog(resized_img, descriptor, hog_object)
        vis_path = os.path.join(output_dir, f"{os.path.splitext(image_file)[0]}_hog_visualization.jpg")
        try:
            cv2.imwrite(vis_path, hog_vis)
            print(f"[INFO] Visualization saved to: {vis_path}")
        except Exception as e:
            print(f"[ERROR] Failed to save visualization: {e}")

        plt.figure(figsize=(10, 8))
        plt.imshow(hog_vis)
        plt.title("HOG Visualization")
        plt.axis('off')
        plt.show()

    json_path = os.path.join(output_dir, f"{os.path.splitext(image_file)[0]}_hog_output.json")
    try:
        json_data = serialize_hog_to_json(
            image_path=image_path,
            resized_gray_shape=resized_img.shape,
            descriptor=descriptor,
            hog_object=hog_object,
            original_image_shape=gray_img.shape
        )
        with open(json_path, 'w') as f:
            f.write(json_data)
        print(f"[INFO] JSON saved to: {json_path}")
    except Exception as e:
        print(f"[ERROR] Failed to save JSON: {e}")
        sys.exit(1)

    print("\n--- HOG processing complete. ---")

if __name__ == "__main__":
    main()
