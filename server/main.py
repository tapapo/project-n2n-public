import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
        path = await save_upload(f, UPLOAD_DIR)
        saved.append({"url": static_url(path, OUT)})
    return {"files": saved}