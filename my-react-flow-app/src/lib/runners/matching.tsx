// src/lib/runners/matching.tsx
import { runBfmatcher, runFlannmatcher, abs } from '../api';
import { markStartThenRunning } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

/**
 * 🔹 รัน Descriptor Matching (BFMatcher / FLANNMatcher)
 * ใช้หลังจากมี feature descriptors จาก SIFT / SURF / ORB แล้ว
 */
export async function runMatcher(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  // ===== Helper: หา input edges =====
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

  // ===== หา descriptor JSON จาก upstream feature node =====
  const findFeatureJson = (srcId: string): string | undefined => {
    const prevNode = nodes.find((n) => n.id === srcId);
    const p = (prevNode?.data as CustomNodeData | undefined)?.payload;
    return (p as any)?.json_path ?? (p as any)?.json_url;
  };

  // ===== เริ่มต้นจับคู่ =====
  const incoming = getIncoming(node.id);
  const e1 = incoming.find((e) => e.targetHandle === 'file1');
  const e2 = incoming.find((e) => e.targetHandle === 'file2');

  if (!e1 || !e2) {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'fault',
                description: 'Need two feature inputs',
              },
            }
          : x
      )
    );
    return;
  }

  const jsonA = findFeatureJson(e1.source);
  const jsonB = findFeatureJson(e2.source);

  if (!jsonA || !jsonB) {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'fault',
                description: 'Upstream features not ready',
              },
            }
          : x
      )
    );
    return;
  }

  const kind = node.type as 'bfmatcher' | 'flannmatcher';
  await markStartThenRunning(node.id, `Running ${kind.toUpperCase()}`, setNodes);

  try {
    const params = ((node.data as CustomNodeData)?.payload?.params || {}) as Record<
      string,
      unknown
    >;
    let resp: any;

    // ===== BFMatcher =====
    if (kind === 'bfmatcher') {
      resp = await runBfmatcher(jsonA, jsonB, params);
    }

    // ===== FLANNMatcher =====
    else if (kind === 'flannmatcher') {
      const p = params || {};

      let indexMode: 'AUTO' | 'KD_TREE' | 'LSH' | undefined;
      let kdTrees: number | undefined;
      let lshTableNumber: number | undefined;
      let lshKeySize: number | undefined;
      let lshMultiProbeLevel: number | undefined;
      let searchChecks: number | undefined;

      if (p.index_params === 'AUTO' || p.index_params == null) {
        indexMode = 'AUTO';
      } else {
        const algo = String((p as any).index_params.algorithm).toUpperCase();
        if (algo.includes('KD')) {
          indexMode = 'KD_TREE';
          kdTrees =
            typeof (p as any).index_params.trees === 'number'
              ? (p as any).index_params.trees
              : undefined;
        } else if (algo === 'LSH') {
          indexMode = 'LSH';
          lshTableNumber =
            typeof (p as any).index_params.table_number === 'number'
              ? (p as any).index_params.table_number
              : undefined;
          lshKeySize =
            typeof (p as any).index_params.key_size === 'number'
              ? (p as any).index_params.key_size
              : undefined;
          lshMultiProbeLevel =
            typeof (p as any).index_params.multi_probe_level === 'number'
              ? (p as any).index_params.multi_probe_level
              : undefined;
        }
      }

      if ((p as any).search_params && (p as any).search_params !== 'AUTO') {
        if (typeof (p as any).search_params.checks === 'number') {
          searchChecks = (p as any).search_params.checks;
        }
      }

      resp = await runFlannmatcher(jsonA, jsonB, {
        loweRatio:
          typeof (p as any).lowe_ratio === 'number'
            ? (p as any).lowe_ratio
            : undefined,
        ransacThresh:
          typeof (p as any).ransac_thresh === 'number'
            ? (p as any).ransac_thresh
            : undefined,
        drawMode: (p as any).draw_mode,
        maxDraw:
          typeof (p as any).max_draw === 'number'
            ? (p as any).max_draw
            : undefined,
        indexMode,
        kdTrees,
        searchChecks,
        lshTableNumber,
        lshKeySize,
        lshMultiProbeLevel,
      });
    }

    // ===== อัปเดตผลลัพธ์ =====
    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description:
                  resp?.matching_statistics?.summary ||
                  `${kind.toUpperCase()} done`,
                payload: {
                  ...(x.data as CustomNodeData)?.payload,
                  vis_url: abs(resp.vis_url),
                  json: resp,
                  json_path: resp?.json_path,
                },
              } as CustomNodeData,
            }
          : x
      )
    );
  } catch (err: any) {
    console.error(`❌ ${kind} failed:`, err);
    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'fault',
                description: err?.message || `${kind} failed`,
              },
            }
          : x
      )
    );
  }
}