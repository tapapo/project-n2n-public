// File: my-react-flow-app/src/lib/runners/segmentation.tsx
import { runDeepLab, runMaskRCNN, runUNET, abs } from '../api';
import { markStartThenRunning, updateNodeStatus, findInputImage } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

export async function runSegmentation(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const nodeLabel = node.data.label || node.type || 'Segmentation';

  // Helper สำหรับดึง Edge ขาเข้า
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

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
    return fail('No input image found. Please connect and run an Image source.');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);
  const BAD_SOURCES = [
    'bfmatcher', 'flannmatcher', 'psnr', 'ssim', 'brisque',       
    'save-json', 'otsu', 'snake', 'sift', 'surf', 'orb'
  ];

  if (prevNode && BAD_SOURCES.includes(prevNode.type || '')) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: ${nodeLabel} requires a raw Image source, not a '${tool}' result.`);
  }

  // 2. ค้นหา Path รูปภาพ
  const imagePath = findInputImage(nodeId, nodes, edges);
  if (!imagePath) {
    return fail('No input image found. Please connect and run an Image source.');
  }

  // 3. เลือก Runner
  let prefix = '';
  let runner: any;

  switch (node.type) {
    case 'deep':
    case 'deeplab':
      prefix = 'DeepLabv3+';
      runner = runDeepLab;
      break;
    case 'mask':
    case 'maskrcnn':
      prefix = 'Mask R-CNN';
      runner = runMaskRCNN;
      break;
    case 'unet':
      prefix = 'U-Net';
      runner = runUNET;
      break;
    default:
      return fail(`Unknown Segmentation node type: ${node.type}`);
  }

  // 4. เริ่มทำงาน
  await markStartThenRunning(nodeId, `Segmenting with ${prefix}...`, setNodes);

  try {
    // ✅ จุดที่แก้ไข: ดึง model_path ออกมาด้วย
    const payload = node.data.payload || {};
    const params = payload.params || {};
    const modelPath = payload.model_path; // ค่านี้มาจาก Input ใน UNET Node

    // 5. เรียก API (ส่ง modelPath ไปเป็นตัวที่ 3)
    const resp = await runner(imagePath, params, modelPath);

    if (resp.detail || resp.status === 'error') {
      const errorMsg = typeof resp.detail === 'string' ? resp.detail : 'Processing failed';
      return fail(errorMsg); 
    }

    // 6. จัดการ URL ผลลัพธ์
    // รองรับทั้ง vis_url (ใหม่) และ keys เดิม
    const visUrlRaw = resp.vis_url || resp.segmented_image || resp.full_vis_image || resp.output_image;
    
    if (!visUrlRaw) {
      return fail('No output image received from backend.');
    }

    const finalVisUrl = abs(visUrlRaw);
    
    // ✅ จัดการ Mask URL (ถ้ามี)
    const maskUrl = resp.mask_url ? abs(resp.mask_url) : undefined;

    // 7. บันทึกผลลัพธ์
    setNodes((nds) =>
      nds.map((n) =>
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
                  
                  // เซ็ตค่าให้ครบเพื่อความชัวร์
                  json: resp,
                  vis_url: finalVisUrl,
                  mask_url: maskUrl, // เพิ่ม mask_url ให้ frontend ใช้งาน
                  
                  // Fallback keys
                  output_image: finalVisUrl, 
                  result_image_url: finalVisUrl,
                  
                  json_data: resp.json_data || resp 
                },
              } as CustomNodeData,
            }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Segmentation Error:`, err);
    const rawMsg = err?.message || 'Processing failed';
    if (rawMsg.includes(prefix) || rawMsg.includes('Invalid Input')) {
        await fail(rawMsg);
    } else {
        await fail(`${prefix} Error: ${rawMsg}`);
    }
  }
}