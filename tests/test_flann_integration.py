# tests/test_flann_integration.py
import os
from pathlib import Path

import cv2
import numpy as np
import pytest

from server.algos.feature.sift_adapter import run as sift_run
from server.algos.feature.orb_adapter import run as orb_run
from server.algos.matching.flannmatcher_adapter import run as flann_run


# --------------------------
# Fixtures / helpers
# --------------------------
@pytest.fixture(autouse=True)
def chdir_tmp(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    yield


def _write_textured(path: Path, label="A", size=(320, 320)):
    h, w = size
    img = np.zeros((h, w, 3), dtype=np.uint8)
    # ลายง่ายๆ ให้มีคีย์พอยต์เยอะพอ
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
    M = cv2.getRotationMatrix2D((w // 2, h // 2), 35, 1.0)
    rot = cv2.warpAffine(src, M, (w, h))
    cv2.imwrite(str(b), rot)
    return str(a), str(b)


@pytest.fixture()
def img_pair_diff(tmp_path):
    c = tmp_path / "c.jpg"
    d = tmp_path / "d.jpg"
    _write_textured(c, "C")
    grid = np.zeros((320, 320, 3), dtype=np.uint8)
    for y in range(0, 320, 20):
        cv2.line(grid, (0, y), (319, y), (255, 255, 255), 1)
    for x in range(0, 320, 20):
        cv2.line(grid, (x, 0), (x, 319), (255, 255, 255), 1)
    cv2.putText(grid, "DIFF", (100, 160), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (200, 200, 200), 3, cv2.LINE_AA)
    cv2.imwrite(str(d), grid)
    return str(c), str(d)


def _ensure_feat_sift(out_dir: Path, img_path: str, **params) -> str:
    j, _ = sift_run(img_path, out_dir=out_dir, **params)
    assert os.path.exists(j)
    return j


def _ensure_feat_orb(tmp_path: Path, img_path: str, **params) -> str:
    # orb_adapter เขียนลง out_root
    j, _ = orb_run(img_path, out_root=str(tmp_path), **params)
    assert os.path.exists(j)
    return j


# --------------------------
# Integration tests
# --------------------------

def test_integration_orb_lsh_multi_params(tmp_path, img_pair_rot):
   
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=900)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=900)

    out = flann_run(
        ja, jb, out_root=str(tmp_path),
        index_mode="LSH",
        lowe_ratio=0.72,
        ransac_thresh=6.0,
        search_checks=80,
        lsh_table_number=10,
        lsh_key_size=14,
        lsh_multi_probe_level=2,
        draw_mode="inliers",
        max_draw=30,
    )

    # echo พารามิเตอร์
    used = out["flann_parameters_used"]
    assert used["index_selected"] == "LSH"
    assert abs(used["lowes_ratio_threshold"] - 0.72) < 1e-6
    assert abs(used["ransac_thresh"] - 6.0) < 1e-6
    assert used["index_params"]["algorithm"] == 6  # LSH
    assert used["index_params"]["table_number"] == 10
    assert used["index_params"]["key_size"] == 14
    assert used["index_params"]["multi_probe_level"] == 2
    assert used["search_params"]["checks"] == 80
    assert used["draw_mode"] == "inliers"
    assert used["max_draw"] == 30

    # sanity
    ms = out["matching_statistics"]
    assert ms["num_inliers"] <= ms["num_good_matches"]
    # vis อาจมีหรือไม่มี (ถ้าไม่มี inliers/good พอ) แต่ json_path ต้องมีจริงเสมอ
    assert os.path.exists(out["json_path"])


def test_integration_sift_kdtree_multi_params(tmp_path, img_pair_rot):
    
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=600)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=600)

    out = flann_run(
        ja, jb, out_root=str(tmp_path),
        index_mode="KD_TREE",
        lowe_ratio=0.70,
        ransac_thresh=4.5,
        search_checks=64,
        kd_trees=8,
        draw_mode="good",
        max_draw=0,  # วาดทั้งหมด
    )

    used = out["flann_parameters_used"]
    assert used["index_selected"] == "KD_TREE"
    assert used["index_params"]["algorithm"] == 1
    assert used["index_params"]["trees"] == 8
    assert used["search_params"]["checks"] == 64
    assert abs(used["lowes_ratio_threshold"] - 0.70) < 1e-6
    assert abs(used["ransac_thresh"] - 4.5) < 1e-6
    assert used["draw_mode"] == "good"
    assert used["max_draw"] == 0

    ms = out["matching_statistics"]
    assert ms["num_inliers"] <= ms["num_good_matches"]
    assert os.path.exists(out["json_path"])


def test_integration_auto_by_tool_defaults(tmp_path, img_pair_rot):
    
    a, b = img_pair_rot

    # SIFT: AUTO
    js1 = _ensure_feat_sift(tmp_path, a, nfeatures=400)
    js2 = _ensure_feat_sift(tmp_path, b, nfeatures=400)
    out_sift = flann_run(js1, js2, out_root=str(tmp_path), index_mode="AUTO", lowe_ratio=None)
    used_sift = out_sift["flann_parameters_used"]
    assert used_sift["index_selected"] == "KD_TREE"
    assert abs(used_sift["lowes_ratio_threshold"] - 0.75) < 1e-6

    # ORB: AUTO
    jo1 = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jo2 = _ensure_feat_orb(tmp_path, b, WTA_K=4, nfeatures=800)  # ต่าง WTA_K ก็ใช้ LSH ได้
    out_orb = flann_run(jo1, jo2, out_root=str(tmp_path), index_mode="AUTO", lowe_ratio=None)
    used_orb = out_orb["flann_parameters_used"]
    assert used_orb["index_selected"] == "LSH"
    assert abs(used_orb["lowes_ratio_threshold"] - 0.8) < 1e-6


def test_integration_invalid_index_combinations_raise(tmp_path, img_pair_rot):
    """
    invalid combos:
    - ORB + KD_TREE → ต้อง error
    - SIFT + LSH    → ต้อง error
    """
    a, b = img_pair_rot
    jo1 = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=600)
    jo2 = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=600)
    js1 = _ensure_feat_sift(tmp_path, a, nfeatures=400)
    js2 = _ensure_feat_sift(tmp_path, b, nfeatures=400)

    with pytest.raises(ValueError):
        flann_run(jo1, jo2, out_root=str(tmp_path), index_mode="KD_TREE")

    with pytest.raises(ValueError):
        flann_run(js1, js2, out_root=str(tmp_path), index_mode="LSH")


def test_integration_homography_reasons(tmp_path):
    
    # เคสภาพต่างกันมากให้คู่ดีน้อย
    c = tmp_path / "c2.jpg"
    d = tmp_path / "d2.jpg"
    _write_textured(c, "C2")
    grid = np.zeros((320, 320, 3), dtype=np.uint8)
    cv2.putText(grid, "NOPE", (60, 180), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (200, 200, 200), 3, cv2.LINE_AA)
    cv2.imwrite(str(d), grid)

    js1 = _ensure_feat_sift(tmp_path, str(c), nfeatures=400)
    js2 = _ensure_feat_sift(tmp_path, str(d), nfeatures=400)
    out1 = flann_run(js1, js2, out_root=str(tmp_path), index_mode="KD_TREE", lowe_ratio=0.6)
    assert out1["matching_statistics"]["homography_reason"] in ("not_enough_good_matches", None)
    # ในภาพต่างหนักๆ ส่วนใหญ่จะได้ not_enough_good_matches
    if out1["matching_statistics"]["num_good_matches"] < 4:
        assert out1["matching_statistics"]["homography_reason"] == "not_enough_good_matches"

    # บังคับให้ findHomography ล้มเหลว โดยใช้ภาพเดียวกันให้แมตช์พอ แล้ว mock
    z = tmp_path / "z.jpg"
    _write_textured(z, "Z")
    j1 = _ensure_feat_sift(tmp_path, str(z), nfeatures=800)
    j2 = _ensure_feat_sift(tmp_path, str(z), nfeatures=800)

    real = cv2.findHomography

    def fake_findH(a, b, method, r):
        return None, None

    cv2.findHomography = fake_findH
    try:
        out2 = flann_run(j1, j2, out_root=str(tmp_path), index_mode="KD_TREE", lowe_ratio=0.8, ransac_thresh=5.0)
        # มี good >= 4 แต่ findHomography = None → reason = 'findHomography_failed'
        if out2["matching_statistics"]["num_good_matches"] >= 4:
            assert out2["matching_statistics"]["homography_reason"] == "findHomography_failed"
    finally:
        cv2.findHomography = real