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
import OtsuNode from './components/nodes/OtsuNode';
import SnakeNode from './components/nodes/SnakeNode';

import type { CustomNodeData } from './types';
import { runFeature } from './lib/runners/features';
import { runQuality } from './lib/runners/quality';
import { runMatcher } from './lib/runners/matching';
import { runAlignment } from './lib/runners/alignment';
import { runOtsu, runSnakeRunner } from './lib/runners/classification';
import { markStartThenRunning } from './lib/runners/utils';
import { useFlowHotkeys } from './hooks/useFlowHotkeys';

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
  otsu: OtsuNode,
  snake: SnakeNode,
};

// ---------- Constants ----------
const STORAGE_KEY_NODES = 'n2n_nodes';
const STORAGE_KEY_EDGES = 'n2n_edges';
const getId = () => `node_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

// ---------- History Types ----------
type GraphSnapshot = {
  nodes: RFNode<CustomNodeData>[];
  edges: Edge[];
};

const cloneSnapshot = (snap: GraphSnapshot): GraphSnapshot => ({
  nodes: snap.nodes.map((n) => ({ ...n })),
  edges: snap.edges.map((e) => ({ ...e })),
});

// เปรียบเทียบ “โครงสร้างกราฟ” โดยไม่สน data/status/payload
const structurallyEqual = (a: GraphSnapshot, b: GraphSnapshot): boolean => {
  if (a.nodes.length !== b.nodes.length) return false;
  if (a.edges.length !== b.edges.length) return false;

  for (let i = 0; i < a.nodes.length; i += 1) {
    const an = a.nodes[i];
    const bn = b.nodes[i];
    if (
      an.id !== bn.id ||
      an.type !== bn.type ||
      an.position.x !== bn.position.x ||
      an.position.y !== bn.position.y ||
      (an.selected ?? false) !== (bn.selected ?? false)
    ) {
      return false;
    }
  }

  for (let i = 0; i < a.edges.length; i += 1) {
    const ae = a.edges[i];
    const be = b.edges[i];
    if (
      ae.id !== be.id ||
      ae.source !== be.source ||
      ae.target !== be.target ||
      (ae.sourceHandle ?? null) !== (be.sourceHandle ?? null) ||
      (ae.targetHandle ?? null) !== (be.targetHandle ?? null) ||
      (ae.type ?? null) !== (be.type ?? null) ||
      (ae.selected ?? false) !== (be.selected ?? false)
    ) {
      return false;
    }
  }

  return true;
};

export default function FlowCanvas({ isRunning, onPipelineDone }: FlowCanvasProps) {
  // React Flow helpers
  const { screenToFlowPosition } = useReactFlow();

  // ใช้จำ "ตำแหน่งเมาส์ล่าสุดบน canvas" สำหรับ paste
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

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
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // ---------- Persist to localStorage ----------
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(nodes));
  }, [nodes]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EDGES, JSON.stringify(edges));
  }, [edges]);

  // ---------- History Management ----------
  const historyRef = useRef<GraphSnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const historyInitializedRef = useRef(false);
  const isApplyingHistoryRef = useRef(false);
  const historyDebounceRef = useRef<number | null>(null);

  // ฟังทุกครั้งที่ nodes/edges เปลี่ยน แล้วบันทึกเป็น history snapshot (debounced)
  useEffect(() => {
    if (isApplyingHistoryRef.current) {
      // ถ้าเป็นการ set จาก undo/redo เอง -> ไม่ต้องสร้าง snapshot ใหม่
      return;
    }

    const currentSnap: GraphSnapshot = {
      nodes: nodesRef.current.map((n) => ({ ...n })),
      edges: edgesRef.current.map((e) => ({ ...e })),
    };

    if (!historyInitializedRef.current) {
      // initial snapshot ครั้งแรก
      historyRef.current = [cloneSnapshot(currentSnap)];
      historyIndexRef.current = 0;
      historyInitializedRef.current = true;
      return;
    }

    // debounce เพื่อรวม drag หลาย ๆ ครั้งให้เป็น 1 step
    if (historyDebounceRef.current !== null) {
      window.clearTimeout(historyDebounceRef.current);
    }

    historyDebounceRef.current = window.setTimeout(() => {
      const snap: GraphSnapshot = {
        nodes: nodesRef.current.map((n) => ({ ...n })),
        edges: edgesRef.current.map((e) => ({ ...e })),
      };

      const hist = historyRef.current;
      const idx = historyIndexRef.current;
      const lastSnap = hist[idx];

      // 🔑 ถ้าโครงสร้างเหมือนเดิม (เปลี่ยนแค่ data/status/payload) => ไม่ต้อง push history
      if (lastSnap && structurallyEqual(lastSnap, snap)) {
        historyDebounceRef.current = null;
        return;
      }

      const trimmed = hist.slice(0, idx + 1);
      trimmed.push(cloneSnapshot(snap));

      historyRef.current = trimmed;
      historyIndexRef.current = trimmed.length - 1;
      historyDebounceRef.current = null;
    }, 80);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (!historyInitializedRef.current) return;

    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx <= 0) return;

    if (historyDebounceRef.current !== null) {
      window.clearTimeout(historyDebounceRef.current);
      historyDebounceRef.current = null;
    }

    const targetIdx = idx - 1;
    const snap = hist[targetIdx];
    historyIndexRef.current = targetIdx;

    isApplyingHistoryRef.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (!historyInitializedRef.current) return;

    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx >= hist.length - 1) return;

    if (historyDebounceRef.current !== null) {
      window.clearTimeout(historyDebounceRef.current);
      historyDebounceRef.current = null;
    }

    const targetIdx = idx + 1;
    const snap = hist[targetIdx];
    historyIndexRef.current = targetIdx;

    isApplyingHistoryRef.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  }, [setNodes, setEdges]);

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
          return runAlignment(
            node,
            setNodes as any,
            nodesRef.current as any,
            edgesRef.current as any
          );

        case 'otsu':
          return runOtsu(
            node as any,
            setNodes as any,
            nodesRef.current as any,
            edgesRef.current as any
          );

        case 'snake':
          return runSnakeRunner(
            node as any,
            setNodes as any,
            nodesRef.current as any,
            edgesRef.current as any
          );

        default:
          console.warn(`⚠️ No runner found for node type: ${node.type}`);
      }
    },
    [setNodes]
  );

  // ---------- Hotkeys: undo / redo / copy / paste / delete ----------
  useFlowHotkeys({
    getPastePosition: () => lastMousePosRef.current,
    runNodeById,
    undo,
    redo,
  });

  // เติม onRunNode ให้โหนดที่โหลดจาก localStorage (ที่ตอนแรกยังไม่มี)
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        typeof n.data?.onRunNode === 'function'
          ? n
          : {
              ...n,
              data: { ...(n.data || {}), onRunNode: (id: string) => runNodeById(id) },
            }
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

  // ---------- Connect / Drag / Drop ----------
  const onConnect = useCallback(
    (conn: Edge | Connection) => setEdges((eds) => addEdge(conn, eds)),
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
      const id = getId();

      const newNode: RFNode<CustomNodeData> = {
        id,
        type,
        position,
        data: {
          label: type.toUpperCase(),
          status: 'idle',
          onRunNode: (id: string) => runNodeById(id),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes, runNodeById]
  );

  // ---------- Default Edge Options ----------
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep' as const,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2, stroke: '#64748b' },
    }),
    []
  );

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
      maxZoom={Infinity}
      onPaneMouseMove={(e) => {
        // เก็บตำแหน่งเมาส์ล่าสุดใน flow-space สำหรับใช้ตอน paste
        lastMousePosRef.current = screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
      }}
    >
      <MiniMap />
      <Controls />
      <Background />
    </ReactFlow>
  );
}