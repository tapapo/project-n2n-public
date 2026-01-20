# server/algos/restoration/dncnn.py
import os
import sys
import json
import uuid
import torch
import torch.nn as nn
from PIL import Image
import numpy as np
from torchvision.transforms import ToTensor

# --- Model Definition ---
class DnCNN(nn.Module):
    def __init__(self, channels=3, num_of_layers=17):
        super(DnCNN, self).__init__()
        kernel_size = 3
        padding = 1
        features = 64
        layers = [nn.Conv2d(channels, features, kernel_size, padding=padding, bias=False), nn.ReLU(inplace=True)]
        for _ in range(num_of_layers-2):
            layers += [nn.Conv2d(features, features, kernel_size, padding=padding, bias=False),
                       nn.BatchNorm2d(features),
                       nn.ReLU(inplace=True)]
        layers += [nn.Conv2d(features, channels, kernel_size, padding=padding, bias=False)]
        self.dncnn = nn.Sequential(*layers)

    def forward(self, x):
        return x - self.dncnn(x)

def run(image_path: str, out_root: str = ".", model_path: str = None, **params):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # 1. รับค่า sigma จาก params (ค่า Default คือ 25)
    sigma = int(params.get('sigma', 25))

    # 2. Logic เลือก Model Path ตามค่า sigma
    # หมายเหตุ: คุณต้องมีไฟล์ dncnn_15.pth, dncnn_25.pth, dncnn_50.pth อยู่ในโฟลเดอร์ weights/
    current_dir = os.path.dirname(os.path.abspath(__file__))
    weights_dir = os.path.join(current_dir, "weights")

    if model_path is None:
        if sigma <= 15:
            model_name = "dncnn_15.pth"
        elif sigma <= 25:
            model_name = "dncnn_25.pth"
        else:
            model_name = "dncnn_50.pth"
        
        model_path = os.path.join(weights_dir, model_name)

    # โหลด Model
    model = DnCNN().to(device)
    
    if os.path.exists(model_path):
        # โหลด weights (ถ้ามีไฟล์)
        model.load_state_dict(torch.load(model_path, map_location=device))
    else:
        # ถ้าหาไฟล์ไม่เจอ จะรันแบบ Weight เปล่าๆ (หรือคุณอาจจะ raise Error ก็ได้)
        print(f"Warning: Weights not found at {model_path}, running initialized model.")

    model.eval()

    # Load image
    img = Image.open(image_path).convert("RGB")
    img_tensor = ToTensor()(img).unsqueeze(0).to(device)

    # Denoise Process
    with torch.no_grad():
        out_tensor = model(img_tensor)
    
    out_img = out_tensor.squeeze().cpu().clamp(0,1).numpy().transpose(1,2,0)
    out_img = (out_img * 255).astype(np.uint8)

    # -------------------------------
    # Prepare payload
    # -------------------------------
    payload = {
        "tool": "DnCNN",
        "tool_version": {"torch": torch.__version__, "python": sys.version.split()[0]},
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img.size[::-1]),
            "enhanced_shape": list(out_img.shape),
            "dtype": str(out_img.dtype)
        },
        "dncnn_parameters_used": {
            "sigma": sigma,
            "model_loaded": os.path.basename(model_path)
        }
    }

    # Unique stem
    base = os.path.splitext(os.path.basename(image_path))[0]
    unique_id = uuid.uuid4().hex[:8]
    stem = f"{base}_dncnn_{unique_id}"

    # Output directories
    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "dncnn_outputs")
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