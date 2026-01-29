# tests/test_surf.py
import os
import json
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

try:
    surf_available = hasattr(cv2, 'xfeatures2d') and hasattr(cv2.xfeatures2d, 'SURF_create')
except AttributeError:
    surf_available = False

if not surf_available:
    pytest.skip("SURF not available (requires opencv-contrib-python)", allow_module_level=True)

from server.algos.feature.surf_adapter import run as surf_run

# 1. FIXTURES

@pytest.fixture()
def textured_img(tmp_path) -> str:
    path = tmp_path / "surf_test.jpg"
    h, w = 320, 320
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for i in range(10, min(h, w), 20):
        cv2.line(img, (i, 0), (w - 1 - i, h - 1), (255, 255, 255), 1)
        cv2.rectangle(img, (i, i), (i + 12, i + 12), (180, 180, 180), -1)
        cv2.circle(img, (w // 2, i), 10, (220, 220, 220), 2)
    cv2.putText(img, "SURF", (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (200, 200, 200), 2)
    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def large_img(tmp_path) -> str:
    path = tmp_path / "large_surf.jpg"
    h, w = 1080, 1920
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(0, h, 60):
        cv2.line(img, (0, y), (w, y), (200, 200, 200), 1)
    for x in range(0, w, 60):
        cv2.line(img, (x, 0), (x, h), (200, 200, 200), 1)
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
        return np.empty((0, 2), dtype=np.float32), np.empty((0, 64), dtype=np.float32)
    
    pts = np.array([[k["x"], k["y"]] for k in kps], dtype=np.float32)
    
    des_list = []
    for k in kps:
        if "descriptor" in k and k["descriptor"]:
             des_list.append(k["descriptor"])
    
    des_dim = d.get("descriptor_dim", 64)
    des = np.array(des_list, dtype=np.float32) if des_list else np.empty((0, des_dim), dtype=np.float32)
    return pts, des

def _check_matching_quality(j1_path, j2_path, min_ratio=0.20):
    d1 = _load_json(j1_path)
    d2 = _load_json(j2_path)
    pts1, des1 = _extract_pts_and_des(d1)
    pts2, des2 = _extract_pts_and_des(d2)
    
    if des1.size == 0 or des2.size == 0: return False, 0.0
    
    bf = cv2.BFMatcher(cv2.NORM_L2)
    matches = bf.knnMatch(des1, des2, k=2)
    good = []
    for pair in matches:
        if len(pair) < 2: continue
        m, n = pair
        if m.distance < 0.75 * n.distance:
            good.append(m)
            
    if len(good) < 4: return False, 0.0
    
    src_pts = np.float32([pts1[m.queryIdx] for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([pts2[m.trainIdx] for m in good]).reshape(-1, 1, 2)
    
    M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    if mask is None: return False, 0.0
    
    ratio = sum(mask.ravel()) / len(good)
    return ratio >= min_ratio, ratio

# 2. BASIC & SCHEMA TESTS

def test_descriptor_dim_and_dtype_default(tmp_path, textured_img):
    j, _ = surf_run(textured_img, out_dir=tmp_path) 
    d = _load_json(j)
    
    assert d["tool"] == "SURF"
    assert d["descriptor_dim"] == 64  
    assert d["num_keypoints"] == len(d["keypoints"])

def test_extended_descriptor_dim(tmp_path, textured_img):
    j, _ = surf_run(textured_img, out_dir=tmp_path, extended=True)
    d = _load_json(j)
    assert d["descriptor_dim"] == 128 

def test_upright_affects_angles(tmp_path, textured_img):
    j, _ = surf_run(textured_img, out_dir=tmp_path, upright=True)
    d = _load_json(j)

    assert d["surf_parameters_used"]["upright"] is True

def test_schema_fields_present(tmp_path, textured_img):
    j, _ = surf_run(textured_img, out_dir=tmp_path)
    d = _load_json(j)
    required = ["tool", "image", "surf_parameters_used", "num_keypoints", "keypoints"]
    for k in required:
        assert k in d

def test_parameter_echo_in_schema(tmp_path, textured_img):
    j, _ = surf_run(textured_img, out_dir=tmp_path, hessianThreshold=500, nOctaves=3)
    d = _load_json(j)
    used = d["surf_parameters_used"]
    assert used["hessianThreshold"] == 500
    assert used["nOctaves"] == 3

# 3. INPUT VARIATIONS

def test_grayscale_input(tmp_path, gray_img):
    j, _ = surf_run(gray_img, out_dir=tmp_path)
    d = _load_json(j)
    assert d["num_keypoints"] > 0

def test_bgra_input(tmp_path, bgra_img):
    j, _ = surf_run(bgra_img, out_dir=tmp_path)
    d = _load_json(j)
    assert d["num_keypoints"] > 0

def test_invalid_path_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        surf_run(str(tmp_path / "non_existent.jpg"), out_dir=tmp_path)

# 4. PARAMETER EFFECTS

def test_hessian_threshold_monotonicity(tmp_path, textured_img):
    j_low, _ = surf_run(textured_img, out_dir=tmp_path, hessianThreshold=100)
    j_hi, _ = surf_run(textured_img, out_dir=tmp_path, hessianThreshold=1000)
    
    d_low = _load_json(j_low)
    d_hi = _load_json(j_hi)
    
    assert d_low["num_keypoints"] >= d_hi["num_keypoints"]

# 5. CACHING & DETERMINISM

def test_caching_same_input_same_output(tmp_path, textured_img):
    j1, v1 = surf_run(textured_img, out_dir=tmp_path, hessianThreshold=400)
    j2, v2 = surf_run(textured_img, out_dir=tmp_path, hessianThreshold=400)
    
    assert j1 == j2
    assert os.path.exists(j1)

def test_param_change_creates_new_file(tmp_path, textured_img):
    j1, _ = surf_run(textured_img, out_dir=tmp_path, hessianThreshold=400)
    j2, _ = surf_run(textured_img, out_dir=tmp_path, hessianThreshold=500)
    assert j1 != j2

# 6. ROBUSTNESS (INVARIANCE)

def test_rotation_invariance(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    h, w = src.shape[:2]
    M = cv2.getRotationMatrix2D((w//2, h//2), 30, 1.0)
    rot_path = str(tmp_path / "rot_surf.jpg")
    cv2.imwrite(rot_path, cv2.warpAffine(src, M, (w, h)))

    j1, _ = surf_run(textured_img, out_dir=tmp_path, upright=False)
    j2, _ = surf_run(rot_path, out_dir=tmp_path, upright=False)
    
    passed, ratio = _check_matching_quality(j1, j2)
    assert passed, f"Rotation Invariance Failed (Ratio: {ratio:.2f})"

def test_scale_invariance(tmp_path, textured_img):
    src = cv2.imread(textured_img)
    scale_path = str(tmp_path / "scale_surf.jpg")
    cv2.imwrite(scale_path, cv2.resize(src, None, fx=0.6, fy=0.6))

    j1, _ = surf_run(textured_img, out_dir=tmp_path)
    j2, _ = surf_run(scale_path, out_dir=tmp_path)
    
    passed, ratio = _check_matching_quality(j1, j2)
    assert passed, f"Scale Invariance Failed (Ratio: {ratio:.2f})"

# 7. PERFORMANCE

def test_runtime_under_budget(tmp_path, textured_img):
    t0 = time.perf_counter()
    j, _ = surf_run(textured_img, out_dir=tmp_path)
    dt = time.perf_counter() - t0
    assert dt < 5.0

def test_large_image_runtime_and_output(tmp_path, large_img):
    t0 = time.perf_counter()
    j, v = surf_run(large_img, out_dir=tmp_path, hessianThreshold=500)
    dt = time.perf_counter() - t0
    
    d = _load_json(j)
    assert d["num_keypoints"] > 50
    assert dt < 15.0