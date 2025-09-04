// src/FlowCanvas.tsx
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  MarkerType,
  type NodeTypes,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  runSift, runSurf, runOrb,
  runBrisque, runPsnr, runSsim,
  runBfmatcher, runFlannmatcher, abs
} from './lib/api';

import ImageInputNode from './components/nodes/ImageInputNode';
import SiftNode from './components/nodes/SiftNode';
import SurfNode from './components/nodes/SurfNode';
import OrbNode from './components/nodes/OrbNode';
import BrisqueNode from './components/nodes/BrisqueNode';
import PsnrNode from './components/nodes/PsnrNode';
import SsimNode from './components/nodes/SsimNode';
import BFMatcherNode from './components/nodes/BFMatcherNode';
import FLANNMatcherNode from './components/nodes/FLANNMatcherNode';

import type { CustomNodeData } from './types';

// ---------- Node Types ----------
const nodeTypes: NodeTypes = {
  'image-input': ImageInputNode,
  sift: SiftNode,
  surf: SurfNode,
  orb: OrbNode,
  brisque: BrisqueNode,
  psnr: PsnrNode,
  ssim: SsimNode,
  bfmatcher: BFMatcherNode,
  flannmatcher: FLANNMatcherNode,
};

// ---------- Helpers ----------
const getId = () => `dndnode_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const makeAbs = (url?: string) => (url ? abs(url) : undefined);

interface FlowCanvasProps {
  isRunning: boolean;
  onPipelineDone: () => void;
}

const DEFAULT_PORTS: Record<
  string,
  { inputs: { id: string; label?: string }[]; outputs: { id: string; label?: string }[] }
> = {
  'image-input': { inputs: [], outputs: [{ id: 'img', label: 'image' }] },
  sift: { inputs: [{ id: 'img' }], outputs: [{ id: 'feat' }] },
  surf: { inputs: [{ id: 'img' }], outputs: [{ id: 'feat' }] },
  orb: { inputs: [{ id: 'img' }], outputs: [{ id: 'feat' }] },
  brisque: { inputs: [{ id: 'img' }], outputs: [{ id: 'json' }] },
  psnr: { inputs: [{ id: 'input1' }, { id: 'input2' }], outputs: [{ id: 'json' }] },
  ssim: { inputs: [{ id: 'input1' }, { id: 'input2' }], outputs: [{ id: 'json' }] },
  bfmatcher: { inputs: [{ id: 'file1' }, { id: 'file2' }], outputs: [{ id: 'json' }] },
  flannmatcher: { inputs: [{ id: 'file1' }, { id: 'file2' }], outputs: [{ id: 'json' }] },
};

const STORAGE_KEY_NODES = 'n2n_nodes';
const STORAGE_KEY_EDGES = 'n2n_edges';

// ---------- Utility ----------
async function fetchFileFromUrl(url: string | undefined, filename: string): Promise<File> {
  if (!url) throw new Error('Missing URL');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const blob = await resp.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

// ทำให้ URL ของรูปเป็น absolute เสมอ และรองรับทุกชนิดโหนด
function getNodeImageUrl(n?: any): string | undefined {
  if (!n) return undefined;
  const normalize = (u?: string) => (u ? (/^(https?:|blob:|data:)/i.test(u) ? u : abs(u)) : undefined);

  if (n.type === 'image-input') {
    return normalize(n.data?.payload?.url) ?? normalize(n.data?.payload?.preview_url);
  }
  if (['sift', 'surf', 'orb'].includes(n.type)) {
    return normalize(n.data?.payload?.result_image_url) ?? normalize(n.data?.payload?.vis_url);
  }
  return normalize(n.data?.payload?.result_image_url) ?? normalize(n.data?.payload?.url);
}

const FlowCanvas = ({ isRunning, onPipelineDone }: FlowCanvasProps) => {
  const initialNodes = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_NODES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  const initialEdges = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_EDGES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow();

  // เก็บ state ปัจจุบันไว้ใน refs (ใช้ตอนกด Run เฉพาะ node)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ---------- Persist ----------
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(nodes));
  }, [nodes]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EDGES, JSON.stringify(edges));
  }, [edges]);

  const onConnect = useCallback(
    (conn: Edge | Connection) => {
      setEdges((eds) => {
        const exists = eds.some(
          (e) =>
            e.source === conn.source &&
            e.sourceHandle === conn.sourceHandle &&
            e.target === conn.target &&
            e.targetHandle === conn.targetHandle
        );
        if (exists) return eds;
        return addEdge(conn, eds);
      });
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type =
        event.dataTransfer.getData('application/reactflow') ||
        event.dataTransfer.getData('text/plain');
      if (!type) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const label = type.charAt(0).toUpperCase() + type.slice(1);
      const ports = DEFAULT_PORTS[type] ?? { inputs: [{ id: 'in' }], outputs: [{ id: 'out' }] };

      const newNode = {
        id: getId(),
        type,
        position,
        data: {
          label,
          inputs: ports.inputs,
          outputs: ports.outputs,
          payload: type === 'image-input' ? {} : undefined,
        } as CustomNodeData,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  // เส้น default ให้เป็น smoothstep + สี + ลูกศร
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep' as const,
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      style: { strokeWidth: 2, stroke: '#475569' },
    }),
    []
  );

  // ========== STOP แบบสุภาพ ==========
  const canceledRef = useRef(false);
  useEffect(() => {
    canceledRef.current = !isRunning;
  }, [isRunning]);
  const guard = () => { if (canceledRef.current) throw new Error('Pipeline canceled'); };

  // ให้ไฟ start โผล่ก่อน → running
  const markStartThenRunning = async (nodeId: string, runningText: string) => {
    setNodes(nds =>
      nds.map(x =>
        x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'start', description: 'Start' } }
          : x
      )
    );
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    await new Promise<void>(r => setTimeout(() => r(), 120));
    setNodes(nds =>
      nds.map(x =>
        x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'running', description: runningText } }
          : x
      )
    );
    await new Promise<void>(r => requestAnimationFrame(() => r()));
  };

  // ---------- helper: อ่านเมตาดาต้าจาก response / JSON ----------
  async function extractFeatureMeta(resp: any, algo: 'SIFT' | 'SURF' | 'ORB') {
    let num_keypoints =
      resp?.num_keypoints ??
      resp?.kps_count ??
      resp?.keypoints?.length ??
      null;

    let shapeFromResp =
      resp?.image?.processed_sift_shape ??   // SIFT
      resp?.image?.processed_shape ??        // SURF
      resp?.image?.processed_orb_shape ??    // ORB
      resp?.image_shape ??
      null;

    let dtypeFromResp =
      resp?.image?.processed_sift_dtype ??
      resp?.image?.processed_dtype ??
      resp?.image?.processed_orb_dtype ??
      resp?.image_dtype ??
      null;

    let fileName = resp?.image?.file_name ?? resp?.file_name ?? null;

    const absJsonUrl = makeAbs(resp?.json_url);

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
        // ignore
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

  // ---------- รันเฉพาะ node ----------
  const runNodeById = useCallback(async (nodeId: string) => {
    const nodesCur = nodesRef.current;
    const edgesCur = edgesRef.current;
    const node = nodesCur.find(n => n.id === nodeId);
    if (!node) return;

    const getUpstreamImagePath = (id: string): string | null => {
      const incoming = edgesCur.filter((e) => e.target === id);
      for (const e of incoming) {
        const prev = nodesCur.find((n) => n.id === e.source);
        if (prev?.type === 'image-input' && prev.data?.payload?.path) {
          return String(prev.data.payload.path);
        }
      }
      return null;
    };

    const getIncoming = (id: string) => edgesCur.filter(e => e.target === id);

    const featureRunner = async (
      _type: 'sift' | 'surf' | 'orb',
      runner: any,
      prefix: 'SIFT' | 'SURF' | 'ORB'
    ) => {
      const imagePath = getUpstreamImagePath(nodeId);
      if (!imagePath) {
        setNodes(nds => nds.map(x => x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: 'No upstream image' } }
          : x));
        return;
      }
      const params = (node.data?.payload?.params) || {};
      await markStartThenRunning(nodeId, `Running ${prefix}`);
      try {
        const resp = await runner(imagePath, params);
        const meta = await extractFeatureMeta(resp, prefix);
        setNodes(nds => nds.map(x => x.id === nodeId
          ? {
            ...x,
            data: {
              ...x.data,
              status: 'success',
              description: `${prefix} done`,
              payload: {
                params,
                json_url: resp.json_url,
                json_path: resp.json_path,
                result_image_url: makeAbs(resp.vis_url),
                vis_url: makeAbs(resp.vis_url),
                num_keypoints: meta.num_keypoints,
                image_shape: meta.image_shape,
                image_dtype: meta.image_dtype,
                file_name: meta.file_name,
              }
            }
          }
          : x));
      } catch (err: any) {
        setNodes(nds => nds.map(x => x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: err?.message || 'Error' } }
          : x));
      }
    };

    const runPairMetric = async (kind: 'psnr' | 'ssim', runner: any) => {
      const incoming = getIncoming(nodeId);
      const e1 = incoming.find(e => e.targetHandle === 'input1');
      const e2 = incoming.find(e => e.targetHandle === 'input2');
      if (!e1 || !e2) {
        setNodes(nds => nds.map(x => x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: 'Need two inputs' } }
          : x));
        return;
      }
      const nodeA = nodesCur.find(x => x.id === e1.source);
      const nodeB = nodesCur.find(x => x.id === e2.source);
      const urlA = getNodeImageUrl(nodeA);
      const urlB = getNodeImageUrl(nodeB);
      if (!urlA || !urlB) {
        setNodes(nds => nds.map(x => x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: 'No input images' } }
          : x));
        return;
      }
      await markStartThenRunning(nodeId, `Running ${kind.toUpperCase()}`);
      try {
        const fileA = await fetchFileFromUrl(urlA, 'a.jpg');
        const fileB = await fetchFileFromUrl(urlB, 'b.jpg');
        const resp = await runner(fileA, fileB);
        const isOK = (resp?.score != null) || (resp?.quality_score != null);
        setNodes(nds => nds.map(x => x.id === nodeId
          ? {
            ...x,
            data: {
              ...x.data,
              status: isOK ? 'success' : 'fault',
              description: resp?.score != null
                ? `SSIM = ${Number(resp.score).toFixed(4)}`
                : resp?.quality_score != null
                  ? `PSNR = ${resp.quality_score} dB`
                  : 'Error',
              payload: { ...(x.data?.payload || {}), json: resp }
            }
          }
          : x));
      } catch (err: any) {
        setNodes(nds => nds.map(x => x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: err?.message || 'Failed to fetch' } }
          : x));
      }
    };

    const runMatcher = async (kind: 'bfmatcher' | 'flannmatcher') => {
      const incoming = getIncoming(nodeId);
      const e1 = incoming.find(e => e.targetHandle === 'file1');
      const e2 = incoming.find(e => e.targetHandle === 'file2');
      if (!e1 || !e2) {
        setNodes(nds => nds.map(x => x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: 'Need two feature inputs' } }
          : x));
        return;
      }
      const nA = nodesCur.find(x => x.id === e1.source);
      const nB = nodesCur.find(x => x.id === e2.source);
      const jsonA = nA?.data?.payload?.json_path;
      const jsonB = nB?.data?.payload?.json_path;
      if (!jsonA || !jsonB) {
        setNodes(nds => nds.map(x => x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: 'Upstream features not ready' } }
          : x));
        return;
      }

      await markStartThenRunning(nodeId, `Running ${kind.toUpperCase()}`);
      try {
        let resp: any;
        if (kind === 'bfmatcher') {
          const p = (node.data?.payload?.params) || {};
          resp = await runBfmatcher(jsonA, jsonB, p);
        } else {
          const p = (node.data?.payload?.params) || {};
          let indexMode: 'AUTO' | 'KD_TREE' | 'LSH' | undefined = undefined;
          let kdTrees: number | undefined = undefined;
          let lshTableNumber: number | undefined = undefined;
          let lshKeySize: number | undefined = undefined;
          let lshMultiProbeLevel: number | undefined = undefined;

          if (p.index_params === 'AUTO' || p.index_params == null) {
            indexMode = 'AUTO';
          } else {
            const algo = String(p.index_params.algorithm).toUpperCase();
            if (algo.includes('KD')) {
              indexMode = 'KD_TREE';
              kdTrees = typeof p.index_params.trees === 'number' ? p.index_params.trees : undefined;
            } else if (algo === 'LSH') {
              indexMode = 'LSH';
              lshTableNumber = typeof p.index_params.table_number === 'number' ? p.index_params.table_number : undefined;
              lshKeySize = typeof p.index_params.key_size === 'number' ? p.index_params.key_size : undefined;
              lshMultiProbeLevel = typeof p.index_params.multi_probe_level === 'number' ? p.index_params.multi_probe_level : undefined;
            }
          }
          let searchChecks: number | undefined = undefined;
          if (p.search_params && p.search_params !== 'AUTO') {
            if (typeof p.search_params.checks === 'number') {
              searchChecks = p.search_params.checks;
            }
          }
          resp = await runFlannmatcher(jsonA, jsonB, {
            loweRatio: typeof p.lowe_ratio === 'number' ? p.lowe_ratio : undefined,
            ransacThresh: typeof p.ransac_thresh === 'number' ? p.ransac_thresh : undefined,
            drawMode: p.draw_mode,
            maxDraw: typeof p.max_draw === 'number' ? p.max_draw : undefined,
            indexMode,
            kdTrees,
            searchChecks,
            lshTableNumber,
            lshKeySize,
            lshMultiProbeLevel,
          });
        }

        setNodes(nds => nds.map(x => x.id === nodeId
          ? {
            ...x,
            data: {
              ...x.data,
              status: 'success',
              description: resp?.matching_statistics?.summary || `${kind} done`,
              payload: {
                ...(x.data?.payload || {}),
                vis_url: abs(resp.vis_url),
                json: resp,
              },
            },
          }
          : x));
      } catch (err: any) {
        setNodes(nds => nds.map(x => x.id === nodeId
          ? { ...x, data: { ...x.data, status: 'fault', description: err?.message || 'Error' } }
          : x));
      }
    };

    // switch ตามชนิดโหนด
    switch (node.type) {
      case 'sift': return featureRunner('sift', runSift, 'SIFT');
      case 'surf': return featureRunner('surf', runSurf, 'SURF');
      case 'orb': return featureRunner('orb', runOrb, 'ORB');
      case 'brisque': {
        const imagePath = getUpstreamImagePath(nodeId);
        if (!imagePath) {
          setNodes(nds => nds.map(x => x.id === nodeId
            ? { ...x, data: { ...x.data, status: 'fault', description: 'No upstream image' } }
            : x));
          return;
        }
        await markStartThenRunning(nodeId, 'Running BRISQUE');
        try {
          const resp = await runBrisque(imagePath);
          setNodes(nds => nds.map(x => x.id === nodeId
            ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: `BRISQUE score = ${Number(resp.score).toFixed(2)}`,
                payload: { ...(x.data?.payload || {}), quality_score: resp.score },
              }
            }
            : x));
        } catch (err: any) {
          setNodes(nds => nds.map(x => x.id === nodeId
            ? { ...x, data: { ...x.data, status: 'fault', description: err?.message || 'Error' } }
            : x));
        }
        return;
      }
      case 'psnr': return runPairMetric('psnr', runPsnr);
      case 'ssim': return runPairMetric('ssim', runSsim);
      case 'bfmatcher': return runMatcher('bfmatcher');
      case 'flannmatcher': return runMatcher('flannmatcher');
      default:
        return;
    }
  }, [setNodes]);

  // ตัว handler ที่คง identity (จะถูกยัดเข้าไปใน data.onRunNode ของทุกโหนด)
  const runNodeByIdRef = useRef<((id: string) => void) | null>(null);

  runNodeByIdRef.current = (id: string) => { void runNodeById(id); };

  const onRunNodeHandler = useMemo(
    () => (id: string) => runNodeByIdRef.current?.(id),
    []
  );

  // แนบ onRunNode ให้ทุกโหนด (ถ้าโหนดไหนยังไม่มี) — ทำครั้งแรกหรือเมื่อมีโหนดใหม่
  useEffect(() => {
    const missing = nodes.some(n => typeof (n.data as any)?.onRunNode !== 'function');
    if (!missing) return;
    setNodes(nds =>
      nds.map(n =>
        typeof (n.data as any)?.onRunNode === 'function'
          ? n
          : { ...n, data: { ...n.data, onRunNode: onRunNodeHandler } }
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, setNodes, onRunNodeHandler]);

  // ---------- Pipeline runner (รันทั้งหมดเหมือนเดิม) ----------
  useEffect(() => {
    if (!isRunning) return;

    async function runPipeline() {
      try {
        const getUpstreamImagePath = (nodeId: string): string | null => {
          const incoming = edges.filter((e) => e.target === nodeId);
          for (const e of incoming) {
            const prev = nodes.find((n) => n.id === e.source);
            if (prev?.type === 'image-input' && prev.data?.payload?.path) {
              return String(prev.data.payload.path);
            }
          }
          return null;
        };

        // แทนที่ฟังก์ชันเดิมทั้งก้อนด้วยอันนี้
        const runFeatureFor = async (
          type: 'sift' | 'surf' | 'orb',
          runner: (imagePath: string, params?: any) => Promise<any>,
          prefix: 'SIFT' | 'SURF' | 'ORB'
        ) => {
          const results: { nodeId: string; json_path: string }[] = [];

          // 👉 ใช้พารามิเตอร์ `type` ในการกรองโหนดจริง ๆ
          const featureNodes = nodes.filter((n) => n.type === type);

          for (const n of featureNodes) {
            guard();

            const imagePath = getUpstreamImagePath(n.id);
            if (!imagePath) continue;

            const params = n.data?.payload?.params || {};
            await markStartThenRunning(n.id, `Running ${prefix}`);

            try {
              const resp = await runner(imagePath, params);
              guard();

              const meta = await extractFeatureMeta(resp, prefix);
              results.push({ nodeId: n.id, json_path: resp.json_path });

              setNodes((nds) =>
                nds.map((x) =>
                  x.id === n.id
                    ? {
                      ...x,
                      data: {
                        ...x.data,
                        status: 'success',
                        description: `${prefix} done`,
                        payload: {
                          params,
                          json_url: resp.json_url,
                          json_path: resp.json_path,
                          result_image_url: makeAbs(resp.vis_url),
                          vis_url: makeAbs(resp.vis_url),
                          num_keypoints: meta.num_keypoints,
                          image_shape: meta.image_shape,
                          image_dtype: meta.image_dtype,
                          file_name: meta.file_name,
                        },
                      },
                    }
                    : x
                )
              );
            } catch (err: any) {
              if (err?.message === 'Pipeline canceled') throw err;
              setNodes((nds) =>
                nds.map((x) =>
                  x.id === n.id
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

          return results;
        };

        // 1) Features
        const siftResults = await runFeatureFor('sift', runSift, 'SIFT'); guard();
        const surfResults = await runFeatureFor('surf', runSurf, 'SURF'); guard();
        const orbResults = await runFeatureFor('orb', runOrb, 'ORB'); guard();

        // 2) BRISQUE
        for (const n of nodes.filter((n) => n.type === 'brisque')) {
          guard();
          const imagePath = getUpstreamImagePath(n.id);
          if (!imagePath) continue;

          await markStartThenRunning(n.id, 'Running BRISQUE');

          try {
            const resp = await runBrisque(imagePath);
            guard();

            setNodes((nds) =>
              nds.map((x) =>
                nds.some(() => false) ? x :
                  x.id === n.id
                    ? {
                      ...x,
                      data: {
                        ...x.data,
                        status: 'success',
                        description: `BRISQUE score = ${Number(resp.score).toFixed(2)}`,
                        payload: { ...(x.data?.payload || {}), quality_score: resp.score },
                      },
                    }
                    : x
              )
            );
          } catch (err: any) {
            if (err?.message === 'Pipeline canceled') throw err;
            setNodes((nds) =>
              nds.map((x) =>
                x.id === n.id
                  ? { ...x, data: { ...x.data, status: 'fault', description: err?.message || 'Error' } }
                  : x
              )
            );
          }
        }
        guard();

        // 3) PSNR & SSIM
        const runPairMetric = async (type: 'psnr' | 'ssim', runner: any) => {
          for (const n of nodes.filter((n) => n.type === type)) {
            guard();

            const incoming = edges.filter((e) => e.target === n.id);
            const edge1 = incoming.find((e) => e.targetHandle === 'input1');
            const edge2 = incoming.find((e) => e.targetHandle === 'input2');
            if (!edge1 || !edge2) continue;

            const nodeA = nodes.find((x) => x.id === edge1.source);
            const nodeB = nodes.find((x) => x.id === edge2.source);

            const urlA = getNodeImageUrl(nodeA);
            const urlB = getNodeImageUrl(nodeB);
            if (!urlA || !urlB) {
              setNodes(nds =>
                nds.map(x => x.id === n.id
                  ? { ...x, data: { ...x.data, status: 'fault', description: 'No input images' } }
                  : x
                )
              );
              continue;
            }

            await markStartThenRunning(n.id, `Running ${type.toUpperCase()}`);

            try {
              const fileA = await fetchFileFromUrl(urlA, 'a.jpg'); guard();
              const fileB = await fetchFileFromUrl(urlB, 'b.jpg'); guard();

              const resp = await runner(fileA, fileB);
              guard();

              const isOK = (resp?.score != null) || (resp?.quality_score != null);
              setNodes((nds) =>
                nds.map((x) =>
                  x.id === n.id
                    ? {
                      ...x,
                      data: {
                        ...x.data,
                        status: isOK ? 'success' : 'fault',
                        description: resp?.score != null
                          ? `SSIM = ${Number(resp.score).toFixed(4)}`
                          : resp?.quality_score != null
                            ? `PSNR = ${resp.quality_score} dB`
                            : `Error`,
                        payload: { ...(x.data?.payload || {}), json: resp },
                      },
                    }
                    : x
                )
              );
            } catch (err: any) {
              setNodes((nds) =>
                nds.map((x) =>
                  x.id === n.id
                    ? { ...x, data: { ...x.data, status: 'fault', description: err?.message || 'Failed to fetch' } }
                    : x
                )
              );
            }
          }
        };

        await runPairMetric('psnr', runPsnr); guard();
        await runPairMetric('ssim', runSsim); guard();

        // 4) Matchers (BF / FLANN)
        const runMatcher = async (type: 'bfmatcher' | 'flannmatcher') => {
          for (const n of nodes.filter((n) => n.type === type)) {
            guard();

            const incoming = edges.filter((e) => e.target === n.id);
            const e1 = incoming.find((e) => e.targetHandle === 'file1');
            const e2 = incoming.find((e) => e.targetHandle === 'file2');
            if (!e1 || !e2) continue;

            const featureResults = (srcId: string) =>
              [...siftResults, ...surfResults, ...orbResults].find(r => r.nodeId === srcId);

            const nodeA = featureResults(e1.source);
            const nodeB = featureResults(e2.source);
            if (!nodeA || !nodeB) continue;

            await markStartThenRunning(n.id, `Running ${type.toUpperCase()}`);

            try {
              let resp: any;

              if (type === 'bfmatcher') {
                const params = (n.data?.payload?.params) || {};
                resp = await runBfmatcher(nodeA.json_path, nodeB.json_path, params);
              } else {
                const p = (n.data?.payload?.params) || {};

                let indexMode: 'AUTO' | 'KD_TREE' | 'LSH' | undefined = undefined;
                let kdTrees: number | undefined = undefined;
                let lshTableNumber: number | undefined = undefined;
                let lshKeySize: number | undefined = undefined;
                let lshMultiProbeLevel: number | undefined = undefined;

                if (p.index_params === 'AUTO' || p.index_params == null) {
                  indexMode = 'AUTO';
                } else {
                  const algo = String(p.index_params.algorithm).toUpperCase();
                  if (algo.includes('KD')) {
                    indexMode = 'KD_TREE';
                    kdTrees = typeof p.index_params.trees === 'number' ? p.index_params.trees : undefined;
                  } else if (algo === 'LSH') {
                    indexMode = 'LSH';
                    lshTableNumber = typeof p.index_params.table_number === 'number' ? p.index_params.table_number : undefined;
                    lshKeySize = typeof p.index_params.key_size === 'number' ? p.index_params.key_size : undefined;
                    lshMultiProbeLevel = typeof p.index_params.multi_probe_level === 'number' ? p.index_params.multi_probe_level : undefined;
                  }
                }

                let searchChecks: number | undefined = undefined;
                if (p.search_params && p.search_params !== 'AUTO') {
                  if (typeof p.search_params.checks === 'number') {
                    searchChecks = p.search_params.checks;
                  }
                }

                resp = await runFlannmatcher(nodeA.json_path, nodeB.json_path, {
                  loweRatio: typeof p.lowe_ratio === 'number' ? p.lowe_ratio : undefined,
                  ransacThresh: typeof p.ransac_thresh === 'number' ? p.ransac_thresh : undefined,
                  drawMode: p.draw_mode,
                  maxDraw: typeof p.max_draw === 'number' ? p.max_draw : undefined,
                  indexMode,
                  kdTrees,
                  searchChecks,
                  lshTableNumber,
                  lshKeySize,
                  lshMultiProbeLevel,
                });
              }

              guard();

              setNodes((nds) =>
                nds.map((x) =>
                  x.id === n.id
                    ? {
                      ...x,
                      data: {
                        ...x.data,
                        status: 'success',
                        description: resp?.matching_statistics?.summary || `${type} done`,
                        payload: {
                          ...(x.data?.payload || {}),
                          vis_url: abs(resp.vis_url),
                          json: resp,
                        },
                      },
                    }
                    : x
                )
              );
            } catch (err: any) {
              setNodes((nds) =>
                nds.map((x) =>
                  x.id === n.id
                    ? { ...x, data: { ...x.data, status: 'fault', description: err?.message || 'Error' } }
                    : x
                )
              );
            }
          }
        };

        await runMatcher('bfmatcher'); guard();
        await runMatcher('flannmatcher'); guard();

        onPipelineDone?.();
      } catch {
        onPipelineDone?.();
      }
    }

    runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDrop={onDrop}
      onDragOver={onDragOver}
      fitView={false}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.SmoothStep}
      connectOnClick={false}
      isValidConnection={() => true}
      deleteKeyCode={['Backspace', 'Delete']}
      minZoom={0.01}
      maxZoom={Infinity}
    >
      <MiniMap />
      <Controls />
      <Background />
    </ReactFlow>
  );
};

export default FlowCanvas;