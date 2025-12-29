import cv2
import torch
import numpy as np
import json
import os
import torchvision.transforms as T
from torchvision.models.segmentation import deeplabv3_resnet101, DeepLabV3_ResNet101_Weights

# 1. โหลด Model เตรียมไว้ระดับ Global เพื่อให้เซิร์ฟเวอร์โหลดแค่ครั้งเดียวตอน Start
device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"

# ใช้ weights=DeepLabV3_ResNet101_Weights.DEFAULT แทน pretrained=True
model = deeplabv3_resnet101(weights=DeepLabV3_ResNet101_Weights.DEFAULT)
model = model.to(device)
model.eval()

def run(image_path, out_root, **kwargs):
    """
    Adapter function สำหรับ DeepLabv3+ เพื่อใช้ใน Pipeline
    """
    output_dir = os.path.join(out_root, "segmentation")
    os.makedirs(output_dir, exist_ok=True)

    # 2. อ่านภาพจาก image_path ที่ส่งมาจาก Node ก่อนหน้า
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot load image at: {image_path}")
    
    h, w = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # 3. Preprocessing
    transform = T.Compose([
        T.ToPILImage(),
        T.Resize((512, 512)),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    input_tensor = transform(img_rgb).unsqueeze(0).to(device)

    # 4. Run Inference
    with torch.no_grad():
        output = model(input_tensor)["out"]

    # 5. Post-processing
    seg = torch.argmax(output.squeeze(), dim=0).cpu().numpy()
    seg = cv2.resize(seg, (w, h), interpolation=cv2.INTER_NEAREST)

    # สร้าง mask (COCO class 37 = sports ball) หรือตามที่ระบุใน params
    target_class = kwargs.get("target_class", 37) 
    mask = (seg == target_class).astype(np.uint8) * 255
    segmented = cv2.bitwise_and(img, img, mask=mask)

    # 6. บันทึกไฟล์ผลลัพธ์
    base_name = os.path.basename(image_path).split('.')[0]
    mask_path = os.path.join(output_dir, f"{base_name}_mask.png")
    seg_path = os.path.join(output_dir, f"{base_name}_segmented.png")

    cv2.imwrite(mask_path, mask)
    cv2.imwrite(seg_path, segmented)

    # 7. บันทึก JSON Metadata
    result_data = {
        "segmentation_tool": "DeepLabv3+",
        "model": "ResNet101 COCO",
        "target_class_id": target_class,
        "input_image": image_path,
        "mask_path": mask_path,
        "segmented_image": seg_path,
        "image_size": [w, h],
        "device": str(device)
    }
    
    json_path = os.path.join(output_dir, f"{base_name}_deeplab_results.json")
    with open(json_path, "w") as f:
        json.dump(result_data, f, indent=4)

    # คืนค่า path ของไฟล์ที่สร้างขึ้นเพื่อให้ Router ส่งกลับไปที่ Frontend
    return json_path, seg_path