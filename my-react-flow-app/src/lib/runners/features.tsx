import { runSift, runSurf, runOrb, abs } from '../api';
// ✅ เพิ่ม findInputImage เข้ามา
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
  // ---------- Helper: ดึงเมตาดาต้าจาก response ----------
  async function extractFeatureMeta(
    resp: any,
    algo: 'SIFT' | 'SURF' | 'ORB'
  ) {
    let num_keypoints =
      resp?.num_keypoints ??
      resp?.kps_count ??
      resp?.keypoints?.length ??
      null;

    let shapeFromResp =
      resp?.image?.processed_sift_shape ??
      resp?.image?.processed_shape ??
      resp?.image?.processed_orb_shape ??
      resp?.image_shape ??
      null;

    let dtypeFromResp =
      resp?.image?.processed_sift_dtype ??
      resp?.image?.processed_dtype ??
      resp?.image?.processed_orb_dtype ??
      resp?.image_dtype ??
      null;

    let fileName = resp?.image?.file_name ?? resp?.file_name ?? null;
    const absJsonUrl = resp?.json_url ? abs(resp.json_url) : undefined;

    // fallback
    if ((!num_keypoints || !shapeFromResp || !dtypeFromResp) && absJsonUrl) {
      try {
        const j = await (await fetch(absJsonUrl)).json();
        num_keypoints = num_keypoints ?? j?.num_keypoints ?? j?.keypoints?.length ?? null;
        shapeFromResp =
          shapeFromResp ??
          j?.image?.processed_sift_shape ??
          j?.image?.processed_shape ??
          j?.image?.processed_orb_shape ??
          j?.image?.shape ??
          null;
        dtypeFromResp =
          dtypeFromResp ??
          j?.image?.processed_sift_dtype ??
          j?.image?.processed_dtype ??
          j?.image?.processed_orb_dtype ??
          j?.image?.dtype ??
          null;
        fileName = fileName ?? j?.image?.file_name ?? null;
      } catch {
        /* ignore network/parse error */
      }
    }

    return {
      num_keypoints: typeof num_keypoints === 'number' ? num_keypoints : null,
      image_shape: Array.isArray(shapeFromResp) ? shapeFromResp : null,
      image_dtype: typeof dtypeFromResp === 'string' ? dtypeFromResp : null,
      file_name: typeof fileName === 'string' ? fileName : null,
      algo,
    };
  }

  // ---------- เลือก runner ตามประเภท ----------
  let prefix: 'SIFT' | 'SURF' | 'ORB';
  let runner: (imagePath: string, params?: Record<string, unknown>) => Promise<any>;

  switch (node.type) {
    case 'sift':
      prefix = 'SIFT';
      runner = runSift;
      break;
    case 'surf':
      prefix = 'SURF';
      runner = runSurf;
      break;
    case 'orb':
      prefix = 'ORB';
      runner = runOrb;
      break;
    default:
      return;
  }

  // ✅ แก้ไข: ใช้ findInputImage (รองรับทั้ง ImageInput และ Alignment)
  const imagePath = findInputImage(node.id, nodes, edges);

  if (!imagePath) {
    const msg = 'No input image found (Please check connection or run parent node).';
    await updateNodeStatus(node.id, 'fault', setNodes);
    throw new Error(msg);
  }

  const params = (node.data as CustomNodeData)?.payload?.params || {};
  await markStartThenRunning(node.id, `Running ${prefix}`, setNodes);

  try {
    const resp = await runner(imagePath, params as Record<string, unknown>);
    const meta = await extractFeatureMeta(resp, prefix);

    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: `Found ${meta.num_keypoints ?? 0} keypoints`,
                payload: {
                  ...(x.data as CustomNodeData)?.payload,
                  params,
                  // ✅ เก็บข้อมูลสำคัญให้ครบเพื่อส่งต่อให้ Save Node หรือ Matcher
                  json: resp,
                  json_url: resp.json_url,
                  json_path: resp.json_path,
                  result_image_url: abs(resp.vis_url),
                  vis_url: abs(resp.vis_url),
                  num_keypoints: meta.num_keypoints,
                  image_shape: meta.image_shape,
                  image_dtype: meta.image_dtype,
                  file_name: meta.file_name,
                  
                  // ✅ Output มาตรฐาน
                  output: {
                    vis_url: abs(resp.vis_url),
                    json_url: resp.json_url,
                    num_keypoints: meta.num_keypoints
                  }
                },
              } as CustomNodeData,
            }
          : x
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Error:`, err);
    await updateNodeStatus(node.id, 'fault', setNodes);
    
    // ✅ Throw Error เพื่อให้ Log Panel แสดงสีแดง
    throw err;
  }
}