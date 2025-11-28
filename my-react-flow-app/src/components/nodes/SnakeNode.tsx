// src/components/nodes/SnakeNode.tsx
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow'; // ✅ เพิ่ม useEdges
import type { CustomNodeData } from '../../types';
import { abs } from '../../lib/api';
import Modal from '../common/Modal';

const dot = (active: boolean, cls: string) => `h-4 w-4 rounded-full ${active ? cls : 'bg-gray-600'} flex-shrink-0`;

const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();
const stopKeys: React.KeyboardEventHandler<HTMLInputElement | HTMLSelectElement> = (e) => {
  e.stopPropagation();
  const k = e.key;
  if (k === 'Backspace' || k === 'Delete' || k === 'Enter' || k === ' ') {
    // no-op
  }
};

// Helper Components
const Num = ({ label, value, onChange, step = 1, min, max }: { label: string; value: Numish; onChange: (v: Numish) => void; step?: number; min?: number; max?: number; }) => (
  <label className="block">
    {label}
    <input
      type="number"
      step={step}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') onChange('');
        else onChange(raw);
      }}
      onMouseDown={stopAll}
      onClick={stopAll}
      onDoubleClick={stopAll}
      onKeyDown={stopKeys}
    />
  </label>
);

const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; }) => (
  <label className="block">
    {label}
    <select
      className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={stopAll}
      onClick={stopAll}
      onDoubleClick={stopAll}
      onKeyDown={stopKeys}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

type InitMode = 'circle' | 'point' | 'bbox';
type Numish = number | string | null | undefined;

type Params = {
  alpha: Numish; beta: Numish; gamma: Numish; w_line: Numish; w_edge: Numish; max_iterations: Numish; gaussian_blur_ksize: Numish; convergence: Numish;
  init_mode: InitMode; init_cx: Numish; init_cy: Numish; init_radius: Numish; init_points: Numish;
  from_point_x: Numish; from_point_y: Numish;
  bbox_x1: Numish; bbox_y1: Numish; bbox_x2: Numish; bbox_y2: Numish;
};

const DEFAULT_PARAMS: Params = {
  alpha: 0.2, beta: 0.2, gamma: 0.1, w_line: 0.0, w_edge: 1.0, max_iterations: 250, gaussian_blur_ksize: 0, convergence: 0.001,
  init_mode: 'circle', init_cx: null, init_cy: null, init_radius: null, init_points: 400,
  from_point_x: null, from_point_y: null,
  bbox_x1: null, bbox_y1: null, bbox_x2: null, bbox_y2: null
};

const normalizeInitMode = (v?: string): InitMode => {
  if (v === 'auto_circle') return 'circle';
  if (v === 'auto_rect') return 'bbox';
  if (v === 'from_points') return 'point';
  if (v === 'circle' || v === 'point' || v === 'bbox') return v;
  return 'circle';
};

const toInt = (v: Numish, fallback: number) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; };
const toFloat = (v: Numish, fallback: number) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isFinite(n) ? n : fallback; };

const SnakeNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); // ✅ ใช้ useEdges
  const [open, setOpen] = useState(false);
  const [showAdv, setShowAdv] = useState(false);

  // ✅ Check Connection
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const savedParams = useMemo(() => {
    const p = ((data?.payload?.params || {}) as Partial<Params>) ?? {};
    return { ...DEFAULT_PARAMS, ...p, init_mode: normalizeInitMode((p as any).init_mode) };
  }, [data?.payload?.params]);

  const [form, setForm] = useState<Params>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const onRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const onClose = () => { setForm(savedParams); setOpen(false); };

  const onSave = () => {
    const next = { ...form };
    const alpha = toFloat(form.alpha, 0.2); const beta = toFloat(form.beta, 0.2); const gamma = toFloat(form.gamma, 0.1);
    const w_line = toFloat(form.w_line, 0.0); const w_edge = toFloat(form.w_edge, 1.0);
    const max_iterations = Math.max(1, toInt(form.max_iterations, 250));
    const gaussian_blur_ksize = Math.max(0, toInt(form.gaussian_blur_ksize, 0));
    const convergence = Math.max(0, toFloat(form.convergence, 0.001));
    const init_points = Math.max(8, toInt(form.init_points, 400));
    const init_cx = form.init_cx === null || form.init_cx === '' ? null : toInt(form.init_cx, 0);
    const init_cy = form.init_cy === null || form.init_cy === '' ? null : toInt(form.init_cy, 0);
    const init_radius = form.init_radius === null || form.init_radius === '' ? null : Math.max(1, toInt(form.init_radius, 10));
    const from_point_x = form.from_point_x === null || form.from_point_x === '' ? null : toInt(form.from_point_x, 0);
    const from_point_y = form.from_point_y === null || form.from_point_y === '' ? null : toInt(form.from_point_y, 0);
    const bbox_x1 = form.bbox_x1 === null || form.bbox_x1 === '' ? null : toInt(form.bbox_x1, 0);
    const bbox_y1 = form.bbox_y1 === null || form.bbox_y1 === '' ? null : toInt(form.bbox_y1, 0);
    const bbox_x2 = form.bbox_x2 === null || form.bbox_x2 === '' ? null : toInt(form.bbox_x2, 0);
    const bbox_y2 = form.bbox_y2 === null || form.bbox_y2 === '' ? null : toInt(form.bbox_y2, 0);

    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                payload: {
                  ...(n.data?.payload || {}),
                  params: {
                    ...next,
                    alpha, beta, gamma, w_line, w_edge, max_iterations, gaussian_blur_ksize,
                    convergence, init_points, init_cx, init_cy, init_radius,
                    from_point_x, from_point_y, bbox_x1, bbox_y1, bbox_x2, bbox_y2,
                  },
                },
              },
            }
          : n
      )
    );
    setOpen(false);
  };

  const resp = data?.payload?.json as any | undefined;
  const previewUrl =
    (data?.payload?.result_image_url as string | undefined) ||
    (data?.payload?.preview_url as string | undefined) ||
    (resp?.overlay_url as string | undefined) ||
    (resp?.contour_url as string | undefined) ||
    (resp?.mask_url as string | undefined);

  const iterText: number | undefined =
    (resp?.iterations as number | undefined) ??
    (data?.payload?.iterations as number | undefined);

  // ✅ Theme: Pink (ชมพูเสมอ)
  let borderColor = 'border-pink-500';
  if (selected) {
    borderColor = 'border-pink-400 ring-2 ring-pink-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  // ✅ Handle Class Logic
  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;
  const sourceHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-80 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      {/* ✅ แยก Class Input/Output */}
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={sourceHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-pink-400 rounded-t-xl px-3 py-2 flex items-center justify-between">
        <div className="font-bold mr-2">Snake</div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRun}
            disabled={isRunning}
            // ✅ ปุ่มชมพูเสมอ
            className={[
              'ml-1 px-3 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white',
              isRunning
                ? 'bg-yellow-600 cursor-wait opacity-80'
                : 'bg-pink-600 hover:bg-pink-700',
            ].join(' ')}
          >
            ▶ Run
          </button>
          <button
            aria-label="Open settings"
            onClick={() => setOpen(true)}
            className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80"
            title="Settings"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="black" aria-hidden="true">
              <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
                <path d="M3 7h18" />
                <circle cx="9" cy="7" r="3.4" fill="white" />
                <path d="M3 17h18" />
                <circle cx="15" cy="17" r="3.4" fill="white" />
              </g>
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3" onMouseDown={stopAll} onClick={stopAll}>
        <p className="text-sm text-gray-300">
          {previewUrl ? `Done ${iterText ? `(${iterText} iters)` : ''}` : 'Connect Image Input and run'}
        </p>

        {previewUrl && (
          <img
            src={abs(previewUrl)}
            alt="snake"
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

      <Modal open={open} title="Snake Settings" onClose={() => setOpen(false)}>
        <div
          className="space-y-5 text-xs text-gray-300"
          onMouseDown={stopAll}
          onClick={stopAll}
          onDoubleClick={stopAll}
        >
          {/* ===== CORE ===== */}
          <div className="space-y-2">
            <div className="font-semibold text-pink-300">Core</div>
            <div className="grid grid-cols-2 gap-2">
              <Num label="alpha" value={form.alpha} step={0.01} onChange={(v) => setForm((s) => ({ ...s, alpha: v }))} />
              <Num label="beta" value={form.beta} step={0.1} onChange={(v) => setForm((s) => ({ ...s, beta: v }))} />
              <Num label="gamma" value={form.gamma} step={0.01} onChange={(v) => setForm((s) => ({ ...s, gamma: v }))} />
              <Num label="w_edge" value={form.w_edge} step={0.05} onChange={(v) => setForm((s) => ({ ...s, w_edge: v }))} />
              <Num label="w_line" value={form.w_line} step={0.05} onChange={(v) => setForm((s) => ({ ...s, w_line: v }))} />
              <Num label="max_iterations" value={form.max_iterations} min={1} step={1} onChange={(v) => setForm((s) => ({ ...s, max_iterations: v }))} />
              <Num label="gaussian_blur_ksize (0=none)" value={form.gaussian_blur_ksize} min={0} step={1} onChange={(v) => setForm((s) => ({ ...s, gaussian_blur_ksize: v }))} />
            </div>
          </div>

          {/* ===== ADVANCED ===== */}
          <div className="space-y-2">
            <button
              className="px-2 py-1 rounded bg-gray-700 text-gray-100 hover:bg-gray-600"
              onClick={(e) => {
                stopAll(e);
                setShowAdv((s) => !s);
              }}
            >
              {showAdv ? '▾ Advanced (hide)' : '▸ Advanced (show)'}
            </button>

            {showAdv && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Num label="convergence" value={form.convergence} min={0} step={0.0001} onChange={(v) => setForm((s) => ({ ...s, convergence: v }))} />
                </div>

                <div className="space-y-2">
                  <div className="font-semibold text-pink-300">Init</div>
                  <Select label="Init mode" value={form.init_mode} onChange={(v) => setForm((s) => ({ ...s, init_mode: v as InitMode }))} options={[{ label: 'circle', value: 'circle' }, { label: 'point', value: 'point' }, { label: 'bbox', value: 'bbox' }]} />
                  <Num label="init_points" value={form.init_points} min={8} step={1} onChange={(v) => setForm((s) => ({ ...s, init_points: v }))} />
                  
                  {/* Init specific fields */}
                  {form.init_mode === 'circle' && (
                    <div className="grid grid-cols-3 gap-2">
                      <Num label="init_cx" value={form.init_cx} step={1} onChange={(v) => setForm((s) => ({ ...s, init_cx: v }))} />
                      <Num label="init_cy" value={form.init_cy} step={1} onChange={(v) => setForm((s) => ({ ...s, init_cy: v }))} />
                      <Num label="init_radius" value={form.init_radius} min={1} step={1} onChange={(v) => setForm((s) => ({ ...s, init_radius: v }))} />
                    </div>
                  )}
                  {form.init_mode === 'point' && (
                    <div className="grid grid-cols-3 gap-2">
                      <Num label="from_point_x" value={form.from_point_x} step={1} onChange={(v) => setForm((s) => ({ ...s, from_point_x: v }))} />
                      <Num label="from_point_y" value={form.from_point_y} step={1} onChange={(v) => setForm((s) => ({ ...s, from_point_y: v }))} />
                      <Num label="init_radius" value={form.init_radius} min={1} step={1} onChange={(v) => setForm((s) => ({ ...s, init_radius: v }))} />
                    </div>
                  )}
                  {form.init_mode === 'bbox' && (
                    <div className="grid grid-cols-4 gap-2">
                      <Num label="bbox_x1" value={form.bbox_x1} step={1} onChange={(v) => setForm((s) => ({ ...s, bbox_x1: v }))} />
                      <Num label="bbox_y1" value={form.bbox_y1} step={1} onChange={(v) => setForm((s) => ({ ...s, bbox_y1: v }))} />
                      <Num label="bbox_x2" value={form.bbox_x2} step={1} onChange={(v) => setForm((s) => ({ ...s, bbox_x2: v }))} />
                      <Num label="bbox_y2" value={form.bbox_y2} step={1} onChange={(v) => setForm((s) => ({ ...s, bbox_y2: v }))} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-1">
            <button onClick={(e) => { stopAll(e); setForm(DEFAULT_PARAMS); }} className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600" title="Reset to defaults">Reset</button>
            <div className="flex gap-2">
              <button onClick={(e) => { stopAll(e); onClose(); }} className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Close</button>
              <button onClick={(e) => { stopAll(e); onSave(); }} className="px-3 py-1 rounded bg-pink-600 text-white hover:bg-pink-700">Save</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default SnakeNode;