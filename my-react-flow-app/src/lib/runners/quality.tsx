import { runBrisque, runPsnr, runSsim } from '../api';
import { markStartThenRunning, getNodeImageUrl, updateNodeStatus, findInputImage } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

export async function runQuality(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);
  const nodeName = node.data.label || node.type?.toUpperCase();

  // Helper: Throw & Update Fault
  const fail = async (msg: string) => {
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg); 
  };

  // รายชื่อโหนดที่ห้ามนำมาต่อ
  const BAD_SOURCES = ['sift', 'surf', 'orb', 'bfmatcher', 'flannmatcher', 'otsu', 'snake', 'save-json'];

  // -----------------------------------------------------
  // 🛡️ BRISQUE (ต้องการ 1 รูปภาพ)
  // -----------------------------------------------------
  if (node.type === 'brisque') {
    const incoming = getIncoming(nodeId);
    if (incoming.length < 1) return fail('No image input');

    const prevNode = nodes.find((n) => n.id === incoming[0].source);
    
    // ✅ Validation: ดึงชื่อโหนดที่ผิดมาแสดง
    if (prevNode && BAD_SOURCES.includes(prevNode.type || '')) {
      const toolName = prevNode.data.label || prevNode.type;
      return fail(`Invalid Input: ${nodeName} requires a clean image, but received output from '${toolName}'.`);
    }

    const imgUrl = findInputImage(nodeId, nodes, edges);

    if (!imgUrl) return fail('Image URL not found for processing.');

    await markStartThenRunning(nodeId, `Running ${nodeName}`, setNodes);

    try {
      const resp = await runBrisque(imgUrl);

      setNodes((nds) =>
        nds.map((x) =>
          x.id === nodeId
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'success',
                  description: `${nodeName} = ${Number(resp.score).toFixed(2)}`,
                  payload: {
                    ...(x.data as CustomNodeData)?.payload,
                    quality_score: resp.score,
                    json: resp,
                    output: resp
                  },
                } as CustomNodeData,
              }
            : x
        )
      );
    } catch (err: any) {
      await fail(err?.message || `${nodeName} failed`);
      return; 
    }
    return;
  }

  // -----------------------------------------------------
  // 🛡️ PSNR / SSIM (ต้องการ 2 รูปภาพ)
  // -----------------------------------------------------
  if (node.type === 'psnr' || node.type === 'ssim') {
    const incoming = getIncoming(nodeId);
    const e1 = incoming.find((e) => e.targetHandle === 'input1');
    const e2 = incoming.find((e) => e.targetHandle === 'input2');

    if (!e1 || !e2) return fail('Need two image inputs (Input 1 & Input 2)');

    const nodeA = nodes.find((x) => x.id === e1.source);
    const nodeB = nodes.find((x) => x.id === e2.source);

    const typeA = nodeA?.type || '';
    const typeB = nodeB?.type || '';

    // ✅ Validation: เช็คทั้งคู่และรวมชื่อคนผิด
    const badInputs: string[] = [];
    
    if (BAD_SOURCES.includes(typeA)) {
        badInputs.push(`Input 1 ('${nodeA?.data.label || typeA}')`);
    }
    if (BAD_SOURCES.includes(typeB)) {
        badInputs.push(`Input 2 ('${nodeB?.data.label || typeB}')`);
    }

    if (badInputs.length > 0) {
      // ถ้าผิดทั้งคู่ มันจะบอกว่า "Invalid from: Input 1 ('SIFT'), Input 2 ('ORB')"
      return fail(`Invalid Input: ${nodeName} requires images. Received invalid outputs from: ${badInputs.join(', ')}.`);
    }

    const urlA = getNodeImageUrl(nodeA);
    const urlB = getNodeImageUrl(nodeB);

    if (!urlA || !urlB) return fail('Image URL for one or both inputs missing.');

    await markStartThenRunning(nodeId, `Running ${nodeName}`, setNodes);

    try {
      // ส่ง Path ไปให้ Backend
      const runner = node.type === 'psnr' ? runPsnr : runSsim;
      const params = node.data.payload?.params;
      
      const resp = await runner(urlA, urlB, params);

      const desc =
        node.type === 'psnr'
          ? `PSNR = ${Number(resp.quality_score ?? resp.score).toFixed(2)} dB`
          : `SSIM = ${Number(resp.score).toFixed(4)}`;

      setNodes((nds) =>
        nds.map((x) =>
          x.id === nodeId
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'success',
                  description: desc,
                  payload: {
                    ...(x.data as CustomNodeData)?.payload,
                    json: resp,
                    output: resp
                  },
                } as CustomNodeData,
              }
            : x
        )
      );
    } catch (err: any) {
      await fail(err?.message || 'Metric failed');
      return;
    }
  }
}