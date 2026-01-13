// src/lib/api.ts
export const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

/**
 * แปลง URL หรือ Path สัมพัทธ์ให้เป็น URL สมบูรณ์
 */
export const abs = (url?: string) => {
  if (!url) return undefined;
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const absStrict = (url: string) =>
  /^(https?:|blob:|data:)/i.test(url) ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;

// ✅ Helper ใหม่: เช็ค Error จาก Backend อัตโนมัติ
async function handleResponse(resp: Response) {
  if (!resp.ok) {
    // พยายามอ่านข้อความ Error จาก Backend (เช่น "Configuration Error...")
    const errBody = await resp.json().catch(() => ({}));
    const msg = errBody.detail || `Request failed with status ${resp.status}`;
    throw new Error(msg);
  }
  return resp.json();
}

// ---------- 1. Core / Upload ----------
export async function uploadImages(files: File[], signal?: AbortSignal) {
  const formData = new FormData();
  for (const f of files) formData.append("files", f);
  const resp = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
    signal,
  });
  // Upload มักเช็คแยก แต่ใช้ helper ก็ได้ (อันนี้คงเดิมไว้ตามสไตล์คุณ)
  if (!resp.ok) throw new Error("Upload failed");
  return await resp.json();
}

// ---------- 2. Feature Detection (SIFT, SURF, ORB) ----------
export async function runSift(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/feature/sift`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp); // ✅ ใช้ handleResponse
}

export async function runSurf(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/feature/surf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp); // ✅ ใช้ handleResponse
}

export async function runOrb(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/feature/orb`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp); // ✅ ใช้ handleResponse
}

// ---------- 3. Enhancement ----------
export async function runCLAHE(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/enhancement/clahe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp);
}

export async function runMSRCR(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/enhancement/msrcr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp);
}

export async function runZeroDCE(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/enhancement/zero_dce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp);
}

// ---------- 4. Matching & Alignment ----------
export async function runBfmatcher(jsonA: string, jsonB: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/match/bf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json_a: jsonA, json_b: jsonB, ...params }), // ...params ถูกต้องแล้ว
    signal,
  });
  return handleResponse(resp); // ✅ สำคัญ: ต้องดัก Error ตรงนี้ ไม่งั้น Node ไม่แดง
}

export async function runFlannmatcher(jsonA: string, jsonB: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/match/flann`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json_a: jsonA, json_b: jsonB, ...params }), // ...params ถูกต้องแล้ว
    signal,
  });
  return handleResponse(resp); // ✅ สำคัญ: ต้องดัก Error ตรงนี้ ไม่งั้น Node ไม่แดง
}

export async function runHomographyAlignment(match_json: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/alignment/homography`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_json, ...params }),
    signal,
  });
  return handleResponse(resp);
}

export async function runAffineAlignment(match_json: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/alignment/affine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_json, ...params }),
    signal,
  });
  return handleResponse(resp);
}

// ---------- 5. Quality Metrics ----------
export async function runBrisque(image_path: string, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/quality/brisque`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path }),
    signal,
  });
  return handleResponse(resp);
}

export async function runPsnr(originalPath: string, processedPath: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/quality/psnr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ original_path: originalPath, processed_path: processedPath, params }),
    signal,
  });
  return handleResponse(resp);
}

export async function runSsim(originalPath: string, processedPath: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/quality/ssim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ original_path: originalPath, processed_path: processedPath, params }),
    signal,
  });
  return handleResponse(resp);
}

// ---------- 6. Segmentation & Classification ----------
export async function runSnake(req: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/classify/snake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  return handleResponse(resp);
}

export async function runOtsuClassification(image_path: string, params?: any, signal?: AbortSignal) {
    const resp = await fetch(`${API_BASE}/api/classify/otsu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_path, ...params }),
      signal,
    });
    return handleResponse(resp);
}

export async function runDeepLab(image_path: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/segmentation/deeplab`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp);
}

export async function runUNET(image_path: string, params?: any, signal?: AbortSignal) {
    const resp = await fetch(`${API_BASE}/api/segmentation/unet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_path, params }),
      signal,
    });
    return handleResponse(resp);
}

export async function runMaskRCNN(image_path: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/segmentation/mask_rcnn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp);
}

// ---------- 7. Restoration ----------
export async function runDncnn(image_path: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/restoration/dncnn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp);
}

export async function runSwinIR(image_path: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/restoration/swinir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp);
}

export async function runRealESRGAN(image_path: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/restoration/realesrgan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  return handleResponse(resp);
}