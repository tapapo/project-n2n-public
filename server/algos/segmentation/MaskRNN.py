import cv2
import os
import json
import numpy as np
import torch
from detectron2.engine import DefaultPredictor
from detectron2.config import get_cfg
from detectron2 import model_zoo
from detectron2.utils.visualizer import Visualizer

# 1. ตั้งค่า Config และโหลดโมเดลเตรียมไว้ (โหลดครั้งเดียวตอน Start เซิร์ฟเวอร์)
cfg = get_cfg()
cfg.merge_from_file(model_zoo.get_config_file(
    "COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"
))
cfg.MODEL.ROI_HEADS.SCORE_THRESH_TEST = 0.5
cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url(
    "COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"
)

# ตรวจสอบ Device (ถ้าเป็น Mac M1/M2/M3 Detectron2 อาจยังรองรับ CPU เป็นหลักหรือ MPS บางส่วน)
cfg.MODEL.DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# สร้าง Predictor ไว้ระดับ Global
predictor = DefaultPredictor(cfg)

def run(image_path, out_root, **kwargs):
    """
    Adapter function สำหรับ Mask R-CNN
    """
    output_dir = os.path.join(out_root, "segmentation", "maskrcnn_objects")
    os.makedirs(output_dir, exist_ok=True)

    # 2. อ่านภาพ
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot load image at: {image_path}")

    # 3. Run Inference
    outputs = predictor(img)
    instances = outputs["instances"].to("cpu")

    boxes = instances.pred_boxes.tensor.numpy()
    masks = instances.pred_masks.numpy()
    scores = instances.scores.numpy()
    classes = instances.pred_classes.numpy()

    # 4. ประมวลผลและบันทึกภาพวัตถุแต่ละชิ้น
    object_data = []
    base_name = os.path.basename(image_path).split('.')[0]

    for i in range(len(masks)):
        mask = masks[i].astype(np.uint8) * 255
        masked = cv2.bitwise_and(img, img, mask=mask)

        obj_filename = f"{base_name}_obj_{i}.png"
        obj_path = os.path.join(output_dir, obj_filename)
        cv2.imwrite(obj_path, masked)

        object_data.append({
            "id": i,
            "class_id": int(classes[i]),
            "score": float(scores[i]),
            "bounding_box": boxes[i].tolist(),
            "mask_path": obj_path
        })

    # 5. สร้างภาพ Visualization (ภาพรวมที่มีเส้นขอบและ Label)
    v = Visualizer(img[:, :, ::-1], scale=1.0)
    out_vis = v.draw_instance_predictions(instances)
    vis_path = os.path.join(output_dir, f"{base_name}_maskrcnn_full.jpg")
    cv2.imwrite(vis_path, out_vis.get_image()[:, :, ::-1])

    # 6. บันทึก JSON
    result_data = {
        "segmentation_tool": "Mask R-CNN",
        "model": "COCO Mask R-CNN R50-FPN",
        "input_image": image_path,
        "num_objects": len(object_data),
        "objects": object_data,
        "full_vis_image": vis_path
    }
    
    json_path = os.path.join(output_dir, f"{base_name}_maskrcnn_results.json")
    with open(json_path, "w") as f:
        json.dump(result_data, f, indent=4)

    # คืนค่า path สำหรับ Router
    return json_path, vis_path