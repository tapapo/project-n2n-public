# server/algos/segmentation/DeepLabv3.py
import os
import sys
import json
import uuid
import torch
import numpy as np
from PIL import Image
from torchvision.transforms import ToTensor
import torchvision

# COCO / Pascal VOC labels for DeepLab
VOC_CLASSES = [
    "background","aeroplane","bicycle","bird","boat","bottle","bus","car","cat",
    "chair","cow","diningtable","dog","horse","motorbike","person","pottedplant",
    "sheep","sofa","train","tvmonitor"
]


# ============================================================
# Load DeepLabv3+
# ============================================================

def load_model(device):
    model = torchvision.models.segmentation.deeplabv3_resnet101(pretrained=True)
    model.to(device)
    model.eval()
    return model


# ============================================================
# Adapter
# ============================================================

def run(image_path: str, out_root: str=".", model_path: str=None, **params):

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(device)

    if model_path:
        model.load_state_dict(torch.load(model_path, map_location=device))

    # Load image
    img = Image.open(image_path).convert("RGB")
    img_tensor = ToTensor()(img).unsqueeze(0).to(device)

    # Predict
    with torch.no_grad():
        out = model(img_tensor)["out"][0]

    pred = out.argmax(0).cpu().numpy()

    # Build binary foreground mask (everything except background)
    mask = (pred != 0).astype(np.uint8)

    img_np = img_tensor[0].cpu().numpy().transpose(1,2,0)
    segmented = img_np * mask[..., None]

    segmented = (segmented * 255).astype(np.uint8)
    mask_img = (mask * 255).astype(np.uint8)

    # Detect which classes appear
    class_ids = np.unique(pred)
    classes = [VOC_CLASSES[c] for c in class_ids if c < len(VOC_CLASSES)]

    payload = {
        "tool": "DeepLabv3+",
        "tool_version": {
            "torch": torch.__version__,
            "python": sys.version.split()[0]
        },
        "detected_classes": classes,
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img.size[::-1]),
            "mask_shape": list(mask_img.shape),
            "segmented_shape": list(segmented.shape)
        }
    }

    # Paths
    base = os.path.splitext(os.path.basename(image_path))[0]
    uid = uuid.uuid4().hex[:8]
    stem = f"{base}_deeplab_{uid}"

    out_root_abs = os.path.abspath(out_root)
    algo_dir = os.path.join(out_root_abs, "features", "deeplabv3plus_outputs")
    os.makedirs(algo_dir, exist_ok=True)

    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w") as f:
        json.dump(payload, f, indent=4)

    mask_path = os.path.join(algo_dir, stem + "_mask.png")
    Image.fromarray(mask_img).save(mask_path)

    vis_path = os.path.join(algo_dir, stem + "_segmented.jpg")
    Image.fromarray(segmented).save(vis_path)

    return os.path.abspath(json_path), os.path.abspath(mask_path), os.path.abspath(vis_path)


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    j, m, v = run("your_image.jpg", "./deeplab_output")
    print("JSON:", j)
    print("Mask:", m)
    print("Segmented:", v)
