// my-react-flow-app/src/lib/runners/classification.tsx
import React from 'react';
import { type Node as RFNode } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { runOtsuClassification, runSnake, abs } from '../api';
import { markStartThenRunning, updateNodeStatus } from './utils';

type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;

type AnyEdge = {
  id?: string;
  source: string;
  target: string;
  targetHandle?: string | null;
  [k: string]: any;
};

const getIncoming = (edges: AnyEdge[], id: string) => edges.filter((e) => e.target === id);

function getNodeParams<T extends object = Record<string, any>>(node: RF): T {
  return ((node.data?.payload?.params as T) ?? ({} as T));
}

// ✅ Helper: หา Path รูปภาพจาก Node ก่อนหน้า (รองรับ Alignment ด้วย)
function getUpstreamImagePath(nodes: RF[], edges: AnyEdge[], nodeId: string): string | null {
  const incoming = getIncoming(edges, nodeId);
  for (const e of incoming) {
    const prev = nodes.find((n) => n.id === e.source);
    if (!prev || !prev.data) continue;

    const data = prev.data.payload || prev.data.output;
    if (!data) continue;

    if (typeof data === 'string') return data;

    if (typeof data === 'object') {
      return (
        (data as any).path ||
        (data as any).image_path ||
        (data as any).aligned_image ||   // ✅ เพิ่มรองรับ alignment
        (data as any).aligned_path ||    // ✅ เพิ่มรองรับ alignment
        (data as any).aligned_url ||     // ✅ เพิ่มรองรับ alignment
        (data as any).saved_path ||
        (data as any).binary_url ||
        (data as any).result_image_url ||
        null
      );
    }
  }
  return null;
}

// ✅ สร้างข้อความ Error มาตรฐาน
const ERR_NO_IMAGE = "No input image found.";

// ✅ รายชื่อ Node ที่ห้ามใช้เป็น Input ให้ Classification (อนุญาต alignment แล้ว)
const INVALID_INPUT_TYPES = [
  'sift',
  'surf',
  'orb',
  'bfmatcher',
  'flannmatcher',
  'psnr',
  'ssim',
  'brisque',
];

// ============================================================
// 1️⃣ OTSU Runner
// ============================================================
export async function runOtsu(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: AnyEdge[],
  signal?: AbortSignal
) {
  const nodeId = node.id;

  // 🔍 ตรวจสอบว่า Node ก่อนหน้าเป็นประเภทต้องห้ามหรือไม่
  const incoming = getIncoming(edges, nodeId);
  if (incoming.length > 0) {
    const parent = nodes.find((n) => n.id === incoming[0].source);
    if (parent) {
      const t = parent.type || '';
      // ✅ ไม่บล็อก alignment อีกต่อไป
      if (INVALID_INPUT_TYPES.includes(t)) {
        await updateNodeStatus(nodeId, 'fault', setNodes);
        throw new Error(
          `Invalid input: Classification cannot follow a '${parent.type}' node.`
        );
      }
    }
  }

  await markStartThenRunning(nodeId, 'Running OTSU', setNodes);

  try {
    const imagePath = getUpstreamImagePath(nodes, edges, nodeId);
    if (!imagePath) throw new Error(ERR_NO_IMAGE);

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
                description: `Threshold = ${thr ?? '?'}`,
                payload: {
                  ...(x.data?.payload || {}),
                  params,
                  json: resp,
                  result_image_url: previewUrl ? abs(previewUrl) : undefined,
                  preview_url: previewUrl ? abs(previewUrl) : undefined,
                  json_url: resp?.json_url,
                  json_path: resp?.json_path,
                  histogram_url: resp?.histogram_url ? abs(resp.histogram_url) : undefined,
                  output: {
                    binary_url: previewUrl ? abs(previewUrl) : undefined,
                    json_url: resp?.json_url,
                    threshold: thr,
                  },
                },
              },
            }
          : x
      )
    );
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    console.error("Otsu Error:", err);
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw err;
  }
}

// ============================================================
// 2️⃣ SNAKE Runner
// ============================================================
export async function runSnakeRunner(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: AnyEdge[],
  signal?: AbortSignal
) {
  const nodeId = node.id;

  // 🔍 ตรวจสอบว่า Node ก่อนหน้าเป็นประเภทต้องห้ามหรือไม่
  const incoming = getIncoming(edges, nodeId);
  if (incoming.length > 0) {
    const parent = nodes.find((n) => n.id === incoming[0].source);
    if (parent) {
      const t = parent.type || '';
      // ✅ ไม่บล็อก alignment อีกต่อไป
      if (INVALID_INPUT_TYPES.includes(t)) {
        await updateNodeStatus(nodeId, 'fault', setNodes);
        throw new Error(
          `Invalid input: Classification cannot follow a '${parent.type}' node.`
        );
      }
    }
  }

  await markStartThenRunning(nodeId, 'Running Snake', setNodes);

  try {
    const imagePath = getUpstreamImagePath(nodes, edges, nodeId);
    if (!imagePath) throw new Error(ERR_NO_IMAGE);

    const params: any = { ...getNodeParams(node) };

    const resp = await runSnake(
      {
        image_path: imagePath,
        alpha: params.alpha ?? 0.2,
        beta: params.beta ?? 0.2,
        gamma: params.gamma ?? 0.1,
        w_line: params.w_line ?? 0.0,
        w_edge: params.w_edge ?? 1.0,
        max_iterations: params.max_iterations ?? 250,
        convergence: params.convergence ?? 0.001,
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
        gaussian_blur_ksize: params.gaussian_blur_ksize ?? 0,
      },
      signal
    );

    const preview =
      (resp?.overlay_url ? abs(resp.overlay_url) : undefined) ??
      (resp?.mask_url ? abs(resp.mask_url) : undefined);

    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: `Done (${resp?.iterations ?? '?'} iters)`,
                payload: {
                  ...(x.data?.payload || {}),
                  params,
                  json: resp,
                  preview_url: preview,
                  result_image_url: preview,
                  json_url: resp?.json_url,
                  json_path: resp?.json_path,
                  overlay_url: resp?.overlay_url ? abs(resp.overlay_url) : undefined,
                  mask_url: resp?.mask_url ? abs(resp.mask_url) : undefined,
                  contour_points: resp?.contour_points,
                  iterations: resp?.iterations,
                  output: {
                    overlay_url: resp?.overlay_url ? abs(resp.overlay_url) : undefined,
                    mask_url: resp?.mask_url ? abs(resp.mask_url) : undefined,
                    json_url: resp?.json_url,
                  },
                },
              },
            }
          : x
      )
    );
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    console.error("Snake Error:", err);
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw err;
  }
}