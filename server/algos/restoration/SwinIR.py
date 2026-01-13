# server/algos/restoration/swinir_adapter.py
import os
import sys
import json
import uuid
import torch
from PIL import Image
import numpy as np
from basicsr.archs.swinir_arch import SwinIR
from basicsr.utils import img2tensor, tensor2img

def run(image_path: str, out_root: str = ".", model_path: str = None, **params):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = SwinIR(
        upscale=1,
        in_chans=3,
        img_size=64,
        window_size=8,
        depths=[6,6,6,6],
        embed_dim=180,
        num_heads=[6,6,6,6],
        mlp_ratio=2,
        resi_connection='1conv'
    ).to(device)

    if model_path:
        model.load_state_dict(torch.load(model_path, map_location=device), strict=True)
    model.eval()

    # Load image
    img = Image.open(image_path).convert("RGB")
    img_tensor = img2tensor(np.array(img), bgr2rgb=True, float32=True)/255.
    img_tensor = img_tensor.unsqueeze(0).to(device)

    # Restore
    with torch.no_grad():
        output = model(img_tensor)
    out_img = tensor2img(output.squeeze(0), rgb2bgr=True)

    # -------------------------------
    # Prepare payload
    # -------------------------------
    payload = {
        "tool": "SwinIR",
        "tool_version": {"torch": torch.__version__, "python": sys.version.split()[0]},
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img.size[::-1]),
            "enhanced_shape": list(out_img.shape),
            "dtype": str(out_img.dtype)
        }
    }

    # Unique stem
    base = os.path.splitext(os.path.basename(image_path))[0]
    unique_id = uuid.uuid4().hex[:8]
    stem = f"{base}_swinir_{unique_id}"

    # Output directories
    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "swinir_outputs")
    os.makedirs(algo_dir, exist_ok=True)

    # Save JSON
    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4)
    json_path = os.path.abspath(json_path)

    # Save Visualization
    vis_path = os.path.join(algo_dir, stem + "_vis.jpg")
    Image.fromarray(out_img).save(vis_path)
    vis_path = os.path.abspath(vis_path)

    return json_path, vis_path

# -------------------------------
# Example usage
# -------------------------------
if __name__ == "__main__":
    img_path = "your_image.jpg"
    out_dir = "./swinir_output"
    json_file, vis_file = run(img_path, out_dir, model_path="SwinIR_Denoising.pth")
    print("JSON saved at:", json_file)
    print("Enhanced image saved at:", vis_file)