import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import SaveImageNode from './components/nodes/SaveImageNode';
import SaveJsonNode from './components/nodes/SaveJsonNode';

import type { CustomNodeData, LogEntry } from './types';

// ---------- Runners ----------
import { runFeature } from './lib/runners/features';
import { runQuality } from './lib/runners/quality';
import { runMatcher } from './lib/runners/matching';
import { runAlignment } from './lib/runners/alignment';
import { runOtsu, runSnakeRunner } from './lib/runners/classification';
import { runSaveImage, runSaveJson } from './lib/runners/saver';
import { markStartThenRunning } from './lib/runners/utils';

// ---------- Hooks / Utils ----------
import { useFlowHotkeys } from './hooks/useFlowHotkeys';
import { useFlowHistory } from './hooks/useFlowHistory';
import { useWorkflowFile } from './hooks/useWorkflowFile';
import { validateNodeInput } from './lib/validation';
import LogPanel from './components/LogPanel';

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
  'save-image': SaveImageNode,
  'save-json': SaveJsonNode,
};

const STORAGE_KEY_NODES = 'n2n_nodes';
const STORAGE_KEY_EDGES = 'n2n_edges';
const getId = () => `node_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

// ✅ Helper: ทำความสะอาดข้อความ Error
function cleanErrorMessage(rawMsg: string): string {
  if (!rawMsg) return 'Unknown Error';

  try {
    const jsonStartIndex = rawMsg.indexOf('{');
    if (jsonStartIndex !== -1) {
      const jsonPart = rawMsg.substring(jsonStartIndex);
      const parsed = JSON.parse(jsonPart);
      if (parsed.detail) return parsed.detail;
    }
  } catch (e) { }

  return rawMsg
    .replace(/^HTTP \d+ [a-zA-Z ]+ - /, '')
    .replace(/^Error: /, '')
    .trim();
}

export default function FlowCanvas({ isRunning, onPipelineDone }: FlowCanvasProps) {
  const { screenToFlowPosition, getNode } = useReactFlow();

  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      lastMousePosRef.current = pos;
    },
    [screenToFlowPosition]
  );

  const initialNodes = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_NODES);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);
  const initialEdges = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_EDGES);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', nodeId?: string) => {
    const newLog: LogEntry = {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      nodeId,
    };
    setLogs((prev) => [...prev, newLog]);
  }, []);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(nodes));
      localStorage.setItem(STORAGE_KEY_EDGES, JSON.stringify(edges));
    } catch (e) { }
  }, [nodes, edges]);

  const isDraggingRef = useRef(false);
  const { undo, redo, isApplyingHistoryRef } = useFlowHistory({ nodes, edges, setNodes, setEdges, isDraggingRef });
  const { saveWorkflow, triggerLoadWorkflow, fileInputRef, handleFileChange } = useWorkflowFile({
    nodes,
    edges,
    setNodes,
    setEdges,
    isApplyingHistoryRef,
  });

  const setIncomingEdgesStatus = useCallback(
    (nodeId: string, status: 'default' | 'error') => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.target === nodeId) {
            if (status === 'error') {
              return {
                ...e,
                animated: true,
                style: { ...e.style, stroke: '#ef4444', strokeWidth: 3 },
              };
            } else {
              return {
                ...e,
                animated: false,
                style: { ...e.style, stroke: '#64748b', strokeWidth: 2 },
              };
            }
          }
          return e;
        })
      );
    },
    [setEdges]
  );

  const runNodeById = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node?.type) return;

      const nodeName = node.data.label || node.type.toUpperCase();
      setIncomingEdgesStatus(nodeId, 'default');

      const check = validateNodeInput(nodeId, nodesRef.current, edgesRef.current);
      if (!check.isValid) {
        const cleanMsg = cleanErrorMessage(check.message || '');
        addLog(`[${nodeName}] ❌ Validation: ${cleanMsg}`, 'error', nodeId);
        setNodes((nds) =>
          nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' } } : n))
        );
        setIncomingEdgesStatus(nodeId, 'error');
        return;
      }

      addLog(`[${nodeName}] ⏳ Processing...`, 'info', nodeId);
      await markStartThenRunning(nodeId, node.type.toUpperCase(), setNodes);

      try {
        switch (node.type) {
          case 'sift': case 'surf': case 'orb':
            await runFeature(node, setNodes, nodesRef.current, edgesRef.current); break;
          case 'brisque': case 'psnr': case 'ssim':
            await runQuality(node, setNodes, nodesRef.current, edgesRef.current); break;
          case 'bfmatcher': case 'flannmatcher':
            await runMatcher(node, setNodes, nodesRef.current, edgesRef.current); break;
          case 'homography-align': case 'affine-align':
            await runAlignment(node, setNodes as any, nodesRef.current as any, edgesRef.current as any); break;
          case 'otsu':
            await runOtsu(node as any, setNodes as any, nodesRef.current as any, edgesRef.current as any); break;
          case 'snake':
            await runSnakeRunner(node as any, setNodes as any, nodesRef.current as any, edgesRef.current as any); break;
          case 'save-image':
            await runSaveImage(node as any, setNodes as any, nodesRef.current as any, edgesRef.current as any); break;
          case 'save-json':
            await runSaveJson(node as any, setNodes as any, nodesRef.current as any, edgesRef.current as any); break;
          default:
            console.warn(`Unknown type: ${node.type}`);
        }

        addLog(`[${nodeName}] ✅ Completed`, 'success', nodeId);
      } catch (err: any) {
        const cleanMsg = cleanErrorMessage(err.message || 'Unknown Error');
        addLog(`[${nodeName}] 💥 Error: ${cleanMsg}`, 'error', nodeId);
        setNodes((nds) =>
          nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' } } : n))
        );
        setIncomingEdgesStatus(nodeId, 'error');
      }
    },
    [setNodes, addLog, setIncomingEdgesStatus]
  );

  useFlowHotkeys({ getPastePosition: () => lastMousePosRef.current, runNodeById, undo, redo });

  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map((n) => {
        if (n.data && typeof n.data.onRunNode === 'function') return n;
        changed = true;
        return { ...n, data: { ...(n.data || {}), onRunNode: (id: string) => runNodeById(id) } };
      });
      return changed ? updated : nds;
    });
  }, [nodes, runNodeById, setNodes]);

  useEffect(() => {
    if (!isRunning) return;
    const runAllNodes = async () => {
      addLog('Starting Pipeline', 'info');
      for (const node of nodesRef.current) {
        if (!node?.id || !node?.type) continue;
        try { await runNodeById(node.id); } catch (e) { }
      }
      addLog('Pipeline Finished', 'success');
      onPipelineDone?.();
    };
    runAllNodes();
  }, [isRunning, onPipelineDone, runNodeById, addLog]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return false;
      const sourceNode = getNode(connection.source!);
      const targetNode = getNode(connection.target!);
      if (!sourceNode || !targetNode) return false;
      if (targetNode.type === 'image-input') return false;
      if (sourceNode.type?.startsWith('save-')) return false;
      return true;
    },
    [getNode]
  );

  const onConnect = useCallback((conn: Edge | Connection) => setEdges((eds) => addEdge(conn, eds)), [setEdges]);
  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') || event.dataTransfer.getData('text/plain');
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
      addLog(`Added ${type}`, 'info', id);
    },
    [screenToFlowPosition, setNodes, runNodeById, addLog]
  );

  const defaultEdgeOptions = useMemo(() => ({ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2, stroke: '#64748b' } }), []);

  return (
    <div className="relative flex-1 h-full flex flex-col">
      <div className="absolute z-10 top-2 right-2 flex gap-2">
        <button onClick={saveWorkflow} className="px-3 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs border border-slate-600 shadow-sm text-white">💾 SAVE WORKFLOW</button>
        <button onClick={triggerLoadWorkflow} className="px-3 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs border border-slate-600 shadow-sm text-white">📂 LOAD WORKFLOW</button>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="flex-1 relative">
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
          defaultEdgeOptions={defaultEdgeOptions as any}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          minZoom={0.08}
          maxZoom={5}
          onNodeDragStart={() => (isDraggingRef.current = true)}
          onNodeDragStop={() => (isDraggingRef.current = false)}
          deleteKeyCode={['Delete', 'Backspace']}
          isValidConnection={isValidConnection}
        >
          <MiniMap
            style={{
              position: 'absolute',
              bottom: 0,   
              left: 50,     
              width: 200,
              height: 140,
              borderRadius: 8,
              background: 'rgba(15,23,42,0.9)', 
              border: '1px solid #475569',
            }}
            maskColor="rgba(0,0,0,0.6)"
            nodeColor={(n) =>
              n.data?.status === 'fault'
                ? '#ef4444'
                : n.data?.status === 'success'
                  ? '#22c55e'
                  : '#94a3b8'
            }
          />
          <Controls />
          <Background />
        </ReactFlow>
      </div>

      <LogPanel logs={logs} onClear={() => setLogs([])} />
    </div>
  );
}