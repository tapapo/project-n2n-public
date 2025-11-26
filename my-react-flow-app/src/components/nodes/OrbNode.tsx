import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';

const handleStyle = { background: '#fff', borderRadius: '50%', width: 8, height: 8, border: '2px solid #6b7280' };
const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

const SettingsSlidersIcon = ({ className = 'h-3.5 w-3.5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="black" aria-hidden="true">
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
      <path d="M3 7h18" />
      <circle cx="9" cy="7" r="3.4" fill="white" />
      <path d="M3 17h18" />
      <circle cx="15" cy="17" r="3.4" fill="white" />
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

const fmtSize = (w?: number|null, h?: number|null) => (w && h) ? `${w}×${h}px` : undefined;
function shapeToWH(shape?: any): { w?: number, h?: number } {
  if (!Array.isArray(shape) || shape.length < 2) return {};
  const h = Number(shape[0]); const w = Number(shape[1]);
  if (Number.isFinite(w) && Number.isFinite(h)) return { w, h };
  return {};
}

const OrbNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);

  const params = useMemo(
    () => ({ ...DEFAULT_ORB, ...(data?.payload?.params || {}) }),
    [data?.payload?.params]
  );

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
    return { w: undefined as number|undefined, h: undefined as number|undefined };
  }, [id, rf]);

  const processed = useMemo(() => {
    const { w, h } = shapeToWH(data?.payload?.image_shape);
    return { w, h };
  }, [data?.payload?.image_shape]);

  const showProcessed =
    processed.w && processed.h &&
    (processed.w !== upstream.w || processed.h !== upstream.h);

  const handleOpen  = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);
  const saveParams  = useCallback(() => {
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: { ...form } } } }
          : n
      )
    );
    setOpen(false);
  }, [rf, id, form]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const handleRun = useCallback(() => {
    if (isBusy) return;
    data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const isBusy = isRunning;

  const resultUrl =
    (data?.payload && (data.payload.result_image_url as string)) ||
    (data?.payload && (data.payload.vis_url as string)) ||
    undefined;

  const caption = (data?.description as string) || (resultUrl ? 'Result preview' : undefined);

  // ✅ FIXED: สีเขียวเสมอ
  let borderColor = 'border-green-500';
  if (selected) {
    borderColor = 'border-green-400 ring-2 ring-green-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-green-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">ORB</div>

        <div className="flex items-center gap-2">
          {/* Run Button */}
          <button
            onClick={handleRun}
            disabled={isBusy}
            // ✅ FIXED: ปุ่มสีเขียวเสมอ
            className={[
              'px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white',
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-green-600 hover:bg-green-700',
            ].join(' ')}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>

          <span className="relative inline-flex items-center group">
            <button
              aria-label="Open ORB settings"
              onClick={handleOpen}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center
                         shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80
                         transition focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-green-500/70"
            >
              <SettingsSlidersIcon />
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
          <img src={resultUrl} alt="orb-result" className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
        )}
        {caption && <p className="text-xs text-gray-400 break-words">{caption}</p>}
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="ORB Settings" onClose={handleClose}>
        {/* (Modal Content) */}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-300">nfeatures<input type="number" min={0} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.nfeatures} onChange={(e) => setForm((s: any) => ({ ...s, nfeatures: Number(e.target.value) }))} /></label>
          <label className="text-xs text-gray-300">scaleFactor<input type="number" step="0.05" min={1.0} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.scaleFactor} onChange={(e) => setForm((s: any) => ({ ...s, scaleFactor: Number(e.target.value) }))} /></label>
          <label className="text-xs text-gray-300">nlevels<input type="number" min={1} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.nlevels} onChange={(e) => setForm((s: any) => ({ ...s, nlevels: Number(e.target.value) }))} /></label>
          <label className="text-xs text-gray-300">edgeThreshold<input type="number" min={0} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.edgeThreshold} onChange={(e) => setForm((s: any) => ({ ...s, edgeThreshold: Number(e.target.value) }))} /></label>
          <label className="text-xs text-gray-300">firstLevel<input type="number" min={0} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.firstLevel} onChange={(e) => setForm((s: any) => ({ ...s, firstLevel: Number(e.target.value) }))} /></label>
          <label className="text-xs text-gray-300">WTA_K<select className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.WTA_K} onChange={(e) => setForm((s: any) => ({ ...s, WTA_K: Number(e.target.value) }))}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
          <label className="text-xs text-gray-300">scoreType<select className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.scoreType} onChange={(e) => setForm((s: any) => ({ ...s, scoreType: e.target.value }))}><option value="FAST">FAST</option><option value="HARRIS">HARRIS</option></select></label>
          <label className="text-xs text-gray-300">patchSize<input type="number" min={1} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.patchSize} onChange={(e) => setForm((s: any) => ({ ...s, patchSize: Number(e.target.value) }))} /></label>
          <label className="text-xs text-gray-300">fastThreshold<input type="number" min={0} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.fastThreshold} onChange={(e) => setForm((s: any) => ({ ...s, fastThreshold: Number(e.target.value) }))} /></label>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={() => { setForm(params); setOpen(false); }} className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Cancel</button>
          <button onClick={saveParams} className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700">Save</button>
        </div>
      </Modal>
    </div>
  );
});

export default OrbNode;