import os
import json
import cv2
import numpy as np
import pytest
import shutil
import tempfile

from server.algos.Classification.otsu_adapter import run as otsu_run

# 1. FIXTURES & UTILS

@pytest.fixture(scope="module")
def tmpdir():
    d = tempfile.mkdtemp(prefix="otsu_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)

def _create_bimodal_image(path: str):
    """สร้างภาพ Bimodal (2 โทนสีชัดเจน)"""
    img = np.full((100, 100), 50, dtype=np.uint8)
    cv2.circle(img, (50, 50), 30, 200, -1)
    cv2.imwrite(path, img)
    return img

def _create_noisy_image(path: str):
    """สร้างภาพที่มี Noise"""
    img = np.full((100, 100), 100, dtype=np.uint8)
    noise = np.random.randint(-50, 50, (100, 100)).astype(np.int16)
    img = np.clip(img + noise, 0, 255).astype(np.uint8)
    cv2.imwrite(path, img)
    return img

# 2. CORE LOGIC & PARAMETERS

def test_basic_otsu_run(tmpdir):
    """OT01: การทำงานพื้นฐาน"""
    p = os.path.join(tmpdir, "basic.png")
    _create_bimodal_image(p)
    json_path, bin_path = otsu_run(p, out_root=tmpdir)
    
    assert os.path.exists(json_path)
    assert os.path.exists(bin_path)
    
    with open(json_path, 'r') as f: data = json.load(f)
    assert 100 < data["threshold_value"] < 150

def test_invert_logic(tmpdir):
    """OT02: Invert Logic (ขาว<->ดำ)"""
    p = os.path.join(tmpdir, "invert.png")
    _create_bimodal_image(p)
    
    _, bin_norm = otsu_run(p, out_root=tmpdir, invert=False)
    _, bin_inv = otsu_run(p, out_root=tmpdir, invert=True)
    
    img_norm = cv2.imread(bin_norm, cv2.IMREAD_GRAYSCALE)
    img_inv = cv2.imread(bin_inv, cv2.IMREAD_GRAYSCALE)
    
    assert img_norm[50, 50] == 255
    assert img_inv[50, 50] == 0

def test_gaussian_blur_enabled(tmpdir):
    """OT03: Gaussian Blur Parameter"""
    p = os.path.join(tmpdir, "blur.png")
    _create_noisy_image(p)
    
    j1, _ = otsu_run(p, out_root=tmpdir, gaussian_blur=False)
    j2, _ = otsu_run(p, out_root=tmpdir, gaussian_blur=True, blur_ksize=15)
    
    assert j1 != j2

def test_blur_ksize_correction(tmpdir):
    """OT04: ปรับ Kernel Blur อัตโนมัติ (เลขคู่ -> เลขคี่)"""
    p = os.path.join(tmpdir, "blur_k.png")
    _create_bimodal_image(p)
    
    j_path, _ = otsu_run(p, out_root=tmpdir, gaussian_blur=True, blur_ksize=4)
    assert os.path.exists(j_path)

def test_morphology_open_close(tmpdir):
    """OT05: Morphology (Open/Close)"""
    p = os.path.join(tmpdir, "morph.png")
    _create_bimodal_image(p)
    
    j_path, _ = otsu_run(p, out_root=tmpdir, morph_open=True, morph_close=True, morph_kernel=5)
    with open(j_path) as f: data = json.load(f)
    
    assert data["parameters"]["open"] is True
    assert data["parameters"]["close"] is True

def test_morph_kernel_correction(tmpdir):
    """OT06: ปรับ Kernel Morph อัตโนมัติ (ค่าลบ/ศูนย์ -> ค่า Default)"""
    p = os.path.join(tmpdir, "morph_k.png")
    _create_bimodal_image(p)
    
    j_path, _ = otsu_run(p, out_root=tmpdir, morph_open=True, morph_kernel=-1)
    assert os.path.exists(j_path)

def test_histogram_generation(tmpdir):
    """OT07: สร้างกราฟ Histogram"""
    p = os.path.join(tmpdir, "hist.png")
    _create_bimodal_image(p)
    
    json_path, _ = otsu_run(p, out_root=tmpdir, show_histogram=True)
    with open(json_path) as f: data = json.load(f)
    
    hist_url = data["output"]["histogram_url"]
    assert hist_url is not None
    assert os.path.exists(os.path.join(tmpdir, "features", "otsu_outputs", os.path.basename(hist_url)))

# 3. EDGE CASES & ROBUSTNESS

def test_solid_color_image(tmpdir):
    """OT08: ภาพสีเดียว (Histogram แท่งเดียว)"""
    p = os.path.join(tmpdir, "solid.png")
    img = np.full((100, 100), 128, dtype=np.uint8)
    cv2.imwrite(p, img)
    
    j_path, _ = otsu_run(p, out_root=tmpdir, show_histogram=True)
    assert os.path.exists(j_path)

def test_grayscale_input(tmpdir):
    """OT09: รองรับ Input ที่เป็น Grayscale อยู่แล้ว"""
    p = os.path.join(tmpdir, "gray_input.png")
    img = np.random.randint(0, 255, (100, 100), dtype=np.uint8) 
    cv2.imwrite(p, img)
    
    j_path, _ = otsu_run(p, out_root=tmpdir)
    assert os.path.exists(j_path)

def test_bgra_support(tmpdir):
    """OT10: รองรับ BGRA (4 Channels)"""
    p = os.path.join(tmpdir, "alpha.png")
    img = np.full((50, 50, 4), 100, dtype=np.uint8)
    cv2.imwrite(p, img)
    
    j_path, _ = otsu_run(p, out_root=tmpdir)
    assert os.path.exists(j_path)

# 4. SYSTEM & INTEGRATION

def test_input_from_json(tmpdir):
    """OT11: รองรับ Input จาก JSON (Pipeline)"""
    real_img = os.path.join(tmpdir, "real.jpg")
    _create_bimodal_image(real_img)
    
    json_in = os.path.join(tmpdir, "prev.json")
    with open(json_in, "w") as f:
        json.dump({"output": {"aligned_image": real_img}}, f)
        
    j_path, _ = otsu_run(json_in, out_root=tmpdir)
    with open(j_path) as f: data = json.load(f)
    assert data["input_image"]["path"] == real_img

def test_invalid_json_rejection(tmpdir):
    """OT12: ปฏิเสธ JSON จาก Matcher"""
    p = os.path.join(tmpdir, "match.json")
    with open(p, "w") as f:
        json.dump({"matching_tool": "BFMatcher"}, f)
        
    with pytest.raises(ValueError, match="Invalid Input"):
        otsu_run(p, out_root=tmpdir)

def test_missing_file_handling(tmpdir):
    """OT13: ไฟล์หายต้องแจ้ง Error"""
    with pytest.raises(ValueError, match="Cannot read image"):
        otsu_run("ghost.png", out_root=tmpdir)

def test_caching_mechanism(tmpdir):
    """OT14: รันซ้ำต้องได้ไฟล์เดิม"""
    p = os.path.join(tmpdir, "cache.png")
    _create_bimodal_image(p)
    j1, _ = otsu_run(p, out_root=tmpdir)
    j2, _ = otsu_run(p, out_root=tmpdir)
    assert j1 == j2

def test_param_change_creates_new_file(tmpdir):
    """OT15: เปลี่ยนพารามิเตอร์ต้องได้ไฟล์ใหม่"""
    p = os.path.join(tmpdir, "param.png")
    _create_bimodal_image(p)
    j1, _ = otsu_run(p, out_root=tmpdir, invert=False)
    j2, _ = otsu_run(p, out_root=tmpdir, invert=True)
    assert j1 != j2

def test_json_schema_check(tmpdir):
    """OT16: ตรวจสอบโครงสร้าง Output JSON"""
    p = os.path.join(tmpdir, "schema.png")
    _create_bimodal_image(p)
    j_path, _ = otsu_run(p, out_root=tmpdir, show_histogram=True)
    
    with open(j_path) as f: data = json.load(f)
    
    assert data["tool"] == "OtsuThreshold"
    assert "threshold_value" in data
    assert "binary_mask_path" in data["output"]
    assert "histogram_url" in data["output"]
    assert "parameters" in data