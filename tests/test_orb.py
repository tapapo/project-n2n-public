import os
import json
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

from server.algos.feature.orb_adapter import run as orb_run

# 1. FIXTURES (Standard Set)

@pytest.fixture()
def textured_img(tmp_path) -> str:
    path = tmp_path / "orb_test.jpg"
    h, w = 320, 320
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for i in range(10, min(h, w), 20):
        cv2.line(img, (i, 0), (w - 1 - i, h - 1), (255, 255, 255), 1)
        cv2.rectangle(img, (i, i), (i + 12, i + 12), (180, 180, 180), -1)
        cv2.circle(img, (w // 2, i), 10, (220, 220, 220), 2)
    cv2.putText(img, "ORB TEST", (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (200, 200, 200), 2)
    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def large_img(tmp_path) -> str:
    path = tmp_path / "large_orb.jpg"
    h, w = 1080, 1920
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(0, h, 40):
        cv2.line(img, (0, y), (w, y), (200, 200, 200), 1)
    for x in range(0, w, 40):
        cv2.line(img, (x, 0), (x, h), (200, 200, 200), 1)
    cv2.putText(img, "HD ORB", (100, 500), cv2.FONT_HERSHEY_SIMPLEX, 4.0, (255, 255, 255), 5)
    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def gray_img(tmp_path) -> str:
    path = tmp_path / "gray.png"
    g = np.zeros((256, 256), dtype=np.uint8)
    cv2.circle(g, (128, 128), 60, 200, -1)
    cv2.imwrite(str(path), g)
    return str(path)

@pytest.fixture()
def bgra_img(tmp_path) -> str:
    path = tmp_path / "bgra.png"
    bgr = np.zeros((256, 256, 3), dtype=np.uint8)
    cv2.rectangle(bgr, (50, 50), (200, 200), (100, 150, 200), -1)
    alpha = np.full((256, 256, 1), 255, dtype=np.uint8)
    bgra = np.concatenate([bgr, alpha], axis=2)
    cv2.imwrite(str(path), bgra)
    return str(path)


def _load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _extract_pts_and_des(d: dict):
    kps = d.get("keypoints", [])
    if not kps:
        return np.empty((0, 2), dtype=np.float32), np.empty((0, 32), dtype=np.uint8)
    
    pts = np.array([[k["x"], k["y"]] for k in kps], dtype=np.float32)
    
    des_list = []
    for k in kps:
        if "descriptor" in k and k["descriptor"]:
             des_list.append(k["descriptor"])
    
    des = np.array(des_list, dtype=np.uint8) if des_list else np.empty((0, 32), dtype=np.uint8)
    return pts, des

def _check_matching_quality_orb(j1_path, j2_path, min_ratio=0.15):
    d1 = _load_json(j1_path)
    d2 = _load_json(j2_path)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)
    
    if des1.size == 0 or des2.size == 0: return False, 0.0
    
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    matches = bf.knnMatch(des1, des2, k=2)
    
    good = []
    for pair in matches:
        if len(pair) < 2: continue
        m, n = pair
        if m.distance < 0.8 * n.distance:
            good.append(m)
            
    if len(good) < 4: return False, 0.0
    
    src_pts = np.float32([pts1[m.queryIdx] for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([pts2[m.trainIdx] for m in good]).reshape(-1, 1, 2)
    
    M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    if mask is None: return False, 0.0
    
    ratio = sum(mask.ravel()) / len(good)
    return ratio >= min_ratio, ratio

# 2. BASIC & SCHEMA TESTS

def test_descriptor_properties(tmp_path, textured_img):
    """ORB ต้องได้ Descriptor ขนาด 32 bytes (256 bits) และเป็น uint8"""
    j, _ = orb_run(textured_img, out_dir=tmp_path)
    d = _load_json(j)
    
    assert d["tool"] == "ORB"
    assert d["descriptor_dim"] == 32
    
    _, des = _extract_pts_and_des(d)
    if des.size > 0:
        assert des.dtype == np.uint8
        assert des.shape[1] == 32
        assert des.max() <= 255

def test_schema_fields_present(tmp_path, textured_img):
    j, _ = orb_run(textured_img, out_dir=tmp_path)
    d = _load_json(j)
    required = ["tool", "image", "orb_parameters_used", "num_keypoints", "keypoints"]
    for k in required:
        assert k in d

def test_parameter_echo(tmp_path, textured_img):
    j, _ = orb_run(textured_img, out_dir=tmp_path, nfeatures=800, scoreType="HARRIS", WTA_K=3)
    d = _load_json(j)
    used = d["orb_parameters_used"]
    
    assert used["nfeatures"] == 800
    assert used["scoreType"] == "HARRIS"
    assert used["WTA_K"] == 3

# 3. INPUT VARIATIONS

def test_grayscale_input(tmp_path, gray_img):
    j, _ = orb_run(gray_img, out_dir=tmp_path)
    d = _load_json(j)
    assert d["num_keypoints"] > 0

def test_bgra_input(tmp_path, bgra_img):
    j, _ = orb_run(bgra_img, out_dir=tmp_path)
    d = _load_json(j)
    assert d["num_keypoints"] > 0

def test_invalid_path(tmp_path):
    with pytest.raises(FileNotFoundError):
        orb_run(str(tmp_path / "none.jpg"), out_dir=tmp_path)

# 4. CACHING LOGIC

def test_caching_same_input(tmp_path, textured_img):
    j1, v1 = orb_run(textured_img, out_dir=tmp_path, nfeatures=500)
    j2, v2 = orb_run(textured_img, out_dir=tmp_path, nfeatures=500)
    
    assert j1 == j2
    assert os.path.exists(j1)

def test_param_change_creates_new_file(tmp_path, textured_img):
    j1, _ = orb_run(textured_img, out_dir=tmp_path, nfeatures=500)
    j2, _ = orb_run(textured_img, out_dir=tmp_path, nfeatures=600)
    
    assert j1 != j2

# 5. ROBUSTNESS (ORB-Specific)

def test_rotation_invariance(tmp_path, textured_img):
    """ORB ออกแบบมาให้ทนทานต่อการหมุน (Oriented FAST)"""
    src = cv2.imread(textured_img)
    h, w = src.shape[:2]
    M = cv2.getRotationMatrix2D((w//2, h//2), 30, 1.0)
    rot_path = str(tmp_path / "rot_orb.jpg")
    cv2.imwrite(rot_path, cv2.warpAffine(src, M, (w, h)))

    j1, _ = orb_run(textured_img, out_dir=tmp_path)
    j2, _ = orb_run(rot_path, out_dir=tmp_path)
    
    passed, ratio = _check_matching_quality_orb(j1, j2)
    assert passed, f"Rotation Invariance Failed (Ratio: {ratio:.2f})"

def test_scale_invariance(tmp_path, textured_img):
    """ORB ใช้ Image Pyramid เพื่อจัดการ Scale"""
    src = cv2.imread(textured_img)
    scale_path = str(tmp_path / "scale_orb.jpg")
    cv2.imwrite(scale_path, cv2.resize(src, None, fx=0.7, fy=0.7))

    j1, _ = orb_run(textured_img, out_dir=tmp_path, nlevels=8)
    j2, _ = orb_run(scale_path, out_dir=tmp_path, nlevels=8)
    
    passed, ratio = _check_matching_quality_orb(j1, j2)
    assert passed, f"Scale Invariance Failed (Ratio: {ratio:.2f})"

# 6. PERFORMANCE

def test_performance_orb_is_fast(tmp_path, large_img):
    """ORB จุดเด่นคือความเร็ว (Fast) ต้องเร็วกว่า SIFT/SURF"""
    t0 = time.perf_counter()
    j, _ = orb_run(large_img, out_dir=tmp_path, nfeatures=1000)
    dt = time.perf_counter() - t0
    
    d = _load_json(j)
    assert dt < 5.0, f"ORB too slow: {dt:.2f}s"
    assert d["num_keypoints"] > 50

def test_fast_threshold_effect(tmp_path, textured_img):
    j_low, _ = orb_run(textured_img, out_dir=tmp_path, fastThreshold=10)
    j_hi, _ = orb_run(textured_img, out_dir=tmp_path, fastThreshold=50)
    
    d_low = _load_json(j_low)
    d_hi = _load_json(j_hi)
    
    assert d_low["num_keypoints"] >= d_hi["num_keypoints"]

# 7. EXTRA PARAMETER TESTS (เพิ่มใหม่)

def test_nlevels_effect(tmp_path, textured_img):
    """ทดสอบการเพิ่ม nlevels (Pyramid layers)"""
    j_low, _ = orb_run(textured_img, out_dir=tmp_path, nlevels=4)
    j_std, _ = orb_run(textured_img, out_dir=tmp_path, nlevels=8)
    
    d_low = _load_json(j_low)
    d_std = _load_json(j_std)
    
    assert d_std["num_keypoints"] >= int(d_low["num_keypoints"] * 0.8)

def test_wta_k_modes(tmp_path, textured_img):
    """ทดสอบโหมด WTA_K (2, 3, 4)"""
    j2, _ = orb_run(textured_img, out_dir=tmp_path, WTA_K=2)
    j4, _ = orb_run(textured_img, out_dir=tmp_path, WTA_K=4)
    
    d2 = _load_json(j2)
    d4 = _load_json(j4)
    
    assert d2["descriptor_dim"] == 32
    assert d4["descriptor_dim"] == 32

def test_score_type_harris_vs_fast(tmp_path, textured_img):
    """ทดสอบ Score Type ที่ต่างกัน (HARRIS vs FAST)"""
    j_fast, _ = orb_run(textured_img, out_dir=tmp_path, scoreType="FAST")
    j_harris, _ = orb_run(textured_img, out_dir=tmp_path, scoreType="HARRIS")
    
    d_fast = _load_json(j_fast)
    d_harris = _load_json(j_harris)
    
    assert d_fast["num_keypoints"] > 0
    assert d_harris["num_keypoints"] > 0
    assert d_fast["num_keypoints"] != d_harris["num_keypoints"]

def test_patch_size_boundary(tmp_path, textured_img):
    """ทดสอบ Patch Size ขนาดต่างๆ"""
    j_std, _ = orb_run(textured_img, out_dir=tmp_path, patchSize=31)
    j_big, _ = orb_run(textured_img, out_dir=tmp_path, patchSize=45)
    
    assert os.path.exists(j_std) and os.path.exists(j_big)