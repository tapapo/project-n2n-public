// src/components/nodes/DEEP.tsx
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

// ✅ พารามิเตอร์ตามต้นฉบับเพื่อนเป๊ะ
const DEFAULT_PARAMS = {
  blend: true,
  palette: "cityscapes"
};
type Params = typeof DEFAULT_PARAMS;

/* ---------------- Component ---------------- */
const DeepLabNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);

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

  // ข้อมูล Classes ที่ตรวจเจอ ตามต้นฉบับเพื่อน
  const detectedClasses = respJson?.classes;

  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;
  const caption = (data?.description && !/(running|start)/i.test(data?.description)) 
    ? data.description 
    : (displayUrl ? 'Segmentation output' : 'Connect Image Input and run');

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${
      selected ? 'border-yellow-400 ring-2 ring-yellow-500' : isRunning ? 'border-yellow-500 ring-2 ring-yellow-500/50' : 'border-yellow-600'
    }`}>
      
      <Handle type="target" position={Position.Left} className="w-2 h-2 rounded-full border-2 bg-white border-yellow-600" style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-yellow-600" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      {/* Header - ปุ่ม Run สไตล์กะทัดรัดเดิม */}
      <div className="bg-gray-700 text-yellow-500 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>DeepLabv3+</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => !isRunning && data?.onRunNode?.(id)}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
                isRunning ? 'bg-yellow-600' : 'bg-yellow-600 hover:bg-yellow-500'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <button
            onClick={handleOpen}
            className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 cursor-pointer hover:bg-gray-100 active:scale-95"
          >
            <SettingsSlidersIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {displayUrl && (
          <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
        )}

        {/* แสดงรายการ Classes ตามต้นฉบับเพื่อน */}
        {detectedClasses && detectedClasses.length > 0 && (
          <div className="text-[10px] text-yellow-400 bg-gray-900/50 p-2 rounded border border-gray-700">
            <span className="text-gray-500 uppercase font-bold text-[9px] block mb-1">Detected Classes:</span>
            {detectedClasses.join(", ")}
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

      {/* Modal Settings - ✅ กลับมามีแค่ Blend และ Palette ตามต้นฉบับเพื่อน */}
      <Modal open={open} title="DeepLab Settings" onClose={handleClose}>
        <div className="grid grid-cols-1 gap-4 text-xs text-gray-300">
          <label className="flex items-center gap-3 p-2 bg-gray-900 rounded border border-gray-700 cursor-pointer hover:bg-gray-800 transition">
            <input 
              type="checkbox" 
              className="nodrag w-4 h-4 accent-yellow-500 cursor-pointer"
              checked={form.blend} 
              onChange={e => setForm((s: Params) => ({ ...s, blend: e.target.checked }))} 
            />
            <span className="uppercase font-bold text-gray-400 text-[10px]">Blend overlay with original image</span>
          </label>

          <label className="block">
            <span className="uppercase font-bold text-gray-400 text-[10px]">Color Palette</span>
            <input 
              type="text"
              className="nodrag w-full bg-gray-900 border border-gray-700 rounded p-2 mt-1 outline-none focus:border-yellow-500 text-yellow-500 font-mono"
              value={form.palette} 
              onChange={e => setForm((s: Params) => ({ ...s, palette: e.target.value }))} 
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-5">
          <button onClick={handleClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600">Cancel</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-yellow-600 text-white text-xs font-bold cursor-pointer hover:bg-yellow-500">Save</button>
        </div>
      </Modal>
    </div>
  );
});

export default DeepLabNode;