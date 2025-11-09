// src/components/nodes/OtsuNode.tsx
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs } from '../../lib/api';
import Modal from '../common/Modal';

const handleStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '50%',
  width: 8,
  height: 8,
  border: '2px solid #6b7280',
};
const dot = (active: boolean, cls: string) => `h-4 w-4 rounded-full ${active ? cls : 'bg-gray-600'} flex-shrink-0`;

type Params = {
  gaussian_blur: boolean;
  blur_ksize: number; // odd only
  invert: boolean;
};

const DEFAULT_PARAMS: Params = {
  gaussian_blur: false,
  blur_ksize: 5,
  invert: false,
};

const OtsuNode = memo(({ id, data }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);

  const savedParams = useMemo<Params>(() => {
    const p = (data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.payload?.params]);

  const [form, setForm] = useState<Params>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const isBusy = data?.status === 'start' || data?.status === 'running';
  const onRun = useCallback(() => {
    if (!isBusy) data?.onRunNode?.(id);
  }, [data, id, isBusy]);

  const onClose = () => { setForm(savedParams); setOpen(false); };
  const onSave = () => {
    const k = Math.max(3, Math.floor(form.blur_ksize));
    const oddK = k % 2 === 0 ? k + 1 : k;

    rf.setNodes(nds =>
      nds.map(n =>
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

  // read response / preview จาก payload
  const resp = data?.payload?.json as any | undefined;
  const previewUrl: string | undefined =
    (data?.payload?.result_image_url as string | undefined) ||
    (data?.payload?.preview_url as string | undefined) ||
    (resp?.binary_url as string | undefined);

  const thr = (resp?.threshold ?? undefined) as number | undefined;

  return (
    <div className="bg-gray-800 border-2 border-pink-500 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible">
      <Handle type="target" position={Position.Left}
        style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right}
        style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />

      {/* header */}
      <div className="bg-gray-700 text-pink-400 rounded-t-xl px-3 py-2 flex items-center justify-between">
        <div className="font-bold mr-2">Otsu Threshold</div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRun}
            disabled={isBusy}
            className={[
              'ml-1 px-3 py-1 rounded text-xs font-semibold transition-colors',
              isBusy ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-pink-600 hover:bg-pink-700 text-white',
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

      {/* body */}
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

      {/* status */}
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

      {/* settings modal */}
      <Modal open={open} title="Otsu Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.gaussian_blur}
              onChange={(e) => setForm((s) => ({ ...s, gaussian_blur: e.target.checked }))}
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
              onChange={(e) => setForm((s) => ({ ...s, blur_ksize: Number(e.target.value) }))}
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.invert}
              onChange={(e) => setForm((s) => ({ ...s, invert: e.target.checked }))}
            />
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