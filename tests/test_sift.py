# tests/test_sift.py
import os
import json
import time
import shutil
from pathlib import Path

import cv2
import numpy as np
import pytest

# ตรวจสอบ path import ให้ตรงกับโครงสร้างโปรเจกต์ของคุณ
from server.algos.feature.sift_adapter import run as sift_run

# =============================================================================
# 1. FIXTURES: การเตรียมข้อมูลจำลอง (Images & Helpers)
# =============================================================================

@pytest.fixture()
def textured_img(tmp_path) -> str:
    """สร้างภาพสังเคราะห์ที่มีลวดลายชัดเจน (เพื่อให้ SIFT จับ Keypoints ได้ง่าย)"""
    path = tmp_path / "textured.jpg"
    h, w = 320, 320
    img = np.zeros((h, w, 3), dtype=np.uint8)

    # วาดลวดลาย: เส้น, สี่เหลี่ยม, วงกลม
    for i in range(10, min(h, w), 20):
        cv2.line(img, (i, 0), (w - 1 - i, h - 1), (255, 255, 255), 1)
        cv2.rectangle(img, (i, i), (i + 12, i + 12), (180, 180, 180), -1)
        cv2.circle(img, (w // 2, i), 10, (220, 220, 220), 2)
    
    # ใส่ Text เพื่อเพิ่ม texture
    cv2.putText(img, "SIFT TEST", (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (200, 200, 200), 2)

    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def large_img(tmp_path) -> str:
    """ภาพขนาดใหญ่ (HD) เพื่อทดสอบ Performance"""
    path = tmp_path / "large.jpg"
    h, w = 1080, 1920
    img = np.zeros((h, w, 3), dtype=np.uint8)
    # วาด Grid
    for y in range(0, h, 50):
        cv2.line(img, (0, y), (w, y), (200, 200, 200), 1)
    for x in range(0, w, 50):
        cv2.line(img, (x, 0), (x, h), (200, 200, 200), 1)
    cv2.imwrite(str(path), img)
    return str(path)

@pytest.fixture()
def gray_img(tmp_path) -> str:
    """ภาพ Grayscale (1 Channel)"""
    path = tmp_path / "gray.png"
    g = np.zeros((256, 256), dtype=np.uint8)
    cv2.circle(g, (128, 128), 50, 200, -1)
    cv2.imwrite(str(path), g)
    return str(path)

@pytest.fixture()
def bgra_img(tmp_path) -> str:
    """ภาพ BGRA (4 Channels with Alpha)"""
    path = tmp_path / "bgra.png"
    bgr = np.zeros((256, 256, 3), dtype=np.uint8)
    cv2.rectangle(bgr, (50, 50), (200, 200), (100, 150, 200), -1)
    alpha = np.full((256, 256, 1), 255, dtype=np.uint8)
    bgra = np.concatenate([bgr, alpha], axis=2)
    cv2.imwrite(str(path), bgra)
    return str(path)

# --- Helpers ---

def _load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _load_kp_and_des(json_path: str):
    """โหลด keypoints และ descriptors จากไฟล์ JSON output"""
    d = _load_json(json_path)
    kps = d.get("keypoints", [])
    pts = np.array([[k["x"], k["y"]] for k in kps], dtype=np.float32) if kps else np.empty((0, 2), dtype=np.float32)
    des = np.array(d.get("descriptors", []), dtype=np.float32) if d.get("descriptors") else np.empty((0, 128), dtype=np.float32)
    return pts, des

def _check_matching_quality(j1_path, j2_path, min_ratio=0.25):
    """Helper สำหรับเช็คว่า Feature 2 ชุด แมตช์กันได้ดีแค่ไหน (Invariance Test)"""
    pts1, des1 = _load_kp_and_des(j1_path)
    pts2, des2 = _load_kp_and_des(j2_path)

    if des1.size == 0 or des2.size == 0:
        return False, 0.0

    # ใช้ KNN Matcher
    bf = cv2.BFMatcher(cv2.NORM_L2)
    matches = bf.knnMatch(des1, des2, k=2)

    # Lowe's Ratio Test
    good = []
    for m, n in matches:
        if m.distance < 0.75 * n.distance:
            good.append(m)

    if len(good) < 4:
        return False, 0.0

    # หา Homography เพื่อยืนยันว่าจุดเกาะกลุ่มกันถูกต้องตามเรขาคณิต
    src_pts = np.float32([pts1[m.queryIdx] for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([pts2[m.trainIdx] for m in good]).reshape(-1, 1, 2)

    M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    
    if mask is None:
        return False, 0.0

    matchesMask = mask.ravel().tolist()
    inlier_count = sum(matchesMask)
    total_good = len(good)
    
    ratio = inlier_count / total_good if total_good > 0 else 0
    return ratio >= min_ratio, ratio

# =============================================================================
# 2. CACHING LOGIC TESTS (สำคัญ: แก้ไขจาก Logic เดิม)
# =============================================================================

def test_caching_same_input_same_output(tmp_path, textured_img):
    """ถ้า Input เหมือนเดิม + Param เหมือนเดิม = ต้องได้ไฟล์เดิม (Cache Hit)"""
    # Run รอบที่ 1
    j1, v1 = sift_run(textured_img, out_dir=tmp_path, nfeatures=500)
    
    # Run รอบที่ 2
    j2, v2 = sift_run(textured_img, out_dir=tmp_path, nfeatures=500)
    
    # ต้องได้ Path เดิม เพราะ Adapter คำนวณ Hash จาก Config
    assert j1 == j2
    assert v1 == v2
    assert os.path.exists(j1)

def test_param_change_creates_new_file(tmp_path, textured_img):
    """ถ้าเปลี่ยน Parameter = ต้องได้ไฟล์ใหม่"""
    j1, _ = sift_run(textured_img, out_dir=tmp_path, nfeatures=500)
    j2, _ = sift_run(textured_img, out_dir=tmp_path, nfeatures=1000) # เปลี่ยนค่า
    
    assert j1 != j2

def test_image_modification_creates_new_file(tmp_path, textured_img):
    """ถ้าแก้ไขรูปภาพ (mtime เปลี่ยน) = ต้องได้ไฟล์ใหม่"""
    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    
    # Sleep เล็กน้อยเพื่อให้ Timestamp ของระบบไฟล์เปลี่ยนแน่นอน
    time.sleep(1.5)
    
    # แตะไฟล์เพื่ออัปเดต Last Modified Time
    Path(textured_img).touch()
    
    j2, _ = sift_run(textured_img, out_dir=tmp_path)
    
    assert j1 != j2

# =============================================================================
# 3. JSON INPUT & ERROR HANDLING TESTS (เพิ่มใหม่)
# =============================================================================

def test_run_from_valid_json_input(tmp_path, textured_img):
    """ทดสอบรับ Input เป็นไฟล์ JSON (Metadata จากโหนดก่อนหน้า)"""
    # จำลองไฟล์ JSON ที่มาจาก Preprocessing Node
    meta_path = tmp_path / "prev_node_output.json"
    payload = {
        "tool": "PREPROCESS",
        "output": {
            "result_image_url": str(textured_img)  # Adapter จะต้องดึง path นี้ไปใช้
        }
    }
    with open(meta_path, "w") as f:
        json.dump(payload, f)
        
    # ส่ง path ของ json เข้าไปในฟังก์ชัน run
    j_out, _ = sift_run(str(meta_path), out_dir=tmp_path)
    
    # ตรวจสอบผลลัพธ์
    data = _load_json(j_out)
    assert data["tool"] == "SIFT"
    assert data["image"]["original_path"] == str(textured_img)

def test_error_on_matching_tool_json(tmp_path):
    """ห้ามรับ JSON ของ Matching Tool (เพราะ SIFT ต้องรันก่อน Matching)"""
    meta_path = tmp_path / "match_result.json"
    with open(meta_path, "w") as f:
        json.dump({"matching_tool": "BFMatcher"}, f)
        
    with pytest.raises(ValueError, match="Invalid Input: SIFT cannot run on"):
        sift_run(str(meta_path), out_dir=tmp_path)

def test_error_on_feature_tool_json(tmp_path):
    """ห้ามรับ JSON ของ Feature Tool ตัวอื่น (ไม่ควรเอา SIFT ไปรันซ้ำบน ORB)"""
    meta_path = tmp_path / "orb_result.json"
    with open(meta_path, "w") as f:
        json.dump({"tool": "ORB"}, f)
        
    with pytest.raises(ValueError, match="Invalid Input: SIFT cannot run on"):
        sift_run(str(meta_path), out_dir=tmp_path)

def test_file_not_found(tmp_path):
    """ทดสอบกรณีไฟล์ไม่มีจริง"""
    with pytest.raises(FileNotFoundError):
        sift_run(str(tmp_path / "non_existent.jpg"), out_dir=tmp_path)

# =============================================================================
# 4. PARAMETER CONTRACT & SCHEMA TESTS
# =============================================================================

def test_json_schema_validity(tmp_path, textured_img):
    """ตรวจสอบโครงสร้าง JSON Output ว่ามี Key ครบถ้วน"""
    j, _ = sift_run(textured_img, out_dir=tmp_path)
    data = _load_json(j)

    required_keys = [
        "tool", "tool_version", "image", "sift_parameters_used",
        "num_keypoints", "descriptor_dim", "keypoints", "descriptors"
    ]
    for k in required_keys:
        assert k in data, f"Missing key: {k}"

    assert data["tool"] == "SIFT"
    assert data["descriptor_dim"] == 128
    assert len(data["keypoints"]) == data["num_keypoints"]

def test_parameter_reflection(tmp_path, textured_img):
    """ค่าพารามิเตอร์ที่ส่งไป ต้องถูกบันทึกลง JSON อย่างถูกต้อง"""
    params = {
        "nfeatures": 300,
        "nOctaveLayers": 4,
        "contrastThreshold": 0.05,
        "edgeThreshold": 12,
        "sigma": 1.8
    }
    j, _ = sift_run(textured_img, out_dir=tmp_path, **params)
    data = _load_json(j)
    used = data["sift_parameters_used"]

    assert used["nfeatures"] == 300
    assert used["nOctaveLayers"] == 4
    assert abs(used["contrastThreshold"] - 0.05) < 1e-6
    assert abs(used["edgeThreshold"] - 12) < 1e-6
    assert abs(used["sigma"] - 1.8) < 1e-6

# =============================================================================
# 5. ROBUSTNESS & INVARIANCE TESTS (ความทนทาน)
# =============================================================================

def test_rotation_invariance(tmp_path, textured_img):
    """ทดสอบการหมุนภาพ: SIFT ควรจะยังจับคู่กันได้"""
    src = cv2.imread(textured_img)
    h, w = src.shape[:2]
    # หมุน 45 องศา
    M = cv2.getRotationMatrix2D((w//2, h//2), 45, 1.0)
    rotated = cv2.warpAffine(src, M, (w, h))
    rot_path = str(tmp_path / "rot.jpg")
    cv2.imwrite(rot_path, rotated)

    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    j2, _ = sift_run(rot_path, out_dir=tmp_path)

    passed, ratio = _check_matching_quality(j1, j2)
    assert passed, f"Rotation invariance failed (Ratio: {ratio:.2f})"

def test_scale_invariance(tmp_path, textured_img):
    """ทดสอบการย่อภาพ: SIFT ควรจะยังจับคู่กันได้"""
    src = cv2.imread(textured_img)
    # ย่อเหลือ 50%
    scaled = cv2.resize(src, None, fx=0.5, fy=0.5)
    scale_path = str(tmp_path / "scale.jpg")
    cv2.imwrite(scale_path, scaled)

    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    j2, _ = sift_run(scale_path, out_dir=tmp_path)

    passed, ratio = _check_matching_quality(j1, j2)
    assert passed, f"Scale invariance failed (Ratio: {ratio:.2f})"

def test_illumination_invariance(tmp_path, textured_img):
    """ทดสอบความสว่างเปลี่ยน: SIFT ควรจะยังจับคู่กันได้"""
    src = cv2.imread(textured_img)
    # เพิ่มความสว่าง
    bright = cv2.convertScaleAbs(src, alpha=1.2, beta=30)
    bright_path = str(tmp_path / "bright.jpg")
    cv2.imwrite(bright_path, bright)

    j1, _ = sift_run(textured_img, out_dir=tmp_path)
    j2, _ = sift_run(bright_path, out_dir=tmp_path)

    passed, ratio = _check_matching_quality(j1, j2)
    assert passed, f"Illumination invariance failed (Ratio: {ratio:.2f})"

# =============================================================================
# 6. INPUT CHANNEL & TYPE TESTS
# =============================================================================

def test_grayscale_support(tmp_path, gray_img):
    """ทดสอบรูปขาวดำ"""
    j, _ = sift_run(gray_img, out_dir=tmp_path)
    data = _load_json(j)
    assert data["num_keypoints"] > 0
    assert data["descriptor_dim"] == 128

def test_bgra_support(tmp_path, bgra_img):
    """ทดสอบรูปที่มี Alpha Channel"""
    j, _ = sift_run(bgra_img, out_dir=tmp_path)
    data = _load_json(j)
    # ควรทำงานได้โดยไม่ Crash (โค้ด Adapter มีการแปลงเป็น Gray)
    assert data["num_keypoints"] > 0

# =============================================================================
# 7. PERFORMANCE TEST
# =============================================================================

def test_performance_large_image(tmp_path, large_img):
    """ทดสอบ Performance กับรูปใหญ่ (ต้องไม่ใช้เวลานานเกินไป)"""
    start_time = time.perf_counter()
    j, v = sift_run(large_img, out_dir=tmp_path, nfeatures=1000)
    duration = time.perf_counter() - start_time
    
    # Assert เวลา (ปรับค่าตามความแรงเครื่อง Server)
    assert duration < 10.0, f"Processing too slow: {duration:.2f}s"
    
    # Assert ว่าไฟล์ถูกสร้างจริง
    assert os.path.exists(j)
    assert os.path.exists(v)