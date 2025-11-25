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

  // ---------- Load initial from localStorage ----------
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

  // ---------- Hotkeys ----------
  useFlowHotkeys({
    getPastePosition: () => null, // หรือจะผูก lastMousePosRef ก็ได้ถ้าใช้อยู่
    runNodeById,
    undo,
    redo,
  });

  // ---------- เติม onRunNode ให้โหนดที่โหลดจาก localStorage / ไฟล์ ----------
  useEffect(() => {
  setNodes((nds) => {
    let changed = false;

    const updated = nds.map((n) => {
      if (typeof n.data?.onRunNode === 'function') {
        return n; // มี onRunNode แล้ว ไม่ต้องแตะ
      }

      changed = true;
      return {
        ...n,
        data: {
          ...(n.data || {}),
          onRunNode: (id: string) => runNodeById(id),
        },
      };
    });

    // ถ้าไม่มี node ไหนต้องแก้เลย → คืนของเดิม จะได้ไม่ trigger render/loop
    return changed ? updated : nds;
  });
}, [nodes, runNodeById, setNodes]);

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
    <div className="relative flex-1">
      {/* ปุ่ม Save / Load แบบ hover สวย ๆ มุมขวาบน */}
      <div className="absolute z-10 top-2 right-2 flex gap-2">
        <button
          onClick={saveWorkflow}
          className="px-3 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs border border-slate-600 shadow-sm"
          title="Save workflow เป็นไฟล์ .json"
        >
          💾 SAVE WORKFLOW
        
        </button>
        <button
          onClick={triggerLoadWorkflow}
          className="px-3 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs border border-slate-600 shadow-sm"
          title="Load workflow จากไฟล์ .json"
        >
          📂 LOAD WORKFLOW
        </button>

        {/* input file ซ่อน */}
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
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        minZoom={0.01}
        maxZoom={Infinity}
        // ใช้ event จริงของ ReactFlow เป็น drag-gesture flag
        onNodeDragStart={() => {
          isDraggingRef.current = true;
        }}
        onNodeDragStop={() => {
          isDraggingRef.current = false;
        }}
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}