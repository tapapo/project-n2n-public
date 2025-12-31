import { abs } from '../api';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData, NodeStatus } from '../../types';

export type RFNode = Node<CustomNodeData>;
export type SetNodes = Dispatch<SetStateAction<RFNode[]>>;


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


// ✅✅ แก้ไขฟังก์ชันนี้: เพิ่ม Logic ให้รองรับ aligned_path และ output_image
export function findInputImage(
  nodeId: string, 
  nodes: RFNode[], 
  edges: Edge[]
): string | undefined {
  // 1. หาเส้นที่เชื่อมเข้าหา Node ปัจจุบัน
  const incoming = edges.find(e => e.target === nodeId);
  if (!incoming) return undefined;

  // 2. หา Node ต้นทาง
  const parent = nodes.find(n => n.id === incoming.source);
  if (!parent || !parent.data) return undefined;

  // ดึงข้อมูล Payload (ส่วนใหญ่ข้อมูลจะกองอยู่ในนี้)
  const p = (parent.data.payload || parent.data.output) as any;
  if (!p) return undefined;
  
  // --- Priority 1: เช็ค Path ตรงๆ (File Path) ---
  
  // 1.1 สำหรับ Homography/Affine Alignment (ที่เราเพิ่งแก้ไป)
  if (typeof p.aligned_path === 'string') return p.aligned_path;

  // 1.2 สำหรับ Image Input หรือ Node ทั่วไป
  if (typeof p.image_path === 'string') return p.image_path;
  
  // 1.3 สำหรับ Enhancement Node (บางทีเก็บใน output_path)
  if (typeof p.output_path === 'string') return p.output_path;

  // --- Priority 2: เช็ค URL (Web Path) ---
  // ถ้า Backend รองรับการ resolve URL เป็นไฟล์ในเครื่องได้ ก็จะใช้ค่าพวกนี้
  
  if (typeof p.output_image === 'string') return p.output_image; // Key มาตรฐานใหม่
  if (typeof p.vis_url === 'string') return p.vis_url;
  if (typeof p.url === 'string') return p.url;
  if (typeof p.aligned_url === 'string') return p.aligned_url;

  // --- Priority 3: เช็คใน object ย่อย (กรณีข้อมูลซ่อนลึก) ---
  
  // เช็คใน output object (Backend raw response)
  if (p.output) {
     if (typeof p.output.aligned_image === 'string') return p.output.aligned_image;
     if (typeof p.output.aligned_path === 'string') return p.output.aligned_path;
  }

  return undefined;
}


export async function fetchFileFromUrl(url: string, filename: string): Promise<File> {
  if (!url) throw new Error('Missing URL');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const blob = await resp.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}


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
  
  // ✅ เพิ่มให้รองรับ output_image ด้วย
  if (['homography-align', 'affine-align'].includes(n.type || '')) {
    return normalize(p?.output_image) ?? normalize(p?.output?.aligned_url) ?? normalize(p?.aligned_url);
  }

  return normalize(p?.output_image) ?? normalize(p?.result_image_url) ?? normalize(p?.url);
}


export function guard(canceledRef: MutableRefObject<boolean>) {
  if (canceledRef.current) throw new Error('Pipeline canceled');
}