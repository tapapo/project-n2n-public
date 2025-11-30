import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';

const statusDot = (active: boolean, color: string) => 
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

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

const DEFAULT_SIFT = {
  nfeatures: 500,
  nOctaveLayers: 3,
  contrastThreshold: 0.04,
  edgeThreshold: 10,
  sigma: 1.6,
};

const fmtSize = (w?: number | null, h?: number | null) => (w && h) ? `${w}×${h}px` : undefined;
function shapeToWH(shape?: any): { w?: number, h?: number } {
  if (!Array.isArray(shape) || shape.length < 2) return {};
  const h = Number(shape[0]);
  const w = Number(shape[1]);
  if (Number.isFinite(w) && Number.isFinite(h)) return { w, h };
  return {};
}

const SiftNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const params = useMemo(() => ({ ...DEFAULT_SIFT, ...(data?.payload?.params || {}) }), [data?.payload?.params]);
  const [form, setForm] = useState(params);
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const upstream = useMemo(() => {
    const incoming = rf.getEdges().filter((e) => e.target === id);
    for (const e of incoming) {
      const node = rf.getNodes().find((n) => n.id === e.source);
      if (node?.type === 'image-input') {
        const w = Number(node.data?.payload?.width);
        const h = Number(node.data?.payload?.height);
        if (Number.isFinite(w) && Number.isFinite(h)) return { w, h };
      }
    }
    return { w: undefined, h: undefined };
  }, [id, rf]);

  const processed = useMemo(() => {
    const { w, h } = shapeToWH(data?.payload?.image_shape);
    return { w, h };
  }, [data?.payload?.image_shape]);

  const showProcessed = processed.w && processed.h && (processed.w !== upstream.w || processed.h !== upstream.h);

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);

  const saveParams = useCallback(() => {
    const clean = {
      ...form,
      nOctaveLayers: Math.max(1, parseInt(String(form.nOctaveLayers || 3), 10)),
      nfeatures: Math.max(0, parseInt(String(form.nfeatures || 0), 10)),
      contrastThreshold: Math.max(0, Number(form.contrastThreshold ?? 0.04)),
      edgeThreshold: Math.max(0, parseInt(String(form.edgeThreshold ?? 10), 10)),
      sigma: Math.max(0, Number(form.sigma ?? 1.6)),
    };

    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: { ...clean } } } }
          : n
      )
    );
    setOpen(false);
  }, [rf, id, form]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const handleRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const resultUrl = data?.payload?.result_image_url || data?.payload?.vis_url || data?.payload?.sift_vis_url;
  
  // ✅ เพิ่มข้อความ Default ถ้ายังไม่มีผลลัพธ์
  
  const caption =
  (data?.description &&
    !/(running|start)/i.test(data?.description)) 
    ? data.description
    : (resultUrl ? 'Result preview' : 'Connect Image Input and run');

  

  let borderColor = 'border-green-500';
  if (selected) borderColor = 'border-green-400 ring-2 ring-green-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;
  const sourceHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={sourceHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-green-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">SIFT</div>
        <div className="flex items-center gap-2">
          <button
            title="Run this node"
            onClick={handleRun}
            disabled={isRunning}
            className={[
              'px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white',
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-green-600 hover:bg-green-700',
            ].join(' ')}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>

          <span className="relative inline-flex items-center group">
            <button
              aria-label="Open SIFT settings"
              onClick={handleOpen}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center
                         shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80
                         transition focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-green-500/70"
            >
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                         whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white
                         opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150
                         group-hover:opacity-100"
            >
              Settings
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {fmtSize(upstream.w, upstream.h) && (
          <div className="text-[11px] text-gray-400">Input: {fmtSize(upstream.w, upstream.h)}</div>
        )}
        {typeof data?.payload?.num_keypoints === 'number' && (
          <div className="text-[11px] text-gray-400">Keypoints: {data.payload.num_keypoints}</div>
        )}
        {showProcessed && (
          <div className="text-[11px] text-gray-400">Processed: {fmtSize(processed.w!, processed.h!)}</div>
        )}

        {resultUrl && (
          <img
            src={resultUrl}
            alt="sift-result"
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
          />
        )}
        {/* ✅ แสดงข้อความ (ถ้าไม่มีรูปจะเป็น "Connect...") */}
        {caption && <p className="text-xs text-white-400 break-words">{caption}</p>}
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="SIFT Settings" onClose={handleClose}>
        <div className="grid grid-cols-2 gap-3 text-xs text-gray-300">
          <label>nFeatures
            <input
              type="number" min={0}
              className="w-full bg-gray-900 rounded border border-gray-700"
              value={form.nfeatures}
              onChange={(e) => setForm((s: any) => ({ ...s, nfeatures: Number(e.target.value) }))}
            />
          </label>
          <label>Octaves
            <input
              type="number" step={1} min={1} max={8}
              className="w-full bg-gray-900 rounded border border-gray-700"
              value={form.nOctaveLayers}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value || '1', 10));
                setForm((s: any) => ({ ...s, nOctaveLayers: v }));
              }}
            />
          </label>
          <label>Contrast
            <input
              type="number" step="0.001" min={0}
              className="w-full bg-gray-900 rounded border border-gray-700"
              value={form.contrastThreshold}
              onChange={(e) => setForm((s: any) => ({ ...s, contrastThreshold: Number(e.target.value) }))}
            />
          </label>
          <label>Edge
            <input
              type="number" min={0}
              className="w-full bg-gray-900 rounded border border-gray-700"
              value={form.edgeThreshold}
              onChange={(e) => setForm((s: any) => ({ ...s, edgeThreshold: Number(e.target.value) }))}
            />
          </label>
          <label>Sigma
            <input
              type="number" step="0.1" min={0}
              className="w-full bg-gray-900 rounded border border-gray-700"
              value={form.sigma}
              onChange={(e) => setForm((s: any) => ({ ...s, sigma: Number(e.target.value) }))}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={handleClose} className="px-3 py-1 rounded bg-gray-700">Cancel</button>
          <button onClick={saveParams} className="px-3 py-1 rounded bg-green-600 text-white">Save</button>
        </div>
      </Modal>
    </div>
  );
});

export default SiftNode;