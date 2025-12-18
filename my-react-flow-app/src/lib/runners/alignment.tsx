//src/lib/runners/alignment.tsx
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
  const nested = (p as any)?.json?.json_path;
  const flat = (p as any)?.json_path;
  const path = typeof nested === 'string' ? nested : typeof flat === 'string' ? flat : null;
  
  if (!path || !path.endsWith('.json')) return null;
  return path;
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

  
  const incoming = getIncoming(edges, nodeId);
  if (!incoming.length) {
    const msg = 'No input matcher connection (Drag a line from BFMatcher/FLANNMatcher).';
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }

  const srcEdge = incoming[0];
  const matchNode = nodes.find((n) => n.id === srcEdge.source);

 
  const allowedTypes = ['bfmatcher', 'flannmatcher'];
  if (!matchNode || !allowedTypes.includes(matchNode.type || '')) {
    const label = matchNode?.data.label || matchNode?.type || 'Unknown Node';
    
    const msg = `Invalid Input: Alignment requires a Matcher node, not a '${label}' result.`;
    
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }

  
  const matchJson = pickMatchJsonFromNode(matchNode);
  if (!matchJson) {
    const msg = 'Matcher has no valid JSON output (Please Run the Matcher node first).';
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }


  const params = getNodeParams(node);
  const label = kind === 'affine-align' ? 'Running Affine' : 'Running Homography';

  await markStartThenRunning(nodeId, label, setNodes);

  try {
    let resp: any;

    if (kind === 'affine-align') {
      resp = await runAffineAlignment(matchJson, params);
    } else {
      resp = await runHomographyAlignment(matchJson, params);
    }

    const alignedPath = resp?.output?.aligned_path;
    const alignedUrl = resp?.output?.aligned_url 
      ? abs(resp.output.aligned_url) 
      : undefined;
    
    const inliers = typeof resp?.num_inliers === 'number' ? resp.num_inliers : '?';

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
                  json: resp,
                  json_path: resp?.json_path,
                  json_url: resp?.json_url ? abs(resp.json_url) : undefined,
                  aligned_path: alignedPath,
                  aligned_url: alignedUrl,
                  output: resp, 
                  url: alignedUrl,
                  result_image_url: alignedUrl 
                },
              } as CustomNodeData,
            }
          : x
      )
    );
  } catch (err: any) {
    console.error("Alignment Error:", err);
    await updateNodeStatus(nodeId, 'fault', setNodes);
    
    throw err;
  }
}