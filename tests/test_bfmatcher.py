# tests/test_bfmatcher.py
import os
import json
import shutil
from pathlib import Path
import cv2
import numpy as np
import pytest

from server.algos.feature.sift_adapter import run as sift_run
from server.algos.feature.orb_adapter import run as orb_run
from server.algos.matching.bfmatcher_adapter import run as bf_run

try:
    SURF_AVAILABLE = hasattr(cv2, "xfeatures2d") and hasattr(cv2.xfeatures2d, "SURF_create")
except AttributeError:
    SURF_AVAILABLE = False

# 1. FIXTURES

@pytest.fixture(autouse=True)
def chdir_tmp(tmp_path, monkeypatch):
    """เปลี่ยน Working Directory ไปที่ tmp_path เพื่อให้ Output ไม่ปนเปื้อน"""
    monkeypatch.chdir(tmp_path)
    yield

def _write_textured(path: Path, label="A", size=(320, 320)):
    h, w = size
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for i in range(10, min(h, w), 18):
        cv2.line(img, (i, 0), (w - 1 - i, h - 1), (255, 255, 255), 1)
        cv2.rectangle(img, (i, i), (i + 10, i + 10), (170, 170, 170), -1)
        cv2.circle(img, (w // 2, i), 9, (220, 220, 220), 2)
    cv2.putText(img, str(label), (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (200, 200, 200), 2, cv2.LINE_AA)
    cv2.imwrite(str(path), img)

@pytest.fixture()
def img_pair_rot(tmp_path):
    """สร้างคู่ภาพ A และ B (A ที่หมุน 45 องศา)"""
    a = tmp_path / "a.jpg"
    b = tmp_path / "b.jpg"
    _write_textured(a, "ROT")
    
    src = cv2.imread(str(a))
    h, w = src.shape[:2]
    M = cv2.getRotationMatrix2D((w//2, h//2), 45, 1.0)
    rot = cv2.warpAffine(src, M, (w, h))
    cv2.imwrite(str(b), rot)
    return str(a), str(b)

@pytest.fixture()
def img_pair_diff(tmp_path):
    """สร้างคู่ภาพ C และ D ที่ต่างกันอย่างสิ้นเชิง"""
    c = tmp_path / "c.jpg"
    d = tmp_path / "d.jpg"
    _write_textured(c, "C")
    
    h, w = 320, 320
    grid = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(0, h, 20):
        cv2.line(grid, (0, y), (w - 1, y), (255, 255, 255), 1)
    for x in range(0, w, 20):
        cv2.line(grid, (x, 0), (x, h - 1), (255, 255, 255), 1)
    cv2.putText(grid, "DIFF", (100, 160), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (200, 200, 200), 3, cv2.LINE_AA)
    cv2.imwrite(str(d), grid)
    return str(c), str(d)


def _load_json(p: str) -> dict:
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def _ensure_feat_sift(out_dir: Path, img_path: str, **params) -> str:
    j, _ = sift_run(img_path, out_dir=out_dir, **params)
    assert os.path.exists(j)
    return j

def _ensure_feat_orb(out_dir: Path, img_path: str, WTA_K=2, nfeatures=800, **params) -> str:
    j, _ = orb_run(img_path, out_dir=out_dir, WTA_K=WTA_K, nfeatures=nfeatures, **params)
    assert os.path.exists(j)
    return j

# 2. SCHEMA & FILE CREATION

def test_schema_and_files_sift(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=400)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=400)
    
    out = bf_run(ja, jb, out_root=str(tmp_path))
    
    assert os.path.exists(out["json_path"])
    required_keys = ["matching_tool", "bfmatcher_parameters_used", "input_features_details",
                     "matching_statistics", "good_matches"]
    for k in required_keys:
        assert k in out

def test_schema_and_files_orb(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=800)
    
    out = bf_run(ja, jb, out_root=str(tmp_path))
    
    assert os.path.exists(out["json_path"])
    assert out["bfmatcher_parameters_used"]["norm_type"] in ("HAMMING", "HAMMING2")

# 3. NORM SELECTION LOGIC

def test_auto_norm_sift_defaults_to_L2(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    assert out["bfmatcher_parameters_used"]["norm_type"] == "L2"

def test_auto_norm_orb_depends_on_WTA(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=4)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=4)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    assert out["bfmatcher_parameters_used"]["norm_type"] == "HAMMING2"

def test_norm_override_valid_for_sift(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = bf_run(ja, jb, out_root=str(tmp_path), norm_override="L1")
    assert out["bfmatcher_parameters_used"]["norm_type"] == "L1"

def test_norm_override_invalid_for_orb_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a)
    jb = _ensure_feat_orb(tmp_path, b)
    with pytest.raises(ValueError, match="Configuration Error"):
        bf_run(ja, jb, out_root=str(tmp_path), norm_override="L2")

def test_wta_k_mismatch_orb_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=4)
    with pytest.raises(ValueError, match="ORB WTA_K mismatch"):
        bf_run(ja, jb, out_root=str(tmp_path))

# 4. CROSS-CHECK & RATIO TEST

def test_cross_check_defaults(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    js1 = _ensure_feat_sift(tmp_path, a)
    js2 = _ensure_feat_sift(tmp_path, b)
    out_sift = bf_run(js1, js2, out_root=str(tmp_path))
    assert out_sift["bfmatcher_parameters_used"]["cross_check"] is False

    jo1 = _ensure_feat_orb(tmp_path, a, WTA_K=2)
    jo2 = _ensure_feat_orb(tmp_path, b, WTA_K=2)
    out_orb = bf_run(jo1, jo2, out_root=str(tmp_path))
    assert out_orb["bfmatcher_parameters_used"]["cross_check"] is True

def test_force_cross_check_true_disables_lowe(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=True, lowe_ratio=0.5)
    assert out["bfmatcher_parameters_used"]["lowes_ratio_threshold"] is None

def test_force_knn_lowes_ratio_applied(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.7)
    assert abs(out["bfmatcher_parameters_used"]["lowes_ratio_threshold"] - 0.7) < 1e-6

# 5. DRAW MODES & RANSAC

def test_inliers_with_rotation_and_draw_modes(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=600)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=600)
    
    out_good = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.75, draw_mode="good")
    out_inl  = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.75, draw_mode="inliers")
    
    assert out_good["matching_statistics"]["num_good_matches"] > 0
    assert out_inl["matching_statistics"]["num_inliers"] > 0
    assert out_good["bfmatcher_parameters_used"]["draw_mode"] == "good"
    assert out_inl["bfmatcher_parameters_used"]["draw_mode"] == "inliers"

def test_ransac_thresh_echo(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = bf_run(ja, jb, out_root=str(tmp_path), ransac_thresh=7.5)
    assert abs(out["bfmatcher_parameters_used"]["ransac_thresh"] - 7.5) < 1e-6

# 6. ERROR HANDLING & TOOL MISMATCH

def test_mismatched_tools_raise(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    js = _ensure_feat_sift(tmp_path, a)
    jo = _ensure_feat_orb(tmp_path, b)
    with pytest.raises(ValueError, match="Mismatch"):
        bf_run(js, jo, out_root=str(tmp_path))

@pytest.mark.skipif(not SURF_AVAILABLE, reason="SURF not available")
def test_surf_pair_runs_when_available(tmp_path, img_pair_rot):
    from server.algos.feature.surf_adapter import run as surf_run
    a, b = img_pair_rot
    ja, _ = surf_run(a, out_dir=tmp_path)
    jb, _ = surf_run(b, out_dir=tmp_path)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    assert out["matching_tool"] == "BFMatcher"

def test_low_matches_on_very_different_images_orb(tmp_path, img_pair_diff):
    a, b = img_pair_diff
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=800)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    
    assert out["matching_statistics"]["num_inliers"] <= out["matching_statistics"]["num_good_matches"]

# 7. HOMOGRAPHY REASONS

def test_homography_reason_not_enough_good_matches(tmp_path):
    a = tmp_path / "n1.jpg"
    b = tmp_path / "n2.jpg"
    
    img1 = np.full((100, 100, 3), 255, dtype=np.uint8)
    cv2.imwrite(str(a), img1)
    
    img2 = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.imwrite(str(b), img2)

    ja = _ensure_feat_sift(tmp_path, str(a), nfeatures=100)
    jb = _ensure_feat_sift(tmp_path, str(b), nfeatures=100)
    
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.1)
    
    assert out["matching_statistics"]["homography_reason"] == "not_enough_good_matches"

def test_homography_failure_reason_exposed(tmp_path, monkeypatch):
    """ทดสอบกรณี findHomography ล้มเหลว (mock return None)"""
    img = tmp_path / "z.jpg"
    _write_textured(img, "Z")
    
    j1 = _ensure_feat_sift(tmp_path, str(img), nfeatures=500)
    j2 = _ensure_feat_sift(tmp_path, str(img), nfeatures=500)

    def fake_findH(*args, **kwargs):
        return None, None
    
    monkeypatch.setattr(cv2, "findHomography", fake_findH)
    
    out = bf_run(j1, j2, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.9)
    assert out["matching_statistics"]["homography_reason"] == "findHomography_failed"

# 8. EXTRA VALIDATIONS

def test_lowe_ratio_validation(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=200)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=200)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=1.1)

def test_ransac_thresh_validation(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=200)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=200)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), ransac_thresh=-5.0)

def test_norm_override_unknown_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    with pytest.raises(ValueError, match="Unknown norm_override"):
        bf_run(ja, jb, out_root=str(tmp_path), norm_override="XYZ")

def test_missing_image_files_do_not_crash(tmp_path, img_pair_rot):
    """ทดสอบกรณีไฟล์รูปต้นฉบับหายไป (Json ยังอยู่)"""
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=200)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=200)

    for jp in (ja, jb):
        data = _load_json(jp)
        data["image"]["original_path"] = str(tmp_path / "ghost.jpg")
        with open(jp, "w", encoding="utf-8") as f:
            json.dump(data, f)

    out = bf_run(ja, jb, out_root=str(tmp_path))
    assert out["inputs"]["image1"]["width"] is None