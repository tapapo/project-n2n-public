// File: src/components/nodes/DnCNNNode.tsx
import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';
import { useNodeStatus } from '../../hooks/useNodeStatus'; // ✅ Import Hook

/* ---------------- UI helpers ---------------- */
const SettingsSlidersIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="black" aria-hidden="true">
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
      <path d="M3 7h18" /><circle cx="9" cy="7" r="3.4" fill="white" />
      <path d="M3 17h18" /><circle cx="15" cy="17" r="3.4" fill="white" />
    </g>
  </svg>
);

const DEFAULT_PARAMS = { sigma: 25 };
type Params = typeof DEFAULT_PARAMS;

/* ---------------- Component ---------------- */
const DnCNNNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();
  const [open, setOpen] = useState(false);

  // ✅ เรียกใช้ Hook
  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  // 1. Parameters logic
  const params = useMemo(() => ({ ...DEFAULT_PARAMS, ...(data?.payload?.params || {}) }), [data?.payload?.params]);
  const [form, setForm] = useState<Params>(params);

  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  
  const handleClose = useCallback(() => { 
    setForm(params); 
    setOpen(false); 
  }, [params]);

  const onSave = useCallback(() => {
    rf.setNodes(nds => nds.map(n => 
      n.id === id ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: { ...form } } } } : n
    ));
    setOpen(false);
  }, [rf, id, form]);
  
  // Logic: Check connection
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const visUrl = data?.payload?.vis_url || data?.payload?.output_image;
  const respJson = data?.payload?.json || data?.payload?.json_data;

  // ข้อมูลจาก Backend Data
  const originalShape = respJson?.image?.original_shape;
  const enhancedShape = respJson?.image?.enhanced_shape;
  const noiseRemoved = respJson?.noise_removed;

  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;
  
  // Caption (ใช้ isSuccess ช่วย)
  const caption = (isSuccess && data?.description) 
    ? data.description 
    : (displayUrl ? 'Restoration complete' : 'Connect Noisy Image and run');

  const handleRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  // Border logic
  let borderColor = 'border-red-500';
  if (selected) borderColor = 'border-red-400 ring-2 ring-red-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  // Handle Class Logic
  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected 
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' 
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      {/* Handles */}
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-gray-500" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      {/* Header */}
      <div className="bg-gray-700 text-red-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>DnCNN</div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRun} 
            disabled={isRunning}
            className={['px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white', isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-red-600 hover:bg-red-700'].join(' ')}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button onClick={handleOpen} className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 hover:bg-gray-100">
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100 z-50 font-normal">
              Settings
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {(originalShape || enhancedShape) && (
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="rounded border border-gray-700 p-2">
              <div className="text-gray-500 mb-1 uppercase text-[9px]">Input</div>
              {originalShape ? <div>{originalShape[1]}×{originalShape[0]}px</div> : <div className="text-gray-600 italic">---</div>}
            </div>
            <div className="rounded border border-gray-700 p-2">
              <div className="text-gray-400 mb-1 uppercase text-[9px]">Enhanced</div>
              {enhancedShape ? <div>{enhancedShape[1]}×{enhancedShape[0]}px</div> : <div className="text-gray-600 italic">---</div>}
            </div>
          </div>
        )}

        {displayUrl && (
          <div className="space-y-2">
            <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
            {noiseRemoved && <div className="text-[10px] text-green-400 text-center font-bold uppercase tracking-widest">Noise Reduced</div>}
          </div>
        )}
        
        <p className="text-sm text-gray-300 break-words leading-relaxed">
          {caption}
        </p>
      </div>

      {/* Status Table */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span>
           {/* ✅ ใช้ isSuccess */}
           <div className={statusDot(isSuccess, 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>

      {/* Settings Modal */}
      <Modal open={open} title="DnCNN Settings" onClose={handleClose}>
        <div className="space-y-4 text-xs text-gray-300 min-w-[250px]">
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="uppercase font-bold text-gray-400 text-[10px] tracking-wider">
                Noise Level (Sigma)
              </label>
              <input 
                type="number" min="0" max="100" step="1"
                className="nodrag w-12 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-red-400 font-mono text-right outline-none focus:border-red-500 text-xs"
                value={form.sigma}
                onChange={(e) => setForm(s => ({ ...s, sigma: Number(e.target.value) }))}
              />
            </div>
            
            <input 
              type="range" min="0" max="100" step="1"
              className="nodrag nopan w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
              value={form.sigma}
              onChange={(e) => setForm(s => ({ ...s, sigma: Number(e.target.value) }))} 
            />
            
            <p className="text-[10px] text-gray-500 italic text-right">
              Higher sigma = Stronger denoising
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
            <button 
              onClick={handleClose} 
              className="px-3 py-1.5 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition"
            >
              Cancel
            </button>
            <button 
              onClick={onSave} 
              className="px-3 py-1.5 rounded bg-red-600 text-white font-bold hover:bg-red-500 transition shadow-lg shadow-red-900/20"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default DnCNNNode;