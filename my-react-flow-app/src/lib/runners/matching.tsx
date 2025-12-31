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

  const findFeatureJson = (n?: RFNode): string | undefined => {
    const p = (n?.data as CustomNodeData | undefined)?.payload;
    return (p as any)?.json_path ?? (p as any)?.json_url;
  };

  // 1. ตรวจสอบการเชื่อมต่อ
  const incoming = getIncoming(node.id);
  const e1 = incoming.find((e) => e.targetHandle === 'file1');
  const e2 = incoming.find((e) => e.targetHandle === 'file2');

  if (!e1 || !e2) {
    const msg = 'Need two feature inputs. Please connect Feature Extraction nodes.';
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }

  // 2. ตรวจสอบประเภทโหนดต้นทาง (ต้องเป็น Feature Node)
  const n1 = nodes.find(n => n.id === e1.source);
  const n2 = nodes.find(n => n.id === e2.source);
  
  const allowedTypes = ['sift', 'surf', 'orb'];
  const type1 = n1?.type || 'unknown';
  const type2 = n2?.type || 'unknown';

  if (!allowedTypes.includes(type1) || !allowedTypes.includes(type2)) {
     const badType = !allowedTypes.includes(type1) ? type1 : type2;
     const msg = `Invalid input: Matchers require Feature Extraction nodes, not a '${badType}' result.`;
     await updateNodeStatus(nodeId, 'fault', setNodes);
     throw new Error(msg);
  }

  // ✅ 2.5 ตรวจสอบความเข้ากันได้ (Compatibility Check)
  // SIFT ต้องคู่กับ SIFT, ORB ต้องคู่กับ ORB ไม่งั้น Descriptor คนละประเภทจะ Match กันไม่ได้
  if (type1 !== type2) {
    const msg = `Mismatch Error: Cannot match '${type1.toUpperCase()}' with '${type2.toUpperCase()}'. Both inputs must use the same algorithm.`;
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }

  // 3. ตรวจสอบว่าโหนดต้นทางรันเสร็จหรือยัง
  const jsonA = findFeatureJson(n1);
  const jsonB = findFeatureJson(n2);

  if (!jsonA || !jsonB) {
    const msg = 'Upstream features not ready (Please Run Features Extraction nodes first).';
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  }

  const kind = node.type as 'bfmatcher' | 'flannmatcher';
  await markStartThenRunning(node.id, `Running ${kind.toUpperCase()}`, setNodes);

  try {
    const params = ((node.data as CustomNodeData)?.payload?.params || {}) as Record<string, any>;
    let resp: any;

    if (kind === 'bfmatcher') {
      resp = await runBfmatcher(jsonA, jsonB, params);
    } 
    else {
      // FLANN Params handling...
      const p = params || {};
      let indexMode: any = 'AUTO';
      let kdTrees, lshTableNumber, lshKeySize, lshMultiProbeLevel, searchChecks;

      if (p.index_params !== 'AUTO' && p.index_params != null) {
         const algo = String(p.index_params.algorithm).toUpperCase();
         if (algo.includes('KD')) {
            indexMode = 'KD_TREE';
            kdTrees = p.index_params.trees;
         } else if (algo === 'LSH') {
            indexMode = 'LSH';
            lshTableNumber = p.index_params.table_number;
            lshKeySize = p.index_params.key_size;
            lshMultiProbeLevel = p.index_params.multi_probe_level;
         }
      }
      
      if (p.search_params && p.search_params !== 'AUTO') {
         searchChecks = p.search_params.checks;
      }

      resp = await runFlannmatcher(jsonA, jsonB, {
        loweRatio: p.lowe_ratio,
        ransacThresh: p.ransac_thresh,
        drawMode: p.draw_mode,
        maxDraw: p.max_draw,
        indexMode, kdTrees, searchChecks, lshTableNumber, lshKeySize, lshMultiProbeLevel,
      });
    }

    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: resp?.description || resp?.matching_statistics?.summary || `${kind.toUpperCase()} done`,
                payload: {
                  ...(x.data as CustomNodeData)?.payload,
                  ...resp,
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
    
    // แสดง Error message ที่ชัดเจนขึ้นใน Node Description ถ้ามี
    setNodes((nds) => nds.map(n => n.id === nodeId ? {
        ...n, data: { ...n.data, description: err.message || 'Execution failed' }
    } : n));

    throw err;
  }
}