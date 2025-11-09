// src/components/nodes/SiftNode.tsx
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';

const handleStyle = { background: '#fff', borderRadius: '50%', width: 8, height: 8, border: '2px solid #6b7280' };
const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

const DEFAULT_SIFT = {
  nfeatures: 500,
  nOctaveLayers: 3,       // ✅ เพิ่ม default
  contrastThreshold: 0.04,
  edgeThreshold: 10,
  sigma: 1.6,
};

// ==== Slider icon (เหมือนภาพตัวอย่าง) ====
const SettingsSlidersIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="black" aria-hidden="true">
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
      {/* แถวบน */}
      <path d="M3 7h18" />
      <circle cx="9" cy="7" r="3.4" fill="white" />
      {/* แถวล่าง */}
      <path d="M3 17h18" />
      <circle cx="15" cy="17" r="3.4" fill="white" />
    </g>
  </svg>
);

// helper: format size
const fmtSize = (w?: number | null, h?: number | null) => (w && h) ? `${w}×${h}px` : undefined;
function shapeToWH(shape?: any): { w?: number, h?: number } {
  if (!Array.isArray(shape) || shape.length < 2) return {};
  const h = Number(shape[0]); const w = Number(shape[1]);
  if (Number.isFinite(w) && Number.isFinite(h)) return { w, h };
  return {};
}

const SiftNode = memo(({ id, data }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);

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
    // ✅ sanitize ค่าอินพุตสำคัญก่อนเซฟ
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

  // --- Run only ---
  const isBusy = data?.status === 'start' || data?.status === 'running';
  const handleRun = useCallback(() => {
    if (isBusy) return;
    data?.onRunNode?.(id);
  }, [data, id, isBusy]);

  const resultUrl = data?.payload?.result_image_url || data?.payload?.vis_url || data?.payload?.sift_vis_url;
  const caption = data?.description || (resultUrl ? 'Result preview' : undefined);

  return (
    <div className="bg-gray-800 border-2 border-green-500 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible">
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />

      {/* Header */}
      <div className="bg-gray-700 text-green-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">SIFT</div>

        <div className="flex items-center gap-2">
          {/* Run */}
          <button
            title="Run this node"
            onClick={handleRun}
            disabled={isBusy}
            className={[
              'px-2 py-1 rounded text-xs font-semibold transition-colors',
              isBusy ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white',
            ].join(' ')}
          >
            ▶ Run
          </button>

          {/* Settings: วงกลมขาว + ไอคอนสไลเดอร์ดำ */}
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
            {/* Tooltip bubble */}
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
        {caption && <p className="text-xs text-gray-400 break-words">{caption}</p>}
      </div>

      {/* Status */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      {/* Modal */}
      <Modal open={open} title="SIFT Settings" onClose={handleClose}>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-300">nfeatures
            <input
              type="number" min={0}
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.nfeatures}
              onChange={(e) => setForm((s: any) => ({ ...s, nfeatures: Number(e.target.value) }))}
            />
          </label>

          <label className="text-xs text-gray-300">nOctaveLayers
            <input
              type="number" step={1} min={1} max={8}
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.nOctaveLayers}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value || '1', 10));
                setForm((s: any) => ({ ...s, nOctaveLayers: v }));
              }}
            />
          </label>

          <label className="text-xs text-gray-300">contrastThreshold
            <input
              type="number" step="0.001" min={0}
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.contrastThreshold}
              onChange={(e) => setForm((s: any) => ({ ...s, contrastThreshold: Number(e.target.value) }))}
            />
          </label>

          <label className="text-xs text-gray-300">edgeThreshold
            <input
              type="number" min={0}
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.edgeThreshold}
              onChange={(e) => setForm((s: any) => ({ ...s, edgeThreshold: Number(e.target.value) }))}
            />
          </label>

          <label className="text-xs text-gray-300">sigma
            <input
              type="number" step="0.1" min={0}
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.sigma}
              onChange={(e) => setForm((s: any) => ({ ...s, sigma: Number(e.target.value) }))}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <button onClick={() => { setForm(params); setOpen(false); }} className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Cancel</button>
          <button onClick={saveParams} className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700">Save</button>
        </div>
      </Modal>
    </div>
  );
});

export default SiftNode;

