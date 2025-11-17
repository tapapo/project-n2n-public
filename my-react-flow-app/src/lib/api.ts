// src/lib/api.ts

// ===== Base URL & URL helpers =====
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

export async function runPsnr(originalFile: File, processedFile: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append("original", originalFile);
  formData.append("processed", processedFile);

  const resp = await fetch(`${API_BASE}/api/quality/psnr`, {
    method: "POST",
    body: formData,
    signal,
  });
  if (!resp.ok) throw new Error("PSNR request failed");
  return await resp.json();
}

export async function runSsim(originalFile: File, processedFile: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append("original", originalFile);
  formData.append("processed", processedFile);

  const resp = await fetch(`${API_BASE}/api/quality/ssim`, {
    method: "POST",
    body: formData,
    signal,
  });
  if (!resp.ok) throw new Error("SSIM request failed");
  return await resp.json();
}

// ---------- Matching ----------
export type BFFrontParams = {
  // รองรับทั้ง camelCase และ snake_case
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

export async function runBfmatcher(
  jsonA: string,
  jsonB: string,
  params?: BFFrontParams,
  signal?: AbortSignal
) {
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

export async function runFlannmatcher(
  jsonA: string,
  jsonB: string,
  params?: {
    loweRatio?: number;
    ransacThresh?: number;
    indexMode?: 'AUTO' | 'KD_TREE' | 'LSH';
    kdTrees?: number;
    searchChecks?: number;
    lshTableNumber?: number;
    lshKeySize?: number;
    lshMultiProbeLevel?: number;
    drawMode?: 'good' | 'inliers';
    maxDraw?: number;
  },
  signal?: AbortSignal
) {
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
export async function runHomographyAlignment(
  match_json: string,
  params?: { warp_mode?: 'image2_to_image1' | 'image1_to_image2'; blend?: boolean },
  signal?: AbortSignal
) {
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

export async function runAffineAlignment(
  match_json: string,
  params?: { warp_mode?: 'image2_to_image1' | 'image1_to_image2'; blend?: boolean },
  signal?: AbortSignal
) {
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

// ---------- Classification (Otsu) ----------
export async function runOtsuClassification(
  image_path: string,
  params?: {
    gaussian_blur?: boolean;
    blur_ksize?: number;
    invert?: boolean;
    morph_open?: boolean;
    morph_close?: boolean;
    morph_kernel?: number;
    show_histogram?: boolean;
  },
  signal?: AbortSignal
) {
  const resp = await fetch(`${API_BASE}/api/classify/otsu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path, ...(params || {}) }),
    signal,
  });
  if (!resp.ok) throw new Error(await resp.text().catch(() => 'Otsu classification failed'));
  return await resp.json();
}

// ---------- Snake (Active Contour) ----------

export type SnakeInitMode =
  | "circle"
  | "point"
  | "bbox"
  | "auto_circle"
  | "auto_rect"
  | "from_points"   // list [[x,y], ...]
  | "from_point";   // seed (x,y)

export type SnakeRequest = {
  image_path: string;

  // --- dynamics / forces ---
  alpha?: number;
  beta?: number;
  gamma?: number;
  w_line?: number;
  w_edge?: number;
  max_iterations?: number;
  convergence?: number;

  // --- initialization ---
  init_mode?: SnakeInitMode;

  init_cx?: number | null;
  init_cy?: number | null;
  init_radius?: number | null;

  init_points?: number | number[][] | null;

  from_point_x?: number | null;
  from_point_y?: number | null;

  bbox_x1?: number | null;
  bbox_y1?: number | null;
  bbox_x2?: number | null;
  bbox_y2?: number | null;

  // preprocess
  gaussian_blur_ksize?: number;   // 0 = none
};

export type SnakeResponse = {
  tool: "SnakeActiveContour" | "Snake";
  json_path: string;
  json_url: string;
  overlay_url?: string | null;
  contour_url?: string | null;
  iterations?: number;
  mask_url?: string | null;
  cache?: boolean;
  contour_points?: number[][];
};


// --- helper: sanitize request ---
function normalizeSnakeRequest(req: SnakeRequest): SnakeRequest {
  const n = { ...req };

  // force iteration to valid int
  if (n.max_iterations !== undefined) {
    n.max_iterations = Math.max(1, Math.floor(Number(n.max_iterations) || 1));
  }

  // blur
  if (n.gaussian_blur_ksize !== undefined) {
    n.gaussian_blur_ksize = Math.max(0, Math.floor(Number(n.gaussian_blur_ksize) || 0));
  }

  // convergence
  if (n.convergence !== undefined) {
    const cv = Number(n.convergence);
    n.convergence = cv >= 0 ? cv : 0;
  }

  // init_points handling
  if (Array.isArray(n.init_points)) {
    n.init_points = n.init_points
      .filter(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          isFinite(Number(p[0])) &&
          isFinite(Number(p[1]))
      )
      .map((p) => [Number(p[0]), Number(p[1])]);
    if (n.init_points.length === 0) {
      n.init_points = null;
    }
  } else if (n.init_points != null) {
    const num = Number(n.init_points);
    n.init_points = Number.isFinite(num) ? Math.max(3, Math.floor(num)) : null;
  }

  const numOrNull = (v: unknown) =>
    v == null ? null : (Number(v) ?? null);

  n.init_cx = numOrNull(n.init_cx);
  n.init_cy = numOrNull(n.init_cy);
  n.init_radius = numOrNull(n.init_radius);

  n.from_point_x = numOrNull(n.from_point_x);
  n.from_point_y = numOrNull(n.from_point_y);

  n.bbox_x1 = numOrNull(n.bbox_x1);
  n.bbox_y1 = numOrNull(n.bbox_y1);
  n.bbox_x2 = numOrNull(n.bbox_x2);
  n.bbox_y2 = numOrNull(n.bbox_y2);

  // force numeric types
  const toNum = (v: unknown) => (v == null ? (v as any) : Number(v));
  n.alpha = toNum(n.alpha);
  n.beta = toNum(n.beta);
  n.gamma = toNum(n.gamma);
  n.w_line = toNum(n.w_line);
  n.w_edge = toNum(n.w_edge);

  return n;
}


// --- direct call to segmentation API ---
export async function runSnake(
  req: SnakeRequest,
  signal?: AbortSignal
): Promise<SnakeResponse> {
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


// --- classification fallback wrapper ---
export async function runSnakeClassification(
  image_path: string,
  params?: Omit<SnakeRequest, "image_path">,
  signal?: AbortSignal
): Promise<SnakeResponse> {
  const body = JSON.stringify(normalizeSnakeRequest({ image_path, ...(params || {}) }));

  const fire = async (path: string) =>
    fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });

  let resp = await fire(`/api/classify/snake`);
  if (resp.ok) return resp.json();

  if (resp.status === 404 || resp.status === 405) {
    resp = await fire(`/api/classification/snake`);
    if (resp.ok) return resp.json();

    if (resp.status === 404 || resp.status === 405) {
      resp = await fire(`/api/segmentation/snake`);
      if (resp.ok) return resp.json();
    }
  }

  const txt = await resp.text().catch(() => "");
  throw new Error(`Snake classification failed (${resp.status}). ${txt}`);
}