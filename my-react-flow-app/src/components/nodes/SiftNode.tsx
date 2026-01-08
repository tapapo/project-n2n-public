import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api'; 

/* ---------------- UI helpers (ยึดตาม SwinIR) ---------------- */
const statusDot = (active: boolean, color: string) => 
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner transition-colors duration-200`;

const SettingsSlidersIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="black" aria-hidden="true">
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
      <path d="M3 7h18" /><circle cx="9" cy="7" r="3.4" fill="white" />
      <path d="M3 17h18" /><circle cx="15" cy="17" r="3.4" fill="white" />
    </g>
  </svg>
);

// ✅ Parameters เดิมของ SIFT
const DEFAULT_SIFT = {
  nfeatures: 500,
  nOctaveLayers: 3,
  contrastThreshold: 0.04,
  edgeThreshold: 10,
  sigma: 1.6,
};
type Params = typeof DEFAULT_SIFT;

/* ---------------- Component ---------------- */
const SiftNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  // 1. Parameter Logic
  const params = useMemo(
    () => ({ ...DEFAULT_SIFT, ...(data?.payload?.params || {}) }),
    [data?.payload?.params]
  );
  const [form, setForm] = useState<Params>(params);
  
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);

  const onSave = useCallback(() => {
    rf.setNodes((nds) => nds.map((n) =>
      n.id === id
        ? { 
            ...n, 
            data: { 
              ...n.data, 
              payload: { 
                ...(n.data?.payload || {}), 
                params: {
                  nfeatures: Number(form.nfeatures),
                  nOctaveLayers: Number(form.nOctaveLayers),
                  contrastThreshold: Number(form.contrastThreshold),
                  edgeThreshold: Number(form.edgeThreshold),
                  sigma: Number(form.sigma)
                } 
              } 
            } 
          }
        : n
    ));
    setOpen(false);
  }, [rf, id, form]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';
  
  // Logic: Check connection
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  // Logic: Display Size (เฉพาะของ SIFT)
  const displaySize = useMemo(() => {
    const processedShape = data?.payload?.json_data?.image?.processed_sift_shape || data?.payload?.image_shape;
    if (Array.isArray(processedShape) && processedShape.length >= 2) {
      return `${processedShape[1]}×${processedShape[0]}px`;
    }
    // Fallback logic
    const incomingEdge = rf.getEdges().find((e) => e.target === id);
    if (incomingEdge) {
      const sourceNode = rf.getNodes().find((n) => n.id === incomingEdge.source);
      const payload = sourceNode?.data?.payload as any;
      if (payload) {
        const w = payload.width || payload.image_shape?.[1];
        const h = payload.height || payload.image_shape?.[0];
        if (w && h) return `${w}×${h}px`;
      }
    }
    return null;
  }, [id, rf, data?.payload]);

  const rawUrl = data?.payload?.vis_url || data?.payload?.result_image_url;
  const displayUrl = rawUrl ? `${abs(rawUrl)}?t=${Date.now()}` : undefined;
  
  // Caption
  const caption = (data?.status === 'success' && data?.description) 
    ? data.description 
    : (displayUrl ? 'Result preview' : 'Connect Image Input and run');

  const handleRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  // Border logic (ใช้ธีมสีเขียวสำหรับ SIFT)
  let borderColor = 'border-green-500';
  if (selected) borderColor = 'border-green-400 ring-2 ring-green-500';
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

      {/* Header (Layout แบบ SwinIR เป๊ะๆ แต่เปลี่ยนสี text เป็น green) */}
      <div className="bg-gray-700 text-green-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>SIFT</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button
              onClick={handleOpen}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition focus-visible:outline-none cursor-pointer hover:bg-gray-100 active:scale-95"
            >
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            {/* Tooltip แบบ SwinIR */}
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100 z-50 font-normal">
              Settings
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {displaySize && (
          <div className="text-[10px] text-gray-400 font-semibold tracking-tight">
            Input: {displaySize}
          </div>
        )}

        {displayUrl && (
          <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
        )}
        
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      {/* Status Table (Layout แบบ SwinIR) */}
      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      {/* Modal Settings */}
      <Modal open={open} title="SIFT Settings" onClose={handleClose}>
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-300">
          <div className="col-span-2">
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">nFeatures</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nfeatures} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nfeatures: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Octave Layers</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nOctaveLayers} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nOctaveLayers: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Sigma</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.sigma} 
              onChange={(e) => setForm((s: Params) => ({ ...s, sigma: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Contrast Th.</label>
            <input 
              type="number" step="0.01"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.contrastThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, contrastThreshold: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Edge Th.</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.edgeThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, edgeThreshold: Number(e.target.value) }))} 
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-5 border-t border-gray-700 mt-4">
          <button onClick={handleClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition">Cancel</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-green-600 text-white text-xs font-bold cursor-pointer hover:bg-green-500 transition">Save</button>
        </div>
      </Modal>

    </div>
  );
});

export default SiftNode;