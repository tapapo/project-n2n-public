// src/components/nodes/UNET.tsx
import { memo, useEffect, useMemo, useState, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "reactflow";
import Modal from "../common/Modal";
import { abs } from "../../lib/api";
import type { CustomNodeData } from "../../types";

/* ---------------- UI helpers (SIFT Style) ---------------- */
const statusDot = (active: boolean, color: string) => 
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner transition-colors duration-200`;

const SettingsSlidersIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="black">
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
      <path d="M3 7h18" /><circle cx="9" cy="7" r="3.4" fill="white" />
      <path d="M3 17h18" /><circle cx="15" cy="17" r="3.4" fill="white" />
    </g>
  </svg>
);

// ✅ รวมพารามิเตอร์ตามต้นฉบับเพื่อน: threshold, blend, palette
const DEFAULT_PARAMS = {
  threshold: 0.5,
  blend: true,
  palette: "default"
};
type Params = typeof DEFAULT_PARAMS;

/* ---------------- Component ---------------- */
const UNetNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);

  // 1. Parameters logic
  const params = useMemo(() => ({ ...DEFAULT_PARAMS, ...(data?.payload?.params || {}) }), [data?.payload?.params]);
  const [form, setForm] = useState<Params>(params);
  
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);

  const onSave = useCallback(() => {
    rf.setNodes(nds => nds.map(n => 
      n.id === id ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: { ...form } } } } : n
    ));
    setOpen(false);
  }, [rf, id, form]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const visUrl = data?.payload?.vis_url || data?.payload?.segmented_image;
  const respJson = data?.payload?.json || data?.payload?.json_data;

  // ข้อมูล Mask Info จากต้นฉบับเพื่อน
  const maskPixels = respJson?.mask_info?.pixels;

  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;
  const caption = (data?.description && !/(running|start)/i.test(data?.description)) 
    ? data.description 
    : (displayUrl ? 'U-Net segmentation output' : 'Connect Image and run');

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${
      selected ? 'border-yellow-400 ring-2 ring-yellow-500' : isRunning ? 'border-yellow-500 ring-2 ring-yellow-500/50' : 'border-yellow-600'
    }`}>
      
      <Handle type="target" position={Position.Left} className="w-2 h-2 rounded-full border-2 bg-white border-yellow-600" style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-yellow-600" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      {/* Header - Fixed Title Size to text-sm เพื่อความเท่าเทียมกับโหนดอื่น */}
      <div className="bg-gray-700 text-yellow-500 rounded-t-xl px-3 py-2 flex items-center justify-between font-bold">
        <div className="text-sm tracking-wide">U-Net</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => !isRunning && data?.onRunNode?.(id)}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
                isRunning ? 'bg-yellow-600' : 'bg-yellow-600 hover:bg-yellow-500'
            }`}
          >
            {isRunning ? 'Running' : '▶ Run'}
          </button>
          
          <button
            onClick={handleOpen}
            className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 cursor-pointer hover:bg-gray-100 active:scale-95"
          >
            <SettingsSlidersIcon />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {displayUrl && (
          <div className="relative group">
            <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
            {maskPixels && (
                <div className="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-[9px] font-mono text-yellow-400 border border-yellow-600/50">
                    Pixels: {maskPixels}
                </div>
            )}
          </div>
        )}
        
        {caption && <p className="text-xs text-white-400 break-words">{caption}</p>}
      </div>

      {/* Status Table */}
      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        {['start', 'running', 'success', 'fault'].map(s => (
          <div key={s} className="flex justify-between items-center py-1">
            <span className={s === 'start' ? 'text-red-400' : s === 'running' ? 'text-cyan-400' : s === 'success' ? 'text-green-400' : 'text-yellow-400'}>{s}</span>
            <div className={statusDot(data?.status === s, s === 'start' ? 'bg-red-500' : s === 'running' ? 'bg-cyan-400 animate-pulse' : s === 'success' ? 'bg-green-500' : 'bg-yellow-500')} />
          </div>
        ))}
      </div>

      {/* Modal Settings - Hybrid Input (พิมพ์ + เลื่อน) */}
      <Modal open={open} title="U-Net Settings" onClose={handleClose}>
        <div className="grid grid-cols-1 gap-5 text-xs text-gray-300">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="uppercase font-bold text-gray-400 text-[10px] tracking-wider">Binary Threshold</label>
              <input 
                type="number" step="0.01" min="0" max="1.0"
                className="nodrag w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-yellow-500 font-mono text-right outline-none focus:border-yellow-500"
                value={form.threshold}
                onChange={(e) => setForm((s: Params) => ({ ...s, threshold: Number(e.target.value) }))}
              />
            </div>
            {/* nodrag nopan ทำให้เลื่อน Slider บนโหนดได้ */}
            <input 
              type="range" step="0.01" min="0" max="1.0" 
              className="nodrag nopan w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500" 
              value={form.threshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, threshold: Number(e.target.value) }))} 
            />
          </div>

          <label className="block">
            <span className="uppercase font-bold text-gray-400 text-[10px]">Color Palette</span>
            <input 
              type="text"
              className="nodrag w-full bg-gray-900 border border-gray-700 rounded p-2 mt-1 outline-none focus:border-yellow-500 text-yellow-500 font-mono"
              value={form.palette} 
              onChange={e => setForm((s: Params) => ({ ...s, palette: e.target.value }))} 
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-gray-900 rounded border border-gray-700 cursor-pointer hover:bg-gray-800 transition">
            <span className="uppercase font-bold text-gray-400 text-[10px]">Blend overlay output</span>
            <input 
              type="checkbox" 
              className="nodrag w-4 h-4 accent-yellow-500 cursor-pointer"
              checked={form.blend} 
              onChange={e => setForm((s: Params) => ({ ...s, blend: e.target.checked }))} 
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-5">
          <button onClick={handleClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition font-medium">Cancel</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-yellow-600 text-white text-xs font-bold cursor-pointer hover:bg-yellow-500 transition">Save</button>
        </div>
      </Modal>
    </div>
  );
});

export default UNetNode;