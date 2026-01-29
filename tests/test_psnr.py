import os
import cv2
import json
import math
import numpy as np
import tempfile
import shutil
import pytest

from server.algos.quality.psnr_adapter import run as psnr_run

# 1. UTILS & FIXTURES

@pytest.fixture(scope="module")
def tmpdir():
    d = tempfile.mkdtemp(prefix="psnr_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)

def _w(path, img):
    ok = cv2.imwrite(path, img)
    assert ok, f"Cannot write {path}"

def _mse(a: np.ndarray, b: np.ndarray) -> float:
    diff = (a.astype(np.float64) - b.astype(np.float64)).ravel()
    return float(np.mean(diff * diff))

def _psnr_by_formula(a: np.ndarray, b: np.ndarray, R: float) -> float:
    mse = _mse(a, b)
    if mse == 0.0:
        return float("inf")
    return 10.0 * math.log10((R * R) / mse)

# 2. CORE LOGIC TESTS

def test_identical_uint8_infinity(tmpdir):
    """PQ01: ภาพเหมือนกันต้องได้ Infinity"""
    np.random.seed(0)
    img = np.random.randint(0, 256, (240, 320, 3), np.uint8)
    p = os.path.join(tmpdir, "identical.png"); _w(p, img)

    out_path, data = psnr_run(p, p, out_root=tmpdir, use_luma=False)
    score = data["quality_score"]
    
    assert score == "Infinity" or score == float("inf") or float(score) > 100.0
    assert os.path.exists(out_path)

def test_shape_mismatch_raises(tmpdir):
    """PQ02: ภาพคนละขนาดต้อง Error"""
    a = np.zeros((200, 300, 3), np.uint8)
    b = np.zeros((210, 300, 3), np.uint8)
    pa = os.path.join(tmpdir, "shape_a.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "shape_b.png"); _w(pb, b)
    with pytest.raises(ValueError, match="Image shape mismatch"):
        psnr_run(pa, pb, out_root=tmpdir)

def test_noise_monotonicity(tmpdir):
    """PQ03: Trend - Noise มากขึ้น PSNR ต้องลดลง"""
    np.random.seed(1)
    base = np.full((100, 100, 3), 127, np.uint8)
    p0 = os.path.join(tmpdir, "noise_base.jpg"); _w(p0, base)

    sigmas = [5, 20, 50]
    scores = []
    for s in sigmas:
        noise = np.random.normal(0, s, base.shape).astype(np.int16)
        img = np.clip(base.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        pp = os.path.join(tmpdir, f"noise_{s}.jpg"); _w(pp, img)
        _, d = psnr_run(p0, pp, out_root=tmpdir, use_luma=False)
        scores.append(float(d["quality_score"]))

    assert scores[0] > scores[1] > scores[2]

def test_jpeg_quality_trend(tmpdir):
    """PQ04: Trend - JPEG Quality ลดลง PSNR ต้องลดลง"""
    base = np.random.randint(0, 256, (100, 100, 3), np.uint8)
    p0 = os.path.join(tmpdir, "jpeg_ref.jpg"); _w(p0, base)

    qualities = [95, 50, 10]
    scores = []
    for q in qualities:
        pq = os.path.join(tmpdir, f"jpeg_q{q}.jpg")
        cv2.imwrite(pq, base, [int(cv2.IMWRITE_JPEG_QUALITY), q])
        _, d = psnr_run(p0, pq, out_root=tmpdir)
        scores.append(float(d["quality_score"]))

    assert scores[0] >= scores[1] >= scores[2]

# 3. FORMAT & DTYPE TESTS

def test_dynamic_range_handling(tmpdir):
    """PQ05: รองรับ 8-bit, 16-bit, Float"""
    g8 = np.random.randint(0, 256, (50, 50), np.uint8)
    g8_b = np.clip(g8 + 10, 0, 255).astype(np.uint8)
    p8a = os.path.join(tmpdir, "g8a.png"); _w(p8a, g8)
    p8b = os.path.join(tmpdir, "g8b.png"); _w(p8b, g8_b)
    _, d8 = psnr_run(p8a, p8b, out_root=tmpdir)

    g16 = (g8.astype(np.uint16) * 256)
    g16_b = (g8_b.astype(np.uint16) * 256)
    p16a = os.path.join(tmpdir, "g16a.tiff"); _w(p16a, g16)
    p16b = os.path.join(tmpdir, "g16b.tiff"); _w(p16b, g16_b)
    _, d16 = psnr_run(p16a, p16b, out_root=tmpdir)

    assert abs(float(d8["quality_score"]) - float(d16["quality_score"])) < 1.0

def test_gray_vs_bgr_behavior(tmpdir):
    """PQ06: ทดสอบ Luma Conversion (Gray vs Color)"""
    color = np.random.randint(0, 256, (50, 50, 3), np.uint8)
    gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
    
    pc = os.path.join(tmpdir, "col.png"); _w(pc, color)
    pg = os.path.join(tmpdir, "gry.png"); _w(pg, gray)

    with pytest.raises(ValueError):
        psnr_run(pg, pc, out_root=tmpdir, use_luma=False)

    _, data = psnr_run(pg, pc, out_root=tmpdir, use_luma=True)
    assert data["quality_score"] != "Infinity"

def test_bgra_alpha_handling(tmpdir):
    """PQ07: ตัด Alpha Channel อัตโนมัติ"""
    bgr = np.random.randint(0, 256, (50, 50, 3), np.uint8)
    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    
    p_bgr = os.path.join(tmpdir, "test_bgr.png"); _w(p_bgr, bgr)
    p_bgra = os.path.join(tmpdir, "test_bgra.png"); _w(p_bgra, bgra)
    
    _, data = psnr_run(p_bgr, p_bgra, out_root=tmpdir)
    score = data["quality_score"]
    assert score == "Infinity" or float(score) > 100

# 4. SYSTEM & ROBUSTNESS TESTS (Adapter Specific)

def test_input_from_alignment_json(tmpdir):
    """PQ08: รองรับ Input เป็นไฟล์ JSON จาก Homography/Affine"""
    real_img = os.path.join(tmpdir, "real_aligned.jpg")
    _w(real_img, np.zeros((50,50,3), np.uint8))
    
    align_json = os.path.join(tmpdir, "homo_result.json")
    with open(align_json, "w") as f:
        json.dump({
            "tool": "HomographyAlignment",
            "output": {"aligned_image": real_img}
        }, f)
        
    out_path, data = psnr_run(align_json, real_img, out_root=tmpdir)
    assert os.path.exists(out_path)
    assert data["images"]["original"]["file_name"] == "real_aligned.jpg"

def test_matcher_input_rejected(tmpdir):
    """PQ09: ปฏิเสธไฟล์ JSON จาก Matcher (เพราะไม่มีรูปผลลัพธ์)"""
    matcher_json = os.path.join(tmpdir, "bf_match.json")
    with open(matcher_json, "w") as f:
        json.dump({"tool": "BFMatcher", "keypoints": []}, f)
        
    with pytest.raises(ValueError, match="Invalid Input"):
        psnr_run(matcher_json, matcher_json, out_root=tmpdir)

def test_caching_mechanism(tmpdir):
    """PQ10: รันซ้ำต้องได้ไฟล์เดิม (Cache Hit)"""
    p = os.path.join(tmpdir, "cache_test.jpg")
    _w(p, np.zeros((50,50,3), np.uint8))
    
    out1, _ = psnr_run(p, p, out_root=tmpdir)
    out2, _ = psnr_run(p, p, out_root=tmpdir)
    
    assert out1 == out2

def test_missing_file_handling(tmpdir):
    """PQ11: ไฟล์หายต้องแจ้ง Error"""
    with pytest.raises(FileNotFoundError):
        psnr_run("ghost1.jpg", "ghost2.jpg", out_root=tmpdir)

def test_json_schema_completeness(tmpdir):
    """PQ12: ตรวจสอบโครงสร้าง Output"""
    p = os.path.join(tmpdir, "schema.jpg")
    _w(p, np.zeros((50,50,3), np.uint8))
    
    _, data = psnr_run(p, p, out_root=tmpdir)
    
    assert "tool" in data
    assert "images" in data
    assert "quality_score" in data
    assert "config" in data
    assert data["config"]["use_luma"] is True 