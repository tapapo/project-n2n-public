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
  const wasDraggingRef = useRef(false);

  // ✅ helper: สร้าง snapshot แต่บังคับ status เป็น 'idle' เพื่อไม่ให้ history จำไฟ
  const makeSnapshot = useCallback((): GraphSnapshot => {
    return {
      nodes: nodesRef.current.map((n) => ({
        ...n,
        data: {
          ...(n.data || {}),
          status: 'idle',
        },
      })),
      edges: edgesRef.current.map((e) => ({ ...e })),
    };
  }, []);

  const pushSnapshot = useCallback((snap: GraphSnapshot) => {
    const hist = historyRef.current;
    const idx = historyIndexRef.current;

    const trimmed = hist.slice(0, idx + 1);
    trimmed.push(cloneSnapshot(snap));

    historyRef.current = trimmed;
    historyIndexRef.current = trimmed.length - 1;
  }, []);

  // ✅ applySnapshot: ย้อนโครงสร้าง แต่ "พยายามเก็บ status ปัจจุบันของ node ไว้"
  const applySnapshot = useCallback(
    (snap: GraphSnapshot) => {
      isApplyingHistoryRef.current = true;

      setNodes((currentNodes) => {
        const currentMap = new Map<string, RFNode<CustomNodeData>>(
          currentNodes.map((n) => [n.id, n])
        );

        const mergedNodes: RFNode<CustomNodeData>[] = snap.nodes.map((snapNode) => {
          const current = currentMap.get(snapNode.id);

          const snapData = (snapNode.data || {}) as CustomNodeData;

          if (!current) {
            // node ถูก restore กลับมา → ให้ไฟ default เป็น idle
            return {
              ...snapNode,
              data: {
                ...snapData,
                status: 'idle',
              },
            };
          }

          const currData = (current.data || {}) as CustomNodeData;

          return {
            ...snapNode,
            data: {
              ...snapData,
              // ใช้ status ปัจจุบันของ node ตัวนี้ (ไม่ให้ undo ไปยุ่งไฟ)
              status: currData.status,
            },
          };
        });

        return mergedNodes;
      });

      setEdges(snap.edges);

      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    },
    [setNodes, setEdges]
  );

  // ฟังทุกครั้งที่ nodes/edges เปลี่ยน แล้วบันทึกเป็น history snapshot
  // แต่ถ้าเป็น drag ให้ทั้ง gesture = 1 snapshot
  useEffect(() => {
    if (isApplyingHistoryRef.current) {
      // ถ้าเป็นการ set จาก undo/redo เอง -> ไม่ต้องสร้าง snapshot ใหม่
      return;
    }

    const anyDragging = nodes.some((n) => (n as any).dragging);

    if (!historyInitializedRef.current) {
      // initial snapshot ครั้งแรก
      const snap = makeSnapshot();
      historyRef.current = [snap];
      historyIndexRef.current = 0;
      historyInitializedRef.current = true;
      wasDraggingRef.current = anyDragging;
      return;
    }

    if (anyDragging) {
      // กำลังลากอยู่ → ยังไม่ push, รอจนลากเสร็จ
      wasDraggingRef.current = true;
      return;
    }

    // ไม่มี node ไหน dragging แล้ว → เกิด action ใหม่
    const snap = makeSnapshot();

    if (wasDraggingRef.current) {
      // เพิ่งจบ drag → push snapshot 1 ครั้งสำหรับทั้ง drag
      pushSnapshot(snap);
      wasDraggingRef.current = false;
    } else {
      // การเปลี่ยนอื่น ๆ (copy/paste/delete/add edge/ฯลฯ)
      pushSnapshot(snap);
    }
  }, [nodes, edges, makeSnapshot, pushSnapshot]);

  const undo = useCallback(() => {
    if (!historyInitializedRef.current) return;

    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx <= 0) return;

    const targetIdx = idx - 1;
    const snap = hist[targetIdx];
    historyIndexRef.current = targetIdx;

    applySnapshot(snap);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (!historyInitializedRef.current) return;

    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx >= hist.length - 1) return;

    const targetIdx = idx + 1;
    const snap = hist[targetIdx];
    historyIndexRef.current = targetIdx;

    applySnapshot(snap);
  }, [applySnapshot]);

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