# tests/test_surf_properties.py
import os
import json
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

# นำเข้า run และตัวโมดูลเพื่อ monkeypatch BASE_DIR ได้
from server.algos.feature.surf_adapter import run as surf_run
import server.algos.feature.surf_adapter as surf_mod

# ======================
# SKIP ทั้งไฟล์ถ้าไม่มี SURF (ต้องใช้ opencv-contrib-python)
# ======================
SURF_AVAILABLE = hasattr(cv2, "xfeatures2d") and hasattr(cv2.xfeatures2d, "SURF_create")
pytestmark = pytest.mark.skipif(not SURF_AVAILABLE, reason="SURF not available. Install opencv-contrib-python.")

# ======================
# Fixtures: รูปสำหรับทดสอบ
# ======================

@pytest.fixture(autouse=True)
def use_tmp_output_dir(tmp_path):
    """
    ทำให้ทุกเทสเขียนไฟล์ลง tmp_path (ไม่ไปปน BASE_DIR ของจริง)
    """
    old = surf_mod.BASE_DIR
    surf_mod.BASE_DIR = str(tmp_path)
    yield
    surf_mod.BASE_DIR = old

@pytest.fixture()
def textured_img(tmp_path) -> str:
    """ภาพสังเคราะห์ที่มี texture เพียงพอให้ SURF เจอคีย์พอยต์"""
    path = tmp_path / "textured.jpg"
    h, w = 360, 360
    img = np.zeros((h, w, 3), dtype=np.uint8)

    # ลวดลาย
    for i in range(10, min(h, w), 20):
        cv2.line(img, (i, 0), (w - 1 - i, h - 1), (255, 255, 255), 1)
        cv2.rectangle(img, (i, i), (i + 12, i + 12), (180, 180, 180), -1)
        cv2.circle(img, (w // 2, i), 10, (220, 220, 220), 2)
    cv2.putText(img, "SURF", (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (200, 200, 200), 2, cv2.LINE_AA)

    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def large_img(tmp_path) -> str:
    """ภาพใหญ่ (HD) พร้อม texture"""
    path = tmp_path / "large.jpg"
    h, w = 1080, 1920
    img = np.zeros((h, w, 3), dtype=np.uint8)

    step = 40
    for y in range(0, h, step):
        cv2.line(img, (0, y), (w - 1, y), (255, 255, 255), 1)
    for x in range(0, w, step):
        cv2.line(img, (x, 0), (x, h - 1), (255, 255, 255), 1)
    cv2.putText(img, "BIG SURF", (50, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 5, (200, 200, 200), 10, cv2.LINE_AA)

    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def gray_img(tmp_path) -> str:
    path = tmp_path / "gray.png"
    g = np.zeros((256, 256), dtype=np.uint8)
    cv2.circle(g, (128, 128), 60, 200, -1)
    cv2.line(g, (32, 32), (224, 200), 150, 3)
    cv2.imwrite(str(path), g)
    return str(path)

@pytest.fixture()
def bgra_img(tmp_path) -> str:
    path = tmp_path / "bgra.png"
    bgr = np.zeros((256, 256, 3), dtype=np.uint8)
    bgr[:] = (10, 20, 30)
    cv2.rectangle(bgr, (40, 40), (200, 200), (220, 220, 220), -1)
    a = np.full((256, 256, 1), 255, dtype=np.uint8)
    bgra = np.concatenate([bgr, a], axis=2)
    cv2.imwrite(str(path), bgra)
    return str(path)

@pytest.fixture()
def non_image_file(tmp_path) -> str:
    p = tmp_path / "not_image.txt"
    p.write_text("this is not an image")
    return str(p)

# ======================
# Helpers
# ======================

def _load_json(p: str) -> dict:
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def _extract_pts_and_des(payload: dict):
    """
    SURF ของคุณเก็บ descriptor ไว้ในแต่ละ keypoint record (ไม่มี top-level 'descriptors')
    """
    kps = payload.get("keypoints", [])
    if not kps:
        return np.empty((0, 2), np.float32), np.empty((0, payload.get("descriptor_dim", 64)), np.float32)
    pts = np.array([[kp["x"], kp["y"]] for kp in kps], dtype=np.float32)
    des = np.array([kp["descriptor"] for kp in kps], dtype=np.float32)
    return pts, des

def _inlier_ratio_via_homography(pts1, des1, pts2, des2, ratio_thresh=0.75, ransac_reproj_thresh=3.0):
    """KNN + Lowe ratio -> Homography RANSAC -> inlier ratio"""
    if des1.size == 0 or des2.size == 0:
        return 0.0, 0
    bf = cv2.BFMatcher(cv2.NORM_L2)
    knn = bf.knnMatch(des1, des2, k=2)
    good = []
    for pair in knn:
        if len(pair) < 2:  # ป้องกัน corner-case
            continue
        m, n = pair
        if m.distance < ratio_thresh * n.distance:
            good.append(m)
    good_count = len(good)
    if good_count < 4:
        return 0.0, good_count

    src = np.float32([pts1[m.queryIdx] for m in good])
    dst = np.float32([pts2[m.trainIdx] for m in good])
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, ransac_reproj_thresh)
    if mask is None:
        return 0.0, good_count
    inlier_ratio = float(mask.sum()) / good_count
    return inlier_ratio, good_count

# ======================
# 0) Availability / Error handling
# ======================

def test_invalid_path_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        surf_run(str(tmp_path / "does_not_exist.png"))

# ======================
# 1) Descriptor / Schema sanity
# ======================

def test_descriptor_dim_and_dtype_default(tmp_path, textured_img):
    j, _ = surf_run(textured_img)
    d = _load_json(j)
    pts, des = _extract_pts_and_des(d)

    # default: extended=False => descriptor_dim = 64
    assert d["descriptor_dim"] == 64
    if des.size > 0:
        assert des.shape[1] == 64
        assert des.dtype == np.float32
        assert np.all(np.isfinite(des))

def test_extended_descriptor_dim(tmp_path, textured_img):
    j, _ = surf_run(textured_img, extended=True)
    d = _load_json(j)
    pts, des = _extract_pts_and_des(d)

    assert d["descriptor_dim"] == 128
    if des.size > 0:
        assert des.shape[1] == 128
        assert des.dtype == np.float32

def test_upright_affects_angles(tmp_path, textured_img):
    j_u, _ = surf_run(textured_img, upright=True)
    d_u = _load_json(j_u)
    angles = np.array([kp["angle"] for kp in d_u["keypoints"]], dtype=np.float32)
    if angles.size == 0:
        pytest.skip("No keypoints to assess upright behavior")

    # circular concentration: R = |mean(exp(i*theta))|
    theta = np.deg2rad(angles % 360.0)
    C = np.cos(theta).mean()
    S = np.sin(theta).mean()
    R = np.hypot(C, S)  # 0..1, ยิ่งใกล้ 1 ยิ่งกระจุกตัว
    assert R >= 0.95, f"Angles are not concentrated under upright=True (R={R:.3f})"

def test_schema_fields_present(tmp_path, textured_img):
    j, _ = surf_run(textured_img)
    p = _load_json(j)
    required = [
        "tool", "image", "surf_parameters_used",
        "num_keypoints", "descriptor_dim", "keypoints"
    ]
    for k in required:
        assert k in p, f"Missing key: {k}"
    assert p["num_keypoints"] == len(p["keypoints"])

# ======================
# 1.5) Parameter echo: ตั้งค่าแล้วต้องสะท้อนใน JSON
# ======================

def test_parameter_echo_in_schema(tmp_path, textured_img):
    j, _ = surf_run(
        textured_img,
        hessianThreshold=250,
        nOctaves=5,
        nOctaveLayers=4,
        extended=True,
        upright=False
    )
    p = _load_json(j)["surf_parameters_used"]
    assert abs(p["hessianThreshold"] - 250) < 1e-9
    assert p["nOctaves"] == 5
    assert p["nOctaveLayers"] == 4
    assert p["extended"] is True
    assert p["upright"] is False

# ======================
# 2) Input variations
# ======================

def test_grayscale_input(tmp_path, gray_img):
    j, _ = surf_run(gray_img)
    d = _load_json(j)
    assert d["num_keypoints"] == len(d["keypoints"])

def test_bgra_input(tmp_path, bgra_img):
    j, _ = surf_run(bgra_img)
    d = _load_json(j)
    assert d["num_keypoints"] == len(d["keypoints"])

# ======================
# 3) Parameter effects
# ======================

def test_hessian_threshold_monotonicity(tmp_path, textured_img):
    # threshold สูงขึ้น -> ควรคัด keypoints ออกมากขึ้น หรือเท่าเดิม (ไม่ควรเพิ่ม)
    j_low, _ = surf_run(textured_img, hessianThreshold=100)
    j_hi,  _ = surf_run(textured_img, hessianThreshold=1000)
    d_low, d_hi = _load_json(j_low), _load_json(j_hi)
    assert d_low["num_keypoints"] >= d_hi["num_keypoints"]

def test_nOctaves_effect(tmp_path, textured_img):
    # เพิ่มจำนวน octave (รองรับสเกลกว้างขึ้น) โดยทั่วไปไม่ควรทำให้คีย์พอยต์ "น้อยลงอย่างมีนัย"
    j_small, _ = surf_run(textured_img, nOctaves=2)
    j_big,   _ = surf_run(textured_img, nOctaves=6)
    d_small, d_big = _load_json(j_small), _load_json(j_big)
    assert d_big["num_keypoints"] >= int(d_small["num_keypoints"] * 0.8)

def test_nOctaveLayers_effect(tmp_path, textured_img):
    # เพิ่มชั้นต่อ octave มักเพิ่มโอกาสตรวจจับ → จำนวนคีย์พอยต์ไม่ควรลดลงอย่างมีนัย
    j_small, _ = surf_run(textured_img, nOctaveLayers=2)
    j_big,   _ = surf_run(textured_img, nOctaveLayers=5)
    d_small, d_big = _load_json(j_small), _load_json(j_big)
    assert d_big["num_keypoints"] >= int(d_small["num_keypoints"] * 0.8)

# ======================
# 4) Determinism
# ======================

def test_determinism_num_and_dim(tmp_path, textured_img):
    j1, _ = surf_run(textured_img)
    j2, _ = surf_run(textured_img)
    d1, d2 = _load_json(j1), _load_json(j2)
    assert d1["num_keypoints"] == d2["num_keypoints"]
    assert d1["descriptor_dim"] == d2["descriptor_dim"]

# ======================
# 5) Invariance / Robustness (STRICT)
# ======================

def test_rotation_invariance(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    h, w = src.shape[:2]
    M = cv2.getRotationMatrix2D((w//2, h//2), 45, 1.0)
    rotated = cv2.warpAffine(src, M, (w, h))
    rot_path = str(tmp_path / "rot.jpg")
    cv2.imwrite(rot_path, rotated)

    j1, _ = surf_run(textured_img)
    j2, _ = surf_run(rot_path)
    d1, d2 = _load_json(j1), _load_json(j2)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)

    ratio, good = _inlier_ratio_via_homography(pts1, des1, pts2, des2)
    if good < 25:
        pytest.skip(f"Too few good matches to assess rotation invariance (good={good})")
    assert ratio >= 0.25, f"inlier ratio too low: {ratio:.2f} (good={good})"

def test_scale_invariance(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    scaled = cv2.resize(src, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    sc_path = str(tmp_path / "scaled.jpg")
    cv2.imwrite(sc_path, scaled)

    j1, _ = surf_run(textured_img)
    j2, _ = surf_run(sc_path)
    d1, d2 = _load_json(j1), _load_json(j2)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)

    ratio, good = _inlier_ratio_via_homography(pts1, des1, pts2, des2)
    if good < 25:
        pytest.skip(f"Too few good matches to assess scale invariance (good={good})")
    assert ratio >= 0.30, f"inlier ratio too low: {ratio:.2f} (good={good})"

def test_illumination_robustness(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    brighter = cv2.convertScaleAbs(src, alpha=1.0, beta=25)
    br_path = str(tmp_path / "brighter.jpg")
    cv2.imwrite(br_path, brighter)

    j1, _ = surf_run(textured_img)
    j2, _ = surf_run(br_path)
    d1, d2 = _load_json(j1), _load_json(j2)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)

    ratio, good = _inlier_ratio_via_homography(pts1, des1, pts2, des2)
    if good < 25:
        pytest.skip(f"Too few good matches to assess illumination robustness (good={good})")
    assert ratio >= 0.35, f"inlier ratio too low: {ratio:.2f} (good={good})"

def test_noise_robustness(tmp_path, textured_img):
    np.random.seed(0)
    src = cv2.imread(textured_img)
    noise = np.random.normal(0, 10, src.shape).astype(np.int16)
    noisy = np.clip(src.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    nz_path = str(tmp_path / "noisy.jpg")
    cv2.imwrite(nz_path, noisy)

    j1, _ = surf_run(textured_img)
    j2, _ = surf_run(nz_path)
    d1, d2 = _load_json(j1), _load_json(j2)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)

    ratio, good = _inlier_ratio_via_homography(pts1, des1, pts2, des2)
    if good < 25:
        pytest.skip(f"Too few good matches to assess noise robustness (good={good})")
    assert ratio >= 0.25, f"inlier ratio too low: {ratio:.2f} (good={good})"

# ======================
# 6) File output behavior
# ======================

def test_out_dir_structure(tmp_path, textured_img):
    j, v = surf_run(textured_img)
    # ต้องอยู่ใต้ <tmp>/surf_outputs/ ตามที่ monkeypatch BASE_DIR ไว้
    assert str(tmp_path) in j and "surf_outputs" in j
    assert str(tmp_path) in v and "surf_outputs" in v
    assert os.path.exists(j) and os.path.exists(v)

def test_unique_filenames_for_same_image(tmp_path, textured_img):
    j1, v1 = surf_run(textured_img)
    j2, v2 = surf_run(textured_img)
    assert j1 != j2 and v1 != v2
    assert os.path.exists(j1) and os.path.exists(j2)

# ======================
# 7) Performance sanity
# ======================

def test_runtime_under_budget(tmp_path, textured_img):
    t0 = time.perf_counter()
    j, _ = surf_run(textured_img)
    _ = _load_json(j)
    dt = time.perf_counter() - t0
    assert dt < 5.0, f"SURF took too long: {dt:.2f}s"

def test_large_image_runtime_and_output(tmp_path, large_img):
    t0 = time.perf_counter()
    j, v = surf_run(large_img, hessianThreshold=300)  # ลด threshold เพื่อให้เจอ keypoints มากขึ้น
    dt = time.perf_counter() - t0

    d = _load_json(j)
    assert os.path.exists(j) and os.path.exists(v)
    assert d["num_keypoints"] > 100
    assert dt < 15.0, f"SURF on large image too slow: {dt:.2f}s"