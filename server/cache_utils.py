# server/cache_utils.py
import hashlib
import json
import os
from typing import Any, Dict, Iterable, Optional, Tuple

def _file_sig(path: str) -> Dict[str, Any]:
    try:
        st = os.stat(path)
        return {"path": os.path.abspath(path), "size": st.st_size, "mtime": int(st.st_mtime)}
    except FileNotFoundError:
        return {"path": os.path.abspath(path), "size": None, "mtime": None}

def make_cache_key(name: str, *, files: Iterable[str] = (), params: Optional[Dict[str, Any]] = None) -> str:
    """
    name: ชื่อรุ่นงาน/อัลกอริทึม เช่น 'sift', 'psnr', 'bf', 'flann' ฯลฯ
    files: ไฟล์อินพุตที่เกี่ยวข้อง (รูป, json descriptor)
    params: พารามิเตอร์ที่ส่งเข้าอะแดปเตอร์ (จะถูก canonicalize)
    """
    payload = {
        "name": name,
        "files": [_file_sig(f) for f in files],
        "params": params or {},
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()  # สั้น เร็ว พอสำหรับ key

def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)

def feature_paths(out_root: str, subdir: str, stem: str, ext_json=".json", ext_img=".jpg") -> Tuple[str, str]:
    """
    ใช้กับงานที่มี JSON + รูปพรีวิว (เช่น feature, matcher)
    คืน (json_path, vis_path) ที่ deterministic
    """
    base_dir = os.path.join(out_root, "features", subdir)
    ensure_dir(base_dir)
    json_path = os.path.join(base_dir, f"{stem}{ext_json}")
    vis_path = os.path.join(base_dir, f"{stem}{ext_img}")
    return json_path, vis_path

def metric_json_path(out_root: str, subdir: str, stem: str) -> str:
    """
    ใช้กับงานที่เก็บเฉพาะ JSON (เช่น brisque/psnr/ssim)
    """
    base_dir = os.path.join(out_root, "features", subdir)
    ensure_dir(base_dir)
    return os.path.join(base_dir, f"{stem}.json")