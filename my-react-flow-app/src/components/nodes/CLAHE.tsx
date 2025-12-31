import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';

/* ---------------- UI Helpers ---------------- */
const statusDot = (active: boolean, color: string) => (
  <div className={`h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`} />
);

const SettingsSlidersIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="black" aria-hidden="true">
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
      <path d="M3 7h18" />
      <circle cx="9" cy="7" r="3.4" fill="white" />
      <path d="M3 17h18" />
      <circle cx="15" cy="17" r="3.4" fill="white" />
    </g>
  </svg>
);

const DEFAULT_PARAMS = {
  clipLimit: 3.0,
  tileGridSizeX: 8,
  tileGridSizeY: 8,
};

type Params = typeof DEFAULT_PARAMS;

const CLAHENode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); // ✅ ยังต้องใช้สำหรับการเช็ค connection (จุดแดง)
  const [open, setOpen] = useState(false);

  // 1. Parameter Management
  const params = useMemo(() => ({
    ...DEFAULT_PARAMS,
    ...(data?.payload?.params || {})
  }), [data?.payload?.params]);

  const [form, setForm] = useState<Params>(params);

  useEffect(() => {
    if (!open) setForm(params);
  }, [params, open]);

  // 2. Action Handlers
  const onSave = useCallback(() => {
    const cleanParams = {
      clipLimit: Number(form.clipLimit),
      tileGridSize: [Number(form.tileGridSizeX), Number(form.tileGridSizeY)],
      tileGridSizeX: Number(form.tileGridSizeX),
      tileGridSizeY: Number(form.tileGridSizeY)
    };

    rf.setNodes((nds) => nds.map((n) => 
      n.id === id 
        ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: cleanParams } } } 
        : n
    ));
    setOpen(false);
  }, [rf, id, form]);

  const handleRun = useCallback(() => {
    if (data?.status !== 'running' && data?.status !== 'start') {
      data?.onRunNode?.(id);
    }
  }, [data, id]);

  // 3. Display Logic
  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';
  
  // ✅ Logic: Check connection (สำหรับจัดการจุดแดง Fault)
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  // ✅ แก้ไข: Logic ดึงขนาดภาพ (เอาเฉพาะจาก Backend หลังรันเสร็จเท่านั้น)
  const displaySize = useMemo(() => {
    // เช็คเฉพาะ payload ที่ได้หลังรันเสร็จแล้ว
    const internalShape = data?.payload?.json_data?.image?.original_shape || data?.payload?.image_shape;
    
    if (Array.isArray(internalShape) && internalShape.length >= 2) {
      return `${internalShape[1]}×${internalShape[0]}px`;
    }

    // ❌ ลบส่วนที่ดึงจาก incomingEdge ออกแล้ว
    return null;
  }, [data?.payload]); // ตัด dependency edges/rf ออก
  
  const visUrl = data?.payload?.vis_url || data?.payload?.output_image;
  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;

  const caption = (data?.status === 'success' && data?.description)
    ? data.description
    : (displayUrl ? 'Enhancement complete' : 'Connect Image Input and run');

  // Border Style
  let borderColor = 'border-indigo-500';
  if (selected) borderColor = 'border-indigo-400 ring-2 ring-indigo-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  // ✅ Logic Handle Class: จัดการสีจุดเชื่อมต่อ
  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected 
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' 
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-gray-500" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      {/* Header */}
      <div className="bg-gray-700 text-indigo-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>CLAHE</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white ${
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>

          <span className="relative inline-flex items-center group">
            <button
              onClick={() => setOpen(true)}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition hover:bg-gray-100 focus-visible:outline-none"
            >
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

      {/* Status Indicators */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          {statusDot(data?.status === 'start', 'bg-red-500')}
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-cyan-400">running</span>
          {statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')}
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          {statusDot(data?.status === 'success', 'bg-green-500')}
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          {statusDot(data?.status === 'fault', 'bg-yellow-500')}
        </div>
      </div>

      {/* Modal Settings */}
      <Modal open={open} title="CLAHE Settings" onClose={() => setOpen(false)}>
        <div className="space-y-4 text-xs text-gray-300">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-gray-400 block mb-1 uppercase font-bold text-[10px]">Clip Limit</label>
              <input 
                type="number" step="0.1" 
                className="w-full bg-gray-900 rounded border border-gray-700 p-2 outline-none focus:border-indigo-500 text-white" 
                value={form.clipLimit} 
                onChange={(e) => setForm(s => ({ ...s, clipLimit: Number(e.target.value) }))} 
              />
            </div>
            <div>
              <label className="text-gray-400 block mb-1 uppercase font-bold text-[10px]">Tile X</label>
              <input 
                type="number" 
                className="w-full bg-gray-900 rounded border border-gray-700 p-2 outline-none focus:border-indigo-500 text-white" 
                value={form.tileGridSizeX} 
                onChange={(e) => setForm(s => ({ ...s, tileGridSizeX: Number(e.target.value) }))} 
              />
            </div>
            <div>
              <label className="text-gray-400 block mb-1 uppercase font-bold text-[10px]">Tile Y</label>
              <input 
                type="number" 
                className="w-full bg-gray-900 rounded border border-gray-700 p-2 outline-none focus:border-indigo-500 text-white" 
                value={form.tileGridSizeY} 
                onChange={(e) => setForm(s => ({ ...s, tileGridSizeY: Number(e.target.value) }))} 
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
            <button onClick={() => setOpen(false)} className="px-4 py-1.5 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition">Close</button>
            <button onClick={onSave} className="px-4 py-1.5 rounded bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default CLAHENode;