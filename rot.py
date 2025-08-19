import os
import cv2

def ensure_dir(p):
    os.makedirs(p, exist_ok=True)

def rotate_4_orientations(img):
    """คืน dict ของรูปที่หมุนแล้วทั้ง 4 มุมโดยใช้ cv2.rotate (นิ่งสุด)"""
    return {
        "rot0":   img,  # 0°
        "rot90":  cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE),
        "rot180": cv2.rotate(img, cv2.ROTATE_180),
        "rot270": cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE),
    }

def save_image(path, img, quality=95):
    ext = os.path.splitext(path)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    elif ext == ".png":
        cv2.imwrite(path, img, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    else:
        cv2.imwrite(path, img)

def rotate_and_save_all(image_path, out_dir, base_name=None, quality=95):
    """
    อ่านภาพ -> หมุน 0/90/180/270 องศา -> เซฟไฟล์
    """
    ensure_dir(out_dir)
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    if base_name is None:
        base_name = os.path.splitext(os.path.basename(image_path))[0]

    rotated = rotate_4_orientations(img)
    outputs = {}
    for tag, im in rotated.items():
        out_path = os.path.join(out_dir, f"{base_name}_{tag}.jpg")
        save_image(out_path, im, quality=quality)
        outputs[tag] = out_path
        print(f"[SAVED] {tag:>6} -> {out_path}  shape={im.shape}")
    return outputs

# ================== ตัวอย่างการใช้งาน ==================
if __name__ == "__main__":
    image_path = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image/Ori.jpg"
    out_dir    = "/Users/pop/Desktop/project_n2n/Image-to-Descriptor/image"
    rotate_and_save_all(image_path, out_dir, quality=95)
