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

  const fail = async (msg: string) => {
    await updateNodeStatus(nodeId, 'fault', setNodes);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, description: msg } }
          : n
      )
    );
  };

  // 1. ค้นหาภาพจากโหนดต้นน้ำ (Upstream)
  const imagePath = findInputImage(nodeId, nodes, edges);

  if (!imagePath) {
    return fail('No input image found. Please connect a source image.');
  }

  // 2. เลือก Runner ตามประเภทของโหนด
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
      return;
  }

  // 3. เริ่มสถานะการทำงาน
  await markStartThenRunning(nodeId, `Segmenting with ${prefix}...`, setNodes);

  try {
    const params = node.data.payload?.params || {};
    
    // 4. เรียกใช้ API
    const resp = await runner(imagePath, params);

    // 5. จัดการ URL ของรูปภาพผลลัพธ์ (รองรับทั้ง vis_url และ segmented_image)
    const visUrl = resp.vis_url || resp.segmented_image || resp.full_vis_image;
    const finalVisUrl = visUrl ? abs(visUrl) : undefined;

    // 6. บันทึกข้อมูลกลับลงในโหนด
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
                  ...resp, // เก็บข้อมูลพวก classes, objects, mask_info ไว้แสดงผล
                  vis_url: finalVisUrl,
                  output_image: finalVisUrl, // สำหรับส่งต่อภาพให้โหนดถัดไป
                  result_image_url: finalVisUrl,
                },
              } as CustomNodeData,
            }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Segmentation Error:`, err);
    await fail(err?.message || `${prefix} processing failed`);
  }
}