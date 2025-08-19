import React, { useCallback, useEffect, useMemo } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';

import { 
  runSift, runSurf, runOrb, 
  runBrisque, runPsnr, runSsim, 
  runBfmatcher, runFlannmatcher, abs 
} from "./lib/api";

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
const nodeTypes = {
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
let id = 0;
const getId = () => `dndnode_${id++}`;

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
  bfmatcher: { inputs: [{ id: "file1" }, { id: "file2" }], outputs: [{ id: "json" }] },
  flannmatcher: { inputs: [{ id: "file1" }, { id: "file2" }], outputs: [{ id: "json" }] },
};

const STORAGE_KEY_NODES = 'n2n_nodes';
const STORAGE_KEY_EDGES = 'n2n_edges';

// ---------- Utility ----------
async function fetchFileFromUrl(url: string, filename: string): Promise<File> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

// ---------- Component ----------
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
          status: 'idle',
          inputs: ports.inputs,
          outputs: ports.outputs,
          payload: type === 'image-input' ? {} : undefined,
        } as CustomNodeData,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      style: { strokeWidth: 2 },
    }),
    []
  );

  // ---------- Pipeline runner ----------
  useEffect(() => {
    if (!isRunning) return;

    async function runPipeline() {
      try {
        // helper หา image จาก upstream
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

        // === Features (SIFT / SURF / ORB) ===
        const runFeatureFor = async (
          type: 'sift' | 'surf' | 'orb',
          runner: any,
          prefix: string
        ) => {
          const results: { nodeId: string, json_path: string }[] = [];
          const featureNodes = nodes.filter((n) => n.type === type);
          for (const n of featureNodes) {
            const imagePath = getUpstreamImagePath(n.id);
            if (!imagePath) continue;

            setNodes((nds) => nds.map((x) =>
              x.id === n.id ? { ...x, data: { ...x.data, status: 'running', description: `Running ${prefix}` } } : x
            ));

            try {
              const resp = await runner(imagePath, {});
              results.push({ nodeId: n.id, json_path: resp.json_path });

              setNodes((nds) => nds.map((x) =>
                x.id === n.id ? {
                  ...x,
                  data: {
                    ...x.data,
                    status: 'success',
                    description: `${prefix} done`,
                    payload: {
                      ...(x.data?.payload || {}),
                      json_url: resp.json_url,
                      json_path: resp.json_path,
                      result_image_url: abs(resp.vis_url),
                    },
                  },
                } : x
              ));
            } catch (err: any) {
              setNodes((nds) => nds.map((x) =>
                x.id === n.id ? { ...x, data: { ...x.data, status: 'fault', description: err?.message } } : x
              ));
            }
          }
          return results;
        };

        const siftResults = await runFeatureFor('sift', runSift, 'SIFT');
        const surfResults = await runFeatureFor('surf', runSurf, 'SURF');
        const orbResults  = await runFeatureFor('orb', runOrb, 'ORB');

        // === BRISQUE ===
        for (const n of nodes.filter((n) => n.type === 'brisque')) {
          const imagePath = getUpstreamImagePath(n.id);
          if (!imagePath) continue;
          setNodes((nds) => nds.map((x) =>
            x.id === n.id ? { ...x, data: { ...x.data, status: 'running', description: 'Running BRISQUE' } } : x
          ));
          try {
            const resp = await runBrisque(imagePath);
            setNodes((nds) => nds.map((x) =>
              x.id === n.id ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'success',
                  description: `BRISQUE score = ${resp.score.toFixed(2)}`,
                  payload: { ...(x.data?.payload || {}), quality_score: resp.score },
                },
              } : x
            ));
          } catch (err: any) {
            setNodes((nds) => nds.map((x) =>
              x.id === n.id ? { ...x, data: { ...x.data, status: 'fault', description: err?.message } } : x
            ));
          }
        }

        // === PSNR & SSIM ===
        const runPairMetric = async (type: 'psnr' | 'ssim', runner: any) => {
          for (const n of nodes.filter((n) => n.type === type)) {
            const incoming = edges.filter((e) => e.target === n.id);
            const edge1 = incoming.find((e) => e.targetHandle === 'input1');
            const edge2 = incoming.find((e) => e.targetHandle === 'input2');
            if (!edge1 || !edge2) continue;
            const nodeA = nodes.find((x) => x.id === edge1.source);
            const nodeB = nodes.find((x) => x.id === edge2.source);
            if (!nodeA?.data?.payload?.result_image_url || !nodeB?.data?.payload?.result_image_url) continue;

            setNodes((nds) => nds.map((x) =>
              x.id === n.id ? { ...x, data: { ...x.data, status: 'running', description: `Running ${type.toUpperCase()}` } } : x
            ));
            try {
              const fileA = await fetchFileFromUrl(nodeA.data.payload.result_image_url, "a.jpg");
              const fileB = await fetchFileFromUrl(nodeB.data.payload.result_image_url, "b.jpg");
              const resp = await runner(fileA, fileB);

              setNodes((nds) => nds.map((x) =>
                x.id === n.id ? {
                  ...x,
                  data: {
                    ...x.data,
                    status: resp?.score || resp?.quality_score ? 'success' : 'fault',
                    description: resp?.score
                      ? `SSIM = ${resp.score.toFixed(4)}`
                      : resp?.quality_score
                        ? `PSNR = ${resp.quality_score} dB`
                        : `Error`,
                    payload: { ...(x.data?.payload || {}), json: resp },
                  },
                } : x
              ));
            } catch (err: any) {
              setNodes((nds) => nds.map((x) =>
                x.id === n.id ? { ...x, data: { ...x.data, status: 'fault', description: err?.message } } : x
              ));
            }
          }
        };

        await runPairMetric('psnr', runPsnr);
        await runPairMetric('ssim', runSsim);

        // === Matchers (BF / FLANN) ===
        const runMatcher = async (type: 'bfmatcher' | 'flannmatcher', runner: any) => {
          for (const n of nodes.filter((n) => n.type === type)) {
            const incoming = edges.filter((e) => e.target === n.id);
            const e1 = incoming.find((e) => e.targetHandle === "file1");
            const e2 = incoming.find((e) => e.targetHandle === "file2");
            if (!e1 || !e2) continue;
            const nodeA = [...siftResults, ...surfResults, ...orbResults].find(r => r.nodeId === e1.source);
            const nodeB = [...siftResults, ...surfResults, ...orbResults].find(r => r.nodeId === e2.source);
            if (!nodeA || !nodeB) continue;

            setNodes((nds) => nds.map((x) =>
              x.id === n.id ? { ...x, data: { ...x.data, status: "running", description: `Running ${type.toUpperCase()}` } } : x
            ));
            try {
              const resp = await runner(nodeA.json_path, nodeB.json_path);
              setNodes((nds) => nds.map((x) =>
                x.id === n.id ? {
                  ...x,
                  data: {
                    ...x.data,
                    status: "success",
                    description: resp?.matching_statistics?.summary || `${type} done`,
                    payload: { ...(x.data?.payload || {}), vis_url: abs(resp.vis_url), json: resp },
                  },
                } : x
              ));
            } catch (err: any) {
              setNodes((nds) => nds.map((x) =>
                x.id === n.id ? { ...x, data: { ...x.data, status: 'fault', description: err?.message } } : x
              ));
            }
          }
        };

        await runMatcher('bfmatcher', runBfmatcher);
        await runMatcher('flannmatcher', runFlannmatcher);

        onPipelineDone?.();
      } catch (err) {
        console.error("Pipeline error:", err);
      }
    }

    runPipeline();
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
      fitView
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
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