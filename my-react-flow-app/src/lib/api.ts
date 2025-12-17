// src/lib/api.ts

export const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export const abs = (url?: string) => {
  if (!url) return undefined;
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const absStrict = (url: string) =>
  /^(https?:|blob:|data:)/i.test(url) ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;

// ---------- Upload ----------
export async function uploadImages(files: File[], signal?: AbortSignal) {
  const formData = new FormData();
  for (const f of files) formData.append("files", f);

  const resp = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
    signal,
  });
  if (!resp.ok) throw new Error("Upload failed");
  return await resp.json();
}

// ---------- Feature ----------
export async function runSift(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/feature/sift`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  if (!resp.ok) throw new Error("SIFT API failed");
  return await resp.json();
}

export async function runSurf(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/feature/surf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  if (!resp.ok) throw new Error("SURF API failed");
  return await resp.json();
}

export async function runOrb(image_path: string, params?: Record<string, any>, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/feature/orb`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
    signal,
  });
  if (!resp.ok) throw new Error("ORB API failed");
  return await resp.json();
}

// ---------- Quality ----------
export async function runBrisque(image_path: string, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/quality/brisque`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path }),
    signal,
  });
  if (!resp.ok) throw new Error("BRISQUE failed");
  return await resp.json();
}

export async function runPsnr(originalPath: string, processedPath: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/quality/psnr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, // ส่ง JSON
    body: JSON.stringify({ 
      original_path: originalPath, 
      processed_path: processedPath,
      params 
    }),
    signal,
  });
  if (!resp.ok) throw new Error("PSNR request failed");
  return await resp.json();
}

export async function runSsim(originalPath: string, processedPath: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/quality/ssim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, // ส่ง JSON
    body: JSON.stringify({ 
      original_path: originalPath, 
      processed_path: processedPath,
      params 
    }),
    signal,
  });
  if (!resp.ok) throw new Error("SSIM request failed");
  return await resp.json();
}

// ---------- Matching ----------
export type BFFrontParams = {
  normType?: "AUTO" | "L1" | "L2" | "HAMMING" | "HAMMING2";
  crossCheck?: boolean;
  loweRatio?: number;
  ransacThresh?: number;
  norm_type?: "AUTO" | "L1" | "L2" | "HAMMING" | "HAMMING2";
  cross_check?: boolean;
  lowe_ratio?: number;
  ransac_thresh?: number;
  draw_mode?: "good" | "inliers";
  drawMode?: "good" | "inliers";
};

export async function runBfmatcher(jsonA: string, jsonB: string, params?: BFFrontParams, signal?: AbortSignal) {
  const rawNorm = params?.normType ?? params?.norm_type;
  const norm_type = rawNorm && rawNorm !== "AUTO" ? rawNorm : undefined;

  const payload = {
    json_a: jsonA,
    json_b: jsonB,
    norm_type,
    cross_check: params?.crossCheck ?? params?.cross_check,
    lowe_ratio: params?.loweRatio ?? params?.lowe_ratio,
    ransac_thresh: params?.ransacThresh ?? params?.ransac_thresh,
    draw_mode: params?.drawMode ?? params?.draw_mode,
  };

  const resp = await fetch(`${API_BASE}/api/match/bf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(msg || "BFMatcher failed");
  }
  return await resp.json();
}

export async function runFlannmatcher(jsonA: string, jsonB: string, params?: any, signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}/api/match/flann`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      json_a: jsonA,
      json_b: jsonB,
      lowe_ratio: params?.loweRatio,
      ransac_thresh: params?.ransacThresh,
      index_mode: params?.indexMode,
      kd_trees: params?.kdTrees,
      search_checks: params?.searchChecks,
      lsh_table_number: params?.lshTableNumber,
      lsh_key_size: params?.lshKeySize,
      lsh_multi_probe_level: params?.lshMultiProbeLevel,
      draw_mode: params?.drawMode,
      max_draw: params?.maxDraw,
    }),
    signal,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "FLANN matcher failed"));
  return res.json();
}

// ---------- Alignment ----------
export async function runHomographyAlignment(match_json: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/alignment/homography`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      match_json,
      warp_mode: params?.warp_mode ?? 'image2_to_image1',
      blend: params?.blend ?? false,
    }),
    signal,
  });
  if (!resp.ok) throw new Error(await resp.text().catch(() => 'Homography alignment failed'));
  return await resp.json();
}

export async function runAffineAlignment(match_json: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/alignment/affine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      match_json,
      warp_mode: params?.warp_mode ?? 'image2_to_image1',
      blend: params?.blend ?? false,
    }),
    signal,
  });
  if (!resp.ok) throw new Error(await resp.text().catch(() => 'Affine alignment failed'));
  return await resp.json();
}

// ---------- Classification ----------
export async function runOtsuClassification(image_path: string, params?: any, signal?: AbortSignal) {
  const resp = await fetch(`${API_BASE}/api/classify/otsu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path, ...(params || {}) }),
    signal,
  });
  if (!resp.ok) throw new Error(await resp.text().catch(() => 'Otsu classification failed'));
  return await resp.json();
}

export type SnakeInitMode = "circle" | "point" | "bbox" | "auto_circle" | "auto_rect" | "from_points" | "from_point";
export type SnakeRequest = { image_path: string; [key: string]: any };
export type SnakeResponse = { tool: string; json_path: string; json_url: string; overlay_url?: string; mask_url?: string; iterations?: number; contour_points?: number[][]; };

function normalizeSnakeRequest(req: SnakeRequest): SnakeRequest {
  const n = { ...req };
  if (n.max_iterations !== undefined) n.max_iterations = Math.max(1, Math.floor(Number(n.max_iterations) || 1));
  return n;
}

export async function runSnake(req: SnakeRequest, signal?: AbortSignal): Promise<SnakeResponse> {
  const payload = normalizeSnakeRequest(req);
  const resp = await fetch(`${API_BASE}/api/segmentation/snake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Snake API error ${resp.status}: ${t}`);
  }
  return resp.json();
}