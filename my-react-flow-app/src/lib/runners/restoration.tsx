// File: my-react-flow-app/src/lib/runners/restoration.tsx
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
  const nodeLabel = node.data.label || node.type || 'Restoration';

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
    return fail('No input connection (Please connect an Image source).');
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

  // 3. หา Path รูปภาพ
  const imagePath = findInputImage(nodeId, nodes, edges);

  if (!imagePath) {
    return fail('No input image found. Please connect and run an Image source.');
  }

  // 4. ระบุ Algorithm
  let prefix = '';
  let runner: any;

  switch (node.type) {
    case 'dcnn': 
    case 'dncnn': 
      prefix = 'DnCNN';
      runner = runDncnn;
      break;
    
    case 'swinir':
      prefix = 'SwinIR';
      runner = runSwinIR;
      break;
    
    case 'real':
    case 'realesrgan': 
      prefix = 'Real-ESRGAN';
      runner = runRealESRGAN;
      break;
      
    default:
      return fail(`Unknown Restoration node type: ${node.type}`);
  }

  // 5. Logic ตรวจสอบ Input Channels
  if (prevNode) {
    const prevPayload = prevNode.data.payload as any;
    const shape = prevPayload?.image_shape || prevPayload?.json_data?.image?.shape;
    let channels = 3; 

    if (Array.isArray(shape)) {
      if (shape.length === 2) channels = 1; 
      else if (shape.length === 3) channels = shape[2];
    } else if (prevPayload?.channels) {
      channels = prevPayload.channels;
    }

    if (channels === 1 && shape) {
      return fail(`Invalid Input: ${prefix} requires a Color image (RGB), but received Grayscale.`);
    }
  }

  // 6. เริ่มการทำงาน
  await markStartThenRunning(nodeId, `Restoring with ${prefix}...`, setNodes);

  try {
    const params = node.data.payload?.params || {};
    
    const resp = await runner(imagePath, params);

    if (resp.detail || resp.status === 'error') {
      const errorMsg = typeof resp.detail === 'string' ? resp.detail : 'Processing failed';
      return fail(errorMsg); 
    }

    const visUrlRaw = resp.vis_url || resp.output_image || resp.result_image_url;
    if (!visUrlRaw) {
      return fail('No output image received.');
    }
    
    const visUrl = abs(visUrlRaw);

    const imgData = resp.json_data?.image || {};
    const finalShape = imgData.enhanced_shape || imgData.original_shape || resp.image_shape;

    // 7. อัปเดตข้อมูลเมื่อสำเร็จ
    setNodes((nds: RFNode[]) =>
      nds.map((n: RFNode) =>
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
                  params,
                  
                  // ✅ FIX: ต้องใส่ json: resp เพื่อให้ Save JSON Node ทำงานได้
                  json: resp,
                  
                  vis_url: visUrl,
                  output_image: visUrl, 
                  result_image_url: visUrl,
                  
                  image_shape: finalShape, 
                  channels: 3, 
                  
                  json_data: resp.json_data 
                },
              } as CustomNodeData,
            }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Runner Error:`, err);
    
    const rawMsg = err?.message || 'Processing failed';

    if (rawMsg.includes(prefix) || rawMsg.includes('Invalid Input')) {
        await fail(rawMsg);
    } else {
        await fail(`${prefix} Error: ${rawMsg}`);
    }
  }
}