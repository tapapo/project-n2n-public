# server/algos/segmentation/MaskRNN.py
import os
import sys
import json
import uuid
import torch
import numpy as np
from PIL import Image
from torchvision.transforms import ToTensor
import torchvision

# COCO class names
COCO_CLASSES = [
    "__background__", "person", "bicycle", "car", "motorcycle", "airplane", "bus",
    "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign",
    "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag",
    "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana",
    "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza",
    "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table",
    "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
    "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock",
    "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
]


# ============================================================
# Load model
# ============================================================

def load_model(device):
    model = torchvision.models.detection.maskrcnn_resnet50_fpn(pretrained=True)
    model.to(device)
    model.eval()
    return model


# ============================================================
# Adapter
# ============================================================

def run(image_path: str, out_root: str = ".", model_path: str = None, score_thr=0.5, **params):

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(device)

    if model_path:
        model.load_state_dict(torch.load(model_path, map_location=device))

    img = Image.open(image_path).convert("RGB")
    img_tensor = ToTensor()(img).to(device)

    with torch.no_grad():
        pred = model([img_tensor])[0]

    masks = pred["masks"][:, 0]
    labels = pred["labels"]
    scores = pred["scores"]

    keep = scores > score_thr
    masks = masks[keep]
    labels = labels[keep]
    scores = scores[keep]

    H, W = img_tensor.shape[1:]

    if len(masks) == 0:
        combined_mask = torch.zeros((H, W), device=device)
    else:
        combined_mask = (masks > 0.5).float().max(dim=0)[0]

    # =============================
    # Visualization
    # =============================

    img_np = img_tensor.cpu().numpy().transpose(1, 2, 0)
    mask_np = combined_mask.cpu().numpy()

    # RGB mask overlay
    overlay = img_np.copy()
    overlay[mask_np == 0] = 0

    overlay = (overlay * 255).astype(np.uint8)
    mask_img = (mask_np * 255).astype(np.uint8)

    # =============================
    # Build detections list
    # =============================

    detections = []
    for i in range(len(labels)):
        detections.append({
            "class_id": int(labels[i]),
            "class_name": COCO_CLASSES[int(labels[i])],
            "confidence": float(scores[i])
        })

    # =============================
    # JSON payload
    # =============================

    payload = {
        "tool": "MaskRCNN_Segmentation",
        "tool_version": {
            "torch": torch.__version__,
            "python": sys.version.split()[0]
        },
        "detections": detections,
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img.size[::-1]),
            "mask_shape": list(mask_img.shape),
            "segmented_shape": list(overlay.shape)
        }
    }

    # =============================
    # Paths
    # =============================

    base = os.path.splitext(os.path.basename(image_path))[0]
    uid = uuid.uuid4().hex[:8]
    stem = f"{base}_maskrcnn_seg_{uid}"

    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "maskrcnn_segmentation")
    os.makedirs(algo_dir, exist_ok=True)

    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w") as f:
        json.dump(payload, f, indent=4)

    mask_path = os.path.join(algo_dir, stem + "_mask.png")
    Image.fromarray(mask_img).save(mask_path)

    vis_path = os.path.join(algo_dir, stem + "_segmented.jpg")
    Image.fromarray(overlay).save(vis_path)

    return os.path.abspath(json_path), os.path.abspath(mask_path), os.path.abspath(vis_path)


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    j, m, v = run("your_image.jpg", "./maskrcnn_seg_output")
    print("JSON:", j)
    print("Mask:", m)
    print("Segmented:", v)
