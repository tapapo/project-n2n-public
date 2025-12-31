import { runHomographyAlignment, runAffineAlignment, abs } from '../api';
import { markStartThenRunning, updateNodeStatus } from './utils';
import type { Edge } from 'reactflow';
import type { Node as RFNode } from 'reactflow'; 
import type { CustomNodeData } from '../../types';

type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;

function getIncoming(edges: Edge[], id: string) {
  return edges.filter((e) => e.target === id);
}

function pickMatchJsonFromNode(matchNode?: RF): string | null {
  if (!matchNode) return null;
  const p = (matchNode.data as CustomNodeData | undefined)?.payload;
  // รองรับหลาย Path
  const matchPath = p?.output?.match_json || p?.json?.json_path || p?.json_path;
  
  if (!matchPath || typeof matchPath !== 'string' || !matchPath.endsWith('.json')) return null;
  return matchPath;
}

function getNodeParams<T extends object = Record<string, any>>(node: RF): T {
  return ((node.data?.payload?.params as T) ?? ({} as T));
}

export async function runAlignment(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const kind = node.type || 'homography-align';

  // 1. ตรวจสอบ Connection
  const incoming = getIncoming(edges, nodeId);
  if (!incoming.length) {
    const msg = 'No input connection. Please connect a Matcher node (BF/FLANN).';
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }

  const srcEdge = incoming[0];
  const matchNode = nodes.find((n) => n.id === srcEdge.source);

  // 2. ตรวจสอบประเภทโหนดต้นทาง
  const allowedTypes = ['bfmatcher', 'flannmatcher'];
  if (!matchNode || !allowedTypes.includes(matchNode.type || '')) {
    const label = matchNode?.data?.label || matchNode?.type || 'Unknown Node';
    const msg = `Invalid Input: Alignment requires a Matcher node, not a '${label}' result.`;
    await updateNodeStatus(nodeId, 'fault', setNodes);
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, description: msg } } : n));
    throw new Error(msg);
  }
  
  // 3. ดึง JSON Path
  const matchJson = pickMatchJsonFromNode(matchNode);
  if (!matchJson) {
    const msg = 'Matcher output not ready. Please Run the Matcher node first.';
    await updateNodeStatus(nodeId, 'fault', setNodes);
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, description: msg } } : n));
    throw new Error(msg);
  }

  const params = getNodeParams(node);
  const label = kind === 'affine-align' ? 'Running Affine...' : 'Running Homography...';

  await markStartThenRunning(nodeId, label, setNodes);

  try {
    let resp: any;

    if (kind === 'affine-align') {
      resp = await runAffineAlignment(matchJson, params);
    } else {
      resp = await runHomographyAlignment(matchJson, params);
    }

    const alignedPath = resp?.output?.aligned_path;
    const alignedUrl = resp?.output?.aligned_url ? abs(resp.output.aligned_url) : undefined;
    const inliers = typeof resp?.num_inliers === 'number' ? resp.num_inliers : (resp?.inliers ?? '?');

    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: `${kind === 'affine-align' ? 'Affine' : 'Homography'} aligned (${inliers} inliers)`,
                payload: {
                  ...(x.data?.payload || {}),
                  tool: kind === 'affine-align' ? 'AffineAlignment' : 'HomographyAlignment',
                  output_type: 'alignment', 
                  params,
                  
                  // ✅ เก็บ raw json
                  json_data: resp, 
                  
                  // ✅ จัดการเรื่อง URL รูปภาพให้ครบถ้วน
                  vis_url: alignedUrl, 
                  result_image_url: alignedUrl,
                  output_image: alignedUrl, 
                  
                  // ✅✅ เพิ่ม Metadata สำคัญ: ขนาดและ Channel
                  // เพื่อให้ Node ถัดไป (Enhancement) รู้ว่าเป็นภาพสีและมีขนาดเท่าไหร่
                  image_shape: resp.image_shape || resp.output?.aligned_shape,
                  channels: resp.channels || (resp.image_shape ? resp.image_shape[2] : 3),

                  json_path: resp?.json_path,
                  aligned_path: alignedPath,
                  output: resp, 
                },
              } as CustomNodeData,
            }
          : x
      )
    );
  } catch (err: any) {
    console.error("Alignment Error:", err);
    await updateNodeStatus(nodeId, 'fault', setNodes);
    const errMsg = err.response?.data?.detail || err.message || "Alignment Failed";
    setNodes((nds) => nds.map(n => n.id === nodeId ? {
        ...n, data: { ...n.data, description: errMsg }
    } : n));
    throw err;
  }
}