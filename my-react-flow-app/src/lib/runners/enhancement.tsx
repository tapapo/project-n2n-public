// File: my-react-flow-app/src/lib/runners/enhancement.tsx
import { type Node, type Edge } from 'reactflow'; 
import { runCLAHE, runMSRCR, runZeroDCE, abs } from '../api';
import { markStartThenRunning, updateNodeStatus, findInputImage } from './utils';
import type { CustomNodeData } from '../../types';

type RFNode = Node<CustomNodeData>;
type SetNodes = (payload: RFNode[] | ((nds: RFNode[]) => RFNode[])) => void;

export async function runEnhancement(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const nodeLabel = node.data.label || node.type || 'Enhancement';

  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

  // ฟังก์ชันสำหรับแจ้ง Error และเปลี่ยนสถานะโหนด
  const fail = async (msg: string) => {
    await updateNodeStatus(nodeId, 'fault', setNodes);
    setNodes((nds: RFNode[]) =>
      nds.map((n: RFNode) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, status: 'fault', description: msg } }
          : n
      )
    );
    throw new Error(msg);
  };

  // 1. เช็คการเชื่อมต่อ
  const incoming = getIncoming(nodeId);
  if (incoming.length === 0) {
    return fail('No input connection (Please connect an Image source).');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);

  // 2. เช็ค Bad Sources (ประเภทโหนดที่ไม่ควรเป็น Input)
  const BAD_SOURCES = [
    'bfmatcher', 'flannmatcher',     
    'psnr', 'ssim', 'brisque',       
    'save-json',                     
    'otsu', 'snake',
    'sift', 'surf', 'orb' //  ห้ามใช้ Feature Detectors เป็น Input
  ];

  if (prevNode && BAD_SOURCES.includes(prevNode.type || '')) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: ${nodeLabel} requires a raw Image source, not a '${tool}' result.`);
  }

  // 3. หา Path รูปภาพ
  const imagePath = findInputImage(nodeId, nodes, edges);
  if (!imagePath) {
    return fail('No input image found (Please check connection or run parent node).');
  }

  // 4. ระบุ Algorithm
  let prefix = '';
  let runner: any;
  const nodeType = node.type?.toLowerCase() || '';

  switch (nodeType) {
    case 'clahe': prefix = 'CLAHE'; runner = runCLAHE; break;
    case 'msrcr': prefix = 'MSRCR'; runner = runMSRCR; break;
    case 'ZeroDCENode':
    case 'zero':
    case 'zerodce': 
    case 'zero_dce': prefix = 'Zero-DCE'; runner = runZeroDCE; break;
    default: return fail(`Unknown Enhancement node type: ${node.type}`);
  }

  // 5. ✅ Logic ตรวจสอบ Input Channels (Frontend Validation)
  if (prevNode) {
    const prevPayload = prevNode.data.payload as any;
    // พยายามหา shape จาก metadata ที่โหนดก่อนหน้าส่งมา
    const shape = prevPayload?.image_shape || prevPayload?.json_data?.image?.shape;
    let channels = 3; // ค่า Default สมมติว่าเป็นสีไปก่อน

    if (Array.isArray(shape)) {
      if (shape.length === 2) channels = 1; // [H, W] = Grayscale
      else if (shape.length === 3) channels = shape[2];
    } else if (prevPayload?.channels) {
      channels = prevPayload.channels;
    }

    // กฎ: MSRCR / Zero-DCE ต้องการภาพสี
    if ((prefix === 'MSRCR' || prefix === 'Zero-DCE') && channels === 1) {
      return fail(`${prefix} requires a BGR color image`);
    }

    // กฎ: CLAHE ต้องการภาพ Grayscale
    // (จะทำงานก็ต่อเมื่อเรารู้ shape แน่นอนแล้ว เพื่อป้องกัน False Positive)
    if (prefix === 'CLAHE' && channels !== 1 && shape) {
       return fail(`CLAHE requires grayscale image `);
    }
  }

  await markStartThenRunning(nodeId, `Running ${prefix}`, setNodes);

  try {
    const params = node.data.payload?.params || {};
    const resp = await runner(imagePath, params);

    // เช็ค Error จาก Backend Response (เช่น 200 OK แต่ status error)
    if (resp.detail || resp.status === 'error') {
      const errorMsg = typeof resp.detail === 'string' ? resp.detail : 'Processing failed';
      // ส่ง errorMsg ไปเลย ไม่ต้องเติม prefix เพราะ backend มักจะบอกเหตุผลมาแล้ว
      return fail(errorMsg); 
    }

    const visUrlRaw = resp.vis_url || resp.output_image || resp.result_image_url;
    if (!visUrlRaw) {
      return fail('No output image received.');
    }

    const visUrl = abs(visUrlRaw);

    // 6. อัปเดตข้อมูลเมื่อสำเร็จ
    setNodes((nds: RFNode[]) =>
      nds.map((n: RFNode) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status: 'success',
                description: `${prefix} completed`,
                payload: {
                  ...(n.data as CustomNodeData)?.payload,
                  ...resp,
                  params,
                  vis_url: visUrl,
                  result_image_url: visUrl,
                  output_image: visUrl,
                  image_shape: resp.image_shape || resp.output?.shape || resp.shape,
                  json_data: resp 
                },
              } as CustomNodeData,
            }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Runner Error:`, err);
    
    // ✅ 7. จัดการ Error Message ให้สวยงาม ไม่ซ้ำซ้อน
    const rawMsg = err?.message || 'Processing failed';
    
    // ถ้าข้อความ Error มีชื่อ Algorithm หรือคำว่า Invalid Input อยู่แล้ว ให้ส่งไปตรงๆ
    if (rawMsg.includes(prefix) || rawMsg.includes('Invalid Input')) {
        await fail(rawMsg);
    } else {
        // ถ้าเป็น Error ทั่วไป (เช่น Failed to fetch) ค่อยเติมชื่อ Algorithm นำหน้า
        await fail(`${prefix} Error: ${rawMsg}`);
    }
  }
}