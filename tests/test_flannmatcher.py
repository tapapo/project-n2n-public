import os
import json
from pathlib import Path
import cv2
import numpy as np
import pytest

from server.algos.feature.sift_adapter import run as sift_run
from server.algos.feature.orb_adapter import run as orb_run
from server.algos.matching.flannmatcher_adapter import run as flann_run

@pytest.fixture(autouse=True)
def chdir_tmp(tmp_path, monkeypatch):
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

def _ensure_feat_sift(out_dir: Path, img_path: str, **params) -> str:
    j, _ = sift_run(img_path, out_dir=out_dir, **params)
    assert os.path.exists(j)
    return j

def _ensure_feat_orb(tmp_path: Path, img_path: str, WTA_K=2, nfeatures=800, **params) -> str:
    j, _ = orb_run(img_path, out_root=str(tmp_path), WTA_K=WTA_K, nfeatures=nfeatures, **params)
    assert os.path.exists(j)
    return j

# TESTS

def test_schema_and_files_sift_flann(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=600)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=600)
    out = flann_run(ja, jb, out_root=str(tmp_path))
    assert os.path.exists(out["json_path"])
    for k in ["matching_tool", "flann_parameters_used", "input_features_details", "matching_statistics"]:
        assert k in out

def test_schema_and_files_orb_flann(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=800)
    out = flann_run(ja, jb, out_root=str(tmp_path))
    assert os.path.exists(out["json_path"])
    assert out["flann_parameters_used"]["index_selected"] in ("LSH", "KD_TREE")

def test_auto_picks_kdtree_for_sift(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="AUTO")
    assert out["flann_parameters_used"]["index_selected"] == "KD_TREE"
    assert out["flann_parameters_used"]["index_selected_reason"] == "auto_by_tool"

def test_auto_picks_lsh_for_orb(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="AUTO")
    assert out["flann_parameters_used"]["index_selected"] == "LSH"
    assert out["flann_parameters_used"]["index_selected_reason"] == "auto_by_tool"

def test_force_kdtree_on_sift_is_respected(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="KD_TREE", kd_trees=7)
    p = out["flann_parameters_used"]
    assert p["index_selected"] == "KD_TREE"
    assert p["index_params"]["trees"] == 7

def test_force_lsh_on_orb_is_respected(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="LSH",
                    lsh_table_number=11, lsh_key_size=10, lsh_multi_probe_level=2)
    p = out["flann_parameters_used"]
    assert p["index_selected"] == "LSH"
    ip = p["index_params"]
    assert ip["table_number"] == 11
    assert ip["key_size"] == 10
    assert ip["multi_probe_level"] == 2

def test_invalid_index_mode_for_sift_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    with pytest.raises(ValueError):
        flann_run(ja, jb, out_root=str(tmp_path), index_mode="LSH")

def test_invalid_index_mode_for_orb_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2)
    with pytest.raises(ValueError, match="Invalid Index"):
        flann_run(ja, jb, out_root=str(tmp_path), index_mode="KD_TREE")

def test_invalid_index_mode_string_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    with pytest.raises(ValueError, match="Invalid index_mode"):
        flann_run(ja, jb, out_root=str(tmp_path), index_mode="WEIRD")

def test_kd_tree_params_echo_for_sift(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=400)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=400)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="KD_TREE", kd_trees=7, search_checks=17)
    p = out["flann_parameters_used"]
    assert p["index_selected"] == "KD_TREE"
    assert p["index_params"]["trees"] == 7
    assert p["search_params"]["checks"] == 17
    assert "KD-Tree" in p["index_name"]

def test_lsh_params_echo_for_orb(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=800)
    out = flann_run(
        ja, jb, out_root=str(tmp_path),
        index_mode="LSH",
        lsh_table_number=10, lsh_key_size=14, lsh_multi_probe_level=3,
        search_checks=42
    )
    p = out["flann_parameters_used"]
    assert p["index_selected"] == "LSH"
    assert p["search_params"]["checks"] == 42
    name = p["index_name"]
    assert "LSH" in name and "table=10" in name

def test_default_ratio_sift_is_0_75_when_not_overridden(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="KD_TREE")
    assert abs(out["flann_parameters_used"]["lowes_ratio_threshold"] - 0.75) < 1e-6

def test_default_ratio_orb_is_0_8_when_not_overridden(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=4)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=4)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="LSH")
    assert abs(out["flann_parameters_used"]["lowes_ratio_threshold"] - 0.8) < 1e-6

def test_override_ratio_is_echoed(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="KD_TREE", lowe_ratio=0.69)
    assert abs(out["flann_parameters_used"]["lowes_ratio_threshold"] - 0.69) < 1e-6

def test_invalid_lowe_ratio_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    with pytest.raises(ValueError):
        flann_run(ja, jb, out_root=str(tmp_path), lowe_ratio=1.1)

def test_ransac_thresh_echo_and_invalid(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = flann_run(ja, jb, out_root=str(tmp_path), ransac_thresh=7.5)
    assert abs(out["flann_parameters_used"]["ransac_thresh"] - 7.5) < 1e-6
    with pytest.raises(ValueError):
        flann_run(ja, jb, out_root=str(tmp_path), ransac_thresh=-2.0)

def test_draw_modes_and_max_draw(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=600)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=600)
    out_good = flann_run(ja, jb, out_root=str(tmp_path), draw_mode="good", max_draw=25)
    out_inl  = flann_run(ja, jb, out_root=str(tmp_path), draw_mode="inliers", max_draw=10)
    
    assert out_good["flann_parameters_used"]["draw_mode"] == "good"
    assert out_inl["flann_parameters_used"]["draw_mode"] == "inliers"
    assert out_good["flann_parameters_used"]["max_draw"] == 25
    assert out_inl["flann_parameters_used"]["max_draw"] == 10

def test_draw_mode_invalid_is_clamped_to_good(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=500)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=500)
    out = flann_run(ja, jb, out_root=str(tmp_path), draw_mode="WEIRD_MODE")
    assert out["flann_parameters_used"]["draw_mode"] == "good"

def test_max_draw_zero_is_accepted_and_echoed(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=700)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=700)
    out = flann_run(ja, jb, out_root=str(tmp_path), max_draw=0) 
    assert out["flann_parameters_used"]["max_draw"] == 0

def test_homography_reason_not_enough_good_matches(tmp_path, img_pair_diff):
    a, b = img_pair_diff
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=300)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=300)
    out = flann_run(ja, jb, out_root=str(tmp_path), index_mode="KD_TREE", lowe_ratio=0.6)
    
    if out["matching_statistics"]["num_good_matches"] < 4:
        assert out["matching_statistics"]["homography_reason"] == "not_enough_good_matches"

def test_homography_failure_reason_exposed(tmp_path, monkeypatch):
    img = tmp_path / "z.jpg"
    h, w = 320, 320
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    for i in range(20, 300, 20):
        cv2.circle(canvas, (i, i//2), 5, (200, 200, 200), 2)
    cv2.putText(canvas, "Z", (120, 200), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (220, 220, 220), 3, cv2.LINE_AA)
    cv2.imwrite(str(img), canvas)

    j1 = _ensure_feat_sift(tmp_path, str(img), nfeatures=500)
    j2 = _ensure_feat_sift(tmp_path, str(img), nfeatures=500)

    def fake_findH(*args, **kwargs):
        return None, None
    
    monkeypatch.setattr(cv2, "findHomography", fake_findH)
    
    out = flann_run(j1, j2, out_root=str(tmp_path), index_mode="KD_TREE", lowe_ratio=0.9)
    assert out["matching_statistics"]["homography_reason"] == "findHomography_failed"

def test_inliers_not_more_than_good_matches(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=800)
    out = flann_run(ja, jb, out_root=str(tmp_path))
    ms = out["matching_statistics"]
    assert ms["num_inliers"] <= ms["num_good_matches"]