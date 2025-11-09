// src/lib/runners/quality.tsx
import { runBrisque, runPsnr, runSsim } from '../api';
import { markStartThenRunning, fetchFileFromUrl, getNodeImageUrl } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

/**
 * 🔹 รัน Quality Assessment (BRISQUE / PSNR / SSIM)
 * - BRISQUE: single image
 * - PSNR / SSIM: image pair (input1, input2)
 */
export async function runQuality(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

  // ---------- Case 1: BRISQUE ----------
  if (node.type === 'brisque') {
    const incoming = getIncoming(node.id);
    const edge = incoming[0];

    if (!edge) {
      setNodes((nds) =>
        nds.map((x) =>
          x.id === node.id
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'fault',
                  description: 'No image input',
                } as CustomNodeData,
              }
            : x
        )
      );
      return;
    }

    const prevNode = nodes.find((n) => n.id === edge.source);
    const imgUrl = getNodeImageUrl(prevNode);

    if (!imgUrl) {
      setNodes((nds) =>
        nds.map((x) =>
          x.id === node.id
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'fault',
                  description: 'Image not found',
                } as CustomNodeData,
              }
            : x
        )
      );
      return;
    }

    await markStartThenRunning(node.id, 'Running BRISQUE', setNodes);

    try {
      // หมายเหตุ: ฟังก์ชัน runBrisque ฝั่ง frontend ของคุณรองรับ URL/Path ตามที่ใช้งานเดิมอยู่แล้ว
      const resp = await runBrisque(imgUrl);

      setNodes((nds) =>
        nds.map((x) =>
          x.id === node.id
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'success',
                  description: `BRISQUE = ${Number(resp.score).toFixed(2)}`,
                  payload: {
                    ...(x.data as CustomNodeData)?.payload,
                    quality_score: resp.score,
                    json: resp,
                  },
                } as CustomNodeData,
              }
            : x
        )
      );
    } catch (err: any) {
      setNodes((nds) =>
        nds.map((x) =>
          x.id === node.id
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'fault',
                  description: err?.message || 'BRISQUE failed',
                } as CustomNodeData,
              }
            : x
        )
      );
    }
    return;
  }

  // ---------- Case 2: PSNR / SSIM ----------
  if (node.type === 'psnr' || node.type === 'ssim') {
    const incoming = getIncoming(node.id);
    const e1 = incoming.find((e) => e.targetHandle === 'input1');
    const e2 = incoming.find((e) => e.targetHandle === 'input2');

    if (!e1 || !e2) {
      setNodes((nds) =>
        nds.map((x) =>
          x.id === node.id
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'fault',
                  description: 'Need two image inputs',
                } as CustomNodeData,
              }
            : x
        )
      );
      return;
    }

    const nodeA = nodes.find((x) => x.id === e1.source);
    const nodeB = nodes.find((x) => x.id === e2.source);

    const urlA = getNodeImageUrl(nodeA);
    const urlB = getNodeImageUrl(nodeB);

    if (!urlA || !urlB) {
      setNodes((nds) =>
        nds.map((x) =>
          x.id === node.id
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'fault',
                  description: 'Input images missing',
                } as CustomNodeData,
              }
            : x
        )
      );
      return;
    }

    await markStartThenRunning(node.id, `Running ${node.type.toUpperCase()}`, setNodes);

    try {
      // แปลง URL → File เพื่อส่ง multipart ให้ API ของ PSNR/SSIM
      const fileA = await fetchFileFromUrl(urlA, 'a.jpg');
      const fileB = await fetchFileFromUrl(urlB, 'b.jpg');

      const runner = node.type === 'psnr' ? runPsnr : runSsim;
      const resp = await runner(fileA, fileB);

      const desc =
        node.type === 'psnr'
          ? `PSNR = ${Number(resp.quality_score ?? resp.score).toFixed(2)} dB`
          : `SSIM = ${Number(resp.score).toFixed(4)}`;

      setNodes((nds) =>
        nds.map((x) =>
          x.id === node.id
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'success',
                  description: desc,
                  payload: {
                    ...(x.data as CustomNodeData)?.payload,
                    json: resp,
                  },
                } as CustomNodeData,
              }
            : x
        )
      );
    } catch (err: any) {
      setNodes((nds) =>
        nds.map((x) =>
          x.id === node.id
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'fault',
                  description: err?.message || 'Metric failed',
                } as CustomNodeData,
              }
            : x
        )
      );
    }
  }
}