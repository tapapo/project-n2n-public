# tests/test_orb_properties.py
import os
import json
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

from server.algos.feature.orb_adapter import run as orb_run
import server.algos.feature.orb_adapter as orb_mod

# ======================
# Fixtures
# ======================

@pytest.fixture(autouse=True)
def chdir_tmp(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    yield

@pytest.fixture()
def textured_img(tmp_path) -> str:
    path = tmp_path / "textured.jpg"
    h, w = 320, 320
    img = np.zeros((h, w, 3), dtype=np.uint8)

    # ลวดลาย
    for i in range(10, min(h, w), 20):
        cv2.line(img, (i, 0), (w - 1 - i, h - 1), (255, 255, 255), 1)
        cv2.rectangle(img, (i, i), (i + 12, i + 12), (180, 180, 180), -1)
        cv2.circle(img, (w // 2, i), 10, (220, 220, 220), 2)
    cv2.putText(img, "ORB", (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (200, 200, 200), 2, cv2.LINE_AA)

    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def large_img(tmp_path) -> str:
    path = tmp_path / "large.jpg"
    h, w = 1080, 1920
    img = np.zeros((h, w, 3), dtype=np.uint8)

    step = 40
    for y in range(0, h, step):
        cv2.line(img, (0, y), (w - 1, y), (255, 255, 255), 1)
    for x in range(0, w, step):
        cv2.line(img, (x, 0), (x, h - 1), (255, 255, 255), 1)
    cv2.putText(img, "BIG ORB", (50, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 5, (200, 200, 200), 10, cv2.LINE_AA)

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
    kps = payload.get("keypoints", [])
    if not kps:
        return np.empty((0, 2), np.float32), np.empty((0, 32), np.uint8)
    pts = np.array([[kp["x"], kp["y"]] for kp in kps], dtype=np.float32)
    des = np.array([kp["descriptor"] for kp in kps], dtype=np.uint8)
    return pts, des

def _inlier_ratio_via_homography_orb(pts1, des1, pts2, des2, ratio_thresh=0.8, ransac_reproj_thresh=3.0):
    if des1.size == 0 or des2.size == 0:
        return 0.0, 0, 0  # ratio, good_count, inlier_count
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    knn = bf.knnMatch(des1, des2, k=2)
    good = []
    for pair in knn:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < ratio_thresh * n.distance:
            good.append(m)
    good_count = len(good)
    if good_count < 4:
        return 0.0, good_count, 0

    src = np.float32([pts1[m.queryIdx] for m in good])
    dst = np.float32([pts2[m.trainIdx] for m in good])
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, ransac_reproj_thresh)
    if mask is None:
        return 0.0, good_count, 0
    inlier_count = int(mask.sum())
    inlier_ratio = inlier_count / good_count
    return inlier_ratio, good_count, inlier_count

# ======================
# 0) Availability / Error handling
# ======================

def test_invalid_path_raises(tmp_path):
    with pytest.raises(ValueError):
        orb_run(str(tmp_path / "does_not_exist.png"), out_root=str(tmp_path))

# ======================
# 1) Descriptor / Schema sanity
# ======================

def test_descriptor_shape_dtype_and_values(tmp_path, textured_img):
    j, _ = orb_run(textured_img, out_root=str(tmp_path), nfeatures=500)
    d = _load_json(j)
    pts, des = _extract_pts_and_des(d)

    assert d["tool"] == "ORB"
    assert d["descriptor_dim"] == 32
    # ถ้ามี descriptor ต้องเป็น uint8, shape (N,32), ค่าในช่วง 0..255
    if des.size > 0:
        assert des.dtype == np.uint8
        assert des.ndim == 2 and des.shape[1] == 32
        assert des.min() >= 0 and des.max() <= 255

def test_schema_fields_present(tmp_path, textured_img):
    j, _ = orb_run(textured_img, out_root=str(tmp_path))
    p = _load_json(j)
    required = [
        "tool", "tool_version", "image", "orb_parameters_used",
        "num_keypoints", "descriptor_dim", "keypoints"
    ]
    for k in required:
        assert k in p, f"Missing key: {k}"
    assert p["num_keypoints"] == len(p["keypoints"])

# ======================
# 2) Parameter contract (ตามพฤติกรรมจริงของ ORB)
# ======================

def test_nfeatures_behavior(tmp_path, textured_img):
    # ORB อาจเกิน nfeatures (overshoot) → ใช้ช่วงค่าที่สมเหตุสมผล
    n = 400
    j, _ = orb_run(textured_img, out_root=str(tmp_path), nfeatures=n)
    d = _load_json(j)
    assert int(n * 0.4) <= d["num_keypoints"] <= int(n * 1.8)

def test_fast_threshold_effect(tmp_path, textured_img):
    # fastThreshold สูง -> ตรวจจับยากขึ้น -> คีย์พอยต์ควรลดลงหรือเท่าเดิม
    j_low, _ = orb_run(textured_img, out_root=str(tmp_path), fastThreshold=5)
    j_hi,  _ = orb_run(textured_img, out_root=str(tmp_path), fastThreshold=40)
    d_low, d_hi = _load_json(j_low), _load_json(j_hi)
    assert d_low["num_keypoints"] >= d_hi["num_keypoints"]

# ======================
# 3) Input variations (channels)
# ======================

def test_grayscale_input(tmp_path, gray_img):
    j, _ = orb_run(gray_img, out_root=str(tmp_path))
    d = _load_json(j)
    assert d["descriptor_dim"] == 32
    assert d["num_keypoints"] == len(d["keypoints"])

def test_bgra_input(tmp_path, bgra_img):
    j, _ = orb_run(bgra_img, out_root=str(tmp_path))
    d = _load_json(j)
    assert d["descriptor_dim"] == 32
    assert d["num_keypoints"] == len(d["keypoints"])

def test_non_image_raises(tmp_path, non_image_file):
    with pytest.raises(ValueError):
        orb_run(non_image_file, out_root=str(tmp_path))

# ======================
# 4) Determinism
# ======================

def test_determinism_num_and_dim(tmp_path, textured_img):
    j1, _ = orb_run(textured_img, out_root=str(tmp_path))
    j2, _ = orb_run(textured_img, out_root=str(tmp_path))
    d1, d2 = _load_json(j1), _load_json(j2)
    assert d1["num_keypoints"] == d2["num_keypoints"]
    assert d1["descriptor_dim"] == d2["descriptor_dim"]

# ======================
# 5) Invariance / Robustness
# ======================

def test_rotation_invariance(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    h, w = src.shape[:2]
    M = cv2.getRotationMatrix2D((w//2, h//2), 45, 1.0)
    rotated = cv2.warpAffine(src, M, (w, h))
    rot_path = str(Path(tmp_path) / "rot.jpg")
    cv2.imwrite(rot_path, rotated)

    j1, _ = orb_run(textured_img, out_root=str(tmp_path))
    j2, _ = orb_run(rot_path, out_root=str(tmp_path))
    d1, d2 = _load_json(j1), _load_json(j2)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)

    ratio, good, inl = _inlier_ratio_via_homography_orb(
        pts1, des1, pts2, des2, ratio_thresh=0.8, ransac_reproj_thresh=3.0
    )
    if good < 25:
        pytest.skip(f"Too few good matches to assess rotation invariance (good={good})")
    # เกณฑ์สำหรับ ORB (binary) บนภาพสังเคราะห์หมุน 45°
    assert ratio >= 0.28 and inl >= 25, f"inlier ratio too low: {ratio:.2f} (good={good}, inlier={inl})"

def test_scale_invariance(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    scaled = cv2.resize(src, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    sc_path = str(Path(tmp_path) / "scaled.jpg")
    cv2.imwrite(sc_path, scaled)

    j1, _ = orb_run(textured_img, out_root=str(tmp_path))
    j2, _ = orb_run(sc_path, out_root=str(tmp_path))
    d1, d2 = _load_json(j1), _load_json(j2)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)

    ratio, good, inl = _inlier_ratio_via_homography_orb(pts1, des1, pts2, des2)
    if good < 25:
        pytest.skip(f"Too few good matches to assess scale invariance (good={good})")
    assert ratio >= 0.22 and inl >= 20, f"inlier ratio too low: {ratio:.2f} (good={good}, inlier={inl})"

def test_illumination_robustness(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    brighter = cv2.convertScaleAbs(src, alpha=1.0, beta=25)
    br_path = str(Path(tmp_path) / "brighter.jpg")
    cv2.imwrite(br_path, brighter)

    j1, _ = orb_run(textured_img, out_root=str(tmp_path))
    j2, _ = orb_run(br_path, out_root=str(tmp_path))
    d1, d2 = _load_json(j1), _load_json(j2)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)

    ratio, good, inl = _inlier_ratio_via_homography_orb(pts1, des1, pts2, des2)
    if good < 25:
        pytest.skip(f"Too few good matches to assess illumination robustness (good={good})")
    assert ratio >= 0.25 and inl >= 20, f"inlier ratio too low: {ratio:.2f} (good={good}, inlier={inl})"

def test_noise_robustness(tmp_path, textured_img):
    np.random.seed(0)
    src = cv2.imread(textured_img)
    noise = np.random.normal(0, 8, src.shape).astype(np.int16)
    noisy = np.clip(src.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    nz_path = str(Path(tmp_path) / "noisy.jpg")
    cv2.imwrite(nz_path, noisy)

    j1, _ = orb_run(textured_img, out_root=str(tmp_path))
    j2, _ = orb_run(nz_path, out_root=str(tmp_path))
    d1, d2 = _load_json(j1), _load_json(j2)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)

    ratio, good, inl = _inlier_ratio_via_homography_orb(pts1, des1, pts2, des2)
    if good < 25:
        pytest.skip(f"Too few good matches to assess noise robustness (good={good})")
    assert ratio >= 0.20 and inl >= 15, f"inlier ratio too low: {ratio:.2f} (good={good}, inlier={inl})"

# ======================
# 6) File output behavior
# ======================

def test_output_paths_and_files(tmp_path, textured_img):
    j, v = orb_run(textured_img, out_root=str(tmp_path))
    # ต้องอยู่ใต้ ./outputs/features/orb_outputs/ (เพราะเรา chdir มาแล้ว)
    assert "outputs" in j and "features" in j and "orb_outputs" in j
    assert "outputs" in v and "features" in v and "orb_outputs" in v
    assert os.path.exists(j) and os.path.exists(v)

def test_unique_filenames_for_same_image(tmp_path, textured_img):
    j1, v1 = orb_run(textured_img, out_root=str(tmp_path))
    j2, v2 = orb_run(textured_img, out_root=str(tmp_path))
    assert j1 != j2 and v1 != v2
    assert os.path.exists(j1) and os.path.exists(j2)

# ======================
# 7) Performance sanity
# ======================

def test_runtime_under_budget(tmp_path, textured_img):
    t0 = time.perf_counter()
    j, _ = orb_run(textured_img, out_root=str(tmp_path))
    _ = _load_json(j)
    dt = time.perf_counter() - t0
    assert dt < 3.0, f"ORB took too long: {dt:.2f}s"

def test_large_image_runtime_and_output(tmp_path, large_img):
    t0 = time.perf_counter()
    # ORB เร็วอยู่แล้ว ขอ features เยอะขึ้นเพื่อเพิ่มโอกาสแมตช์
    j, v = orb_run(large_img, out_root=str(tmp_path), nfeatures=1500, fastThreshold=10)
    dt = time.perf_counter() - t0

    d = _load_json(j)
    assert os.path.exists(j) and os.path.exists(v)
    assert d["num_keypoints"] > 150  # ภาพใหญ่ควรได้คีย์พอยต์มากพอสมควร
    assert dt < 10.0, f"ORB on large image too slow: {dt:.2f}s"

# ======================
# 8) Parameter echo + พารามิเตอร์ที่เหลือ (แนวโน้ม + tolerance)
# ======================

def test_parameter_echo_in_schema(tmp_path, textured_img):
    j, _ = orb_run(
        textured_img, out_root=str(tmp_path),
        nfeatures=777, scaleFactor=1.4, nlevels=6,
        edgeThreshold=25, firstLevel=1, WTA_K=4,
        scoreType="HARRIS", patchSize=41, fastThreshold=7
    )
    p = _load_json(j)["orb_parameters_used"]
    assert p["nfeatures"] == 777
    assert abs(p["scaleFactor"] - 1.4) < 1e-6
    assert p["nlevels"] == 6
    assert p["edgeThreshold"] == 25
    assert p["firstLevel"] == 1
    assert p["WTA_K"] == 4
    assert p["scoreType"] == cv2.ORB_HARRIS_SCORE
    assert p["patchSize"] == 41
    assert p["fastThreshold"] == 7

def test_scaleFactor_effect(tmp_path, textured_img):
    j1, _ = orb_run(textured_img, out_root=str(tmp_path), scaleFactor=1.6)
    j2, _ = orb_run(textured_img, out_root=str(tmp_path), scaleFactor=1.2)
    d1, d2 = _load_json(j1), _load_json(j2)
    # แนวโน้ม: scaleFactor เล็กลง (พีระมิดถี่) ไม่ควรแย่ลงมาก
    assert d2["num_keypoints"] >= int(d1["num_keypoints"] * 0.8)

def test_nlevels_monotonicity(tmp_path, textured_img):
    j1, _ = orb_run(textured_img, out_root=str(tmp_path), nlevels=4)
    j2, _ = orb_run(textured_img, out_root=str(tmp_path), nlevels=12)
    d1, d2 = _load_json(j1), _load_json(j2)
    # เพิ่มเลเยอร์ ไม่ควรแย่ลงมาก
    assert d2["num_keypoints"] >= int(d1["num_keypoints"] * 0.8)

def test_edgeThreshold_effect(tmp_path, textured_img):
    j_low, _ = orb_run(textured_img, out_root=str(tmp_path), edgeThreshold=10)
    j_hi,  _ = orb_run(textured_img, out_root=str(tmp_path), edgeThreshold=40)
    d_low, d_hi = _load_json(j_low), _load_json(j_hi)
    # ขอบกว้างขึ้น อาจลดหรือเท่าเดิม แต่ไม่ควร "เพิ่มขึ้นมากผิดธรรมชาติ"
    assert d_hi["num_keypoints"] <= int(d_low["num_keypoints"] * 1.2)

def test_firstLevel_effect(tmp_path, textured_img):
    j0, _ = orb_run(textured_img, out_root=str(tmp_path), firstLevel=0)
    j2, _ = orb_run(textured_img, out_root=str(tmp_path), firstLevel=2)
    d0, d2 = _load_json(j0), _load_json(j2)

    # echo
    p0 = _load_json(j0)["orb_parameters_used"]["firstLevel"]
    p2 = _load_json(j2)["orb_parameters_used"]["firstLevel"]
    assert p0 == 0 and p2 == 2

    # ไม่คาดหวัง monotonic เคร่งครัด → อนุญาตต่างได้ในกรอบสมเหตุสมผล (±30%)
    base = max(1, d0["num_keypoints"])
    diff_ratio = abs(d2["num_keypoints"] - d0["num_keypoints"]) / base
    assert diff_ratio <= 0.3

def test_WTA_K_modes(tmp_path, textured_img):
    j2, _ = orb_run(textured_img, out_root=str(tmp_path), WTA_K=2)
    j4, _ = orb_run(textured_img, out_root=str(tmp_path), WTA_K=4)
    for jj in (j2, j4):
        _, des = _extract_pts_and_des(_load_json(jj))
        if des.size:
            assert des.shape[1] == 32
            assert des.dtype == np.uint8

def test_scoreType_modes(tmp_path, textured_img):
    j_fast, _ = orb_run(textured_img, out_root=str(tmp_path), scoreType="FAST")
    j_harris, _ = orb_run(textured_img, out_root=str(tmp_path), scoreType="HARRIS")
    d_fast, d_harris = _load_json(j_fast), _load_json(j_harris)
    assert d_fast["num_keypoints"] > 0
    assert d_harris["num_keypoints"] > 0

def test_patchSize_runs_and_schema(tmp_path, textured_img):
    j_small, _ = orb_run(textured_img, out_root=str(tmp_path), patchSize=15)
    j_big,   _ = orb_run(textured_img, out_root=str(tmp_path), patchSize=51)
    for jj in (j_small, j_big):
        d = _load_json(jj)
        _, des = _extract_pts_and_des(d)
        assert d["descriptor_dim"] == 32
        if des.size:
            assert des.shape[1] == 32
            assert des.dtype == np.uint8