// src/lib/runners/utils.tsx
import { abs } from '../api';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type { Node } from 'reactflow';
import type { CustomNodeData } from '../../types';

// ====== Typed aliases ======
export type RFNode = Node<CustomNodeData>;
export type SetNodes = Dispatch<SetStateAction<RFNode[]>>;

/**
 * 🟢 markStartThenRunning
 * อัปเดตสถานะของโหนดให้แสดงผล Start → Running (typed)
 */
export async function markStartThenRunning(
  nodeId: string,
  label: string,
  setNodes: SetNodes
) {
  // Start
  setNodes((nds) =>
    nds.map((x) =>
      x.id === nodeId
        ? {
            ...x,
            data: { ...x.data, status: 'start', description: `Start ${label}` },
          }
        : x
    )
  );

  // หน่วงนิดให้ ReactFlow render
  await new Promise((r) => setTimeout(r, 200));

  // Running
  setNodes((nds) =>
    nds.map((x) =>
      x.id === nodeId
        ? {
            ...x,
            data: { ...x.data, status: 'running', description: `Running ${label}` },
          }
        : x
    )
  );
}

/**
 * 📂 fetchFileFromUrl
 * โหลดภาพจาก URL แล้วคืนค่าเป็น File object (ใช้ส่งเข้า API)
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
 * คืนค่า absolute URL ของภาพที่อยู่ในโหนดใด ๆ
 * รองรับ image-input / SIFT / SURF / ORB / metric / matcher / alignment
 */
export function getNodeImageUrl(n?: RFNode): string | undefined {
  if (!n) return undefined;

  const normalize = (u?: string) =>
    u ? (/^(https?:|blob:|data:)/i.test(u) ? u : abs(u)) : undefined;

  // image-input → url หรือ preview_url
  if (n.type === 'image-input') {
    return (
      normalize(n.data?.payload?.url) ??
      normalize(n.data?.payload?.preview_url)
    );
  }

  // feature nodes → result_image_url หรือ vis_url
  if (n.type === 'sift' || n.type === 'surf' || n.type === 'orb') {
    return (
      normalize(n.data?.payload?.result_image_url) ??
      normalize(n.data?.payload?.vis_url)
    );
  }

  // matcher nodes → vis_url
  if (n.type === 'bfmatcher' || n.type === 'flannmatcher') {
    return normalize(n.data?.payload?.vis_url);
  }

  // alignment nodes → ใช้ output.aligned_image (หรือ aligned_url ถ้ามี)
  if (n.type === 'homography-align' || n.type === 'affine-align') {
    const alignedFromJson =
      (n.data?.payload as any)?.json?.output?.aligned_image ||
      (n.data?.payload as any)?.json?.output?.aligned_url;

    // เผื่อมี caching อื่น ๆ เก็บ path ไว้ตรง payload โดยตรง
    const alignedDirect =
      (n.data?.payload as any)?.aligned_image ||
      (n.data?.payload as any)?.aligned_url;

    return normalize(alignedFromJson) ?? normalize(alignedDirect);
  }

  // metric nodes (PSNR / SSIM / BRISQUE) — เผื่อมีรูปไว้โชว์
  return (
    normalize(n.data?.payload?.result_image_url) ??
    normalize(n.data?.payload?.url)
  );
}

/**
 * 🧰 guard
 * ใช้ตรวจสอบว่าถูกยกเลิก pipeline ระหว่างรันหรือไม่
 */
export function guard(canceledRef: MutableRefObject<boolean>) {
  if (canceledRef.current) throw new Error('Pipeline canceled');
}