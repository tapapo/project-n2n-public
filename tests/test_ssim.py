import os
import cv2
import json
import numpy as np
import tempfile
import shutil
import pytest

from server.algos.quality.ssim_adapter import compute_ssim, run_ssim_assessment

# 1. UTILS & FIXTURES

@pytest.fixture(scope="module")
def tmpdir():
    d = tempfile.mkdtemp(prefix="ssim_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)

def _w(path, img):
    ok = cv2.imwrite(path, img)
    assert ok, f"Cannot write {path}"

# 2. CORE LOGIC TESTS

def test_identical_images_score_one(tmpdir):
    """SQ01: ภาพเหมือนกันต้องได้ 1.0"""
    np.random.seed(0)
    img = np.random.randint(0, 256, (100, 100, 3), np.uint8)
    p = os.path.join(tmpdir, "id.png")
    _w(p, img)
    
    out = compute_ssim(p, p, out_root=tmpdir)
    assert 0.999 <= float(out["score"]) <= 1.0

def test_shape_mismatch_raises(tmpdir):
    """SQ02: ภาพคนละขนาดต้อง Error"""
    a = np.zeros((100, 100, 3), np.uint8)
    b = np.zeros((110, 100, 3), np.uint8)
    pa = os.path.join(tmpdir, "a.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "b.png"); _w(pb, b)
    
    with pytest.raises(ValueError, match="Image shape mismatch"):
        run_ssim_assessment(pa, pb)

def test_noise_trend_non_increasing(tmpdir):
    """SQ03: Trend - Noise มากขึ้น SSIM ต้องลดลง"""
    base = np.full((100, 100, 3), 127, np.uint8)
    p0 = os.path.join(tmpdir, "base.png"); _w(p0, base)

    sigmas = [5, 20, 50]
    scores = []
    for s in sigmas:
        noise = np.random.normal(0, s, base.shape).astype(np.int16)
        img = np.clip(base + noise, 0, 255).astype(np.uint8)
        pp = os.path.join(tmpdir, f"noise_{s}.png"); _w(pp, img)
        out = compute_ssim(p0, pp, out_root=tmpdir)
        scores.append(float(out["score"]))

    # SSIM (Similarity) should decrease as noise increases
    assert scores[0] > scores[1] > scores[2]

def test_jpeg_trend_non_increasing(tmpdir):
    """SQ04: Trend - JPEG Quality ลดลง SSIM ต้องลดลง"""
    base = np.random.randint(0, 256, (100, 100, 3), np.uint8)
    p0 = os.path.join(tmpdir, "jpeg_ref.jpg"); _w(p0, base)

    qualities = [95, 50, 10]
    scores = []
    for q in qualities:
        pq = os.path.join(tmpdir, f"q{q}.jpg")
        cv2.imwrite(pq, base, [int(cv2.IMWRITE_JPEG_QUALITY), q])
        out = compute_ssim(p0, pq, out_root=tmpdir)
        scores.append(float(out["score"]))

    assert scores[0] >= scores[1] >= scores[2]

# 3. MODE & FORMAT TESTS

def test_auto_mode_color_handling(tmpdir):
    """SQ05: Auto Mode เลือก Color เมื่อ input เป็นสีทั้งคู่"""
    a = np.random.randint(0, 256, (50, 50, 3), np.uint8)
    b = np.clip(a + 10, 0, 255).astype(np.uint8)
    pa = os.path.join(tmpdir, "ca.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "cb.png"); _w(pb, b)

    _, mode, _, _ = run_ssim_assessment(pa, pb, auto_switch=True)
    assert mode == "Color (Multi-channel)"

def test_auto_mode_gray_fallback(tmpdir):
    """SQ06: Auto Mode ถอยไป Gray เมื่อมีรูปใดรูปหนึ่งเป็น Gray"""
    col = np.random.randint(0, 256, (50, 50, 3), np.uint8)
    gry = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY)
    pc = os.path.join(tmpdir, "col.png"); _w(pc, col)
    pg = os.path.join(tmpdir, "gry.png"); _w(pg, gry)

    _, mode, _, _ = run_ssim_assessment(pc, pg, auto_switch=True)
    assert mode == "Grayscale"

def test_dynamic_range_support(tmpdir):
    """SQ07: รองรับ 8-bit, 16-bit, Float"""
    g8 = np.random.randint(0, 256, (50, 50), np.uint8)
    g8b = np.clip(g8 + 5, 0, 255).astype(np.uint8)
    p8a = os.path.join(tmpdir, "g8a.png"); _w(p8a, g8)
    p8b = os.path.join(tmpdir, "g8b.png"); _w(p8b, g8b)
    s8 = compute_ssim(p8a, p8b, out_root=tmpdir)["score"]

    g16 = (g8.astype(np.uint16) * 256)
    g16b = (g8b.astype(np.uint16) * 256)
    p16a = os.path.join(tmpdir, "g16a.tiff"); _w(p16a, g16)
    p16b = os.path.join(tmpdir, "g16b.tiff"); _w(p16b, g16b)
    s16 = compute_ssim(p16a, p16b, out_root=tmpdir)["score"]

    assert abs(float(s8) - float(s16)) < 0.05

def test_bgra_alpha_handling(tmpdir):
    """SQ08: ตัด Alpha Channel อัตโนมัติ"""
    bgr = np.random.randint(0, 256, (50, 50, 3), np.uint8)
    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    
    p3 = os.path.join(tmpdir, "bgr.png"); _w(p3, bgr)
    p4 = os.path.join(tmpdir, "bgra.png"); _w(p4, bgra)
    
    out = compute_ssim(p3, p4, out_root=tmpdir)
    assert float(out["score"]) > 0.999

def test_small_image_win_size_clamp(tmpdir):
    """SQ09: ปรับ win_size ลงอัตโนมัติถ้าภาพเล็กกว่า"""
    a = np.random.randint(0, 256, (9, 9), np.uint8)
    pa = os.path.join(tmpdir, "s.png"); _w(pa, a)
    
    _, _, msg, _ = run_ssim_assessment(pa, pa, win_size=99, auto_switch=True)
    assert "successful" in msg

# 4. SYSTEM & ROBUSTNESS TESTS

def test_input_from_alignment_json(tmpdir):
    """SQ10: รองรับ Input เป็นไฟล์ JSON จาก Homography/Affine"""
    real_img = os.path.join(tmpdir, "real.jpg")
    _w(real_img, np.zeros((50,50,3), np.uint8))
    
    align_json = os.path.join(tmpdir, "homo.json")
    with open(align_json, "w") as f:
        json.dump({
            "tool": "HomographyAlignment",
            "output": {"aligned_image": real_img}
        }, f)
    
    out = compute_ssim(align_json, real_img, out_root=tmpdir)
    with open(out["json_path"], "r") as f:
        data = json.load(f)
    assert data["images"]["original"]["file_name"] == "real.jpg"

def test_matcher_input_rejected(tmpdir):
    """SQ11: ปฏิเสธไฟล์ JSON จาก Matcher"""
    matcher_json = os.path.join(tmpdir, "match.json")
    with open(matcher_json, "w") as f:
        json.dump({"tool": "BFMatcher", "keypoints": []}, f)
        
    with pytest.raises(ValueError, match="Invalid Input"):
        compute_ssim(matcher_json, matcher_json, out_root=tmpdir)

def test_caching_mechanism(tmpdir):
    """SQ12: รันซ้ำต้องได้ไฟล์เดิม (Cache Hit)"""
    p = os.path.join(tmpdir, "cache.png")
    _w(p, np.zeros((50,50), np.uint8))
    
    out1 = compute_ssim(p, p, out_root=tmpdir)
    out2 = compute_ssim(p, p, out_root=tmpdir)
    assert out1["json_path"] == out2["json_path"]

def test_missing_file_handling(tmpdir):
    """SQ13: ไฟล์หายต้องแจ้ง Error"""
    with pytest.raises(FileNotFoundError):
        compute_ssim("ghost1.jpg", "ghost2.jpg", out_root=tmpdir)

def test_json_schema_completeness(tmpdir):
    """SQ14: ตรวจสอบโครงสร้าง Output"""
    p = os.path.join(tmpdir, "schema.png")
    _w(p, np.zeros((50,50), np.uint8))
    
    out = compute_ssim(p, p, out_root=tmpdir)
    with open(out["json_path"], "r") as f:
        data = json.load(f)
        
    assert data["tool"] == "SSIM"
    assert "score" in data
    assert "color_mode_used_for_ssim" in data
    assert "params_used" in data