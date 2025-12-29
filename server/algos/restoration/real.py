import cv2
import os
import json
import numpy as np
import torch
from realesrgan import RealESRGANer
from basicsr.archs.rrdbnet_arch import RRDBNet

# หาตำแหน่งโฟลเดอร์ปัจจุบันเพื่อระบุ Path ของ Weights ให้แม่นยำ
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

def run(image_path, out_root, model_path=None, **kwargs):
    """
    Adapter function for Real-ESRGAN
    """
    # 1. จัดการ Path
    if model_path is None:
        # ชี้ไปที่โฟลเดอร์ weights ที่อยู่ในโฟลเดอร์เดียวกับไฟล์นี้
        model_path = os.path.join(CURRENT_DIR, "weights", "RealESRGAN_x4plus.pth")
    
    # ตรวจสอบว่ามีไฟล์ model หรือไม่
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model weights not found at: {model_path}. Please download it first.")

    output_dir = os.path.join(out_root, "restoration")
    os.makedirs(output_dir, exist_ok=True)

    # 2. ตั้งค่า Device (รองรับ Apple Silicon 'mps')
    if torch.cuda.is_available():
        device = "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"

    # 3. โหลด Model (ย้ายมาไว้ใน run เพื่อไม่ให้แครชตอนรันเซิร์ฟเวอร์ครั้งแรก)
    model = RRDBNet(
        num_in_ch=3, num_out_ch=3, num_feat=64,
        num_block=23, num_grow_ch=32, scale=4
    )

    scale = kwargs.get("scale", 4)
    
    upsampler = RealESRGANer(
        scale=4, # scale ของ model หลัก
        model_path=model_path,
        model=model,
        tile=kwargs.get("tile", 0),
        tile_pad=10,
        pre_pad=0,
        half=(device == "cuda"), # half precision เฉพาะ cuda
        device=device
    )

    # 4. อ่านภาพ
    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot load image: {image_path}")

    h, w, _ = img.shape

    # 5. ประมวลผล
    # outscale คือ scale ที่เราต้องการจริงๆ
    output, _ = upsampler.enhance(img, outscale=scale)

    # 6. บันทึกผลลัพธ์
    base_name = os.path.basename(image_path).split('.')[0]
    out_filename = f"{base_name}_realesrgan.png"
    output_path = os.path.join(output_dir, out_filename)
    cv2.imwrite(output_path, output)

    # 7. บันทึก JSON
    result_data = {
        "tool": "Real-ESRGAN",
        "scale": scale,
        "input_resolution": [w, h],
        "output_resolution": [output.shape[1], output.shape[0]],
        "device": device,
        "output_image": output_path
    }
    
    json_path = os.path.join(output_dir, f"{base_name}_realesrgan.json")
    with open(json_path, "w") as f:
        json.dump(result_data, f, indent=4)

    return json_path, output_path