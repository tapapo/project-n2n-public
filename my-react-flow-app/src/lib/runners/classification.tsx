//src/lib/runners/classification.tsx
import React from 'react';
import type { Node as RFNode, Edge } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { runOtsuClassification, runSnake, abs } from '../api';
import { markStartThenRunning, updateNodeStatus, findInputImage } from './utils';

type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;

const getIncoming = (edges: Edge[], id: string) => edges.filter((e) => e.target === id);

function getNodeParams<T extends object = Record<string, any>>(node: RF): T {
  return ((node.data?.payload?.params as T) ?? ({} as T));
}

const INVALID_INPUT_TYPES = [
  'sift', 'surf', 'orb',
  'bfmatcher', 'flannmatcher',
  'psnr', 'ssim', 'brisque',
  'save-json','otsu','snake'
];


export async function runOtsu(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: Edge[], 
  signal?: AbortSignal
) {
  const nodeId = node.id;
  const nodeName = "Otsu Threshold";

  const fail = async (msg: string) => {
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  };

  const incoming = getIncoming(edges, nodeId);
  if (incoming.length === 0) {
    return fail('No input connection (Please connect an Image source).');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);
  if (prevNode && INVALID_INPUT_TYPES.includes(prevNode.type || '')) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: ${nodeName} requires an Image source, not a '${tool}' result.`);
  }

  await markStartThenRunning(nodeId, 'Running OTSU', setNodes);

  try {
    const imagePath = findInputImage(nodeId, nodes, edges);

    if (!imagePath) {
      return fail('No input image found (Please check connection or run parent node).');
    }

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
    await fail(err?.message || 'Otsu failed');
  }
}


export async function runSnakeRunner(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: Edge[], 
  signal?: AbortSignal
) {
  const nodeId = node.id;
  const nodeName = "Snake";

  const fail = async (msg: string) => {
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  };

  const incoming = getIncoming(edges, nodeId);
  if (incoming.length === 0) {
    return fail('No input connection (Please connect an Image source).');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);
  if (prevNode && INVALID_INPUT_TYPES.includes(prevNode.type || '')) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: ${nodeName} requires an Image source, not a '${tool}' result.`);
  }

  await markStartThenRunning(nodeId, 'Running Snake', setNodes);

  try {
    const imagePath = findInputImage(nodeId, nodes, edges);
    
    if (!imagePath) {
      return fail('No input image found (Please check connection or run parent node).');
    }

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
    await fail(err?.message || 'Snake failed');
  }
}