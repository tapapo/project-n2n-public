import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges, useNodes } from 'reactflow'; // ✅ เพิ่ม useNodes
import type { CustomNodeData } from '../../types';
import { abs } from '../../lib/api';
import Modal from '../common/Modal';
// ✅ Import Helper เพื่อดึงรูป
import { getNodeImageUrl } from '../../lib/runners/utils';

const dot = (active: boolean, cls: string) => 
  `h-4 w-4 rounded-full ${active ? cls : 'bg-gray-600'} flex-shrink-0`;

// Helper: ป้องกัน Event ทะลุ
const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

type Params = {
  gaussian_blur: boolean;
  blur_ksize: number;
  invert: boolean;
};

const DEFAULT_PARAMS: Params = {
  gaussian_blur: false,
  blur_ksize: 5,
  invert: false,
};

const OtsuNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes<CustomNodeData>(); // ✅ ใช้ useNodes

  const [open, setOpen] = useState(false);
  
  // ✅ State เก็บขนาดรูป
  const [imgSize, setImgSize] = useState<{w: number, h: number} | null>(null);

  // ✅ Logic หา URL รูปภาพจากโหนดแม่ (Auto Preview)
  const upstreamImage = useMemo(() => {
    const incoming = edges.find(e => e.target === id);
    if (!incoming) return null;
    const parent = nodes.find(n => n.id === incoming.source);
    return getNodeImageUrl(parent);
  }, [edges, nodes, id]);

  const isConnected = useMemo(() => edges.some((e) => e.target === id), [edges, id]);

  const savedParams = useMemo(() => ({ ...DEFAULT_PARAMS, ...(data?.payload?.params || {}) }), [data?.payload?.params]);
  const [form, setForm] = useState<Params>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const onRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const onClose = () => { setForm(savedParams); setOpen(false); };
  
  const onSave = () => {
    const k = Math.max(3, Math.floor(form.blur_ksize));
    const oddK = k % 2 === 0 ? k + 1 : k;
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                payload: { ...(n.data?.payload || {}), params: { ...form, blur_ksize: oddK } },
              },
            }
          : n
      )
    );
    setOpen(false);
  };

  const resp = data?.payload?.json as any | undefined;
  const resultImage = data?.payload?.result_image_url || data?.payload?.preview_url || resp?.binary_url;
  const thr = resp?.threshold;

  // ✅ Priority: รูปผลลัพธ์ > รูปต้นทาง
  const displayImage = resultImage || upstreamImage;

  // ✅ Theme: Pink
  let borderColor = 'border-pink-500';
  if (selected) {
    borderColor = 'border-pink-400 ring-2 ring-pink-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  // ✅ Handle Class
  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;
  const sourceHandleClass = 'w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500';

  // ✅ Event เมื่อรูปโหลดเสร็จ (เพื่อเก็บขนาด)
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={sourceHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-pink-400 rounded-t-xl px-3 py-2 flex items-center justify-between">
        <div className="font-bold mr-2">Otsu Threshold</div>
        <div className="flex items-center gap-3">
          <button onClick={onRun} disabled={isRunning} className={['ml-1 px-3 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white', isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-pink-600 hover:bg-pink-700'].join(' ')}>
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          <span className="relative inline-flex items-center group">
            <button aria-label="Open Otsu settings" onClick={() => setOpen(true)} className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80 transition-all">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="black"><g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}><path d="M3 7h18" /><circle cx="9" cy="7" r="3.4" fill="white" /><path d="M3 17h18" /><circle cx="15" cy="17" r="3.4" fill="white" /></g></svg>
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 shadow-lg transition-opacity duration-200">Settings<span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" /></span>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* ✅ 1. แสดงขนาดรูปด้านบน */}
        {imgSize && (
            <div className="text-[10px] text-gray-400">
                Input: {imgSize.w}x{imgSize.h}px
            </div>
        )}

        <p className="text-sm text-gray-300">
          {resultImage ? `Threshold = ${thr ?? '?'}` : 'Connect Image Input and run'}
        </p>

        {displayImage && (
          <img
            src={abs(displayImage)}
            alt="otsu"
            onLoad={onImgLoad} // ✅ จับ event
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
          />
        )}
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={dot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={dot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={dot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={dot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="Otsu Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.gaussian_blur} onKeyDown={stopPropagation} onChange={(e) => setForm((s: Params) => ({ ...s, gaussian_blur: e.target.checked }))} />
            Gaussian blur before threshold
          </label>

          <label className="block">
            Blur kernel size (odd)
            <input type="number" min={3} step={2} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.blur_ksize} onKeyDown={stopPropagation} onChange={(e) => setForm((s: Params) => ({ ...s, blur_ksize: Number(e.target.value) }))} />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.invert} onKeyDown={stopPropagation} onChange={(e) => setForm((s: Params) => ({ ...s, invert: e.target.checked }))} />
            Invert output
          </label>

          <div className="flex justify-end gap-2 pt-3">
            <button onClick={onClose} className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Close</button>
            <button onClick={onSave} className="px-3 py-1 rounded bg-pink-600 text-white hover:bg-pink-700">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default OtsuNode;