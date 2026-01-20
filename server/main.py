# File: server/main.py
import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import จาก utils_io
from .utils_io import save_upload, static_url, ensure_dirs, OUT, UPLOAD_DIR
from .routers import (
    features, matching, alignment, quality, 
    classification, enhancement, restoration, segmentation
)

app = FastAPI(title="N2N Unified API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_dirs(UPLOAD_DIR, OUT)
app.mount("/static", StaticFiles(directory=OUT), name="static")

# Register Routers
app.include_router(features.router,       prefix="/api/feature")
app.include_router(matching.router,       prefix="/api/match")
app.include_router(alignment.router,      prefix="/api/alignment")
app.include_router(quality.router,        prefix="/api/quality")
app.include_router(classification.router, prefix="/api/classify")
app.include_router(enhancement.router,    prefix="/api/enhancement")
app.include_router(restoration.router,    prefix="/api/restoration")
app.include_router(segmentation.router,   prefix="/api/segmentation")

@app.post("/api/upload")
async def api_upload(files: list[UploadFile] = File(...)):
    saved = []
    for f in files:
        # save_upload ใน utils_io สร้างชื่อไฟล์แบบ UUID ให้แล้ว (แก้ Cache ได้เลย)
        path = await save_upload(f, UPLOAD_DIR)
        
        # ✅ FIX: ต้องส่ง 'name' และ 'path' กลับไปด้วย (ในโค้ดเดิมที่คุณส่งมามันหายไป)
        saved.append({
            "name": f.filename,
            "path": path,                  # 👈 สำคัญมาก! Frontend ต้องใช้สิ่งนี้
            "url": static_url(path, OUT)
        })
    return {"files": saved}