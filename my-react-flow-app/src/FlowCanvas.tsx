// src/FlowCanvas.tsx
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  type NodeTypes,
  type Edge,
  type Connection,
  ConnectionLineType,
  useReactFlow,
  type Node as RFNode,
} from 'reactflow';
import 'reactflow/dist/style.css';

// ---------- Node Components ----------
import ImageInputNode from './components/nodes/ImageInputNode';
import SiftNode from './components/nodes/SiftNode';
import SurfNode from './components/nodes/SurfNode';
import OrbNode from './components/nodes/OrbNode';
import BrisqueNode from './components/nodes/BrisqueNode';
import PsnrNode from './components/nodes/PsnrNode';
import SsimNode from './components/nodes/SsimNode';
import BFMatcherNode from './components/nodes/BFMatcherNode';
import FLANNMatcherNode from './components/nodes/FLANNMatcherNode';
import HomographyAlignNode from './components/nodes/HomographyAlignNode';
import AffineAlignNode from './components/nodes/AffineAlignNode';
import OtsuNode from './components/nodes/OtsuNode';              // ✅ เพิ่ม Otsu node

import type { CustomNodeData } from './types';
import { runFeature } from './lib/runners/features';
import { runQuality } from './lib/runners/quality';
import { runMatcher } from './lib/runners/matching';
import { runAlignment } from './lib/runners/alignment';
import { runOtsu } from './lib/runners/classification';          // ✅ เพิ่ม runner Otsu
import { markStartThenRunning } from './lib/runners/utils';

// ---------- Props ----------
interface FlowCanvasProps {
  isRunning: boolean;
  onPipelineDone: () => void;
}

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
  'homography-align': HomographyAlignNode,
  'affine-align': AffineAlignNode,
  otsu: OtsuNode,                                            // ✅ ประกาศ type 'otsu'
};

// ---------- Constants ----------
const STORAGE_KEY_NODES = 'n2n_nodes';
const STORAGE_KEY_EDGES = 'n2n_edges';
const getId = () => `node_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

export default function FlowCanvas({ isRunning, onPipelineDone }: FlowCanvasProps) {
  // ---------- Load / Save State ----------
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

  // ---------- Keep current states in refs ----------
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ---------- Persist to localStorage ----------
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(nodes));
  }, [nodes]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EDGES, JSON.stringify(edges));
  }, [edges]);

  // ---------- React Flow helpers ----------
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (conn: Edge | Connection) => setEdges((eds) => addEdge(conn, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ✅ ใช้ screenToFlowPosition (ไม่ต้องลบ bounds เอง)
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type =
        event.dataTransfer.getData('application/reactflow') ||
        event.dataTransfer.getData('text/plain');

      if (!type) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = getId();

      const newNode: RFNode<CustomNodeData> = {
        id,
        type,
        position,
        data: {
          label: type.toUpperCase(),
          status: 'idle',
          onRunNode: (id: string) => runNodeById(id), // ✅ ใส่ตั้งแต่สร้าง
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  // ---------- Node Execution ----------
  const runNodeById = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node?.type) return;

      await markStartThenRunning(nodeId, node.type.toUpperCase(), setNodes);

      switch (node.type) {
        case 'sift':
        case 'surf':
        case 'orb':
          return runFeature(node, setNodes, nodesRef.current, edgesRef.current);

        case 'brisque':
        case 'psnr':
        case 'ssim':
          return runQuality(node, setNodes, nodesRef.current, edgesRef.current);

        case 'bfmatcher':
        case 'flannmatcher':
          return runMatcher(node, setNodes, nodesRef.current, edgesRef.current);

        case 'homography-align':
        case 'affine-align':
          return runAlignment(node, setNodes as any, nodesRef.current as any, edgesRef.current as any);

        case 'otsu':                                          // ✅ เพิ่ม case Otsu
          return runOtsu(node as any, setNodes as any, nodesRef.current as any, edgesRef.current as any);

        default:
          console.warn(`⚠️ No runner found for node type: ${node.type}`);
      }
    },
    [setNodes]
  );

  // ✅ เติม onRunNode ให้โหนดที่โหลดจาก localStorage (ที่ยังไม่มี)
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        typeof n.data?.onRunNode === 'function'
          ? n
          : { ...n, data: { ...n.data, onRunNode: (id: string) => runNodeById(id) } }
      )
    );
  }, [runNodeById, setNodes]);

  // ---------- Pipeline Runner (Run All) ----------
  useEffect(() => {
    if (!isRunning) return;

    const runAllNodes = async () => {
      for (const node of nodesRef.current) {
        if (!node?.id || !node?.type) continue;
        try {
          await runNodeById(node.id);
        } catch (err) {
          console.error(`❌ Error running node ${node.id}:`, err);
        }
      }
      onPipelineDone?.();
    };

    runAllNodes();
  }, [isRunning, onPipelineDone, runNodeById]);

  // ---------- Default Edge Options ----------
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep' as const,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2, stroke: '#64748b' },
    }),
    []
  );

  // ---------- Render ----------
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDrop={onDrop}
      onDragOver={onDragOver}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.SmoothStep}
      fitView
      minZoom={0.01}
      maxZoom={Infinity} // ✅ ไม่ลิมิตตามที่ต้องการ
    >
      <MiniMap />
      <Controls />
      <Background />
    </ReactFlow>
  );
}