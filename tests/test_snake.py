import os
import json
import cv2
import numpy as np
import pytest
import shutil
import tempfile

try:
    from server.algos.Classification.snake_adapter import (
        run as snake_run, 
        HAS_SKIMAGE,
        _init_snake_circle,
        _init_snake_bbox,
        _prepare_image_for_snake
    )
except ImportError:
    pytest.skip("Skipping Snake tests: Module not found", allow_module_level=True)

# 1. FIXTURES & UTILS

@pytest.fixture(scope="module")
def tmpdir():
    d = tempfile.mkdtemp(prefix="snake_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)

def _create_simple_shape(path: str, shape_type="circle"):
    """สร้างภาพทดสอบง่ายๆ"""
    img = np.zeros((200, 200), dtype=np.uint8)
    if shape_type == "circle":
        cv2.circle(img, (100, 100), 50, 255, -1)
    elif shape_type == "rect":
        cv2.rectangle(img, (50, 50), (150, 150), 255, -1)
    cv2.imwrite(path, img)
    return img

def _create_noisy_shape(path: str):
    """สร้างภาพที่มี Noise"""
    img = np.zeros((200, 200), dtype=np.uint8)
    cv2.circle(img, (100, 100), 50, 200, -1)
    noise = np.random.randint(-20, 20, (200, 200)).astype(np.int16)
    img = np.clip(img + noise, 0, 255).astype(np.uint8)
    cv2.imwrite(path, img)
    return img

# 2. UNIT TESTS (Helper Functions Logic) - [NEW]

def test_helper_init_circle_math():
    """SN01: ตรวจสอบคณิตศาสตร์การสร้างวงกลมเริ่มต้น"""
    snake = _init_snake_circle(200, 200, cx=100, cy=100, r=50, pts=100)
    
    ys, xs = snake[:, 0], snake[:, 1]
    
    assert 49 < np.min(ys) < 51   
    assert 149 < np.max(ys) < 151 
    assert 49 < np.min(xs) < 51  
    assert 149 < np.max(xs) < 151 

def test_helper_init_bbox_math():
    """SN02: ตรวจสอบคณิตศาสตร์การสร้างสี่เหลี่ยมเริ่มต้น"""
    snake = _init_snake_bbox(200, 200, x1=50, y1=50, x2=150, y2=150, pts=100)
    
    ys, xs = snake[:, 0], snake[:, 1]
    
    assert np.isclose(np.min(xs), 50)
    assert np.isclose(np.max(xs), 150)
    assert np.isclose(np.min(ys), 50)
    assert np.isclose(np.max(ys), 150)

def test_helper_min_points_enforcement():
    """SN03: ตรวจสอบการบังคับจำนวนจุดขั้นต่ำ"""
    snake = _init_snake_circle(100, 100, None, None, None, pts=2)
    assert len(snake) == 8

def test_helper_image_prep():
    """SN04: ตรวจสอบการแปลงภาพเป็น Float"""
    img = np.full((10, 10), 128, dtype=np.uint8) 
    res = _prepare_image_for_snake(img, gaussian_blur_ksize=0)
    
    assert res.dtype == np.float32 or res.dtype == np.float64
    assert 0.0 <= res.min() and res.max() <= 1.0
    assert np.isclose(res[0,0], 128/255.0, atol=1e-3)

# 3. INTEGRATION TESTS (Run Function)

def test_basic_snake_run(tmpdir):
    """SN05: การทำงานพื้นฐาน (Init Circle)"""
    if not HAS_SKIMAGE: pytest.skip("scikit-image not installed")
    p = os.path.join(tmpdir, "circle.png")
    _create_simple_shape(p, "circle")
    
    json_path, overlay_path, mask_path = snake_run(
        p, out_root=tmpdir, init_mode="circle", init_cx=100, init_cy=100, init_radius=80
    )
    
    assert os.path.exists(json_path)
    assert os.path.exists(overlay_path)
    
    ov = cv2.imread(overlay_path)
    assert ov.shape[2] == 3

def test_init_mode_bbox_run(tmpdir):
    """SN06: Run ด้วยโหมด Bounding Box"""
    if not HAS_SKIMAGE: pytest.skip()
    p = os.path.join(tmpdir, "rect.png")
    _create_simple_shape(p, "rect") 
    
    json_path, _, _ = snake_run(
        p, out_root=tmpdir, init_mode="bbox",
        bbox_x1=40, bbox_y1=40, bbox_x2=160, bbox_y2=160
    )
    with open(json_path) as f: data = json.load(f)
    assert data["parameters"]["init_mode"] == "bbox"

def test_init_mode_point_run(tmpdir):
    """SN07: Run ด้วยโหมด Point Click"""
    if not HAS_SKIMAGE: pytest.skip()
    p = os.path.join(tmpdir, "point.png")
    _create_simple_shape(p, "circle")
    
    json_path, _, _ = snake_run(
        p, out_root=tmpdir, init_mode="point",
        from_point_x=100, from_point_y=100, init_radius=60
    )
    assert os.path.exists(json_path)

def test_gaussian_blur_param(tmpdir):
    """SN08: ตรวจสอบผลกระทบ Gaussian Blur"""
    if not HAS_SKIMAGE: pytest.skip()
    p = os.path.join(tmpdir, "noisy.png")
    _create_noisy_shape(p)
    
    j1, _, _ = snake_run(p, out_root=tmpdir, gaussian_blur_ksize=1)
    j2, _, _ = snake_run(p, out_root=tmpdir, gaussian_blur_ksize=9)
    assert j1 != j2

def test_params_echo(tmpdir):
    """SN09: ตรวจสอบการบันทึก Parameters"""
    p = os.path.join(tmpdir, "params.png")
    _create_simple_shape(p)
    
    json_path, _, _ = snake_run(
        p, out_root=tmpdir, alpha=0.99, beta=5.55
    )
    with open(json_path) as f: data = json.load(f)
    assert data["parameters"]["alpha"] == 0.99
    assert data["parameters"]["beta"] == 5.55

# 4. ROBUSTNESS & EDGE CASES

def test_pipeline_input(tmpdir):
    """SN10: Input จาก JSON Pipeline"""
    real = os.path.join(tmpdir, "real.jpg")
    _create_simple_shape(real)
    
    j_in = os.path.join(tmpdir, "align.json")
    with open(j_in, "w") as f:
        json.dump({"output": {"aligned_image": real}}, f)
        
    j_out, _, _ = snake_run(j_in, out_root=tmpdir)
    with open(j_out) as f: data = json.load(f)
    assert data["input_image"]["path"] == real

def test_invalid_json_input(tmpdir):
    """SN11: ปฏิเสธ JSON Matcher"""
    p = os.path.join(tmpdir, "match.json")
    with open(p, "w") as f: json.dump({"matching_tool": "BFMatcher"}, f)
    
    with pytest.raises(ValueError, match="Invalid Input"):
        snake_run(p, out_root=tmpdir)

def test_missing_file(tmpdir):
    """SN12: ไฟล์หาย"""
    with pytest.raises(ValueError, match="Cannot read image"):
        snake_run("ghost.png", out_root=tmpdir)

def test_alpha_channel_input(tmpdir):
    """SN13: รองรับ BGRA"""
    p = os.path.join(tmpdir, "bgra.png")
    img = np.zeros((100, 100, 4), dtype=np.uint8)
    cv2.circle(img, (50,50), 20, (255,255,255,255), -1)
    cv2.imwrite(p, img)
    
    j_path, _, _ = snake_run(p, out_root=tmpdir)
    assert os.path.exists(j_path)

def test_caching(tmpdir):
    """SN14: Caching"""
    p = os.path.join(tmpdir, "cache.png")
    _create_simple_shape(p)
    j1, _, _ = snake_run(p, out_root=tmpdir)
    j2, _, _ = snake_run(p, out_root=tmpdir)
    assert j1 == j2

# 5. ERROR HANDLING & FALLBACKS

def test_fallback_no_skimage(tmpdir, monkeypatch):
    """SN15: Fallback เมื่อไม่มี skimage"""
    monkeypatch.setattr("server.algos.Classification.snake_adapter.HAS_SKIMAGE", False)
    p = os.path.join(tmpdir, "nosk.png")
    _create_simple_shape(p)
    
    json_path, _, _ = snake_run(p, out_root=tmpdir)
    with open(json_path) as f: data = json.load(f)
    
    assert "not installed" in data["warning"]
    assert len(data["output"]["contour_points_xy"]) > 0

def test_calculation_crash_handling(tmpdir, monkeypatch):
    """SN16: จัดการ Crash ตอนคำนวณ"""
    if not HAS_SKIMAGE: pytest.skip()
    
    def mock_crash(*args, **kwargs): raise RuntimeError("BOOM")
    monkeypatch.setattr("server.algos.Classification.snake_adapter.active_contour", mock_crash)
    
    p = os.path.join(tmpdir, "crash.png")
    _create_simple_shape(p)
    
    json_path, _, _ = snake_run(p, out_root=tmpdir)
    with open(json_path) as f: data = json.load(f)
    
    assert "Snake calculation failed" in data["warning"]

def test_output_schema(tmpdir):
    """SN17: Output Structure"""
    if not HAS_SKIMAGE: pytest.skip()
    p = os.path.join(tmpdir, "schema.png")
    _create_simple_shape(p)
    
    json_path, _, _ = snake_run(p, out_root=tmpdir)
    with open(json_path) as f: data = json.load(f)
    
    assert data["tool"] == "SnakeActiveContour"
    assert "contour_points_xy" in data["output"]
    assert "mask_path" in data["output"]

def test_overlay_creation(tmpdir):
    """SN18: ตรวจสอบการสร้างไฟล์ Overlay"""
    if not HAS_SKIMAGE: pytest.skip()
    p = os.path.join(tmpdir, "ov.png")
    _create_simple_shape(p)
    
    _, overlay_path, _ = snake_run(p, out_root=tmpdir)
    assert os.path.exists(overlay_path)
    
    img = cv2.imread(overlay_path)
    assert img.shape[2] == 3