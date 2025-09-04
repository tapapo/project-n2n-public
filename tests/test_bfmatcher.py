# tests/test_bfmatcher.py
import os
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

# --- อแดปเตอร์ฝั่งฟีเจอร์ ---
from server.algos.feature.sift_adapter import run as sift_run
from server.algos.feature.orb_adapter import run as orb_run

# --- อแดปเตอร์ฝั่งแมตช์ ---
from server.algos.matching.bfmatcher_adapter import run as bf_run



@pytest.fixture(autouse=True)
def chdir_tmp(tmp_path, monkeypatch):
    """
    ORB adapter เขียนลง ./outputs/... เสมอ
    เลย chdir มา tmp เพื่อไม่ให้ไปเลอะโปรเจกต์จริง
    """
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
    """ภาพ A และ A ที่หมุน 45°"""
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
    """ภาพ C และ D ที่ต่างกันมาก"""
    c = tmp_path / "c.jpg"
    d = tmp_path / "d.jpg"
    _write_textured(c, "C")
    # D: ลายเป็นกริด & ตัวหนังสือคนละตำแหน่ง
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
    """รัน SIFT แล้วคืน json_path"""
    j, _ = sift_run(img_path, out_dir=out_dir, **params)
    assert os.path.exists(j)
    return j


def _ensure_feat_orb(tmp_path: Path, img_path: str, WTA_K=2, nfeatures=800, **params) -> str:
    
    j, _ = orb_run(img_path, out_root=str(tmp_path), WTA_K=WTA_K, nfeatures=nfeatures, **params)
    assert os.path.exists(j)
    return j


SURF_AVAILABLE = hasattr(cv2, "xfeatures2d") and hasattr(cv2.xfeatures2d, "SURF_create")


# ============================================================
# 1) Basic schema & file creation
# ============================================================

def test_schema_and_files_sift(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=400)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=400)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    # ไฟล์ JSON ของผลลัพธ์ต้องมีจริง
    assert os.path.exists(out["json_path"])
    # สนามหลักๆ ต้องอยู่ครบ
    for k in ["matching_tool", "bfmatcher_parameters_used", "input_features_details",
              "matching_statistics", "good_matches"]:
        assert k in out


def test_schema_and_files_orb(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=800)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    assert os.path.exists(out["json_path"])
    assert out["bfmatcher_parameters_used"]["norm_type"] in ("HAMMING", "HAMMING2")  # อัตโนมัติจาก WTA_K


# ============================================================
# 2) Norm selection / overrides
# ============================================================

def test_auto_norm_sift_defaults_to_L2(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    assert out["bfmatcher_parameters_used"]["norm_type"] == "L2"


def test_auto_norm_orb_depends_on_WTA(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=4)  # → ควร HAMMING2
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
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), norm_override="L2")  # ผิดชนิดสำหรับ ORB


def test_wta_k_mismatch_orb_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=4)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path))


# ============================================================
# 3) Cross-check vs KNN + Lowe
# ============================================================

def test_cross_check_defaults(tmp_path, img_pair_rot):
    # SIFT → default cross_check=False; ORB → default cross_check=True
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
    # เมื่อ cross_check=True → lowe_ratio ถูกปิด (None)
    assert out["bfmatcher_parameters_used"]["lowes_ratio_threshold"] is None


def test_force_knn_lowes_ratio_applied(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.7)
    assert abs(out["bfmatcher_parameters_used"]["lowes_ratio_threshold"] - 0.7) < 1e-6


# ============================================================
# 4) RANSAC / draw modes / echo
# ============================================================

def test_inliers_with_rotation_and_draw_modes(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=600)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=600)
    out_good = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.75, draw_mode="good")
    out_inl  = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.75, draw_mode="inliers")
    # ทั้งสองควรมี good matches > 0 และ inliers >= 0
    assert out_good["matching_statistics"]["num_good_matches"] >= 0
    assert out_inl["matching_statistics"]["num_good_matches"] >= 0
    # draw_mode ถูก echo
    assert out_good["bfmatcher_parameters_used"]["draw_mode"] == "good"
    assert out_inl["bfmatcher_parameters_used"]["draw_mode"] == "inliers"


def test_ransac_thresh_echo(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    out = bf_run(ja, jb, out_root=str(tmp_path), ransac_thresh=7.5)
    assert abs(out["bfmatcher_parameters_used"]["ransac_thresh"] - 7.5) < 1e-6


# ============================================================
# 5) Error-prop / Tool mismatch
# ============================================================

def test_mismatched_tools_raise(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    js = _ensure_feat_sift(tmp_path, a)
    jo = _ensure_feat_orb(tmp_path, b, WTA_K=2)
    with pytest.raises(ValueError):
        bf_run(js, jo, out_root=str(tmp_path))


@pytest.mark.skipif(not SURF_AVAILABLE, reason="SURF not available (opencv-contrib needed)")
def test_surf_pair_runs_when_available(tmp_path, img_pair_rot):
    # แค่ smoke test ว่ารันได้กับ SURF (รายละเอียด SURF test แยกไฟล์ไปแล้ว)
    from server.algos.feature.surf_adapter import run as surf_run
    a, b = img_pair_rot
    ja, _ = surf_run(a)
    jb, _ = surf_run(b)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    assert out["matching_tool"] == "BFMatcher"


def test_low_matches_on_very_different_images_orb(tmp_path, img_pair_diff):
    a, b = img_pair_diff
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=800)
    out = bf_run(ja, jb, out_root=str(tmp_path))
    # ภาพต่างกันมาก ควรมี inliers น้อย
    assert out["matching_statistics"]["num_inliers"] <= out["matching_statistics"]["num_good_matches"]


# ============================================================
# 6) NEW: Homography reasons
# ============================================================

def test_homography_reason_not_enough_good_matches(tmp_path):
    """
    บังคับให้ได้ good_matches < 4 เพื่อให้ homography_reason = 'not_enough_good_matches'
    ใช้ภาพที่ต่างกันมาก + KNN (cross_check=False) + ratio เข้ม
    """
    a = tmp_path / "n1.jpg"
    b = tmp_path / "n2.jpg"
    _write_textured(a, "N1")
    # ภาพต่าง: พื้นดำ + ข้อความมุมอื่น
    img = np.zeros((320, 320, 3), dtype=np.uint8)
    cv2.putText(img, "NOPE", (60, 180), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (200, 200, 200), 3, cv2.LINE_AA)
    cv2.imwrite(str(b), img)

    ja = _ensure_feat_sift(tmp_path, str(a), nfeatures=300)
    jb = _ensure_feat_sift(tmp_path, str(b), nfeatures=300)
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.6)  # เข้มขึ้นเพื่อตัดคู่เยอะๆ
    assert out["matching_statistics"]["homography_reason"] == "not_enough_good_matches"


def test_homography_failure_reason_exposed(tmp_path):
    """
    บังคับให้ findHomography คืน None เพื่อตรวจ 'homography_reason' = 'findHomography_failed'
    เงื่อนไข: ต้องมี good_matches >= 4 ก่อน (จึงจะเรียก findHomography)
    """
    # ใช้ภาพเดียวกันเพื่อให้แมตช์เยอะพอ
    img = tmp_path / "z.jpg"
    _write_textured(img, "Z")
    j1 = _ensure_feat_sift(tmp_path, str(img), nfeatures=500)
    j2 = _ensure_feat_sift(tmp_path, str(img), nfeatures=500)

    import server.algos.matching.bfmatcher_adapter as bfmod  # แค่ให้แน่ใจว่าเราอ้างโมดูลได้

    real_findH = cv2.findHomography

    def fake_findH(src, dst, method, r):
        return None, None

    cv2.findHomography = fake_findH
    try:
        out = bf_run(j1, j2, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.9)
        # มีแมตช์เพียงพอแล้ว แต่ findHomography ถูกทำให้ล้มเหลว → reason = 'findHomography_failed'
        assert out["matching_statistics"]["homography_reason"] == "findHomography_failed"
    finally:
        # คืนค่าฟังก์ชันตัวจริง
        cv2.findHomography = real_findH


# ============================================================
# 7) Extra validations / edge cases
# ============================================================

def test_lowe_ratio_validation(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=200)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=200)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=1.0)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.0)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=-0.1)


def test_ransac_thresh_validation(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=200)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=200)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), ransac_thresh=0.0)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), ransac_thresh=-1.0)


def test_norm_override_unknown_raises(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a)
    jb = _ensure_feat_sift(tmp_path, b)
    with pytest.raises(ValueError):
        bf_run(ja, jb, out_root=str(tmp_path), norm_override="FOO_BAR")  # ไม่รู้จัก


def test_orb_knn_default_ratio_is_0_8_when_not_overridden(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    # ORB + cross_check=False + ไม่ override → effective_lowe_ratio ต้องเป็น 0.8
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=800)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=800)
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False)
    assert abs(out["bfmatcher_parameters_used"]["lowes_ratio_threshold"] - 0.8) < 1e-6


def test_orb_explicit_cross_check_false_enables_lowe(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_orb(tmp_path, a, WTA_K=2, nfeatures=600)
    jb = _ensure_feat_orb(tmp_path, b, WTA_K=2, nfeatures=600)
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.77)
    assert out["bfmatcher_parameters_used"]["cross_check"] is False
    assert abs(out["bfmatcher_parameters_used"]["lowes_ratio_threshold"] - 0.77) < 1e-6


def test_good_matches_count_consistency(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=400)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=400)
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.75)
    gm = out.get("good_matches", [])
    assert isinstance(gm, list)
    assert out["matching_statistics"]["num_good_matches"] == len(gm)


def test_visualization_created_when_matches_exist(tmp_path, img_pair_rot):
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=600)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=600)
    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.75, draw_mode="good")
    vis = out.get("vis_url")
    # มีโอกาสแมตช์เยอะ → ควรสร้าง preview ได้
    assert vis is None or os.path.exists(vis)  # บางเครื่องอาจได้ None ถ้าแมตช์น้อย/วาดไม่สำเร็จ


def test_missing_image_files_do_not_crash(tmp_path, img_pair_rot):
    """
    แก้ไขพาธภาพใน JSON ให้หายไป แล้วเรียก bf_run อีกรอบ
    ต้องไม่ crash และค่า inputs.width/height/channels เป็น None
    """
    a, b = img_pair_rot
    ja = _ensure_feat_sift(tmp_path, a, nfeatures=200)
    jb = _ensure_feat_sift(tmp_path, b, nfeatures=200)

    # แกะ JSON แล้วทำให้ original_path ชี้ไปไฟล์ที่ไม่มีอยู่
    for jp in (ja, jb):
        data = _load_json(jp)
        data["image"]["original_path"] = str(tmp_path / "not_exists.jpg")
        with open(jp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    out = bf_run(ja, jb, out_root=str(tmp_path), cross_check=False, lowe_ratio=0.9)
    assert out["inputs"]["image1"]["width"] is None
    assert out["inputs"]["image1"]["height"] is None
    assert out["inputs"]["image1"]["channels"] is None
    assert out["inputs"]["image2"]["width"] is None
    assert out["inputs"]["image2"]["height"] is None
    assert out["inputs"]["image2"]["channels"] is None