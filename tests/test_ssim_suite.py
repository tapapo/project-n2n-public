# tests/test_ssim_suite.py

import os
import cv2
import json
import numpy as np
import tempfile
import shutil
import pytest

from server.algos.quality.ssim_adapter import compute_ssim, run_ssim_assessment


# ---------------------------
# Fixtures / utilities
# ---------------------------
@pytest.fixture(scope="module")
def tmpdir():
    d = tempfile.mkdtemp(prefix="ssim_suite_")
    yield d
    shutil.rmtree(d, ignore_errors=True)

def _w(path, img):
    ok = cv2.imwrite(path, img)
    assert ok, f"Cannot write {path}"


# ---------------------------
# 1) Identity / Basic
# ---------------------------
def test_identical_is_one(tmpdir):
    np.random.seed(0)
    img = np.random.randint(0, 256, (240, 320, 3), np.uint8)
    p = os.path.join(tmpdir, "id.png"); _w(p, img)
    out = compute_ssim(p, p, out_root=tmpdir)  # default auto mode
    assert 0.999 <= float(out["score"]) <= 1.0


def test_shape_mismatch_raises_in_forced_color(tmpdir):
    # บังคับ Color แต่ให้รูปต่างขนาด -> ต้อง error
    a = np.zeros((200, 300, 3), np.uint8)
    b = np.zeros((210, 300, 3), np.uint8)
    pa = os.path.join(tmpdir, "fa.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "fb.png"); _w(pb, b)
    with pytest.raises(ValueError):
        run_ssim_assessment(pa, pb, calculate_on_color=True, auto_switch=False, win_size=11, data_range=None)


# ---------------------------
# 2) Trend tests: Noise / JPEG
# ---------------------------
@pytest.mark.parametrize("sigmas", [[3, 8, 16, 24]])
def test_noise_trend_non_increasing(tmpdir, sigmas):
    base = np.full((240, 320, 3), 127, np.uint8)
    pref = os.path.join(tmpdir, "noise_ref.png"); _w(pref, base)

    scores = []
    for s in sigmas:
        noise = np.random.normal(0, s, base.shape).astype(np.int16)
        img = np.clip(base.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        p = os.path.join(tmpdir, f"noise_{s}.png"); _w(p, img)
        out = compute_ssim(pref, p, out_root=tmpdir)  # auto mode
        scores.append(float(out["score"]))

    # SSIM ไม่ควร "เพิ่ม" เมื่อ noise มากขึ้น (allow tolerance เล็กน้อย)
    for i in range(1, len(scores)):
        assert scores[i] <= scores[i-1] + 0.02, f"SSIM should not increase with more noise: {scores}"


@pytest.mark.parametrize("qualities", [[100, 90, 70, 50, 30]])
def test_jpeg_trend_non_increasing(tmpdir, qualities):
    base = np.random.randint(0, 256, (240, 320, 3), np.uint8)
    pref = os.path.join(tmpdir, "jpeg_ref.jpg"); _w(pref, base)

    scores = []
    for q in qualities:
        p = os.path.join(tmpdir, f"q{q}.jpg")
        cv2.imwrite(p, base, [int(cv2.IMWRITE_JPEG_QUALITY), q])
        out = compute_ssim(pref, p, out_root=tmpdir)  # auto mode
        scores.append(float(out["score"]))

    for i in range(1, len(scores)):
        assert scores[i] <= scores[i-1] + 0.02, f"SSIM should not increase when JPEG quality decreases: {scores}"


# ---------------------------
# 3) Mode behavior & Gray/BGR handling
# ---------------------------
def test_auto_mode_color_if_both_color(tmpdir):
    # Auto (default): ถ้าทั้งคู่เป็นสี -> ควรใช้ "Color (Multi-channel)"
    a = np.random.randint(0, 256, (180, 220, 3), np.uint8)
    b = np.clip(a.astype(np.int16) + 5, 0, 255).astype(np.uint8)
    pa = os.path.join(tmpdir, "auto_col_a.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "auto_col_b.png"); _w(pb, b)

    score, mode, msg, _ = run_ssim_assessment(pa, pb, calculate_on_color=False, auto_switch=True, data_range=None)
    assert mode == "Color (Multi-channel)"
    assert 0.0 <= float(score) <= 1.0
    assert msg.startswith("SSIM calculation successful")


def test_auto_mode_fallsback_to_gray_if_one_is_gray(tmpdir):
    # Auto (default): ถ้ามี Gray อย่างน้อยหนึ่ง -> ควรใช้ Grayscale
    a = np.random.randint(0, 256, (180, 220, 3), np.uint8)
    g = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    pa = os.path.join(tmpdir, "auto_gray_col.png"); _w(pa, a)
    pg = os.path.join(tmpdir, "auto_gray_g.png");  _w(pg, g)

    score, mode, msg, _ = run_ssim_assessment(pa, pg, calculate_on_color=False, auto_switch=True, data_range=None)
    assert mode == "Grayscale"
    assert 0.0 <= float(score) <= 1.0


def test_force_grayscale_mode(tmpdir):
    # บังคับ Grayscale เสมอ
    a = np.random.randint(0, 256, (160, 200, 3), np.uint8)
    b = np.clip(a.astype(np.int16) + 7, 0, 255).astype(np.uint8)
    pa = os.path.join(tmpdir, "force_g_a.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "force_g_b.png"); _w(pb, b)

    score, mode, _, _ = run_ssim_assessment(pa, pb, calculate_on_color=False, auto_switch=False, data_range=None)
    assert mode == "Grayscale"
    assert 0.0 <= float(score) <= 1.0


def test_force_color_mode(tmpdir):
    # บังคับ Color (ทั้งคู่ต้องเป็นสีและขนาดเท่ากัน)
    a = np.random.randint(0, 256, (160, 200, 3), np.uint8)
    b = np.clip(a.astype(np.int16) + 7, 0, 255).astype(np.uint8)
    pa = os.path.join(tmpdir, "force_c_a.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "force_c_b.png"); _w(pb, b)

    score, mode, _, _ = run_ssim_assessment(pa, pb, calculate_on_color=True, auto_switch=False, data_range=None, win_size=11)
    assert mode == "Color (Multi-channel)"
    assert 0.0 <= float(score) <= 1.0


def test_gray_vs_bgr_default_does_not_error(tmpdir):
    # โหมด default (auto) ต้อง handle gray vs bgr ได้ (แปลงเป็น gray)
    color = np.random.randint(0, 256, (200, 300, 3), np.uint8)
    gray  = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
    pc = os.path.join(tmpdir, "graybgr_c.png"); _w(pc, color)
    pg = os.path.join(tmpdir, "graybgr_g.png"); _w(pg, gray)

    out = compute_ssim(pg, pc, out_root=tmpdir)  # default auto
    assert 0.0 <= float(out["score"]) <= 1.0


# ---------------------------
# 4) Alpha handling / Dynamic range
# ---------------------------
def test_bgra_vs_bgr_equal_after_alpha_drop(tmpdir):
    # BGRA ถูกตัด alpha อัตโนมัติ -> คะแนนควรเท่ากับ BGR
    bgr  = np.random.randint(0, 256, (160, 200, 3), np.uint8)
    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    bgr2 = np.clip(bgr.astype(np.int16) + 10, 0, 255).astype(np.uint8)
    bgra2 = cv2.cvtColor(bgr2, cv2.COLOR_BGR2BGRA)

    p3 = os.path.join(tmpdir, "bgr.png");  _w(p3, bgr)
    p4 = os.path.join(tmpdir, "bgra.png"); _w(p4, bgra)
    p3b = os.path.join(tmpdir, "bgr2.png"); _w(p3b, bgr2)
    p4b = os.path.join(tmpdir, "bgra2.png"); _w(p4b, bgra2)

    out_bgr  = compute_ssim(p3, p3b, out_root=tmpdir)    # auto (Color)
    out_bgra = compute_ssim(p4, p4b, out_root=tmpdir)    # auto -> drop alpha -> Color
    assert abs(float(out_bgr["score"]) - float(out_bgra["score"])) < 1e-6


def test_dynamic_range_uint8_uint16_float(tmpdir):
    # uint8
    g8  = np.random.randint(0, 256, (128, 160), np.uint8)
    g8b = np.clip(g8.astype(np.int16) + 4, 0, 255).astype(np.uint8)
    p8a = os.path.join(tmpdir, "g8a.png"); _w(p8a, g8)
    p8b = os.path.join(tmpdir, "g8b.png"); _w(p8b, g8b)
    s1 = compute_ssim(p8a, p8b, out_root=tmpdir)["score"]

    # uint16 (scale ค่าขึ้น 256 เท่า)
    g16  = (g8.astype(np.uint16) * 256).astype(np.uint16)
    g16b = (g8b.astype(np.uint16) * 256).astype(np.uint16)
    p16a = os.path.join(tmpdir, "g16a.tiff"); _w(p16a, g16)
    p16b = os.path.join(tmpdir, "g16b.tiff"); _w(p16b, g16b)
    s2 = compute_ssim(p16a, p16b, out_root=tmpdir)["score"]

    # float [0,1] -> เซฟเป็น 8-bit เพื่อโหลดง่าย (adapter จะ auto data_range)
    gf  = g8.astype(np.float32)/255.0
    gfb = g8b.astype(np.float32)/255.0
    pfa = os.path.join(tmpdir, "fa.png"); _w(pfa, (gf*255).astype(np.uint8))
    pfb = os.path.join(tmpdir, "fb.png"); _w(pfb, (gfb*255).astype(np.uint8))
    s3 = compute_ssim(pfa, pfb, out_root=tmpdir)["score"]

    # ค่า SSIM ควร "สอดคล้อง" กันพอสมควร (อาจไม่เท่ากันเป๊ะ)
    assert abs(float(s1) - float(s2)) < 0.05
    assert abs(float(s1) - float(s3)) < 0.1


# ---------------------------
# 5) win_size clamping / JSON schema
# ---------------------------
def test_small_image_win_size_clamp(tmpdir):
    # ขอ win_size ใหญ่เกิน รูปเล็ก -> adapter ต้อง clamp ลงและคำนวณได้
    a = np.random.randint(0, 256, (9, 9), np.uint8)
    b = np.clip(a.astype(np.int16) + 1, 0, 255).astype(np.uint8)
    pa = os.path.join(tmpdir, "sa.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "sb.png"); _w(pb, b)
    score, mode, msg, _ = run_ssim_assessment(pa, pb, calculate_on_color=False, auto_switch=True, win_size=99, data_range=None)
    assert 0.0 <= float(score) <= 1.0
    assert msg.startswith("SSIM calculation successful")


def test_output_json_schema(tmpdir):
    a = np.random.randint(0, 256, (120, 160, 3), np.uint8)
    b = np.clip(a.astype(np.int16) + 3, 0, 255).astype(np.uint8)
    pa = os.path.join(tmpdir, "ja.png"); _w(pa, a)
    pb = os.path.join(tmpdir, "jb.png"); _w(pb, b)

    out = compute_ssim(pa, pb, out_root=tmpdir)  # auto mode
    jp = out["json_path"]
    assert os.path.exists(jp)

    with open(jp, "r", encoding="utf-8") as f:
        data = json.load(f)

    for key in ["tool", "tool_info", "images", "params_used", "color_mode_used_for_ssim", "score", "score_interpretation"]:
        assert key in data

    assert data["tool"] == "SSIM"
    assert 0.0 <= float(data["score"]) <= 1.0

    # ตรวจ params_used ว่ามี field สำคัญ (อาจถูก auto ปรับ)
    pr = data["params_used"]
    for k in ["win_size", "gaussian_weights", "K1", "K2", "data_range"]:
        assert k in pr