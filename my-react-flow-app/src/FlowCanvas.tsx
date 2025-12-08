// src/FlowCanvas.tsx
import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  useReactFlow,
  type Node as RFNode,
  type Edge,
  type Connection,
  BackgroundVariant,
  type Viewport
} from 'reactflow';
import 'reactflow/dist/style.css';

// ✅ Import Config
import { nodeTypes, defaultEdgeOptions } from './lib/flowConfig';

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

// Interface สำหรับให้ App เรียกใช้
export interface FlowCanvasHandle {
  getSnapshot: () => { nodes: RFNode[]; edges: Edge[]; viewport: Viewport };
  restoreSnapshot: (nodes: RFNode[], edges: Edge[], viewport: Viewport) => void;
  fitView: () => void;
}

interface FlowCanvasProps {
  isRunning: boolean;
  onPipelineDone: () => void;
  // Callback เพื่อส่งข้อมูลกลับไปบันทึกที่ App
  onFlowChange?: (changes: { nodes: RFNode[]; edges: Edge[]; viewport: Viewport }) => void;
  // ✅ รับชื่อ Tab ปัจจุบันมาจาก App (เพื่อเอาไปตั้งชื่อไฟล์ตอน Save)
  currentTabName: string; 
}

const getId = () => `node_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

// Helper: ทำความสะอาดข้อความ Error
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
  return rawMsg.replace(/^HTTP \d+ [a-zA-Z ]+ - /, '').replace(/^Error: /, '').trim();
}

const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(
  ({ isRunning, onPipelineDone, onFlowChange, currentTabName }, ref) => {
  
  const { screenToFlowPosition, fitView, getViewport, setViewport, getNode } = useReactFlow(); 

  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      lastMousePosRef.current = pos;
    },
    [screenToFlowPosition]
  );

  // เริ่มต้นด้วยว่างเปล่า (รอ App ส่งข้อมูลมาให้)
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const isDraggingRef = useRef(false);
  const isCanceledRef = useRef(false);

  // ✅ Auto-save trigger
  useEffect(() => {
    if (!onFlowChange) return;
    const timer = setTimeout(() => {
      onFlowChange({ nodes, edges, viewport: getViewport() });
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, edges, onFlowChange, getViewport]);

  // ✅ API สำหรับให้ App เรียกใช้
  useImperativeHandle(ref, () => ({
    getSnapshot: () => ({
      nodes: nodes,
      edges: edges,
      viewport: getViewport(),
    }),
    restoreSnapshot: (newNodes, newEdges, newViewport) => {
      if (isApplyingHistoryRef.current) (isApplyingHistoryRef.current as boolean) = true;
      
      const nodesWithFunc = newNodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          onRunNode: (id: string) => runNodeById(id)
        }
      }));

      setNodes(nodesWithFunc);
      setEdges(newEdges);
      
      setTimeout(() => {
         setViewport(newViewport);
         if (isApplyingHistoryRef.current) (isApplyingHistoryRef.current as boolean) = false;
      }, 50);
    },
    fitView: () => {
        window.requestAnimationFrame(() => {
            fitView({ padding: 0.2, duration: 800 });
        });
    }
  }));

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

  const { undo, redo, isApplyingHistoryRef } = useFlowHistory({ nodes, edges, setNodes, setEdges, isDraggingRef });
  
  // ✅ ส่งชื่อ flowName ไปให้ Hook ใช้งาน
  const { saveWorkflow, triggerLoadWorkflow, fileInputRef, handleFileChange } = useWorkflowFile({
    nodes,
    edges,
    setNodes,
    setEdges,
    isApplyingHistoryRef,
    flowName: currentTabName // <--- ส่งต่อตรงนี้ครับ
  });

  const setIncomingEdgesStatus = useCallback(
    (nodeId: string, status: 'default' | 'error') => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.target === nodeId) {
            if (status === 'error') {
              return { ...e, animated: true, style: { ...e.style, stroke: '#ef4444', strokeWidth: 3 } };
            } else {
              return { ...e, animated: false, style: { ...e.style, stroke: '#64748b', strokeWidth: 2 } };
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
      if (!node || !node.type) {
         console.warn(`Attempted to run unknown node ID: ${nodeId}`);
         return;
      }

      const nodeName = node.data.label || node.type.toUpperCase();
      setIncomingEdgesStatus(nodeId, 'default');

      const check = validateNodeInput(nodeId, nodesRef.current, edgesRef.current);
      if (!check.isValid) {
        const cleanMsg = cleanErrorMessage(check.message || '');
        addLog(`[${nodeName}] ❌ Validation: ${cleanMsg}`, 'error', nodeId);
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' } } : n)));
        setIncomingEdgesStatus(nodeId, 'error');
        return;
      }

      addLog(`[${nodeName}] ⏳ Processing...`, 'info', nodeId);
      await markStartThenRunning(nodeId, node.type.toUpperCase(), setNodes);

      try {
        switch (node.type) {
          case 'image-input': break; 
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
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' } } : n)));
        setIncomingEdgesStatus(nodeId, 'error');
        throw err;
      }
    },
    [setNodes, addLog, setIncomingEdgesStatus]
  );

  useFlowHotkeys({ getPastePosition: () => lastMousePosRef.current, runNodeById, undo, redo });

  // Update onRunNode callback when nodes change
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

  // Run Pipeline Logic
  useEffect(() => {
    if (!isRunning) {
        isCanceledRef.current = true;
        return;
    }
    isCanceledRef.current = false;
    
    const runAllNodes = async () => {
      addLog('Starting Pipeline', 'info');
      const executionPriority = {
          'image-input': 1, 'brisque': 10, 'psnr': 10, 'ssim': 10, 'sift': 20, 'surf': 20, 'orb': 20, 
          'otsu': 30, 'snake': 30, 'bfmatcher': 40, 'flannmatcher': 40, 'homography-align': 50, 
          'affine-align': 50, 'save-image': 99, 'save-json': 99, 
      };
      
      const sortedNodes = nodesRef.current.slice().sort((a, b) => {
            const priorityA = executionPriority[a.type as keyof typeof executionPriority] || 100;
            const priorityB = executionPriority[b.type as keyof typeof executionPriority] || 100;
            return priorityA - priorityB;
        });

      for (const node of sortedNodes) {
        if (isCanceledRef.current) {
            addLog('Pipeline stopped by user.', 'warning');
            break; 
        }
        if (!node?.id || !node?.type) continue;
        try { await runNodeById(node.id); } catch (e) { console.warn(`Node ${node.id} failed, skipping.`); continue; }
      }
      if (!isCanceledRef.current) addLog('Pipeline Finished', 'success');
      onPipelineDone?.();
    };
    runAllNodes();
  }, [isRunning, onPipelineDone, runNodeById, addLog]);

  const isValidConnection = useCallback((connection: Connection) => {
      if (connection.source === connection.target) return false;
      const sourceNode = getNode(connection.source!);
      const targetNode = getNode(connection.target!);
      if (!sourceNode || !targetNode) return false;
      if (targetNode.type === 'image-input') return false;
      if (sourceNode.type?.startsWith('save-')) return false;
      return true;
    }, [getNode]);

  const onConnect = useCallback((conn: Edge | Connection) => setEdges((eds) => addEdge(conn, eds)), [setEdges]);
  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback((event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') || event.dataTransfer.getData('text/plain');
      if (!type) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = getId();
      const newNode: RFNode<CustomNodeData> = {
        id, type, position,
        data: { label: type.toUpperCase(), status: 'idle', onRunNode: (id: string) => runNodeById(id) },
      };
      setNodes((nds) => nds.concat(newNode));
      addLog(`Added ${type}`, 'info', id);
    }, [screenToFlowPosition, setNodes, runNodeById, addLog]);

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
          defaultEdgeOptions={defaultEdgeOptions}
          
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
            style={{ position: 'absolute', bottom: 0, left: 50, width: 200, height: 140, borderRadius: 8, background: 'rgba(15,23,42,0.9)', border: '1px solid #475569' }}
            maskColor="rgba(0,0,0,0.6)"
            nodeColor={(n) => n.data?.status === 'fault' ? '#ef4444' : n.data?.status === 'success' ? '#22c55e' : '#94a3b8'}
          />
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#334155" />
        </ReactFlow>
      </div>
      <LogPanel logs={logs} onClear={() => setLogs([])} />
    </div>
  );
});

export default FlowCanvas;