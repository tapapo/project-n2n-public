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
// ... (Imports เหมือนเดิม) ...
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
import { useFlowHistory } from './hooks/useFlowHistory';
import { useWorkflowFile } from './hooks/useWorkflowFile';

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

export default function FlowCanvas({ isRunning, onPipelineDone }: FlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  // ---------- Track mouse position for paste ----------
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      lastMousePosRef.current = pos;
    },
    [screenToFlowPosition]
  );

  // ---------- Load initial from localStorage (Safer) ----------
  const initialNodes = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_NODES);
      const parsed = raw ? JSON.parse(raw) : [];
      // ✅ เช็คว่าเป็น Array จริงๆ เพื่อกัน Crash
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to parse nodes from localStorage', e);
      return [];
    }
  }, []);

  const initialEdges = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_EDGES);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to parse edges from localStorage', e);
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
    // ใส่ try-catch เผื่อ Storage เต็ม (Quota Exceeded)
    try {
      localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(nodes));
      localStorage.setItem(STORAGE_KEY_EDGES, JSON.stringify(edges));
    } catch (error) {
      console.warn('LocalStorage Save Failed:', error);
    }
  }, [nodes, edges]);

  // ---------- Drag flag สำหรับ history ----------
  const isDraggingRef = useRef(false);

  // ---------- History Hook ----------
  const { undo, redo, isApplyingHistoryRef } = useFlowHistory({
    nodes,
    edges,
    setNodes,
    setEdges,
    isDraggingRef,
  });

  // ---------- Workflow Save / Load (ไฟล์ JSON) ----------
  const {
    saveWorkflow,
    triggerLoadWorkflow,
    fileInputRef,
    handleFileChange,
  } = useWorkflowFile({
    nodes,
    edges,
    setNodes,
    setEdges,
    isApplyingHistoryRef,
  });

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
        case 'otsu':
          return runOtsu(node as any, setNodes as any, nodesRef.current as any, edgesRef.current as any);
        case 'snake':
          return runSnakeRunner(node as any, setNodes as any, nodesRef.current as any, edgesRef.current as any);
        default:
          console.warn(`⚠️ No runner found for node type: ${node.type}`);
      }
    },
    [setNodes]
  );

  // ---------- Hotkeys ----------
  useFlowHotkeys({
    getPastePosition: () => lastMousePosRef.current,
    runNodeById,
    undo,
    redo,
  });

  // ---------- เติม onRunNode ให้โหนดที่โหลดจาก localStorage / ไฟล์ ----------
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map((n) => {
        // เช็คทั้ง type function และ data มีอยู่จริง
        if (n.data && typeof n.data.onRunNode === 'function') return n;
        changed = true;
        return {
          ...n,
          data: {
            ...(n.data || {}),
            onRunNode: (id: string) => runNodeById(id),
          },
        };
      });
      return changed ? updated : nds;
    });
  }, [nodes, runNodeById, setNodes]);

  // ---------- Pipeline Runner (Run All) ----------
  useEffect(() => {
    if (!isRunning) return;
    const runAllNodes = async () => {
      // หมายเหตุ: การวน loop แบบนี้จะรันตามลำดับ Array (ลำดับการสร้าง)
      // ถ้า Node มี Dependency กัน อาจต้องพิจารณาใช้ Topological Sort ในอนาคต
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
    <div className="relative flex-1 h-full">
      {/* ปุ่ม Save / Load */}
      <div className="absolute z-10 top-2 right-2 flex gap-2">
        <button
          onClick={saveWorkflow}
          className="px-3 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs border border-slate-600 shadow-sm text-white"
        >
          💾 SAVE WORKFLOW
        </button>
        <button
          onClick={triggerLoadWorkflow}
          className="px-3 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs border border-slate-600 shadow-sm text-white"
        >
          📂 LOAD WORKFLOW
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onMouseMove={onMouseMove}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        minZoom={0.01}
        maxZoom={Infinity}
        onNodeDragStart={() => (isDraggingRef.current = true)}
        onNodeDragStop={() => (isDraggingRef.current = false)}
        // เพิ่ม deleteKeyCode เพื่อให้ลบด้วยปุ่ม Delete/Backspace ได้โดยตรง (ReactFlow จัดการให้)
        // หรือถ้าใช้ useFlowHotkeys จัดการแล้วก็ไม่ต้องใส่ก็ได้ แต่ใส่ไว้กันเหนียวได้ครับ
        deleteKeyCode={['Delete', 'Backspace']} 
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}