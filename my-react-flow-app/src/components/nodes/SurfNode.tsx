import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges, useNodes } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api'; 

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

const DEFAULT_SURF = {
  hessianThreshold: 100,
  nOctaves: 4,
  nOctaveLayers: 3,
  extended: false,
  upright: false,
};

// Helpers
function toNum(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function fmtSize(w?: any, h?: any) {
  const wn = toNum(w);
  const hn = toNum(h);
  if (wn !== undefined && hn !== undefined) return `${wn} x ${hn}px`;
  return undefined;
}

function shapeToText(sh?: any) {
  if (Array.isArray(sh) && sh.length >= 2) return fmtSize(sh[1], sh[0]);
  return undefined;
}

const SurfNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes<CustomNodeData>();
  const [open, setOpen] = useState(false);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const params = useMemo(
    () => ({ ...DEFAULT_SURF, ...(data?.payload?.params || {}) }),
    [data?.payload?.params]
  );

  const [form, setForm] = useState(params);
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const upstreamSize = useMemo(() => {
    const incoming = edges.find(e => e.target === id);
    if (!incoming) return undefined;
    const parent = nodes.find(n => n.id === incoming.source);
    if (!parent) return undefined;
    
    const p = parent.data.payload;
    const w = p?.width || p?.image_shape?.[1];
    const h = p?.height || p?.image_shape?.[0];
    
    return fmtSize(w, h);
  }, [edges, nodes, id]);

  const processedText = shapeToText(data?.payload?.image_shape);
  const showProcessed = processedText && upstreamSize && processedText !== upstreamSize;

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);
  const saveParams = useCallback(() => {
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                payload: { ...(n.data?.payload || {}), params: { ...form } },
              },
            }
          : n
      )
    );
    setOpen(false);
  }, [rf, id, form]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const handleRun = useCallback(() => {
    if (isBusy) return;
    data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const isBusy = isRunning;

  const rawUrl =
    (data?.payload && (data.payload.result_image_url as string)) ||
    (data?.payload && (data.payload.vis_url as string));

  const displayUrl = rawUrl ? `${abs(rawUrl)}?t=${Date.now()}` : undefined;

  const caption =
  (data?.description &&
    !/(running|start)/i.test(data?.description)) 
    ? data.description
    : (displayUrl ? 'Result preview' : 'Connect Image Input and run');

  let borderColor = 'border-green-500';
  if (selected) {
    borderColor = 'border-green-400 ring-2 ring-green-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

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
        <div className="font-bold">SURF</div>

        <div className="flex items-center gap-2">
          <button
            title="Run this node"
            onClick={handleRun}
            disabled={isBusy}
            className={[
              'px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white',
              isBusy ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-green-600 hover:bg-green-700',
            ].join(' ')}
          >
            {isBusy ? 'Running...' : '▶ Run'}
          </button>

          <span className="relative inline-flex items-center group">
            <button
              aria-label="Open SURF settings"
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
        {upstreamSize && (
          <div className="text-[11px] text-gray-400">Input: {upstreamSize}</div>
        )}
        {typeof data?.payload?.num_keypoints === 'number' && (
          <div className="text-[11px] text-gray-400">Keypoints: {data.payload.num_keypoints}</div>
        )}
        {showProcessed && (
          <div className="text-[11px] text-gray-400">Processed: {processedText}</div>
        )}

        {displayUrl && (
          <img
            src={displayUrl}
            alt="surf-result"
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {caption && <p className="text-xs text-white-400 break-words">{caption}</p>}
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className={statusDot(data?.status === 'start', 'bg-red-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-cyan-400">running</span>
          <div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          <div className={statusDot(data?.status === 'success', 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          <div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} />
        </div>
      </div>

      <Modal open={open} title="SURF Settings" onClose={handleClose}>
        <div className="grid grid-cols-2 gap-3 text-xs text-gray-300">
          <label>
            hessianThreshold
            <input
              type="number" min={0} step="1"
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.hessianThreshold}
              onChange={(e) => setForm((s: any) => ({ ...s, hessianThreshold: Number(e.target.value) }))}
            />
          </label>
          <label>
            nOctaves
            <input
              type="number" min={1} step="1"
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.nOctaves}
              onChange={(e) => setForm((s: any) => ({ ...s, nOctaves: Number(e.target.value) }))}
            />
          </label>
          <label>
            nOctaveLayers
            <input
              type="number" min={1} step="1"
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.nOctaveLayers}
              onChange={(e) => setForm((s: any) => ({ ...s, nOctaveLayers: Number(e.target.value) }))}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-300 col-span-2">
            <input
              type="checkbox"
              className="accent-green-500"
              checked={!!form.extended}
              onChange={(e) => setForm((s: any) => ({ ...s, extended: e.target.checked }))}
            />
            extended (128-d descriptor)
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 col-span-2">
            <input
              type="checkbox"
              className="accent-green-500"
              checked={!!form.upright}
              onChange={(e) => setForm((s: any) => ({ ...s, upright: e.target.checked }))}
            />
            upright (no rotation estimation)
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={() => { setForm(params); setOpen(false); }}
            className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={saveParams}
            className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
          >
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
});

export default SurfNode;