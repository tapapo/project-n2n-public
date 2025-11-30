import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs } from '../../lib/api';
import Modal from '../common/Modal';

const dot = (active: boolean, cls: string) =>
  `h-4 w-4 rounded-full ${active ? cls : 'bg-gray-600'} flex-shrink-0`;

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
  const [open, setOpen] = useState(false);

  // ✅ Check connection
  const isConnected = useMemo(() => edges.some((e) => e.target === id), [edges, id]);

  const savedParams = useMemo(
    () => ({ ...DEFAULT_PARAMS, ...(data?.payload?.params || {}) }),
    [data?.payload?.params]
  );
  const [form, setForm] = useState<Params>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const onRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const onClose = () => {
    setForm(savedParams);
    setOpen(false);
  };

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
  const previewUrl =
    (data?.payload?.result_image_url as string | undefined) ||
    (data?.payload?.preview_url as string | undefined) ||
    (resp?.binary_url as string | undefined);
  const thr = resp?.threshold;

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
  const sourceHandleClass =
    'w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500';

  return (
    <div
      className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}
    >
      {/* Input Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        className={targetHandleClass}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* Output Handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        className={sourceHandleClass}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* Header */}
      <div className="bg-gray-700 text-pink-400 rounded-t-xl px-3 py-2 flex items-center justify-between">
        <div className="font-bold mr-2">Otsu Threshold</div>

        <div className="flex items-center gap-3">
          {/* ▶ Run */}
          <button
            onClick={onRun}
            disabled={isRunning}
            className={[
              'ml-1 px-3 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white',
              isRunning
                ? 'bg-yellow-600 cursor-wait opacity-80'
                : 'bg-pink-600 hover:bg-pink-700',
            ].join(' ')}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>

          {/* ⚙ Settings with Tooltip */}
          <span className="relative inline-flex items-center group">
            <button
              aria-label="Open Otsu settings"
              onClick={() => setOpen(true)}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center
                         shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80
                         transition focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-pink-500/70"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="black">
                <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
                  <path d="M3 7h18" />
                  <circle cx="9" cy="7" r="3.4" fill="white" />
                  <path d="M3 17h18" />
                  <circle cx="15" cy="17" r="3.4" fill="white" />
                </g>
              </svg>
            </button>

            {/* ✅ Tooltip */}
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

      {/* Content */}
      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-300">
          {previewUrl ? `Threshold = ${thr ?? '?'}` : 'Connect Image Input and run'}
        </p>

        {previewUrl && (
          <img
            src={abs(previewUrl)}
            alt="otsu"
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
          />
        )}
      </div>

      {/* Footer Status */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className={dot(data?.status === 'start', 'bg-red-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-cyan-400">running</span>
          <div className={dot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          <div className={dot(data?.status === 'success', 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          <div className={dot(data?.status === 'fault', 'bg-yellow-500')} />
        </div>
      </div>

      {/* ⚙ Modal Settings */}
      <Modal open={open} title="Otsu Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.gaussian_blur}
              onChange={(e) =>
                setForm((s: Params) => ({ ...s, gaussian_blur: e.target.checked }))
              }
            />
            Gaussian blur before threshold
          </label>

          <label className="block">
            Blur kernel size (odd)
            <input
              type="number"
              min={3}
              step={2}
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.blur_ksize}
              onChange={(e) =>
                setForm((s: Params) => ({ ...s, blur_ksize: Number(e.target.value) }))
              }
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.invert}
              onChange={(e) => setForm((s: Params) => ({ ...s, invert: e.target.checked }))}
            />
            Invert output
          </label>

          <div className="flex justify-end gap-2 pt-3">
            <button
              onClick={onClose}
              className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
            >
              Close
            </button>
            <button
              onClick={onSave}
              className="px-3 py-1 rounded bg-pink-600 text-white hover:bg-pink-700"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default OtsuNode;