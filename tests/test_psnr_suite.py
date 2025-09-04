# tests/test_psnr_suite.py

import os
import cv2
import json
import math
import numpy as np
import tempfile
import shutil
import pytest

# ปรับ path import ให้ตรงตำแหน่ง adapter จริงของคุณ
from server.algos.quality.psnr_adapter import run as psnr_run

# ---------------------------
# Utilities / Fixtures
# ---------------------------

@pytest.fixture(scope="module")
def tmpdir():
    d = tempfile.mkdtemp(prefix="psnr_suite_")
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

# ---------------------------
# 1) Identity / Basic behavior
# ---------------------------

def test_identical_uint8_infinity(tmpdir):
    np.random.seed(0)
    img = np.random.randint(0, 256, (240, 320, 3), np.uint8)
    p = os.path.join(tmpdir, "a.png"); _w(p, img)

    out_path, data = psnr_run(p, p, out_root=tmpdir, use_luma=False)
    # PSNR อาจ serialize เป็น "Infinity" หรือค่ามากมาก
    score = data["quality_score"]
    assert score == "Infinity" or float(score) > 100.0
    assert os.path.exists(out_path)

def test_shape_mismatch_raises(tmpdir):
    a = np.zeros((200, 300, 3), np.uint8)
    b = np.zeros((210, 300, 3), np.uint8)
    pa = os.path.join(tmpdir, "shape_a.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "shape_b.png"); _w(pb, b)
    with pytest.raises(ValueError):
        psnr_run(pa, pb, out_root=tmpdir)

# ---------------------------
# 2) Trend tests: Noise / JPEG
# ---------------------------

@pytest.mark.parametrize("sigmas", [[3, 8, 16, 24]])
def test_noise_monotonicity(tmpdir, sigmas):
    np.random.seed(1)
    base = np.full((240, 320, 3), 127, np.uint8)
    p0 = os.path.join(tmpdir, "noise_base.jpg"); _w(p0, base)

    scores = []
    for s in sigmas:
        noise = np.random.normal(0, s, base.shape).astype(np.int16)
        img = np.clip(base.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        pp = os.path.join(tmpdir, f"noise_{s}.jpg"); _w(pp, img)
        _, d = psnr_run(p0, pp, out_root=tmpdir, use_luma=False)
        scores.append(d["quality_score"])

    # noise มากขึ้น -> PSNR ควรลดลงแบบ non-increasing (ยอม tolerance เล็กน้อย)
    for i in range(1, len(scores)):
        assert scores[i] <= scores[i-1] + 0.5, f"PSNR should not increase with noise: {scores}"

@pytest.mark.parametrize("qualities", [[100, 90, 70, 50, 30]])
def test_jpeg_quality_trend(tmpdir, qualities):
    np.random.seed(2)
    base = np.random.randint(0, 256, (240, 320, 3), np.uint8)
    p0 = os.path.join(tmpdir, "jpeg_ref.jpg"); _w(p0, base)

    scores = []
    for q in qualities:
        pq = os.path.join(tmpdir, f"jpeg_q{q}.jpg")
        cv2.imwrite(pq, base, [int(cv2.IMWRITE_JPEG_QUALITY), q])
        _, d = psnr_run(p0, pq, out_root=tmpdir)
        scores.append(d["quality_score"])

    # quality ลดลง -> PSNR ควรลดลง (non-increasing with tolerance)
    for i in range(1, len(scores)):
        assert scores[i] <= scores[i-1] + 0.5, f"PSNR should not increase when JPEG quality decreases: {scores}"

# ---------------------------
# 3) Dynamic range correctness
# ---------------------------

def test_dynamic_range_uint8_uint16_float(tmpdir):
    np.random.seed(3)
    # เริ่มจากภาพ 8-bit
    g8   = np.random.randint(0, 256, (128, 160), np.uint8)
    g8_b = np.clip(g8.astype(np.int16) + 3, 0, 255).astype(np.uint8)

    p8a = os.path.join(tmpdir, "g8a.png"); _w(p8a, g8)
    p8b = os.path.join(tmpdir, "g8b.png"); _w(p8b, g8_b)
    _, d8 = psnr_run(p8a, p8b, out_root=tmpdir)
    psnr8 = d8["quality_score"]

    # 16-bit: scale ขึ้น (x256)
    g16   = (g8.astype(np.uint16) * 256).astype(np.uint16)
    g16_b = (g8_b.astype(np.uint16) * 256).astype(np.uint16)
    p16a = os.path.join(tmpdir, "g16a.tiff"); _w(p16a, g16)
    p16b = os.path.join(tmpdir, "g16b.tiff"); _w(p16b, g16_b)
    _, d16 = psnr_run(p16a, p16b, out_root=tmpdir)
    psnr16 = d16["quality_score"]

    # float32 [0,1]
    gf   = g8.astype(np.float32)/255.0
    gf_b = g8_b.astype(np.float32)/255.0
    # บันทึกเป็น 8-bit เพื่อความง่ายในการโหลดกลับ (adapter จะจัดการ dtype ให้)
    pfa = os.path.join(tmpdir, "gfa.png"); _w(pfa, (gf*255).astype(np.uint8))
    pfb = os.path.join(tmpdir, "gfb.png"); _w(pfb, (gf_b*255).astype(np.uint8))
    _, df = psnr_run(pfa, pfb, out_root=tmpdir)
    psnrf = df["quality_score"]

    # ค่าทั้งสามควร "สอดคล้องทิศทาง" (ไม่ต้องเท่ากันเป๊ะ แต่ใกล้กันในเชิงความหมาย)
    # โดยเฉพาะ uint8 vs uint16 ที่ต่างกันแค่สเกล -> PSNR ควรใกล้เคียง
    assert abs(psnr8 - psnr16) < 0.5, f"PSNR uint8 vs uint16 should be close: {psnr8} vs {psnr16}"
    # float (ผ่านไฟล์) อาจต่างขึ้นเล็กน้อยได้
    assert abs(psnr8 - psnrf) < 2.0, f"PSNR uint8 vs float-derived should be reasonably close: {psnr8} vs {psnrf}"

# ---------------------------
# 4) Gray vs BGR / Alpha handling
# ---------------------------

def test_gray_vs_bgr_behavior(tmpdir):
    np.random.seed(4)
    # ทำภาพสี แล้ว derive เป็น gray
    color = np.random.randint(0, 256, (200, 300, 3), np.uint8)
    gray  = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)

    pc = os.path.join(tmpdir, "col.png"); _w(pc, color)
    pg = os.path.join(tmpdir, "gry.png"); _w(pg, gray)

    # (A) ไม่ใช้ use_luma -> ควร error (shape mismatch)
    with pytest.raises(ValueError):
        psnr_run(pg, pc, out_root=tmpdir, use_luma=False)

    # (B) ใช้ use_luma=True -> ควรคำนวณได้
    _, data = psnr_run(pg, pc, out_root=tmpdir, use_luma=True)
    assert isinstance(data["quality_score"], (float, str))

    # ตรวจเทียบกับสูตร: ใช้ Y จาก BGR มาเทียบกับ gray แล้วคำนวณ PSNR ตรง ๆ
    y = cv2.cvtColor(color, cv2.COLOR_BGR2YCrCb)[:, :, 0]
    R = 255.0
    ref = _psnr_by_formula(gray, y, R)
    if data["quality_score"] != "Infinity":
        assert abs(float(data["quality_score"]) - ref) < 0.5, \
            f"PSNR(luma) should match formula ~0.5dB: got {data['quality_score']} vs {ref}"

def test_bgra_vs_bgr(tmpdir):
    np.random.seed(5)
    bgr  = np.random.randint(0, 256, (180, 220, 3), np.uint8)
    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)

    p3 = os.path.join(tmpdir, "bgr.png");  _w(p3, bgr)
    p4 = os.path.join(tmpdir, "bgra.png"); _w(p4, bgra)

    # adapter จะตัด alpha อัตโนมัติ -> ควรคำนวณได้ และเท่ากับ PSNR(BGR,BGR)
    # สร้างอีกไฟล์ bgr2 ต่างออกนิดหน่อย เพื่อไม่ให้เป็น Infinity
    bgr2 = np.clip(bgr.astype(np.int16) + 2, 0, 255).astype(np.uint8)
    p3b = os.path.join(tmpdir, "bgr2.png"); _w(p3b, bgr2)
    p4b = os.path.join(tmpdir, "bgra2.png"); _w(p4b, cv2.cvtColor(bgr2, cv2.COLOR_BGR2BGRA))

    # PSNR โดย adapter
    _, d_bgra = psnr_run(p4, p4b, out_root=tmpdir)     # จะ drop alpha แล้วใช้ BGR เปรียบเทียบ
    _, d_bgr  = psnr_run(p3, p3b, out_root=tmpdir)

    # ค่าควรเท่ากันมาก ๆ
    assert abs(float(d_bgra["quality_score"]) - float(d_bgr["quality_score"])) < 1e-6

# ---------------------------
# 5) JSON Schema / content
# ---------------------------

def test_output_json_schema(tmpdir):
    a = np.random.randint(0, 256, (100, 120, 3), np.uint8)
    b = np.clip(a.astype(np.int16) + 5, 0, 255).astype(np.uint8)
    pa = os.path.join(tmpdir, "ja.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "jb.png"); _w(pb, b)

    out_path, data = psnr_run(pa, pb, out_root=tmpdir)
    assert os.path.exists(out_path)

    # ฟิลด์หลัก
    for key in ["tool", "tool_version", "config", "images", "quality_score", "score_interpretation"]:
        assert key in data

    assert data["tool"] == "PSNR"
    assert "opencv" in data["tool_version"] and "python" in data["tool_version"]
    assert "R" in data["config"] and "use_luma" in data["config"]

    # images metadata
    assert "original" in data["images"] and "processed" in data["images"]
    for side in ["original", "processed"]:
        info = data["images"][side]
        for f in ["file_name", "path", "shape", "dtype"]:
            assert f in info

    # score type
    assert isinstance(data["quality_score"], (float, str))