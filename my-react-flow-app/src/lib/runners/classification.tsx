// src/lib/runners/classification.tsx
import React from 'react';
import { type Node as RFNode } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { runOtsuClassification, abs } from '../api';
import { markStartThenRunning } from './utils';

type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;

type AnyEdge = {
  source: string;
  target: string;
  targetHandle?: string;
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

/**
 * runOtsu
 * - รับภาพจาก image-input upstream
 * - เรียก /api/classification/otsu
 * - อัปเดต payload ด้วยผลลัพธ์และพรีวิว
 */
export async function runOtsu(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: AnyEdge[]
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

  const params = (node.data?.payload?.params || {}) as {
    gaussian_blur?: boolean;
    blur_ksize?: number;
    invert?: boolean;
    morph_open?: boolean;
    morph_close?: boolean;
    morph_kernel?: number;
    show_histogram?: boolean;
  };

  await markStartThenRunning(nodeId, 'Running OTSU', setNodes);

  try {
    const resp = await runOtsuClassification(imagePath, params);
    // backend ตอนนี้คืน threshold, binary_url, json_url, histogram_url
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
                  json: resp,                      // เก็บ response ตรง ๆ
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
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: { ...x.data, status: 'fault', description: err?.message || 'OTSU failed' },
            }
          : x
      )
    );
  }
}