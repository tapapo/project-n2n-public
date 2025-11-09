// src/lib/runners/alignment.tsx
import { API_BASE, abs } from '../api';
import { markStartThenRunning } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

function getIncoming(edges: Edge[], id: string) {
  return edges.filter((e) => e.target === id);
}

function pickMatchJsonFromNode(matchNode?: RFNode): string | null {
  if (!matchNode) return null;
  const p = (matchNode.data as CustomNodeData | undefined)?.payload;

  // รองรับทั้งแบบที่ payload.json เป็น object และแบบที่เก็บเป็น json_path ตรง ๆ
  const nested = (p as any)?.json?.json_path;
  const flat = (p as any)?.json_path;

  const path =
    typeof nested === 'string'
      ? nested
      : typeof flat === 'string'
      ? flat
      : null;

  if (!path || !path.endsWith('.json')) return null;
  return path;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? ` - ${text}` : ''}`);
  }
  return resp.json() as Promise<T>;
}

/**
 * 🔹 runAlignment
 * เรียกใช้หลังจาก BFMatcher / FLANNMatcher → ทำ Homography หรือ Affine alignment
 * - node.type === 'homography-align' → POST /api/alignment/homography
 * - node.type === 'affine-align'     → POST /api/alignment/affine
 */
export async function runAlignment(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const kind = (node.type as string) || 'homography-align';

  // 1) หา upstream matcher → เอา match_json ที่เป็น "ไฟล์ .json" ของผล matching
  const incoming = getIncoming(edges, nodeId);
  if (!incoming.length) {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'fault',
                description: 'No input matcher connection',
              },
            }
          : x
      )
    );
    return;
  }

  const srcEdge = incoming[0];
  const matchNode = nodes.find((n) => n.id === srcEdge.source);
  const matchJson = pickMatchJsonFromNode(matchNode);

  if (!matchJson) {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'fault',
                description: 'Matcher has no valid JSON output',
              },
            }
          : x
      )
    );
    return;
  }

  // 2) อ่าน params จาก node
  const params = ((node.data as CustomNodeData)?.payload?.params || {}) as Record<
    string,
    unknown
  >;

  // 3) mark running
  await markStartThenRunning(
    nodeId,
    kind === 'affine-align' ? 'Running Affine' : 'Running Homography',
    setNodes
  );

  try {
    let result: any;

    if (kind === 'affine-align') {
      // ค่า default ที่ปลอดภัย
      const body = {
        match_json: matchJson,
        model:
          typeof params.model === 'string' ? (params.model as string) : 'affine', // 'affine' | 'partial'
        warp_mode:
          typeof params.warp_mode === 'string'
            ? (params.warp_mode as string)
            : 'image2_to_image1',
        blend: !!params.blend,
        ransac_thresh:
          typeof params.ransac_thresh === 'number' ? (params.ransac_thresh as number) : 3.0,
        confidence:
          typeof params.confidence === 'number' ? (params.confidence as number) : 0.99,
        refine_iters:
          typeof params.refine_iters === 'number' ? (params.refine_iters as number) : 10,
      };

      // เรียก API affine
      result = await postJSON(`${API_BASE}/api/alignment/affine`, body);
    } else {
      // homography-align
      const body = {
        match_json: matchJson,
        warp_mode:
          typeof params.warp_mode === 'string'
            ? (params.warp_mode as string)
            : 'image2_to_image1',
        blend: !!params.blend,
      };

      // เรียก API homography
      result = await postJSON(`${API_BASE}/api/alignment/homography`, body);
    }

    // 4) หา URL ของภาพผลลัพธ์
    // backend ใหม่ควรส่ง result.output.aligned_url มาแล้ว
    // ถ้าไม่มี ให้ลองแปลงจาก aligned_image → abs()
    const alignedUrl: string | undefined =
      (result?.output?.aligned_url as string | undefined) ||
      (result?.output?.aligned_image ? abs(result.output.aligned_image) : undefined);

    // 5) อัปเดต node
    const inliers = typeof result?.num_inliers === 'number' ? (result.num_inliers as number) : undefined;

    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description:
                  kind === 'affine-align'
                    ? `Affine aligned${inliers != null ? ` (${inliers} inliers)` : ''}`
                    : `Homography aligned${inliers != null ? ` (${inliers} inliers)` : ''}`,
                payload: {
                  ...((x.data as CustomNodeData)?.payload || {}),
                  params, // เก็บ params ล่าสุด
                  json: result, // เก็บผลลัพธ์เต็ม (matrix, meta, path, output)
                  aligned_url: alignedUrl, // ให้โหนด UI ใช้แสดงรูปได้ทันที
                },
              } as CustomNodeData,
            }
          : x
      )
    );
  } catch (err: any) {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'fault',
                description: err?.message || 'Alignment failed',
              },
            }
          : x
      )
    );
  }
}