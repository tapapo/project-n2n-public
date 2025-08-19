import os
import cv2
import json
import sys
import uuid
import numpy as np

def run(original_path: str, processed_path: str, out_root: str = "outputs"):
    """
    Compute PSNR between original and processed images.
    Returns:
        (json_path, data_dict)
    """
    # 1. load images
    img1 = cv2.imread(original_path, cv2.IMREAD_UNCHANGED)
    img2 = cv2.imread(processed_path, cv2.IMREAD_UNCHANGED)

    if img1 is None or img2 is None:
        raise FileNotFoundError("Could not read one or both images")

    if img1.shape != img2.shape:
        raise ValueError(f"Image shape mismatch: {img1.shape} vs {img2.shape}")

    # 2. compute PSNR
    score = cv2.PSNR(img1, img2)

    # 3. prepare output dir
    out_dir = os.path.join(out_root, "features", "psnr_outputs")
    os.makedirs(out_dir, exist_ok=True)

    uid = uuid.uuid4().hex[:8]
    stem1 = os.path.splitext(os.path.basename(original_path))[0]
    stem2 = os.path.splitext(os.path.basename(processed_path))[0]
    out_json = os.path.join(out_dir, f"psnr_{stem1}_vs_{stem2}_{uid}.json")

    # 4. prepare data
    data = {
        "tool": "PSNR",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0],
        },
        "images": {
            "original": {
                "file_name": os.path.basename(original_path),
                "path": original_path,
                "shape": list(img1.shape),
                "dtype": str(img1.dtype),
            },
            "processed": {
                "file_name": os.path.basename(processed_path),
                "path": processed_path,
                "shape": list(img2.shape),
                "dtype": str(img2.dtype),
            },
        },
        "quality_score": round(float(score), 4),
        "score_interpretation": "Higher score means better quality (∞ for identical images)."
    }

    # 5. save json
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return out_json, data