import os, uuid, json
from typing import Optional
from fastapi import UploadFile

def ensure_dirs(*paths: str) -> None:
    for p in paths: os.makedirs(p, exist_ok=True)

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
    rel = os.path.relpath(abs_path, static_root).replace("\\", "/")
    return f"/static/{rel}"

def save_json(payload: dict, out_dir: str, stem: Optional[str] = None) -> str:
    ensure_dirs(out_dir)
    import time
    if not stem: stem = str(int(time.time()*1000))
    path = os.path.join(out_dir, f"{stem}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4, ensure_ascii=False)
    return path
