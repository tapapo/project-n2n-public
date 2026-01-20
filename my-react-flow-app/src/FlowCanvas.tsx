// File: src/FlowCanvas.tsx
import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ReactFlow, {
  MiniMap, Controls, Background, useNodesState, useEdgesState,
  addEdge, ConnectionLineType, useReactFlow,
  type Node as RFNode, type Edge, type Connection, BackgroundVariant, type Viewport
} from 'reactflow';
import 'reactflow/dist/style.css';

import { nodeTypes, defaultEdgeOptions } from './lib/flowConfig';
import type { CustomNodeData, LogEntry, NodeStatus } from './types'; // ✅ เพิ่ม NodeStatus

// ---------- Runners ----------
import { runFeature } from './lib/runners/features';
import { runQuality } from './lib/runners/quality';
import { runMatcher } from './lib/runners/matching';
import { runAlignment } from './lib/runners/alignment';
import { runOtsu, runSnakeRunner } from './lib/runners/classification';
import { runSaveImage, runSaveJson } from './lib/runners/saver';
import { markStartThenRunning } from './lib/runners/utils';
import { runEnhancement } from './lib/runners/enhancement';
import { runRestoration } from './lib/runners/restoration';
import { runSegmentation } from './lib/runners/segmentation';

// ---------- Hooks / Utils ----------
import { useFlowHotkeys } from './hooks/useFlowHotkeys';
import { useFlowHistory } from './hooks/useFlowHistory';
import { useWorkflowFile } from './hooks/useWorkflowFile';
import { validateNodeInput } from './lib/validation';
import LogPanel from './components/LogPanel';

export interface FlowCanvasHandle {
  getSnapshot: () => { nodes: RFNode[]; edges: Edge[]; viewport: Viewport };
  restoreSnapshot: (nodes: RFNode[], edges: Edge[], viewport: Viewport) => void;
  fitView: () => void;
}

interface FlowCanvasProps {
  isRunning: boolean;
  onPipelineDone: () => void;
  onFlowChange?: (changes: { nodes: RFNode[]; edges: Edge[]; viewport: Viewport }) => void;
  currentTabName: string; 
}

const getId = () => `node_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

function cleanErrorMessage(rawMsg: string): string {
  if (!rawMsg) return 'Unknown Error';
  try {
    const parsed = JSON.parse(rawMsg.substring(rawMsg.indexOf('{')));
    if (parsed.detail) return parsed.detail;
  } catch (e) { }
  return rawMsg.replace(/^HTTP \d+ [a-zA-Z ]+ - /, '').replace(/^Error: /, '').trim();
}

const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(
  ({ isRunning, onPipelineDone, onFlowChange, currentTabName }, ref) => {
  
  // ✅ 1. ใช้ getNodes/getEdges เพื่อดึงข้อมูลสด
  const { screenToFlowPosition, fitView, getViewport, setViewport, getNode, getNodes, getEdges } = useReactFlow(); 

  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const onMouseMove = useCallback((event: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      lastMousePosRef.current = pos;
    }, [screenToFlowPosition]);

  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const isDraggingRef = useRef(false);
  const isCanceledRef = useRef(false);
  
  // Lock ไม่ให้รันซ้อน
  const isProcessingRef = useRef(false); 

  // Auto-save hook
  useEffect(() => {
    if (!onFlowChange) return;
    const timer = setTimeout(() => {
      onFlowChange({ nodes, edges, viewport: getViewport() });
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, edges, onFlowChange, getViewport]);

  useImperativeHandle(ref, () => ({
    getSnapshot: () => ({ nodes, edges, viewport: getViewport() }),
    restoreSnapshot: (newNodes, newEdges, newViewport) => {
      if (isApplyingHistoryRef.current) (isApplyingHistoryRef.current as any) = true;
      const nodesWithFunc = newNodes.map(n => ({
        ...n, data: { ...n.data, onRunNode: (id: string) => runNodeById(id) }
      }));
      setNodes(nodesWithFunc);
      setEdges(newEdges);
      setTimeout(() => {
         setViewport(newViewport);
         if (isApplyingHistoryRef.current) (isApplyingHistoryRef.current as any) = false;
      }, 50);
    },
    fitView: () => { window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 800 })); }
  }));

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', nodeId?: string) => {
    setLogs((prev) => [...prev, {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      type, message, nodeId,
    }]);
  }, []);

  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const { undo, redo, isApplyingHistoryRef } = useFlowHistory({ nodes, edges, setNodes, setEdges, isDraggingRef });
  const { saveWorkflow, triggerLoadWorkflow, fileInputRef, handleFileChange } = useWorkflowFile({
    nodes, edges, setNodes, setEdges, isApplyingHistoryRef, flowName: currentTabName
  });

  const handleClearWorkflow = useCallback(() => {
    if (nodes.length === 0) return; 
    setNodes([]); setEdges([]);
    addLog('Workflow cleared.', 'warning');
  }, [nodes, setNodes, setEdges, addLog]);

  const setIncomingEdgesStatus = useCallback((nodeId: string, status: 'default' | 'error') => {
      setEdges((eds) => eds.map((e) => e.target === nodeId ? { 
          ...e, animated: status === 'error', 
          style: { ...e.style, stroke: status === 'error' ? '#ef4444' : '#64748b', strokeWidth: status === 'error' ? 3 : 2 } 
      } : e));
  }, [setEdges]);

  // --- NODE RUNNER ---
  const runNodeById = useCallback(async (nodeId: string) => {
      // ✅ 2. ใช้ getNodes() เพื่อความชัวร์
      const currentNodes = getNodes(); 
      const currentEdges = getEdges(); 

      const node = currentNodes.find((n) => n.id === nodeId);
      
      if (!node) {
          // ถ้าหาไม่เจอจริงๆ ให้แจ้ง Error
          throw new Error(`Node ${nodeId} missing from store`);
      }
      if (!node.type) return;

      const nodeName = node.data.label || node.type.toUpperCase();

      setIncomingEdgesStatus(nodeId, 'default');
      const check = validateNodeInput(nodeId, currentNodes, currentEdges); 
      if (!check.isValid) {
        const cleanMsg = cleanErrorMessage(check.message || '');
        addLog(`[${nodeName}] ❌ Skip: ${cleanMsg}`, 'error', nodeId);
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' as NodeStatus } } : n)));
        setIncomingEdgesStatus(nodeId, 'error');
        throw new Error(check.message); 
      }

      addLog(`[${nodeName}] ⏳ Processing...`, 'info', nodeId);
      await markStartThenRunning(nodeId, node.type.toUpperCase(), setNodes);

      try {
        const typeKey = node.type.toLowerCase();
        // ส่ง nodes ล่าสุดไปให้ Adapter
        const freshNodes = getNodes();
        const freshEdges = getEdges();

        switch (typeKey) {
          case 'image-input': 
             if (!node.data.payload?.url) throw new Error("No image uploaded yet.");
            setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, status: 'success' as NodeStatus } } : n));
            await new Promise(r => setTimeout(r, 100)); 
            break; 
          
          case 'sift': case 'surf': case 'orb': await runFeature(node, setNodes, freshNodes, freshEdges); break;
          case 'brisque': case 'psnr': case 'ssim': await runQuality(node, setNodes, freshNodes, freshEdges); break;
          case 'bfmatcher': case 'flannmatcher': await runMatcher(node, setNodes, freshNodes, freshEdges); break;
          case 'homography-align': case 'affine-align': await runAlignment(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'otsu': await runOtsu(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'snake': await runSnakeRunner(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'clahe': case 'msrcr': case 'zero': case 'zerodce': case 'zero-dce': case 'zero_dce': await runEnhancement(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'dcnn': case 'dncnn': case 'swinir': case 'real': case 'realesrgan': await runRestoration(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'deep': case 'deeplab': case 'mask': case 'maskrcnn': case 'unet': await runSegmentation(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'save-image': await runSaveImage(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'save-json': await runSaveJson(node as any, setNodes as any, freshNodes, freshEdges); break;
          default: console.warn(`Unknown type: ${node.type}`);
        }
        addLog(`[${nodeName}] ✅ Completed`, 'success', nodeId);
      } catch (err: any) {
        addLog(`[${nodeName}] 💥 Error: ${cleanErrorMessage(err.message)}`, 'error', nodeId);
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' as NodeStatus } } : n)));
        setIncomingEdgesStatus(nodeId, 'error');
        throw err;
      }
    }, [setNodes, addLog, setIncomingEdgesStatus, getNodes, getEdges]);

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


  // 🔥🔥🔥 EXECUTION CONTROLLER (เวอร์ชันบังคับรัน) 🔥🔥🔥
  useEffect(() => {
    if (!isRunning) { 
        isCanceledRef.current = true; 
        isProcessingRef.current = false;
        return; 
    }
    
    // ป้องกันรันซ้อน
    if (isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    isCanceledRef.current = false;
    
    const runAllNodes = async () => {
      try {
          addLog('🚀 Pipeline Started', 'info');
          
          // 1. ดึง getNodes() สดๆ
          const allNodes = getNodes();
          
          if (!allNodes || allNodes.length === 0) {
              addLog('⚠️ No nodes found to run.', 'warning');
              return;
          }

          const executionPriority: Record<string, number> = {
              'image-input': 1, 'clahe': 5, 'msrcr': 5, 'zero': 5, 'dcnn': 10, 'dncnn': 10, 'swinir': 10, 'real': 10, 
              'sift': 20, 'surf': 20, 'orb': 20, 'deep': 25, 'deeplab': 25, 'unet': 25, 'otsu': 30, 'snake': 30, 
              'bfmatcher': 40, 'flannmatcher': 40, 'homography-align': 50, 'brisque': 60, 'psnr': 60, 'save-image': 99
          };
          
          const sortedNodes = allNodes.sort((a, b) => {
              return (executionPriority[a.type?.toLowerCase() || ''] || 100) - (executionPriority[b.type?.toLowerCase() || ''] || 100);
          });

          // 2. วนลูป (Force Loop)
          for (const node of sortedNodes) {
            if (isCanceledRef.current) { addLog('Pipeline stopped.', 'warning'); break; }
            if (!node?.id || !node?.type) continue;
            
            // ข้ามพวก Save ถ้าต้องการ
            if (node.type.startsWith('save-')) continue;

            try { 
                // ✅ KEY FIX: บังคับเปลี่ยนสถานะเป็น Running ก่อนเรียกฟังก์ชัน
                // เพื่อให้ UI เปลี่ยนสี และ Runner รู้ว่านี่คือการรันใหม่
                setNodes((nds) => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'running' as NodeStatus } } : n));
                
                // รอ 50ms ให้ React อัปเดตสถานะเสร็จก่อน (สำคัญมาก!) 
                await new Promise(r => setTimeout(r, 50));

                // สั่งรัน -> ซึ่งจะไปเรียก getNodes() ใหม่อีกทีข้างใน
                await runNodeById(node.id); 
            
            } catch (e) { 
                console.warn(`Node ${node.id} failed.`); 
                isCanceledRef.current = true;
                break;
            }
          }
          
          if (!isCanceledRef.current) addLog('🏁 Pipeline Finished', 'success');

      } finally {
          isProcessingRef.current = false;
          onPipelineDone?.();
      }
    };

    // ดีดตัวออกจากลูป React ปัจจุบัน
    setTimeout(() => runAllNodes(), 0);
    
    return () => { isProcessingRef.current = false; };
  }, [isRunning]);

  const isValidConnection = useCallback((connection: Connection) => {
      if (connection.source === connection.target) return false;
      const t = getNode(connection.target!);
      if (!t || t.type === 'image-input') return false;
      return true;
  }, [getNode]);

  const onConnect = useCallback((conn: Edge | Connection) => setEdges((eds) => addEdge(conn, eds)), [setEdges]);
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/reactflow');
      if (!type) return;
      const id = getId();
      setNodes((nds) => nds.concat({
        id, type, position: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        data: { label: type.toUpperCase(), status: 'idle', onRunNode: (id: string) => runNodeById(id) },
      }));
      addLog(`Added ${type}`, 'info', id);
    }, [screenToFlowPosition, setNodes, runNodeById, addLog]);

  return (
    <div className="relative flex-1 h-full flex flex-col">
      <div className="absolute z-10 top-2 right-2 flex gap-2">
        <button onClick={saveWorkflow} className="px-3 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs border border-slate-600 shadow-sm text-white">💾 SAVE</button>
        <button onClick={triggerLoadWorkflow} className="px-3 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs border border-slate-600 shadow-sm text-white">📂 LOAD</button>
        <button onClick={handleClearWorkflow} className="px-3 py-1 rounded bg-red-900/80 hover:bg-red-700 text-xs border border-red-700 shadow-sm text-white">🗑️ CLEAR</button>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver} onMouseMove={onMouseMove}
          nodeTypes={nodeTypes} defaultEdgeOptions={defaultEdgeOptions}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView minZoom={0.08} maxZoom={5}
          onNodeDragStart={() => (isDraggingRef.current = true)}
          onNodeDragStop={() => (isDraggingRef.current = false)}
          isValidConnection={isValidConnection}
        >
          <MiniMap style={{ background: 'rgba(15,23,42,0.9)' }} maskColor="rgba(0,0,0,0.6)" nodeColor={(n) => n.data?.status === 'success' ? '#22c55e' : '#94a3b8'} />
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#334155" />
        </ReactFlow>
      </div>
      <LogPanel logs={logs} onClear={() => setLogs([])} />
    </div>
  );
});

export default FlowCanvas;