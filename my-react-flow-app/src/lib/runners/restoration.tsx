import { runDncnn, runSwinIR, runRealESRGAN, abs } from '../api';
import { markStartThenRunning, updateNodeStatus, findInputImage } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

/**
 * Runner สำหรับกลุ่ม Restoration (DnCNN, SwinIR, Real-ESRGAN)
 */
export async function runRestoration(
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
    return fail('No input image found. Please connect an Image source.');
  }

  // 2. เลือก Runner ตามประเภทของโหนด
  let prefix = '';
  let runner: any;

  switch (node.type) {
    case 'dcnn': // ใน FlowCanvas คุณใช้ dcnn
      prefix = 'DnCNN';
      runner = runDncnn;
      break;
    case 'swinir':
      prefix = 'SwinIR';
      runner = runSwinIR;
      break;
    case 'real':
      prefix = 'Real-ESRGAN';
      runner = runRealESRGAN;
      break;
    default:
      return;
  }

  // 3. เริ่มสถานะการทำงาน
  await markStartThenRunning(nodeId, `Restoring with ${prefix}...`, setNodes);

  try {
    const params = node.data.payload?.params || {};
    
    // 4. เรียกใช้ API
    const resp = await runner(imagePath, params);

    // 5. จัดการ URL ของรูปภาพผลลัพธ์
    const visUrl = resp.vis_url ? abs(resp.vis_url) : undefined;

    // 6. บันทึกข้อมูลกลับลงในโหนด
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status: 'success',
                description: `${prefix} finished`,
                payload: {
                  ...(n.data as CustomNodeData)?.payload,
                  ...resp,
                  vis_url: visUrl,
                  output_image: visUrl, // ส่งต่อภาพให้โหนดถัดไป
                  result_image_url: visUrl,
                },
              } as CustomNodeData,
            }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Runner Error:`, err);
    await fail(err?.message || `${prefix} failed`);
  }
}