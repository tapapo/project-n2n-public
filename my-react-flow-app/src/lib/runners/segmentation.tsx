import { runDeepLab, runMaskRCNN, runUNET, abs } from '../api';
import { markStartThenRunning, updateNodeStatus, findInputImage } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

/**
 * Runner สำหรับกลุ่ม Segmentation (DeepLabv3+, Mask R-CNN, U-Net)
 */
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

  // ✅ Standard Fail Function
  const fail = async (msg: string) => {
    await updateNodeStatus(nodeId, 'fault', setNodes);
    setNodes((nds: RFNode[]) =>
      nds.map((n: RFNode) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, status: 'fault', description: msg } }
          : n
      )
    );
    throw new Error(msg); // หยุดการทำงานทันที
  };

  // 1. เช็คการเชื่อมต่อ
  const incoming = getIncoming(nodeId);
  if (incoming.length === 0) {
    return fail('No input image found. Please connect and run an Image source.');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);

  // 2. เช็ค Bad Sources
  const BAD_SOURCES = [
    'bfmatcher', 'flannmatcher',     
    'psnr', 'ssim', 'brisque',       
    'save-json',                     
    'otsu', 'snake',
    'sift', 'surf', 'orb'
  ];

  if (prevNode && BAD_SOURCES.includes(prevNode.type || '')) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: ${nodeLabel} requires a raw Image source, not a '${tool}' result.`);
  }

  // 3. ค้นหา Path รูปภาพ
  const imagePath = findInputImage(nodeId, nodes, edges);

  if (!imagePath) {
    return fail('No input image found. Please connect and run an Image source.');
  }

  // 4. เลือก Runner ตามประเภทของโหนด
  let prefix = '';
  let runner: any;

  switch (node.type) {
    case 'deep':
      prefix = 'DeepLabv3+';
      runner = runDeepLab;
      break;
    case 'mask':
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

  // 5. เริ่มสถานะการทำงาน
  await markStartThenRunning(nodeId, `Segmenting with ${prefix}...`, setNodes);

  try {
    const params = node.data.payload?.params || {};
    
    // 6. เรียกใช้ API
    const resp = await runner(imagePath, params);

    // ✅ เพิ่มการเช็ค Error จาก Backend response
    if (resp.detail || resp.status === 'error') {
      const errorMsg = typeof resp.detail === 'string' ? resp.detail : 'Processing failed';
      return fail(errorMsg); 
    }

    // 7. จัดการ URL ของรูปภาพผลลัพธ์
    const visUrlRaw = resp.vis_url || resp.segmented_image || resp.full_vis_image || resp.output_image;
    
    if (!visUrlRaw) {
      return fail('No output image received from backend.');
    }

    const finalVisUrl = abs(visUrlRaw);

    // 8. บันทึกข้อมูลกลับลงในโหนด (Success)
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
                  
                  // ✅ FIX: ต้องใส่ json: resp เพื่อให้ Save JSON Node ทำงานได้
                  json: resp,

                  vis_url: finalVisUrl,
                  output_image: finalVisUrl, 
                  result_image_url: finalVisUrl,
                  
                  // เก็บ json_data เพื่อให้โหนดถัดไปดึงขนาดภาพได้
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