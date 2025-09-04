# tests/test_sift_properties.py
import os
import json
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

from server.algos.feature.sift_adapter import run as sift_run

# ======================
# Fixtures: รูปสำหรับทดสอบ
# ======================

@pytest.fixture()
def textured_img(tmp_path) -> str:
    """ภาพสังเคราะห์ที่มี texture เพียงพอให้ SIFT เจอคีย์พอยต์"""
    path = tmp_path / "textured.jpg"
    h, w = 320, 320
    img = np.zeros((h, w, 3), dtype=np.uint8)

    # ลวดลาย 
    for i in range(10, min(h, w), 20):
        cv2.line(img, (i, 0), (w - 1 - i, h - 1), (255, 255, 255), 1)
        cv2.rectangle(img, (i, i), (i + 12, i + 12), (180, 180, 180), -1)
        cv2.circle(img, (w // 2, i), 10, (220, 220, 220), 2)
    cv2.putText(img, "SIFT", (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (200, 200, 200), 2, cv2.LINE_AA)

    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def large_img(tmp_path) -> str:
    """ภาพใหญ่ (HD) พร้อม texture"""
    path = tmp_path / "large.jpg"
    h, w = 1080, 1920
    img = np.zeros((h, w, 3), dtype=np.uint8)

    # วาดลายเส้น/วงกลมเพื่อให้มี keypoints เพียงพอ
    step = 40
    for y in range(0, h, step):
        cv2.line(img, (0, y), (w - 1, y), (255, 255, 255), 1)
    for x in range(0, w, step):
        cv2.line(img, (x, 0), (x, h - 1), (255, 255, 255), 1)
    cv2.putText(img, "BIG SIFT", (50, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 5, (200, 200, 200), 10, cv2.LINE_AA)

    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def gray_img(tmp_path) -> str:
    """ภาพ grayscale"""
    path = tmp_path / "gray.png"
    g = np.zeros((256, 256), dtype=np.uint8)
    cv2.circle(g, (128, 128), 60, 200, -1)
    cv2.line(g, (32, 32), (224, 200), 150, 3)
    cv2.imwrite(str(path), g)
    return str(path)

@pytest.fixture()
def bgra_img(tmp_path) -> str:
    """ภาพ BGRA (4 channels)"""
    path = tmp_path / "bgra.png"
    bgr = np.zeros((256, 256, 3), dtype=np.uint8)
    bgr[:] = (10, 20, 30)
    cv2.rectangle(bgr, (40, 40), (200, 200), (220, 220, 220), -1)
    a = np.full((256, 256, 1), 255, dtype=np.uint8)  # alpha
    bgra = np.concatenate([bgr, a], axis=2)
    cv2.imwrite(str(path), bgra)
    return str(path)

@pytest.fixture()
def non_image_file(tmp_path) -> str:
    """ไฟล์ที่ 'มีอยู่จริง' แต่ไม่ใช่ภาพ"""
    p = tmp_path / "not_image.txt"
    p.write_text("this is not an image")
    return str(p)

# ======================
# Helpers
# ======================

def _load_json(p: str) -> dict:
    with open(p, "r") as f:
        return json.load(f)

def _bf_match_ratio(des1: np.ndarray, des2: np.ndarray) -> float:
    """สัดส่วนแมตช์แบบหลวม ๆ (ใช้ในเวอร์ชัน soft ถ้าจำเป็น)"""
    if des1.size == 0 or des2.size == 0:
        return 0.0
    bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=True)
    matches = bf.match(des1, des2)
    denom = max(1, min(len(des1), len(des2)))
    return len(matches) / denom

# ===== Helpers (strict) =====
def _load_kp_and_des(json_path: str):
    d = _load_json(json_path)
    kps = d["keypoints"]
    pts = np.array([[kp["x"], kp["y"]] for kp in kps], dtype=np.float32) if kps else np.empty((0, 2), np.float32)
    des = np.array(d["descriptors"], dtype=np.float32) if d["descriptors"] else np.empty((0, 128), np.float32)
    return pts, des

def _inlier_ratio_via_homography(pts1, des1, pts2, des2, ratio_thresh=0.75, ransac_reproj_thresh=3.0):
    """คำนวณ inlier ratio ด้วย KNN+Lowe ratio -> findHomography(RANSAC)"""
    if des1.size == 0 or des2.size == 0:
        return 0.0, 0  # ratio, good_count

    bf = cv2.BFMatcher(cv2.NORM_L2)
    knn = bf.knnMatch(des1, des2, k=2)
    good = []
    for m, n in knn:
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
# 1) Determinism / Repeatability
# ======================

def test_determinism_num_and_shape(tmp_path, textured_img):
    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    j2, _ = sift_run(textured_img, out_dir=tmp_path)

    d1, d2 = _load_json(j1), _load_json(j2)
    des1 = np.array(d1["descriptors"], dtype=np.float32)
    des2 = np.array(d2["descriptors"], dtype=np.float32)

    assert d1["num_keypoints"] == d2["num_keypoints"]
    assert des1.shape == des2.shape

# ======================
# 2) Parameter contract (มีอยู่ + ค่าตามที่ตั้ง)
# ======================

def test_nfeatures_is_close_to_target(tmp_path, textured_img):
    n = 50
    j, _ = sift_run(textured_img, out_dir=tmp_path, nfeatures=n)
    d = _load_json(j)
    # SIFT ของ OpenCV ให้ค่า "ใกล้เคียง" ไม่ใช่ strict cap
    assert abs(d["num_keypoints"] - n) <= 5

def test_defaults_present_in_schema(tmp_path, textured_img):
    j, _ = sift_run(textured_img, out_dir=tmp_path)
    d = _load_json(j)
    params = d["sift_parameters_used"]
    for key in ["nfeatures", "nOctaveLayers", "contrastThreshold", "edgeThreshold", "sigma"]:
        assert key in params

def test_parameter_echo_in_schema(tmp_path, textured_img):
    j, _ = sift_run(
        textured_img, out_dir=tmp_path,
        nfeatures=321, nOctaveLayers=5,
        contrastThreshold=0.08, edgeThreshold=6, sigma=2.0
    )
    p = _load_json(j)["sift_parameters_used"]
    assert p["nfeatures"] == 321
    assert p["nOctaveLayers"] == 5
    assert abs(p["contrastThreshold"] - 0.08) < 1e-9
    assert abs(p["edgeThreshold"] - 6) < 1e-9
    assert abs(p["sigma"] - 2.0) < 1e-9

# ======================
# 2.5) Parameter effects (แนวโน้ม + tolerance)
# ======================

def test_nOctaveLayers_effect(tmp_path, textured_img):
    j_lo, _ = sift_run(textured_img, out_dir=tmp_path, nOctaveLayers=2)
    j_hi, _ = sift_run(textured_img, out_dir=tmp_path, nOctaveLayers=5)
    d_lo, d_hi = _load_json(j_lo), _load_json(j_hi)
    # เลเยอร์มากขึ้น โดยทั่วไปไม่ควรได้คีย์พอยต์น้อยลงอย่างมีนัย
    assert d_hi["num_keypoints"] >= int(d_lo["num_keypoints"] * 0.8)

def test_contrastThreshold_effect(tmp_path, textured_img):
    j_lo, _ = sift_run(textured_img, out_dir=tmp_path, contrastThreshold=0.02)
    j_hi, _ = sift_run(textured_img, out_dir=tmp_path, contrastThreshold=0.1)
    d_lo, d_hi = _load_json(j_lo), _load_json(j_hi)
    # threshold สูงขึ้น → คัดเข้มขึ้น → คีย์พอยต์ควรลดลงหรือเท่าเดิม
    assert d_lo["num_keypoints"] >= d_hi["num_keypoints"]

def test_edgeThreshold_effect(tmp_path, textured_img):
    j_lo, _ = sift_run(textured_img, out_dir=tmp_path, edgeThreshold=2)
    j_hi, _ = sift_run(textured_img, out_dir=tmp_path, edgeThreshold=10)
    d_lo, d_hi = _load_json(j_lo), _load_json(j_hi)
    # edgeThreshold สูงขึ้น → ขอบที่ “กัน” กว้างขึ้น/ผ่อนลง → โดยทั่วไปคีย์พอยต์ “ไม่ควรลดลง”
    assert d_hi["num_keypoints"] >= d_lo["num_keypoints"]

def test_sigma_effect(tmp_path, textured_img):
    j_lo, _ = sift_run(textured_img, out_dir=tmp_path, sigma=1.2)
    j_hi, _ = sift_run(textured_img, out_dir=tmp_path, sigma=2.4)
    d_lo, d_hi = _load_json(j_lo), _load_json(j_hi)
    # sigma สูง เบลอขึ้น → จุดละเอียดหาย → จำนวนคีย์พอยต์มักลดลงหรือเท่าเดิม
    assert d_lo["num_keypoints"] >= d_hi["num_keypoints"]

# ======================
# 3) Descriptor sanity
# ======================

def test_descriptor_shape_dtype_and_finite(tmp_path, textured_img):
    j, _ = sift_run(textured_img, out_dir=tmp_path)
    d = _load_json(j)
    des = np.array(d["descriptors"], dtype=np.float32)

    if des.size == 0:
        pytest.skip("No descriptors; fixture did not produce keypoints on this run")

    assert des.dtype == np.float32
    assert des.ndim == 2
    assert des.shape[1] == 128
    assert np.all(np.isfinite(des))
    norms = np.linalg.norm(des, axis=1)
    assert np.all(norms > 0)

# ======================
# 4) Input variations (channels)
# ======================

def test_grayscale_input(tmp_path, gray_img):
    j, _ = sift_run(gray_img, out_dir=tmp_path)
    d = _load_json(j)
    assert d["descriptor_dim"] == 128
    assert d["num_keypoints"] == len(d["descriptors"]) == len(d["keypoints"])

def test_bgra_input(tmp_path, bgra_img):
    j, _ = sift_run(bgra_img, out_dir=tmp_path)
    d = _load_json(j)
    assert d["descriptor_dim"] == 128
    assert d["num_keypoints"] == len(d["descriptors"]) == len(d["keypoints"])

def test_non_image_raises(tmp_path, non_image_file):
    with pytest.raises(ValueError):
        sift_run(non_image_file, out_dir=tmp_path)

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

    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    j2, _ = sift_run(rot_path, out_dir=tmp_path)

    pts1, des1 = _load_kp_and_des(j1)
    pts2, des2 = _load_kp_and_des(j2)

    ratio, good = _inlier_ratio_via_homography(pts1, des1, pts2, des2, ratio_thresh=0.75, ransac_reproj_thresh=3.0)
    if good < 25:
        pytest.skip(f"Too few good matches to assess rotation invariance (good={good})")
    assert ratio >= 0.35, f"inlier ratio too low: {ratio:.2f} (good={good})"

def test_scale_invariance(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    scaled = cv2.resize(src, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    sc_path = str(tmp_path / "scaled.jpg")
    cv2.imwrite(sc_path, scaled)

    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    j2, _ = sift_run(sc_path, out_dir=tmp_path)

    pts1, des1 = _load_kp_and_des(j1)
    pts2, des2 = _load_kp_and_des(j2)

    ratio, good = _inlier_ratio_via_homography(pts1, des1, pts2, des2, ratio_thresh=0.75, ransac_reproj_thresh=3.0)
    if good < 25:
        pytest.skip(f"Too few good matches to assess scale invariance (good={good})")
    assert ratio >= 0.30, f"inlier ratio too low: {ratio:.2f} (good={good})"

def test_illumination_robustness(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    brighter = cv2.convertScaleAbs(src, alpha=1.0, beta=25)  # shift intensity เล็กน้อย
    br_path = str(tmp_path / "brighter.jpg")
    cv2.imwrite(br_path, brighter)

    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    j2, _ = sift_run(br_path, out_dir=tmp_path)

    pts1, des1 = _load_kp_and_des(j1)
    pts2, des2 = _load_kp_and_des(j2)

    ratio, good = _inlier_ratio_via_homography(pts1, des1, pts2, des2, ratio_thresh=0.75, ransac_reproj_thresh=3.0)
    if good < 25:
        pytest.skip(f"Too few good matches to assess illumination robustness (good={good})")
    assert ratio >= 0.35, f"inlier ratio too low: {ratio:.2f} (good={good})"

def test_noise_robustness(tmp_path, textured_img):
    np.random.seed(0)  # reproducible
    src = cv2.imread(textured_img)
    noise = np.random.normal(0, 10, src.shape).astype(np.int16)  # sigma=10
    noisy = np.clip(src.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    nz_path = str(tmp_path / "noisy.jpg")
    cv2.imwrite(nz_path, noisy)

    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    j2, _ = sift_run(nz_path, out_dir=tmp_path)

    pts1, des1 = _load_kp_and_des(j1)
    pts2, des2 = _load_kp_and_des(j2)

    ratio, good = _inlier_ratio_via_homography(pts1, des1, pts2, des2, ratio_thresh=0.75, ransac_reproj_thresh=3.0)
    if good < 25:
        pytest.skip(f"Too few good matches to assess noise robustness (good={good})")
    assert ratio >= 0.25, f"inlier ratio too low: {ratio:.2f} (good={good})"

# ======================
# 6) Output contract / JSON schema
# ======================

def test_json_schema_contract(tmp_path, textured_img):
    j, _ = sift_run(textured_img, out_dir=tmp_path)
    p = _load_json(j)

    required = [
        "tool", "tool_version", "image", "sift_parameters_used",
        "num_keypoints", "descriptor_dim", "keypoints", "descriptors"
    ]
    for k in required:
        assert k in p, f"Missing key: {k}"

    assert p["tool"] == "SIFT"
    assert p["descriptor_dim"] == 128
    assert p["num_keypoints"] == len(p["descriptors"]) == len(p["keypoints"])

    if p["num_keypoints"] > 0:
        kp = p["keypoints"][0]
        for kk in ["x", "y", "size", "angle", "response", "octave", "class_id", "descriptor"]:
            assert kk in kp

# ======================
# 7) File output behavior
# ======================

def test_out_dir_respected_and_subfolder(tmp_path, textured_img):
    j, v = sift_run(textured_img, out_dir=tmp_path)
    # ต้องอยู่ใต้ <out_dir>/sift_outputs/ จริง
    assert str(tmp_path) in j and "sift_outputs" in j
    assert str(tmp_path) in v and "sift_outputs" in v
    assert os.path.exists(j) and os.path.exists(v)

def test_unique_filenames_for_same_image(tmp_path, textured_img):
    j1, v1 = sift_run(textured_img, out_dir=tmp_path)
    j2, v2 = sift_run(textured_img, out_dir=tmp_path)
    assert j1 != j2 and v1 != v2
    assert os.path.exists(j1) and os.path.exists(j2)

# ======================
# 8) Performance sanity
# ======================

def test_runtime_under_budget(tmp_path, textured_img):
    t0 = time.perf_counter()
    j, _ = sift_run(textured_img, out_dir=tmp_path)
    _ = _load_json(j)
    dt = time.perf_counter() - t0
    # งบเวลาหลวม ๆ สำหรับภาพ 320x320 บนเครื่อง dev ทั่วไป
    assert dt < 5.0, f"SIFT took too long: {dt:.2f}s"

def test_large_image_runtime_and_output(tmp_path, large_img):
    t0 = time.perf_counter()
    j, v = sift_run(large_img, out_dir=tmp_path, nfeatures=1000)
    dt = time.perf_counter() - t0

    d = _load_json(j)

    # ต้องสร้างไฟล์ออกมาได้จริง
    assert os.path.exists(j)
    assert os.path.exists(v)

    # ต้องมี keypoints จำนวนมากพอสมควร (ขึ้นกับภาพ แต่ควร > 100)
    assert d["num_keypoints"] > 100

    # ต้องไม่กินเวลามากเกินไป (กำหนด tolerance เผื่อเครื่อง dev)
    assert dt < 15.0, f"SIFT on large image too slow: {dt:.2f}s"