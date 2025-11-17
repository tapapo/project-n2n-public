// src/components/nodes/AffineAlignNode.tsx
import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';

const handleStyle = {
  background: '#fff',
  borderRadius: '50%',
  width: 8,
  height: 8,
  border: '2px solid #6b7280',
};
const dot = (active: boolean, cls: string) =>
  `h-4 w-4 rounded-full ${active ? cls : 'bg-gray-600'} flex-shrink-0`;

type Params = {
  model: 'affine' | 'partial';
  warp_mode: 'image2_to_image1' | 'image1_to_image2';
  blend: boolean;
  ransac_thresh: number;
  confidence: number;
  refine_iters: number;
};

const DEFAULT_PARAMS: Params = {
  model: 'affine',
  warp_mode: 'image2_to_image1',
  blend: false,
  ransac_thresh: 3.0,
  confidence: 0.99,
  refine_iters: 10,
};

const AffineAlignNode = memo(({ id, data }: NodeProps<CustomNodeData>) => {
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

  const onClose = () => {
    setForm(savedParams);
    setOpen(false);
  };
  const onSave = () => {
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                payload: {
                  ...(n.data?.payload || {}),
                  params: { ...form },
                },
              },
            }
          : n
      )
    );
    setOpen(false);
  };

  // -------- ผลลัพธ์จาก runner ----------
  const resp = data?.payload?.json as any | undefined;

  const alignedUrl: string | undefined =
    (data?.payload?.aligned_url as string | undefined) ||
    (resp?.output?.aligned_url as string | undefined);

  const inliers = resp?.num_inliers;

  // ดึงค่า model/warp/blend จาก resp ถ้าไม่มีใช้ค่าที่เซฟไว้
  const model: Params['model'] =
    (resp?.model as Params['model'] | undefined) ?? savedParams.model;
  const warpMode: Params['warp_mode'] =
    (resp?.warp_mode as Params['warp_mode'] | undefined) ??
    savedParams.warp_mode;
  const blend: boolean =
    typeof resp?.blend === 'boolean' ? resp.blend : savedParams.blend;

  return (
    <div className="bg-gray-800 border-2 border-purple-500 rounded-xl shadow-2xl w-88 max-w-sm text-gray-200 overflow-visible">
      {/* handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* header */}
      <div className="bg-gray-700 text-purple-500 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">Affine Align</div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={isBusy}
            className={[
              'px-2 py-1 rounded text-xs font-semibold transition-colors',
              isBusy
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white',
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
            {/* icon */}
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="black"
              aria-hidden="true"
            >
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
          {alignedUrl
            ? `Alignment complete — ${inliers ?? '?'} inliers`
            : 'Connect a Matcher node and run'}
        </p>

        {alignedUrl && (
          <img
            src={abs(alignedUrl)}
            alt="affine-aligned"
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
          />
        )}

        {/* model (บรรทัดแรก) + warp/blend (บรรทัดถัดไป) */}
        <div className="mt-1 text-[11px] text-gray-300">
          <div className="mb-1">
            <span className="px-2 py-0.5 rounded bg-gray-900/70 border border-gray-700">
              Model:{' '}
              <span className="text-gray-100">
                {model === 'partial' ? 'partial' : 'affine'}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-0.5 rounded bg-gray-900/70 border border-gray-700">
              Warp:{' '}
              <span className="text-gray-100">
                {warpMode === 'image2_to_image1'
                  ? 'image2_to_image1'
                  : 'image1_to_image2'}
              </span>
            </span>

            <span className="px-2 py-0.5 rounded bg-gray-900/70 border border-gray-700">
              Blend:{' '}
              <span className="text-gray-100">{blend ? 'ON' : 'OFF'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* status */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className={dot(data?.status === 'start', 'bg-red-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-cyan-400">running</span>
          <div
            className={dot(
              data?.status === 'running',
              'bg-cyan-400 animate-pulse'
            )}
          />
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
      <Modal open={open} title="Affine Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-300">
          <label>
            Model
            <select
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.model}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  model: e.target.value as Params['model'],
                }))
              }
            >
              <option value="affine">Affine (6-DoF)</option>
              <option value="partial">Partial (shearless)</option>
            </select>
          </label>

          <label>
            Warp mode
            <select
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.warp_mode}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  warp_mode: e.target.value as Params['warp_mode'],
                }))
              }
            >
              <option value="image2_to_image1">Image2 → Image1</option>
              <option value="image1_to_image2">Image1 → Image2</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.blend}
              onChange={(e) =>
                setForm((s) => ({ ...s, blend: e.target.checked }))
              }
            />
            Blend overlay
          </label>

          <label className="block">
            RANSAC threshold (px)
            <input
              type="number"
              step="0.1"
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.ransac_thresh}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  ransac_thresh: Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="block">
            Confidence (0–1)
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.confidence}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  confidence: Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="block">
            Refine iters
            <input
              type="number"
              className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
              value={form.refine_iters}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  refine_iters: Number(e.target.value),
                }))
              }
            />
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
              className="px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-700"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default AffineAlignNode;