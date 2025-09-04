# tests/test_brisque_suite.py
import os
import glob
import cv2
import numpy as np
import tempfile
import shutil
import pytest
from typing import List, Tuple

from server.algos.quality.brisque_adapter import run  # ← ตามที่คุณต้องการ

# ========== Utils ==========

def _ensure_write(path: str, img: np.ndarray) -> None:
    ok = cv2.imwrite(path, img)
    assert ok, f"Cannot write {path}"

def _list_images_from_env(max_n: int = 8) -> List[str]:
    root = os.environ.get("BRISQUE_TEST_IMAGES", "").strip()
    if not root:
        return []
    patterns = ["*.jpg", "*.jpeg", "*.png", "*.bmp", "*.tif", "*.tiff", "*.JPG", "*.PNG"]
    files = []
    for p in patterns:
        files.extend(glob.glob(os.path.join(root, p)))
    files = sorted(files)
    return files[:max_n]

def _make_synthetic_natural_like(h: int = 360, w: int = 540) -> np.ndarray:
    # เดิม: gradient + รูปร่างง่าย
    base = np.tile(np.linspace(20, 230, w, dtype=np.uint8), (h, 1))
    img = cv2.merge([base, base, base])
    cv2.circle(img, (w//2, h//2), 60, (255, 255, 255), -1)
    cv2.rectangle(img, (40, 40), (200, 160), (80, 80, 80), -1)

    # เติม texture เล็กน้อยให้ใกล้ natural ขึ้น (low-amplitude noise + mild blur)
    noise = np.random.normal(0, 3, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = cv2.GaussianBlur(img, (3, 3), 0.7)
    return img

def _distort_jpeg(path_in: str, qualities: List[int], tmpdir: str) -> List[Tuple[int, str]]:
    img = cv2.imread(path_in, cv2.IMREAD_COLOR)
    outs = []
    for q in qualities:
        out = os.path.join(tmpdir, f"{os.path.splitext(os.path.basename(path_in))[0]}_jq{q}.jpg")
        cv2.imwrite(out, img, [int(cv2.IMWRITE_JPEG_QUALITY), int(q)])
        outs.append((q, out))
    return outs

def _distort_blur(path_in: str, sigmas: List[float], tmpdir: str) -> List[Tuple[float, str]]:
    img = cv2.imread(path_in, cv2.IMREAD_COLOR)
    outs = []
    for s in sigmas:
        k = int(max(3, round(s * 3) * 2 + 1))
        blur = cv2.GaussianBlur(img, (k, k), s)
        out = os.path.join(tmpdir, f"{os.path.splitext(os.path.basename(path_in))[0]}_blur{int(s*10)}.jpg")
        _ensure_write(out, blur)
        outs.append((s, out))
    return outs

def _distort_noise(path_in: str, sigmas: List[float], tmpdir: str) -> List[Tuple[float, str]]:
    img = cv2.imread(path_in, cv2.IMREAD_COLOR)
    outs = []
    for s in sigmas:
        noise = np.random.normal(0, s, img.shape).astype(np.int16)
        noisy = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        out = os.path.join(tmpdir, f"{os.path.splitext(os.path.basename(path_in))[0]}_ns{int(s)}.jpg")
        _ensure_write(out, noisy)
        outs.append((s, out))
    return outs

def _is_synthetic(path: str) -> bool:
    return os.path.basename(path).startswith("synthetic_")

def _strict_expected() -> bool:
    """ใช้ strict checks ก็ต่อเมื่อมี BRISQUE_TEST_IMAGES (รูปจริง)"""
    return bool(os.environ.get("BRISQUE_TEST_IMAGES", "").strip())

# ========== Fixtures ==========

@pytest.fixture(scope="module")
def tmpdir():
    d = tempfile.mkdtemp(prefix="brisque_pytest_")
    yield d
    shutil.rmtree(d, ignore_errors=True)

@pytest.fixture(scope="module")
def base_images(tmpdir) -> List[str]:
    imgs = _list_images_from_env(max_n=4)
    paths = []
    if imgs:
        for i, p in enumerate(imgs):
            img = cv2.imread(p, cv2.IMREAD_COLOR)
            if img is None:
                continue
            q = os.path.join(tmpdir, f"real_{i}.jpg")
            _ensure_write(q, img)
            paths.append(q)
    else:
        for i in range(2):
            img = _make_synthetic_natural_like()
            q = os.path.join(tmpdir, f"synthetic_{i}.jpg")
            _ensure_write(q, img)
            paths.append(q)

    assert len(paths) > 0, "No base images prepared"
    return paths

# ========== Tests: Distortion trends ==========

@pytest.mark.parametrize("qualities", [[95, 90, 70, 50, 30, 20]])
def test_jpeg_quality_trend(base_images, tmpdir, qualities):
    """
    ถ้าเป็นรูปจริง → คาดหวังแนวโน้ม: คุณภาพ JPEG ลดลง (Q จากสูง→ต่ำ) → คะแนน BRISQUE โดยรวมควรสูงขึ้น (non-decreasing โดยมี tolerance)
    ถ้าเป็นรูปสังเคราะห์ → ใช้เงื่อนไขแบบผ่อน เพราะสถิติอาจไม่ "ธรรมชาติ"
    """
    tol = 2.0  # tolerance สำหรับการ "ไม่ลดลง" เผื่อ jitter
    strict = _strict_expected()

    for p in base_images:
        var_paths = _distort_jpeg(p, qualities, tmpdir)

        # รวม baseline (บันทึกสำเนา Q=100) ไว้หัวขบวน
        img = cv2.imread(p, cv2.IMREAD_COLOR)
        q100_path = os.path.join(tmpdir, f"{os.path.splitext(os.path.basename(p))[0]}_jq100.jpg")
        cv2.imwrite(q100_path, img, [int(cv2.IMWRITE_JPEG_QUALITY), 100])

        seq = [(100, q100_path)] + var_paths
        scores = []
        for q, path_q in seq:
            _, d = run(path_q, out_root=tmpdir)
            scores.append((q, d["quality_score"]))

        ordered_scores = [s for _, s in scores]
        if strict and not _is_synthetic(p):
            # strict: non-decreasing เมื่อ Q ลดลง
            for i in range(1, len(ordered_scores)):
                assert ordered_scores[i] >= ordered_scores[i-1] - tol, f"JPEG not non-decreasing: {scores}"
        else:
            # relaxed: ต้องมีอย่างน้อยครึ่งหนึ่งของ distortions ที่คะแนน >= baseline - tol
            baseline = ordered_scores[0]
            distorted = ordered_scores[1:]
            assert sum(s >= baseline - tol for s in distorted) >= max(1, len(distorted)//2), \
                f"Relaxed JPEG check failed for synthetic-like image: {scores}"

@pytest.mark.parametrize("sigmas", [[0.0, 0.5, 1.0, 1.5, 2.5]])
def test_blur_trend(base_images, tmpdir, sigmas):
    tol = 2.0
    strict = _strict_expected()

    for p in base_images:
        # รวม sigma=0 (original) เป็น baseline
        img = cv2.imread(p, cv2.IMREAD_COLOR)
        base_path = os.path.join(tmpdir, f"{os.path.splitext(os.path.basename(p))[0]}_blur0.jpg")
        _ensure_write(base_path, img)
        var_paths = _distort_blur(p, [s for s in sigmas if s > 0], tmpdir)
        seq = [(0.0, base_path)] + var_paths

        scores = []
        for s, path_s in seq:
            _, d = run(path_s, out_root=tmpdir)
            scores.append((s, d["quality_score"]))

        ordered_scores = [sc for _, sc in scores]
        if strict and not _is_synthetic(p):
            for i in range(1, len(ordered_scores)):
                assert ordered_scores[i] >= ordered_scores[i-1] - tol, f"Blur not non-decreasing: {scores}"
        else:
            baseline = ordered_scores[0]
            distorted = ordered_scores[1:]
            # ผ่อน: ค่าเฉลี่ยครึ่งหลัง (sigma สูง) ควร >= ค่าเฉลี่ยครึ่งแรก (sigma ต่ำ) - tol
            mid = len(distorted)//2
            low = distorted[:mid] if mid else distorted
            high = distorted[mid:] if mid else distorted
            if low and high:
                assert (np.mean(high) + tol) >= np.mean(low), f"Relaxed blur check failed: {scores}"
            else:
                assert any(s >= baseline - tol for s in distorted), f"Relaxed blur check failed (short): {scores}"

@pytest.mark.parametrize("sigmas", [[0, 5, 10, 20, 30]])
def test_noise_trend(base_images, tmpdir, sigmas):
    tol = 2.0
    strict = _strict_expected()

    for p in base_images:
        # รวม sigma=0 baseline
        img = cv2.imread(p, cv2.IMREAD_COLOR)
        base_path = os.path.join(tmpdir, f"{os.path.splitext(os.path.basename(p))[0]}_ns0.jpg")
        _ensure_write(base_path, img)
        var_paths = _distort_noise(p, [s for s in sigmas if s > 0], tmpdir)
        seq = [(0.0, base_path)] + var_paths

        scores = []
        for s, path_s in seq:
            _, d = run(path_s, out_root=tmpdir)
            scores.append((s, d["quality_score"]))

        ordered_scores = [sc for _, sc in scores]
        if strict and not _is_synthetic(p):
            for i in range(1, len(ordered_scores)):
                assert ordered_scores[i] >= ordered_scores[i-1] - tol, f"Noise not non-decreasing: {scores}"
        else:
            baseline = ordered_scores[0]
            distorted = ordered_scores[1:]
            # ผ่อน: อย่างน้อยครึ่งหนึ่งของ distortions ต้องมีคะแนน >= baseline - tol
            assert sum(s >= baseline - tol for s in distorted) >= max(1, len(distorted)//2), \
                f"Relaxed noise check failed: {scores}"

# ========== IO/Format & JSON schema (เดิม) ==========

def test_support_bgra_and_16bit_and_float(base_images, tmpdir):
    p = base_images[0]
    bgr = cv2.imread(p, cv2.IMREAD_COLOR)
    assert bgr is not None

    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    p_bgra = os.path.join(tmpdir, "fmt_bgra.png")
    _ensure_write(p_bgra, bgra)

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.uint16)
    gray16 = (gray.astype(np.uint16) * 256).clip(0, 65535).astype(np.uint16)
    p_16 = os.path.join(tmpdir, "fmt_u16.tiff")
    _ensure_write(p_16, gray16)

    gray_f32 = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    p_f32 = os.path.join(tmpdir, "fmt_float_like.png")
    _ensure_write(p_f32, (gray_f32 * 255.0).astype(np.uint8))

    for path in [p_bgra, p_16, p_f32]:
        _, data = run(path, out_root=tmpdir)
        assert "quality_score" in data
        assert isinstance(data["quality_score"], float)

def test_tiny_image_rejected(tmpdir):
    tiny = np.full((32, 32, 3), 128, dtype=np.uint8)
    ptiny = os.path.join(tmpdir, "tiny.jpg")
    _ensure_write(ptiny, tiny)
    with pytest.raises(ValueError):
        run(ptiny, out_root=tmpdir)

def test_output_json_schema(base_images, tmpdir):
    p = base_images[0]
    out_path, data = run(p, out_root=tmpdir)
    assert os.path.exists(out_path)

    for key in ["tool", "tool_version", "image", "brisque_parameters_used", "quality_score", "quality_bucket"]:
        assert key in data

    assert data["tool"] == "BRISQUE"
    assert isinstance(data["quality_score"], float)
    assert data["quality_bucket"] in {"excellent", "good", "fair", "poor", "very_poor"}

    imginfo = data["image"]
    assert imginfo.get("channels", None) == 1
    shp = imginfo.get("processed_shape", [])
    assert isinstance(shp, list) and len(shp) == 2 and min(shp) >= 48