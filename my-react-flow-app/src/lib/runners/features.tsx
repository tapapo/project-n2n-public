import { runSift, runSurf, runOrb, abs } from '../api';
import { markStartThenRunning, updateNodeStatus, findInputImage } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

/**
 * รัน Feature Extraction (SIFT, SURF, ORB)
 */
export async function runFeature(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  
  // Helper: ค้นหาเส้นขาเข้า
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

  // Helper: แจ้ง Error และเปลี่ยนสีแดง
  const fail = async (msg: string) => {
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg); 
  };

  // ------------------------------------------------------
  // 🛡️ STEP 1: Validation (เช็คประเภทโหนดต้นทาง)
  // ------------------------------------------------------
  const incoming = getIncoming(nodeId);
  if (incoming.length === 0) {
    return fail('No input connection (Please connect an Image source).');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);
  
  // รายชื่อโหนดที่ "ห้าม" เอามาต่อเข้า Feature (เพราะไม่ใช่รูปภาพดิบ)
  const BAD_SOURCES = [
    'sift', 'surf', 'orb',           // Feature ต่อ Feature ไม่ได้
    'bfmatcher', 'flannmatcher',     // Matcher ต่อ Feature ไม่ได้
    'otsu', 'snake',                 // Classification ต่อ Feature ไม่ได้
    'psnr', 'ssim', 'brisque',       // Quality ต่อ Feature ไม่ได้
    'save-json', 'save-image'        // Save ต่อ Feature ไม่ได้
  ];

  if (prevNode && BAD_SOURCES.includes(prevNode.type || '')) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: Feature Extraction requires an Image source, not a '${tool}' result.`);
  }

  // ------------------------------------------------------
  // 🛡️ STEP 2: หา Path รูปภาพ
  // ------------------------------------------------------
  const imagePath = findInputImage(nodeId, nodes, edges);

  if (!imagePath) {
    return fail('No input image found (Please check connection or run parent node).');
  }

  // ------------------------------------------------------
  // 🚀 STEP 3: Execution
  // ------------------------------------------------------
  let prefix = '';
  let runner: any;

  switch (node.type) {
    case 'sift': prefix = 'SIFT'; runner = runSift; break;
    case 'surf': prefix = 'SURF'; runner = runSurf; break;
    case 'orb':  prefix = 'ORB';  runner = runOrb; break;
    default: return;
  }

  await markStartThenRunning(nodeId, `Running ${prefix}`, setNodes);

  try {
    const params = node.data.payload?.params;
    
    // เรียก API
    const resp = await runner(imagePath, params);

    // เตรียมข้อมูล Metadata
    const num_keypoints = resp.num_keypoints ?? resp.kps_count ?? 0;
    
    // เช็คว่ามี vis_url ไหม (บางที backend อาจส่ง path เต็มมา ต้องแปลงเป็น abs url)
    const visUrl = resp.vis_url ? abs(resp.vis_url) : undefined;

    // Update Success
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status: 'success',
                description: `Found ${num_keypoints} keypoints`,
                payload: {
                  ...(n.data as CustomNodeData)?.payload,
                  params,
                  json: resp,
                  json_url: resp.json_url,
                  json_path: resp.json_path,
                  
                  // สำหรับแสดงผล
                  result_image_url: visUrl,
                  vis_url: visUrl,
                  
                  // Meta
                  num_keypoints: num_keypoints,
                  image_shape: resp?.image?.processed_shape || resp?.image_shape,
                  image_dtype: resp?.image?.processed_dtype || resp?.image_dtype,
                  file_name: resp?.image?.file_name || resp?.file_name,
                  
                  // Output มาตรฐาน
                  output: {
                    vis_url: visUrl,
                    json_url: resp.json_url,
                    num_keypoints: num_keypoints
                  }
                },
              } as CustomNodeData,
            }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Error:`, err);
    await fail(err?.message || `${prefix} failed`);
  }
}