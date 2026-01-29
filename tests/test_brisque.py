import os
import json
import cv2
import numpy as np
import tempfile
import shutil
import pytest
from typing import List, Tuple

from server.algos.quality.brisque_adapter import run, MODEL_PATH, RANGE_PATH

# 1. UTILS & FIXTURES

def _ensure_write(path: str, img: np.ndarray) -> None:
    ok = cv2.imwrite(path, img)
    assert ok, f"Cannot write {path}"

def _make_synthetic_natural_like(h: int = 360, w: int = 540) -> np.ndarray:
    """สร้างภาพสังเคราะห์ที่มี Texture เพียงพอสำหรับ BRISQUE"""
    base = np.tile(np.linspace(20, 230, w, dtype=np.uint8), (h, 1))
    img = cv2.merge([base, base, base])
    cv2.circle(img, (w//2, h//2), 60, (255, 255, 255), -1)
    cv2.rectangle(img, (40, 40), (200, 160), (80, 80, 80), -1)
    
    noise = np.random.normal(0, 3, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = cv2.GaussianBlur(img, (3, 3), 0.7)
    return img

@pytest.fixture(scope="module")
def check_models_exist():
    if not os.path.exists(MODEL_PATH) or not os.path.exists(RANGE_PATH):
        pytest.skip(f"Skipping: BRISQUE Model files not found at {MODEL_PATH}")

@pytest.fixture(scope="module")
def tmpdir():
    d = tempfile.mkdtemp(prefix="brisque_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)

@pytest.fixture(scope="module")
def base_images(tmpdir) -> List[str]:
    paths = []
    for i in range(2):
        img = _make_synthetic_natural_like()
        q = os.path.join(tmpdir, f"synthetic_{i}.jpg")
        _ensure_write(q, img)
        paths.append(q)
    return paths

# 2. FUNCTIONAL TESTS (Algorithm Logic)

def test_brisque_basic_run(check_models_exist, base_images, tmpdir):
    """BQ01: ทดสอบการรันพื้นฐาน"""
    out_path, data = run(base_images[0], out_root=tmpdir)
    assert os.path.exists(out_path)
    assert "quality_score" in data
    assert isinstance(data["quality_score"], float)

def test_jpeg_quality_trend(check_models_exist, base_images, tmpdir):
    """BQ02: Trend - JPEG Quality ลดลง -> Score เพิ่มขึ้น (แย่ลง)"""
    p = base_images[0]
    img = cv2.imread(p)
    
    p_high = os.path.join(tmpdir, "q95.jpg")
    cv2.imwrite(p_high, img, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    
    p_low = os.path.join(tmpdir, "q10.jpg")
    cv2.imwrite(p_low, img, [int(cv2.IMWRITE_JPEG_QUALITY), 10])
    
    _, d_high = run(p_high, out_root=tmpdir)
    _, d_low = run(p_low, out_root=tmpdir)
    
    assert d_low["quality_score"] > d_high["quality_score"]

def test_blur_trend(check_models_exist, base_images, tmpdir):
    """BQ03: Trend - Blur มากขึ้น -> Score เพิ่มขึ้น"""
    p = base_images[0]
    img = cv2.imread(p)
    
    p_blur1 = os.path.join(tmpdir, "blur1.jpg")
    cv2.imwrite(p_blur1, cv2.GaussianBlur(img, (3,3), 0.5))
    
    p_blur2 = os.path.join(tmpdir, "blur2.jpg")
    cv2.imwrite(p_blur2, cv2.GaussianBlur(img, (15,15), 5.0))
    
    _, d1 = run(p_blur1, out_root=tmpdir)
    _, d2 = run(p_blur2, out_root=tmpdir)
    
    assert d2["quality_score"] > d1["quality_score"]

def test_noise_trend(check_models_exist, base_images, tmpdir):
    """BQ04: Trend - Noise มากขึ้น -> Score เพิ่มขึ้น"""
    p = base_images[0]
    img = cv2.imread(p).astype(np.int16)
    
    noise1 = np.random.normal(0, 5, img.shape)
    p_n1 = os.path.join(tmpdir, "noise1.jpg")
    cv2.imwrite(p_n1, np.clip(img + noise1, 0, 255).astype(np.uint8))
    
    noise2 = np.random.normal(0, 50, img.shape)
    p_n2 = os.path.join(tmpdir, "noise2.jpg")
    cv2.imwrite(p_n2, np.clip(img + noise2, 0, 255).astype(np.uint8))
    
    _, d1 = run(p_n1, out_root=tmpdir)
    _, d2 = run(p_n2, out_root=tmpdir)
    
    assert d2["quality_score"] > d1["quality_score"]

# 3. FORMAT SUPPORT TESTS

def test_format_bgra_support(check_models_exist, base_images, tmpdir):
    """BQ05: รองรับภาพ BGRA (4 Channels)"""
    img = cv2.imread(base_images[0])
    bgra = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    p_bgra = os.path.join(tmpdir, "test.png") 
    cv2.imwrite(p_bgra, bgra)
    
    _, data = run(p_bgra, out_root=tmpdir)
    assert data["image"]["channels"] == 1 

def test_format_uint16_support(check_models_exist, base_images, tmpdir):
    """BQ06: รองรับภาพ 16-bit (TIFF)"""
    img = cv2.imread(base_images[0])
    gray16 = (cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.uint16) * 256)
    p_16 = os.path.join(tmpdir, "test.tiff")
    cv2.imwrite(p_16, gray16)
    
    _, data = run(p_16, out_root=tmpdir)
    assert data["image"]["dtype"] == "uint8" 

def test_format_float_support(check_models_exist, base_images, tmpdir):
    """BQ07: รองรับภาพ Float (จำลองโดยการแปลงแล้ว Save เป็น Format ที่อ่านกลับมาเช็ค)"""
   
    from server.algos.quality.brisque_adapter import _to_uint8_gray
    
    img_float = np.random.rand(100, 100).astype(np.float32) 
    res = _to_uint8_gray(img_float, "mem")
    assert res.dtype == np.uint8
    assert res.max() <= 255

# 4. SYSTEM & ROBUSTNESS TESTS

def test_input_from_json_file(check_models_exist, base_images, tmpdir):
    """BQ08: รองรับ Input เป็นไฟล์ JSON (จาก Node อื่น)"""
    fake_prev_json = os.path.join(tmpdir, "prev_output.json")
    with open(fake_prev_json, "w") as f:
        json.dump({
            "tool": "HomographyAlignment",
            "output": {"aligned_image": base_images[0]}
        }, f)
    
    _, data = run(fake_prev_json, out_root=tmpdir)
    assert data["image"]["original_path"] == base_images[0]

def test_caching_mechanism(check_models_exist, base_images, tmpdir):
    """BQ09: รันซ้ำต้องได้ไฟล์เดิม (Cache Hit)"""
    p = base_images[0]
    out1, _ = run(p, out_root=tmpdir)
    out2, _ = run(p, out_root=tmpdir)
    assert out1 == out2

def test_tiny_image_rejection(tmpdir):
    """BQ10: ภาพเล็กกว่า 48x48 ต้อง Error"""
    tiny = np.zeros((32, 32, 3), dtype=np.uint8)
    p = os.path.join(tmpdir, "tiny.jpg")
    cv2.imwrite(p, tiny)
    with pytest.raises(ValueError, match="Image too small"):
        run(p, out_root=tmpdir)

def test_missing_file_handling(tmpdir):
    """BQ11: ไฟล์หายต้องแจ้ง Error"""
    with pytest.raises(FileNotFoundError):
        run(os.path.join(tmpdir, "ghost.jpg"), out_root=tmpdir)

def test_json_schema_completeness(check_models_exist, base_images, tmpdir):
    """BQ12: ตรวจสอบ Key สำคัญใน Output JSON"""
    _, data = run(base_images[0], out_root=tmpdir)
    required = ["tool", "image", "brisque_parameters_used", "quality_score", "quality_bucket"]
    for k in required:
        assert k in data

def test_parameter_echo(check_models_exist, base_images, tmpdir):
    """BQ13: ตรวจสอบว่าบันทึกชื่อ Model ที่ใช้ลงใน JSON"""
    _, data = run(base_images[0], out_root=tmpdir)
    params = data["brisque_parameters_used"]
    assert "model_file" in params
    assert "range_file" in params