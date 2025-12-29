# server/algos/feature/zero_dce_adapter.py
import os
import sys
import json
import uuid
import cv2
import numpy as np
import torch

# You need a Zero-DCE model class (placeholder)
class ZeroDCEModel(torch.nn.Module):
    def forward(self, x):
        # Dummy implementation; replace with real model
        return x

# Load model (singleton or cached)
_model = None
def get_model():
    global _model
    if _model is None:
        _model = ZeroDCEModel()
        _model.eval()
    return _model

def run(image_path: str, out_root: str = ".", **params):
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    if img.ndim != 3 or img.shape[2] != 3:
        raise ValueError("Zero-DCE requires a BGR color image")

    img_norm = img.astype(np.float32) / 255.0
    img_tensor = torch.from_numpy(img_norm.transpose(2,0,1)).unsqueeze(0)  # C,H,W

    model = get_model()
    with torch.no_grad():
        enhanced_tensor = model(img_tensor)
    enhanced = enhanced_tensor.squeeze(0).permute(1,2,0).numpy()
    enhanced = np.clip(enhanced*255, 0, 255).astype(np.uint8)

    # Payload
    payload = {
        "tool": "Zero-DCE",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0],
            "torch": torch.__version__
        },
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img.shape),
            "enhanced_shape": list(enhanced.shape),
            "dtype": str(enhanced.dtype)
        },
        "zero_dce_parameters_used": params
    }

    # Unique stem
    base = os.path.splitext(os.path.basename(image_path))[0]
    unique_id = uuid.uuid4().hex[:8]
    stem = f"{base}_zero_dce_{unique_id}"

    # Output directories
    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "zero_dce_outputs")
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