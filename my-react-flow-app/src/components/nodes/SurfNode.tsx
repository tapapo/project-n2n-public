// File: my-react-flow-app/src/components/nodes/SurfNode.tsx
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

const DEFAULT_SURF = {
  hessianThreshold: 100,
  nOctaves: 4,
  nOctaveLayers: 3,
  extended: false,
  upright: false,
};

type Params = typeof DEFAULT_SURF;

const SurfNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  // Parameters
  const params = useMemo(
    () => ({ ...DEFAULT_SURF, ...(data?.payload?.params || {}) }),
    [data?.payload?.params]
  );
  const [form, setForm] = useState<Params>(params);
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  // Logic สำหรับแสดงขนาดภาพ
  const displaySize = useMemo(() => {
    const imgData = data?.payload?.json_data?.image;
    const shape = imgData?.processed_surf_shape || imgData?.processed_shape || imgData?.original_shape || data?.payload?.image_shape;
    
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

  // บันทึกการตั้งค่า
  const saveParams = useCallback(() => {
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { 
          ...n, 
          data: { 
            ...n.data, 
            payload: { 
              ...(n.data?.payload || {}), 
              params: {
                hessianThreshold: Number(form.hessianThreshold),
                nOctaves: Number(form.nOctaves),
                nOctaveLayers: Number(form.nOctaveLayers),
                extended: form.extended,
                upright: form.upright
              } 
            } 
          } 
        } : n
      )
    );
    setOpen(false);
  }, [rf, id, form]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';
  const displayUrl = data?.payload?.vis_url ? `${abs(data.payload.vis_url)}?t=${Date.now()}` : undefined;
  
  const caption = (data?.description && !/(running|start)/i.test(data?.description)) 
    ? data.description
    : (displayUrl ? 'Result preview' : 'Connect Image Input and run');

  // Border Style (ใช้ธีมสีเขียว)
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
        <div>SURF</div>
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
              aria-label="Open SURF settings"
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

        {displayUrl && <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />}
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      {/* Status Table (Structure แบบ SwinIR) */}
      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      {/* Settings Modal (ปรับ Style ให้เหมือน SwinIR Modal) */}
      <Modal open={open} title="SURF Settings" onClose={() => setOpen(false)}>
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-300">
          <div className="col-span-2">
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Hessian Threshold</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.hessianThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, hessianThreshold: Number(e.target.value) }))} 
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Octaves</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nOctaves} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nOctaves: Number(e.target.value) }))} 
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Layers</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nOctaveLayers} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nOctaveLayers: Number(e.target.value) }))} 
            />
          </div>
          <div className="col-span-2 space-y-2 pt-2 text-[10px] font-bold text-gray-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.extended} onChange={(e) => setForm((s: Params) => ({ ...s, extended: e.target.checked }))} className="accent-green-500" /> 
              Extended (128-d)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.upright} onChange={(e) => setForm((s: Params) => ({ ...s, upright: e.target.checked }))} className="accent-green-500" /> 
              Upright (No rotation)
            </label>
          </div>
        </div>
        
        {/* Modal Buttons (ขนาด px-4 py-1.5) */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-4">
          <button 
            onClick={() => setOpen(false)} 
            className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white"
          >
            Cancel
          </button>
          <button 
            onClick={saveParams} 
            className="px-4 py-1.5 rounded bg-green-600 text-white text-xs font-bold cursor-pointer hover:bg-green-500 transition"
          >
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
});

export default SurfNode;