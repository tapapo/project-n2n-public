// File: my-react-flow-app/src/components/nodes/OrbNode.tsx
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api'; 

/* --- Helpers (ยึดตาม SwinIR Master) --- */

// ✅ 1. ใช้ statusDot แบบ String Class (เหมือน SwinIR)
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

const DEFAULT_ORB = {
  nfeatures: 500,
  scaleFactor: 1.2,
  nlevels: 8,
  edgeThreshold: 31,
  firstLevel: 0,
  WTA_K: 2,
  scoreType: 'FAST' as 'FAST' | 'HARRIS',
  patchSize: 31,
  fastThreshold: 20,
};

type Params = typeof DEFAULT_ORB;

const OrbNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  // จัดการ Parameters
  const params = useMemo(
    () => ({ ...DEFAULT_ORB, ...(data?.payload?.params || {}) }),
    [data?.payload?.params]
  );
  
  const [form, setForm] = useState<Params>(params);
  
  useEffect(() => { 
    if (!open) setForm(params); 
  }, [params, open]);

  // Logic คำนวณขนาดภาพ
  const displaySize = useMemo(() => {
    const imgData = data?.payload?.json_data?.image;
    const shape = imgData?.processed_orb_shape || imgData?.processed_shape || imgData?.original_shape || data?.payload?.image_shape;
    
    if (Array.isArray(shape) && shape.length >= 2) {
      return `${shape[1]}×${shape[0]}px`;
    }

    const incomingEdge = rf.getEdges().find((e) => e.target === id);
    if (incomingEdge) {
      const sourceNode = rf.getNodes().find((n) => n.id === incomingEdge.source);
      const p = sourceNode?.data?.payload;
      if (p) {
        const w = p.width || p.image_shape?.[1] || p.json_data?.image?.processed_shape?.[1] || p.json_data?.image?.original_shape?.[1];
        const h = p.height || p.image_shape?.[0] || p.json_data?.image?.processed_shape?.[0] || p.json_data?.image?.original_shape?.[0];
        if (w && h) return `${w}×${h}px`;
      }
    }
    return null;
  }, [id, rf, data?.payload]);

  const saveParams = useCallback(() => {
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: form } } } : n
      )
    );
    setOpen(false);
  }, [rf, id, form]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const resultUrl = data?.payload?.result_image_url || data?.payload?.vis_url;
  const displayUrl = resultUrl ? `${abs(resultUrl)}?t=${Date.now()}` : undefined;
  
  const caption = (data?.description && !/(running|start)/i.test(data?.description)) 
    ? data.description
    : (displayUrl ? 'Result preview' : 'Connect Image Input and run');

  // สไตล์ขอบโหนด
  let borderStyle = 'border-green-500';
  if (selected) borderStyle = 'border-green-400 ring-2 ring-green-500';
  else if (isRunning) borderStyle = 'border-yellow-500 ring-2 ring-yellow-500/50';

  // Handle styles
  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected 
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' 
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderStyle}`}>
      
      {/* Handles */}
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-gray-500" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      {/* Header Style (Layout แบบ SwinIR: px-2 py-2) */}
      <div className="bg-gray-700 text-green-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>ORB</div>
        <div className="flex items-center gap-2"> {/* ✅ Gap-2 ตาม SwinIR */}
          <button 
            onClick={() => !isRunning && data?.onRunNode?.(id)} 
            disabled={isRunning} 
            // ✅ Button size: px-2 py-1 ตาม SwinIR
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white ${
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button 
              aria-label="Open ORB settings"
              onClick={() => setOpen(true)} 
              // ✅ Settings button: h-5 w-5 ตาม SwinIR
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition hover:bg-gray-100 focus:outline-none"
            >
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            {/* ✅ Tooltip แบบ SwinIR */}
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
        
        <p className="text-sm text-gray-300 break-words leading-relaxed">
          {caption}
        </p>
      </div>

      {/* Status Table (Structure แบบ SwinIR) */}
      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      {/* Modal Settings */}
      <Modal open={open} title="ORB Settings" onClose={() => setOpen(false)}>
        {/* ใช้ max-h สำหรับ Scrollbar */}
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-300 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          
          <div className="col-span-2 border-b border-gray-700 pb-2 mb-2">
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">nFeatures</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nfeatures} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nfeatures: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Scale Factor</label>
            <input 
              type="number" step="0.1" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.scaleFactor} 
              onChange={(e) => setForm((s: Params) => ({ ...s, scaleFactor: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Levels</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nlevels} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nlevels: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Edge Thresh</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.edgeThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, edgeThreshold: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Patch Size</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.patchSize} 
              onChange={(e) => setForm((s: Params) => ({ ...s, patchSize: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">WTA_K</label>
            <select 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.WTA_K} 
              onChange={(e) => setForm((s: Params) => ({ ...s, WTA_K: Number(e.target.value) }))}
            >
              <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Score Type</label>
            <select 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.scoreType} 
              onChange={(e) => setForm((s: Params) => ({ ...s, scoreType: e.target.value as 'FAST' | 'HARRIS' }))}
            >
              <option value="FAST">FAST</option><option value="HARRIS">HARRIS</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Fast Thresh</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.fastThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, fastThreshold: Number(e.target.value) }))} 
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">First Level</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.firstLevel} 
              onChange={(e) => setForm((s: Params) => ({ ...s, firstLevel: Number(e.target.value) }))} 
            />
          </div>

        </div>

        {/* Modal Buttons (ขนาด px-4 py-1.5) */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-6">
          <button 
            onClick={() => setOpen(false)} 
            className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white"
          >
            Cancel
          </button>
          <button 
            onClick={saveParams} 
            className="px-4 py-1.5 rounded bg-green-600 text-white font-bold transition hover:bg-green-500 text-xs"
          >
            Save
          </button>
        </div>
      </Modal>

    </div>
  );
});

export default OrbNode;