import cv2
import torch
import numpy as np
import json
import os
import sys

# 1. โหลดโมเดลเตรียมไว้ระดับ Global
device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"

# โหลดโมเดลจาก torch hub (จะดาวน์โหลดอัตโนมัติในการรันครั้งแรก)
model = torch.hub.load(
    "mateuszbuda/brain-segmentation-pytorch",
    "unet",
    in_channels=3,
    out_channels=1,
    init_features=32,
    pretrained=True
)
model = model.to(device)
model.eval()

def run(image_path, out_root, **kwargs):
    """
    Adapter function สำหรับ U-Net
    """
    output_dir = os.path.join(out_root, "segmentation")
    os.makedirs(output_dir, exist_ok=True)

    # 2. อ่านภาพ
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot load image at: {image_path}")

    h, w, _ = img.shape
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_norm = img_rgb / 255.0

    # 3. Preprocessing (Resize เป็น 256x256 ตามสเปคโมเดล)
    img_resized = cv2.resize(img_norm, (256, 256))
    tensor = torch.from_numpy(img_resized).float().permute(2, 0, 1).unsqueeze(0).to(device)

    # 4. Run Inference
    with torch.no_grad():
        pred = model(tensor)

    mask = torch.sigmoid(pred)[0,0].cpu().numpy()
    mask = cv2.resize(mask, (w, h))

    # กำหนดค่า Threshold จากพารามิเตอร์ (ถ้าไม่มีใช้ 0.5)
    threshold = kwargs.get("threshold", 0.5)
    binary_mask = (mask > threshold).astype(np.uint8) * 255

    # 5. Apply Mask
    segmented = cv2.bitwise_and(img, img, mask=binary_mask)

    # 6. บันทึกผลลัพธ์
    base_name = os.path.basename(image_path).split('.')[0]
    mask_path = os.path.join(output_dir, f"{base_name}_unet_mask.png")
    seg_path = os.path.join(output_dir, f"{base_name}_unet_segmented.png")

    cv2.imwrite(mask_path, binary_mask)
    cv2.imwrite(seg_path, segmented)

    # 7. บันทึก JSON Metadata
    result_data = {
        "segmentation_tool": "U-Net",
        "model": "mateuszbuda brain-segmentation",
        "input_image": image_path,
        "image_size": [w, h],
        "threshold": threshold,
        "device": str(device)
    }
    
    json_path = os.path.join(output_dir, f"{base_name}_unet_results.json")
    with open(json_path, "w") as f:
        json.dump(result_data, f, indent=4)

    return json_path, seg_path