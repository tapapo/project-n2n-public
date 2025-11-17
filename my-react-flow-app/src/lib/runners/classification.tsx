// src/lib/runners/classification.tsx
import React from 'react';
import { type Node as RFNode } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { runOtsuClassification, runSnake, abs } from '../api';
import { markStartThenRunning } from './utils';

type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;

// -------- edges type (ให้กว้างไว้พอประมาณ) ----------
type AnyEdge = {
  id?: string;
  source: string;
  target: string;
  targetHandle?: string | null;
  [k: string]: any;
};

// ===== helpers =====
const getIncoming = (edges: AnyEdge[], id: string) => edges.filter((e) => e.target === id);

// ดึง path ของรูปจาก upstream image-input
function getUpstreamImagePath(nodes: RF[], edges: AnyEdge[], nodeId: string): string | null {
  const incoming = getIncoming(edges, nodeId);
  for (const e of incoming) {
    const prev = nodes.find((n) => n.id === e.source);
    if (prev?.type === 'image-input' && prev.data?.payload?.path) {
      return String(prev.data.payload.path);
    }
  }
  return null;
}

// ดึง params ที่ผู้ใช้เคยปรับไว้บน node (ถ้าไม่มีให้เป็นว่าง)
function getNodeParams<T extends object = Record<string, any>>(node: RF): T {
  return ((node.data?.payload?.params as T) ?? ({} as T));
}

/**
 * runOtsu
 * - รับภาพจาก image-input upstream
 * - เรียก /api/classify/otsu
 * - อัปเดต payload ด้วยผลลัพธ์และพรีวิว
 */
export async function runOtsu(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: AnyEdge[],
  signal?: AbortSignal
) {
  const nodeId = node.id;
  const imagePath = getUpstreamImagePath(nodes, edges, nodeId);

  if (!imagePath) {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'fault',
                description: 'No upstream image-input found',
              },
            }
          : x
      )
    );
    return;
  }

  // รวม default + ของเดิมที่ user เคยเซ็ตไว้ใน node
  const defaults = {
    gaussian_blur: true,
    blur_ksize: 5,
    invert: false,
    morph_open: false,
    morph_close: false,
    morph_kernel: 3,
    show_histogram: false,
  };
  const params = { ...defaults, ...getNodeParams(node) };

  await markStartThenRunning(nodeId, 'Running OTSU', setNodes);

  try {
    const resp = await runOtsuClassification(imagePath, params, signal);
    const previewUrl: string | undefined = resp?.binary_url;
    const thr = resp?.threshold;

    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: `OTSU threshold = ${thr ?? '?'}`,
                payload: {
                  ...(x.data?.payload || {}),
                  params,
                  json: resp,
                  result_image_url: previewUrl ? abs(previewUrl) : undefined,
                  preview_url: previewUrl ? abs(previewUrl) : undefined,
                  json_url: resp?.json_url,
                  json_path: resp?.json_path,
                  histogram_url: resp?.histogram_url ? abs(resp.histogram_url) : undefined,
                },
              },
            }
          : x
      )
    );
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: err?.message || 'OTSU failed' } }
          : x
      )
    );
  }
}

/**
 * runSnake (Active Contour)
 * - รับภาพจาก image-input upstream
 * - เรียก /api/segmentation/snake (ผ่าน runSnake)
 * - อัปเดต payload: contour/mask preview, json_url, จุดเส้นขอบ ฯลฯ
 */
export async function runSnakeRunner(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: AnyEdge[],
  signal?: AbortSignal
) {
  const nodeId = node.id;
  const imagePath = getUpstreamImagePath(nodes, edges, nodeId);

  if (!imagePath) {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: 'No upstream image-input found' } }
          : x
      )
    );
    return;
  }

  // ดึง params ที่ user ปรับไว้ใน SnakeNode (อาจเป็น string/number)
  const params: any = { ...getNodeParams(node) };

  await markStartThenRunning(nodeId, 'Running Snake (Active Contour)', setNodes);

  try {
    const resp = await runSnake(
      {
        image_path: imagePath,

        // ---- Snake dynamics (ให้ตรงกับ SnakeNode.DEFAULT_PARAMS) ----
        alpha: params.alpha ?? 0.2,
        beta: params.beta ?? 0.2,
        gamma: params.gamma ?? 0.1,
        w_line: params.w_line ?? 0.0,
        w_edge: params.w_edge ?? 1.0,
        max_iterations: params.max_iterations ?? 250,
        convergence: params.convergence ?? 0.001,

        // ---- Initialization ----
        init_mode: params.init_mode ?? 'circle',
        init_cx: params.init_cx ?? null,
        init_cy: params.init_cy ?? null,
        init_radius: params.init_radius ?? null,
        init_points: params.init_points ?? 400,

        from_point_x: params.from_point_x ?? null,
        from_point_y: params.from_point_y ?? null,

        bbox_x1: params.bbox_x1 ?? null,
        bbox_y1: params.bbox_y1 ?? null,
        bbox_x2: params.bbox_x2 ?? null,
        bbox_y2: params.bbox_y2 ?? null,

        // ---- Preprocessing (เหลือแค่ gaussian_blur_ksize; 0 = ไม่เบลอ) ----
        gaussian_blur_ksize: params.gaussian_blur_ksize ?? 0,
      },
      signal
    );

    // ----- เลือกภาพพรีวิว -----
    const preview =
      (resp?.overlay_url ? abs(resp.overlay_url) : undefined) ??
      (resp?.mask_url ? abs(resp.mask_url) : undefined);

    // ----- อัปเดต Node State -----
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: `Snake done (${resp?.iterations ?? 'n/a'} iters)`,
                payload: {
                  ...(x.data?.payload || {}),
                  params, // เก็บ params เดิมที่ user เซ็ตไว้ใน node
                  json: resp,
                  preview_url: preview,
                  result_image_url: preview,
                  json_url: resp?.json_url,
                  json_path: resp?.json_path,
                  overlay_url: resp?.overlay_url ? abs(resp.overlay_url) : undefined,
                  mask_url: resp?.mask_url ? abs(resp.mask_url) : undefined,
                  contour_points: resp?.contour_points,
                  iterations: resp?.iterations,
                },
              },
            }
          : x
      )
    );
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'fault',
                description: err?.message || 'Snake failed',
              },
            }
          : x
      )
    );
  }
}