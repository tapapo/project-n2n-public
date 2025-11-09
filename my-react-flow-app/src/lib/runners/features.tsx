// src/lib/runners/features.tsx
import { runSift, runSurf, runOrb, abs } from '../api';
import { markStartThenRunning } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

/**
 * รัน Feature Extraction (SIFT, SURF, ORB)
 * ใช้ใน FlowCanvas ผ่าน runFeature(node, setNodes, nodes, edges)
 */
export async function runFeature(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  // ---------- Helper: หา upstream image ----------
  const getUpstreamImagePath = (id: string): string | null => {
    const incoming = edges.filter((e) => e.target === id);
    for (const e of incoming) {
      const prev = nodes.find((n) => n.id === e.source);
      if (prev?.type === 'image-input' && (prev.data as CustomNodeData)?.payload?.path) {
        return String((prev.data as CustomNodeData).payload!.path);
      }
    }
    return null;
  };

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

    // fallback: ลองอ่าน JSON ถ้ามี url แต่ยังได้ meta ไม่ครบ
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

  const imagePath = getUpstreamImagePath(node.id);
  if (!imagePath) {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: { ...x.data, status: 'fault', description: 'No upstream image' },
            }
          : x
      )
    );
    return;
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
                description: `${prefix} done`,
                payload: {
                  ...(x.data as CustomNodeData)?.payload,
                  params,
                  json_url: resp.json_url,
                  json_path: resp.json_path,
                  result_image_url: abs(resp.vis_url),
                  vis_url: abs(resp.vis_url),
                  num_keypoints: meta.num_keypoints,
                  image_shape: meta.image_shape,
                  image_dtype: meta.image_dtype,
                  file_name: meta.file_name,
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
                description: err?.message || 'Error',
              },
            }
          : x
      )
    );
  }
}