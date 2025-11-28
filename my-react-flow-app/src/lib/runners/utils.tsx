import { abs } from '../api';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData, NodeStatus } from '../../types';

// ====== Typed aliases ======
export type RFNode = Node<CustomNodeData>;
export type SetNodes = Dispatch<SetStateAction<RFNode[]>>;

/**
 * 🟢 markStartThenRunning
 */
export async function markStartThenRunning(
  nodeId: string,
  label: string,
  setNodes: SetNodes
) {
  setNodes((nds) =>
    nds.map((x) =>
      x.id === nodeId
        ? { ...x, data: { ...x.data, status: 'start', description: `Start ${label}` } }
        : x
    )
  );

  await new Promise((r) => setTimeout(r, 200));

  setNodes((nds) =>
    nds.map((x) =>
      x.id === nodeId
        ? { ...x, data: { ...x.data, status: 'running', description: `Running ${label}` } }
        : x
    )
  );
}

/**
 * ✅ updateNodeStatus
 */
export async function updateNodeStatus(
  nodeId: string,
  status: NodeStatus,
  setNodes: SetNodes
) {
  setNodes((nds) =>
    nds.map((n) => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, status: status } };
      }
      return n;
    })
  );
  await new Promise((r) => setTimeout(r, 50));
}

/**
 * ✅ findInputImage (ตัวสำคัญที่ Brisque เรียกใช้)
 */
export function findInputImage(
  nodeId: string, 
  nodes: RFNode[], 
  edges: Edge[]
): string | undefined {
  const incoming = edges.find(e => e.target === nodeId);
  if (!incoming) return undefined;

  const parent = nodes.find(n => n.id === incoming.source);
  if (!parent || !parent.data) return undefined;

  const data = parent.data.payload || parent.data.output;
  if (!data) return undefined;
  
  // 1. String Path ตรงๆ
  if (typeof data === 'string') return data;

  // 2. Object (เช็ค URL รูปภาพหลักๆ)
  if (typeof data === 'object') {
     // เช็คแบบเจาะจงก่อน
     if (['homography-align', 'affine-align'].includes(parent.type || '')) {
        return (data as any).aligned_url || (data as any).url;
     }
     
     // เช็คแบบทั่วไป
     return (data as any).url || 
            (data as any).aligned_url || 
            (data as any).path || 
            (data as any).image_path ||
            (data as any).saved_path || 
            (data as any).vis_url || 
            (data as any).binary_url || 
            (data as any).result_image_url || 
            undefined;
  }
  return undefined;
}

/**
 * 📂 fetchFileFromUrl
 */
export async function fetchFileFromUrl(url: string, filename: string): Promise<File> {
  if (!url) throw new Error('Missing URL');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const blob = await resp.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

/**
 * 🧭 getNodeImageUrl
 */
export function getNodeImageUrl(n?: RFNode): string | undefined {
  if (!n) return undefined;
  const normalize = (u?: string) => u ? (/^(https?:|blob:|data:)/i.test(u) ? u : abs(u)) : undefined;

  const p = n.data?.payload as any;

  if (n.type === 'image-input') {
    return normalize(p?.url) ?? normalize(p?.preview_url);
  }
  if (['sift', 'surf', 'orb'].includes(n.type || '')) {
    return normalize(p?.result_image_url) ?? normalize(p?.vis_url);
  }
  if (['bfmatcher', 'flannmatcher'].includes(n.type || '')) {
    return normalize(p?.vis_url);
  }
  if (['homography-align', 'affine-align'].includes(n.type || '')) {
    return normalize(p?.output?.aligned_url) ?? normalize(p?.aligned_url);
  }

  return normalize(p?.result_image_url) ?? normalize(p?.url);
}

/**
 * 🧰 guard
 */
export function guard(canceledRef: MutableRefObject<boolean>) {
  if (canceledRef.current) throw new Error('Pipeline canceled');
}