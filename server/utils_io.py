# server/utils_io.py
import os
import uuid
import json
from pathlib import Path
from urllib.parse import urlparse
from typing import Optional
from fastapi import UploadFile

# --- Path Configuration ---
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.getenv("N2N_OUT", os.path.join(ROOT, "outputs"))
UPLOAD_DIR = os.path.join(OUT, "uploads")
RESULT_DIR = OUT

def ensure_dirs(*paths: str) -> None:
    for p in paths: os.makedirs(p, exist_ok=True)

def resolve_image_path(p: str) -> str:
    if not p: return p
    if p.startswith("http://") or p.startswith("https://"):
        path_part = urlparse(p).path or ""
    else:
        path_part = p

    if path_part.startswith("/static/"):
        rel = path_part[len("/static/"):] 
        return str(os.path.join(OUT, rel.lstrip("/")))

    if "/uploads/" in path_part:
        name = Path(path_part).name
        return str(os.path.join(UPLOAD_DIR, name))
    return p

def _read_json(path: str) -> dict:
    if not os.path.exists(path): return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

async def save_upload(f: UploadFile, dst_dir: str) -> str:
    ensure_dirs(dst_dir)
    ext = os.path.splitext(f.filename)[1] or ".bin"
    fname = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(dst_dir, fname)
    with open(path, "wb") as out:
        out.write(await f.read())
    return path

def static_url(abs_path: str, static_root: str) -> Optional[str]:
    if not abs_path: return None
    try:
        rel = os.path.relpath(abs_path, static_root).replace("\\", "/")
        return f"/static/{rel}"
    except ValueError:
        return None