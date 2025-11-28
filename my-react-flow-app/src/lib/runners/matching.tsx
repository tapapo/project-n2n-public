import { runBfmatcher, runFlannmatcher, abs } from '../api';
import { markStartThenRunning, updateNodeStatus } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

export async function runMatcher(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

  // Helper: หา JSON Path
  const findFeatureJson = (n?: RFNode): string | undefined => {
    const p = (n?.data as CustomNodeData | undefined)?.payload;
    return (p as any)?.json_path ?? (p as any)?.json_url;
  };

  // -----------------------------------------------------------
  // 🛡️ STEP 1: เช็คจำนวนเส้น (Connection Count)
  // -----------------------------------------------------------
  const incoming = getIncoming(node.id);
  const e1 = incoming.find((e) => e.targetHandle === 'file1');
  const e2 = incoming.find((e) => e.targetHandle === 'file2');

  if (!e1 || !e2) {
    // ถ้ายังไม่ได้ต่อสายเลย
    const msg = 'Need two feature inputs. Please connect SIFT, SURF, or ORB nodes.';
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }

  // -----------------------------------------------------------
  // 🛡️ STEP 2: เช็คประเภทโหนด (Strict Type Validation)
  // จุดนี้จะกันไม่ให้ Error แบบ JSON {"detail":...} หลุดออกมา
  // -----------------------------------------------------------
  const n1 = nodes.find(n => n.id === e1.source);
  const n2 = nodes.find(n => n.id === e2.source);
  
  // รายชื่อโหนดที่อนุญาตให้เข้า Matcher ได้
  const allowedTypes = ['sift', 'surf', 'orb'];

  const type1 = n1?.type || 'unknown';
  const type2 = n2?.type || 'unknown';

  if (!allowedTypes.includes(type1) || !allowedTypes.includes(type2)) {
     // ถ้ามีเส้นไหนผิดประเภท (เช่นลาก Otsu หรือ Matcher มาใส่) -> แจ้ง Error แบบที่คุณชอบทันที
     const msg = `Invalid input type. Matchers require Feature Extraction nodes (SIFT/SURF/ORB).`;
     
     await updateNodeStatus(nodeId, 'fault', setNodes);
     throw new Error(msg);
  }

  // -----------------------------------------------------------
  // 🛡️ STEP 3: เช็คข้อมูล (Data Check)
  // ประเภทถูกแล้ว แต่ยังไม่ได้กด Run โหนดแม่
  // -----------------------------------------------------------
  const jsonA = findFeatureJson(n1);
  const jsonB = findFeatureJson(n2);

  if (!jsonA || !jsonB) {
    const msg = 'Upstream features not ready (Please Run SIFT/SURF/ORB first).';
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }

  // -----------------------------------------------------------
  // 🚀 STEP 4: รัน API (Execution)
  // -----------------------------------------------------------
  const kind = node.type as 'bfmatcher' | 'flannmatcher';
  await markStartThenRunning(node.id, `Running ${kind.toUpperCase()}`, setNodes);

  try {
    const params = ((node.data as CustomNodeData)?.payload?.params || {}) as Record<
      string,
      unknown
    >;
    let resp: any;

    if (kind === 'bfmatcher') {
      resp = await runBfmatcher(jsonA, jsonB, params);
    }
    else if (kind === 'flannmatcher') {
      // FLANN Logic
      const p = params || {};
      let indexMode: any = 'AUTO';
      let kdTrees, lshTableNumber, lshKeySize, lshMultiProbeLevel, searchChecks;

      if (p.index_params !== 'AUTO' && p.index_params != null) {
         const algo = String((p as any).index_params.algorithm).toUpperCase();
         if (algo.includes('KD')) {
            indexMode = 'KD_TREE';
            kdTrees = (p as any).index_params.trees;
         } else if (algo === 'LSH') {
            indexMode = 'LSH';
            lshTableNumber = (p as any).index_params.table_number;
            lshKeySize = (p as any).index_params.key_size;
            lshMultiProbeLevel = (p as any).index_params.multi_probe_level;
         }
      }
      
      if ((p as any).search_params && (p as any).search_params !== 'AUTO') {
         searchChecks = (p as any).search_params.checks;
      }

      resp = await runFlannmatcher(jsonA, jsonB, {
        loweRatio: (p as any).lowe_ratio,
        ransacThresh: (p as any).ransac_thresh,
        drawMode: (p as any).draw_mode,
        maxDraw: (p as any).max_draw,
        indexMode, kdTrees, searchChecks, lshTableNumber, lshKeySize, lshMultiProbeLevel,
      });
    }

    // Success
    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: resp?.matching_statistics?.summary || `${kind.toUpperCase()} done`,
                payload: {
                  ...(x.data as CustomNodeData)?.payload,
                  vis_url: abs(resp.vis_url),
                  json: resp,
                  json_path: resp?.json_path,
                  output: {
                    match_json: resp.json_path,
                    vis_url: abs(resp.vis_url),
                    json_url: resp.json_url
                  }
                },
              } as CustomNodeData,
            }
          : x
      )
    );
  } catch (err: any) {
    console.error(`❌ ${kind} failed:`, err);
    await updateNodeStatus(node.id, 'fault', setNodes);
    
    // โยน Error ออกไปให้ Log Panel
    throw err;
  }
}