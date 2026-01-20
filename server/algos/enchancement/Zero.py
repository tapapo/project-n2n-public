import os
import sys
import json
import uuid
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import cv2
from PIL import Image
from torchvision.transforms import ToTensor

# ============================================================
# 1. Zero-DCE Model Architecture (Real Implementation)
# ============================================================

class ZeroDCE(nn.Module):
    def __init__(self):
        super(ZeroDCE, self).__init__()
        self.relu = nn.ReLU(inplace=True)
        number_f = 32
        
        # Encoder
        self.e_conv1 = nn.Conv2d(3, number_f, 3, 1, 1, bias=True) 
        self.e_conv2 = nn.Conv2d(number_f, number_f, 3, 1, 1, bias=True) 
        self.e_conv3 = nn.Conv2d(number_f, number_f, 3, 1, 1, bias=True) 
        self.e_conv4 = nn.Conv2d(number_f, number_f, 3, 1, 1, bias=True) 
        
        # Decoder (Concatenate)
        self.e_conv5 = nn.Conv2d(number_f*2, number_f, 3, 1, 1, bias=True) 
        self.e_conv6 = nn.Conv2d(number_f*2, number_f, 3, 1, 1, bias=True) 
        self.e_conv7 = nn.Conv2d(number_f*2, 24, 3, 1, 1, bias=True) # Output 24 channels (8 iterations * 3 RGB)

    def forward(self, x, num_iters=8):
        # Feature Extraction
        x1 = self.relu(self.e_conv1(x))
        x2 = self.relu(self.e_conv2(x1))
        x3 = self.relu(self.e_conv3(x2))
        x4 = self.relu(self.e_conv4(x3))

        # Concatenate & Decode
        x5 = self.relu(self.e_conv5(torch.cat([x3, x4], 1)))
        x6 = self.relu(self.e_conv6(torch.cat([x2, x5], 1)))
        
        # Predict Curve Parameters (24 channels)
        x_r = torch.tanh(self.e_conv7(torch.cat([x1, x6], 1)))
        
        # Split into 8 sets of curves (each set has 3 channels for R,G,B)
        curves = torch.split(x_r, 3, dim=1)
        
        # Iterative Enhancement
        # ใช้ค่า num_iters จาก Slider เพื่อกำหนดว่าจะวนลูปปรับแสงกี่รอบ
        # (สูงสุดได้ 8 รอบ ตามโครงสร้างโมเดลมาตรฐาน)
        limit = min(len(curves), max(1, num_iters))
        
        for i in range(limit):
            # LE Curve Formula: I_n+1 = I_n + A_n * (I_n^2 - I_n)
            x = x + curves[i] * (torch.pow(x, 2) - x)
            
        return x

# ============================================================
# 2. Adapter Function
# ============================================================

# หาตำแหน่งโฟลเดอร์ปัจจุบัน
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

def run(image_path: str, out_root: str = ".", model_path: str = None, **params):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # 1. รับค่า iterations จาก params (Default = 8)
    iterations = int(params.get('iterations', 8))
    
    # 2. เตรียม Model
    model = ZeroDCE().to(device)
    
    # ตั้งค่า Path ของ Weights (คุณต้องไปหาโหลดไฟล์ epoch85.pth หรือ similar มาวาง)
    if model_path is None:
        model_path = os.path.join(CURRENT_DIR, "weights", "ZeroDCE_epoch99.pth")
    
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path, map_location=device))
    else:
        # ถ้าไม่มีไฟล์ weights ให้รันแบบ random init (แต่เตือนไว้หน่อย)
        print(f"[Warning] Zero-DCE weights not found at {model_path}. Running with random weights (Output might be weird).")

    model.eval()

    # 3. เตรียมภาพ
    img_bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError(f"Cannot read image: {image_path}")
    
    # Resize ถ้ารูปใหญ่เกินไป (Optional: เพื่อความเร็ว)
    # แต่ Zero-DCE ค่อนข้างเร็ว รัน Full size ได้
    
    # Normalize 0-1 & HWC -> CHW
    img = img_bgr.astype(np.float32) / 255.0
    img = np.transpose(img, (2, 0, 1)) # to CHW
    img_tensor = torch.from_numpy(img).unsqueeze(0).to(device)

    # 4. Run Model
    with torch.no_grad():
        # ส่งค่า iterations เข้าไปใน forward
        enhanced_tensor = model(img_tensor, num_iters=iterations)

    # 5. Convert back to Image
    enhanced = enhanced_tensor.squeeze(0).cpu().numpy()
    enhanced = np.transpose(enhanced, (1, 2, 0)) # to HWC
    enhanced = np.clip(enhanced * 255.0, 0, 255).astype(np.uint8)

    # 6. Prepare Output
    payload = {
        "tool": "Zero-DCE",
        "tool_version": {
            "torch": torch.__version__,
            "python": sys.version.split()[0]
        },
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img_bgr.shape), 
            "enhanced_shape": list(enhanced.shape),
            "dtype": str(enhanced.dtype)
        },
        "zero_dce_parameters_used": {
            "iterations": iterations,
            "model_path": os.path.basename(model_path)
        }
    }

    # Paths
    base = os.path.splitext(os.path.basename(image_path))[0]
    unique_id = uuid.uuid4().hex[:8]
    stem = f"{base}_zero_dce_{unique_id}"

    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "zero_dce_outputs")
    os.makedirs(algo_dir, exist_ok=True)

    # Save JSON
    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4)

    # Save visualization
    vis_path = os.path.join(algo_dir, stem + "_vis.jpg")
    cv2.imwrite(vis_path, enhanced)

    return os.path.abspath(json_path), os.path.abspath(vis_path)

if __name__ == "__main__":
    # Test block
    j, v = run("test.jpg", ".", iterations=8)
    print("Saved:", j, v)