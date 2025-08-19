// src/lib/api.ts

// ---------- Upload ----------
export async function uploadImages(files: File[]) {
  const formData = new FormData();
  for (const f of files) {
    formData.append("files", f);
  }

  const resp = await fetch("http://localhost:8000/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) throw new Error("Upload failed");
  return await resp.json();
}

// ---------- Feature ----------
export async function runSift(image_path: string, params?: Record<string, any>) {
  const resp = await fetch("http://localhost:8000/api/feature/sift", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
  });
  if (!resp.ok) throw new Error("SIFT API failed");
  return await resp.json();
}

export async function runSurf(image_path: string, params?: Record<string, any>) {
  const resp = await fetch("http://localhost:8000/api/feature/surf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
  });
  if (!resp.ok) throw new Error("SURF API failed");
  return await resp.json();
}

export async function runOrb(image_path: string, params?: Record<string, any>) {
  const resp = await fetch("http://localhost:8000/api/feature/orb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path, params }),
  });
  if (!resp.ok) throw new Error("ORB API failed");
  return await resp.json();
}

// ---------- Quality ----------
export async function runBrisque(image_path: string) {
  const resp = await fetch("http://localhost:8000/api/quality/brisque", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_path }),
  });
  if (!resp.ok) throw new Error("BRISQUE failed");
  return await resp.json();
}

export async function runPsnr(originalFile: File, processedFile: File) {
  const formData = new FormData();
  formData.append("original", originalFile);
  formData.append("processed", processedFile);

  const resp = await fetch("http://localhost:8000/api/quality/psnr", {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) throw new Error("PSNR request failed");
  return await resp.json(); // backend ส่ง JSON structured
}

export async function runSsim(originalFile: File, processedFile: File) {
  const formData = new FormData();
  formData.append("original", originalFile);
  formData.append("processed", processedFile);

  const resp = await fetch("http://localhost:8000/api/quality/ssim", {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) throw new Error("SSIM request failed");
  return await resp.json();
}


// ---------- Matching ----------

export async function runBfmatcher(jsonA: string, jsonB: string) {
  const resp = await fetch("http://localhost:8000/api/match/bf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json_a: jsonA, json_b: jsonB }),
  });
  if (!resp.ok) throw new Error("BFMatcher failed");
  return await resp.json();
}

export async function runFlannmatcher(jsonA: string, jsonB: string, ratio = 0.75, ransac = 5.0) {
  const res = await fetch("http://127.0.0.1:8000/api/match/flann", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      json_a: jsonA,
      json_b: jsonB,
      lowe_ratio: ratio,
      ransac_thresh: ransac,
    }),
  });
  return res.json();
}
// ---------- Helpers ----------
export const abs = (url: string) => {
  if (!url) return url;
  if (url.startsWith("http")) return url;
  return `http://localhost:8000${url}`;
};