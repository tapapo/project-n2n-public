// src/components/nodes/FLANNMatcherNode.tsx
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';

const handleStyle = { background: '#fff', borderRadius: '50%', width: 8, height: 8, border: '2px solid #6b7280' };
const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

// ==== Settings icon (สไลเดอร์ในวงกลมขาว) ====
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

type FLANNParams = {
  lowe_ratio: number;
  ransac_thresh: number;
  draw_mode: 'good' | 'inliers';
  max_draw?: number | null;
  index_params:
  | { algorithm: number | 'KDTREE' | 'KD_TREE' | 'LSH' | 'AUTO'; trees?: number; table_number?: number; key_size?: number; multi_probe_level?: number }
  | 'AUTO';
  search_params: { checks?: number } | 'AUTO';
};

const DEFAULT_PARAMS: FLANNParams = {
  lowe_ratio: 0.75,
  ransac_thresh: 5.0,
  draw_mode: 'good',
  index_params: 'AUTO',
  search_params: 'AUTO',
};

function makeSizeTextFromInputs(x?: any): string | undefined {
  if (!x) return undefined;
  if (typeof x.width === 'number' && typeof x.height === 'number') return `${x.width} × ${x.height}`;
  return undefined;
}
function shapeToText(sh?: any) {
  if (Array.isArray(sh)) return sh.join(' × ');
  if (typeof sh === 'string') return sh;
  return undefined;
}
function extractInputMeta(respJson: any) {
  const inputs = respJson?.inputs;
  const details = respJson?.input_features_details;
  const aNew = inputs?.image1, bNew = inputs?.image2;
  const aOld = details?.image1, bOld = details?.image2;
  const metaA = {
    file: aOld?.file_name,
    tool: aOld?.feature_tool,
    kps: aOld?.num_keypoints,
    sizeText: makeSizeTextFromInputs(aNew) ?? shapeToText(aOld?.descriptor_shape || aOld?.image_shape),
  };
  const metaB = {
    file: bOld?.file_name,
    tool: bOld?.feature_tool,
    kps: bOld?.num_keypoints,
    sizeText: makeSizeTextFromInputs(bNew) ?? shapeToText(bOld?.descriptor_shape || bOld?.image_shape),
  };
  return { metaA, metaB };
}
function humanIndex(used: any): string | undefined {
  if (!used || !used.index_params) return;
  const ip = used.index_params;
  if (typeof ip !== 'object' || !Object.keys(ip).length) return; // ⬅️ ไม่มีอะไร ไม่ต้องแสดง

  const algo = (ip.algorithm ?? '').toString().toUpperCase();
  if (algo === '1' || algo.includes('KD')) {
    const t = ip.trees ?? 5;
    return `KD-Tree (trees=${t})`;
  }
  if (algo === '6' || algo === 'LSH') {
    const tb = ip.table_number ?? 6;
    const ks = ip.key_size ?? 12;
    const mp = ip.multi_probe_level ?? 1;
    return `LSH (table=${tb}, key=${ks}, multi=${mp})`;
  }
  return; // ⬅️ ไม่รู้จัก ก็ไม่ต้องแสดง
}

function humanSearch(used: any): string | undefined {
  if (!used || !used.search_params) return;
  const sp = used.search_params;
  if (typeof sp !== 'object' || !Object.keys(sp).length) return; // ⬅️ ไม่มีอะไร ไม่ต้องแสดง
  if (typeof sp.checks === 'number') return `checks=${sp.checks}`;
  return;
}

const FLANNMatcherNode = memo(({ id, data }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);

  const savedParams: FLANNParams = useMemo(() => {
    const p = (data?.payload?.params || {}) as Partial<FLANNParams>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.payload?.params]);
  const [form, setForm] = useState<FLANNParams>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const onClose = () => { setForm(savedParams); setOpen(false); };
  const onSave = () => {
    rf.setNodes(nds =>
      nds.map(n =>
        n.id === id
          ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: { ...form } } } }
          : n
      )
    );
    setOpen(false);
  };

  // === Run เฉพาะ node นี้
  const isBusy = data?.status === 'start' || data?.status === 'running';
  const onRun = useCallback(() => {
    if (isBusy) return;
    data?.onRunNode?.(id);
  }, [data, id, isBusy]);

  const visUrl = data?.payload?.vis_url as string | undefined;
  const respJson = data?.payload?.json as any | undefined;

  const inliers =
    typeof respJson?.inliers === 'number'
      ? respJson.inliers
      : respJson?.matching_statistics?.num_inliers;

  const goodCount =
    respJson?.matching_statistics?.num_good_matches ??
    (Array.isArray(respJson?.good_matches) ? respJson.good_matches.length : undefined);

  const caption =
    respJson?.matching_statistics?.summary ??
    (inliers != null && goodCount != null
      ? `${inliers} inliers / ${goodCount} good matches`
      : visUrl
        ? 'Matches preview'
        : 'Connect two feature nodes and run');;

  const { metaA, metaB } = extractInputMeta(respJson || {});
  const used = respJson?.flann_parameters_used;
  const usedIndexPretty = humanIndex(used);
  const usedSearchPretty = humanSearch(used);

  return (
    <div className="bg-gray-800 border-2 border-orange-500 rounded-xl shadow-2xl w-88 max-w-sm text-gray-200 overflow-visible">
      {/* ports */}
      <Handle type="target" position={Position.Left} id="file1" style={{ ...handleStyle, top: '35%', transform: 'translateY(-50%)' }} />
      <Handle type="target" position={Position.Left} id="file2" style={{ ...handleStyle, top: '65%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />

      {/* header */}
      <div className="bg-gray-700 text-orange-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">FLANN Matcher</div>

        <div className="flex items-center gap-2">
          {/* Run this node */}
          <button
            title="Run this node"
            onClick={onRun}
            disabled={isBusy}
            className={[
              'px-2 py-1 rounded text-xs font-semibold transition-colors',
              isBusy ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 text-white',
            ].join(' ')}
          >
            ▶ Run
          </button>

          {/* Settings: วงกลมพื้นขาว ขอบเทา */}
          <span className="relative inline-flex items-center group">
            <button
              aria-label="Open FLANN settings"
              onClick={() => setOpen(true)}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center
               shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80
               transition focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-orange-500/70"
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

      {/* body */}
      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-300">{caption}</p>

        {(metaA.kps != null || metaA.sizeText || metaB.kps != null || metaB.sizeText) && (
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="rounded border border-gray-700 p-2">
              <div className="text-gray-400 mb-1">Input A</div>
              {metaA.kps != null && <div className="text-gray-300">Keypoints: {metaA.kps}</div>}
              {metaA.sizeText && <div className="text-gray-300">Size: {metaA.sizeText}</div>}
            </div>
            <div className="rounded border border-gray-700 p-2">
              <div className="text-gray-400 mb-1">Input B</div>
              {metaB.kps != null && <div className="text-gray-300">Keypoints: {metaB.kps}</div>}
              {metaB.sizeText && <div className="text-gray-300">Size: {metaB.sizeText}</div>}
            </div>
          </div>
        )}

        {visUrl && (
          <img
            src={abs(visUrl)}
            alt="flann-vis"
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
          />
        )}

        {(usedIndexPretty || usedSearchPretty) && (
          <div className="mt-1 text-[11px] text-gray-300 space-y-1">
            {usedIndexPretty && <div><span className="text-gray-400">Index:</span> {usedIndexPretty}</div>}
            {usedSearchPretty && <div><span className="text-gray-400">Search:</span> {usedSearchPretty}</div>}
          </div>
        )}
      </div>

      {/* status */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      {/* settings modal */}
      <Modal open={open} title="FLANN Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <label>
              Lowe's ratio
              <input
                type="number" step="0.01" min={0} max={1}
                className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                value={form.lowe_ratio}
                onChange={(e) => setForm(s => ({ ...s, lowe_ratio: Number(e.target.value) }))}
              />
            </label>
            <label>
              RANSAC thresh (px)
              <input
                type="number" step="0.1" min={0}
                className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                value={form.ransac_thresh}
                onChange={(e) => setForm(s => ({ ...s, ransac_thresh: Number(e.target.value) }))}
              />
            </label>
            <label>
              Draw mode
              <select
                className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                value={form.draw_mode}
                onChange={(e) => setForm(s => ({ ...s, draw_mode: e.target.value as FLANNParams['draw_mode'] }))}
              >
                <option value="good">Good matches</option>
                <option value="inliers">Inliers only</option>
              </select>
            </label>
            
          </div>

          {/* Index params */}
          <div className="rounded border border-gray-700 p-2">
            <div className="mb-2 text-gray-300">Index params</div>
            <div className="grid grid-cols-2 gap-3">
              <label>
                Algorithm
                <select
                  className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                  value={
                    form.index_params === 'AUTO'
                      ? 'AUTO'
                      : (typeof (form.index_params as any).algorithm === 'string'
                        ? (form.index_params as any).algorithm.toUpperCase()
                        : String((form.index_params as any).algorithm))
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'AUTO') {
                      setForm(s => ({ ...s, index_params: 'AUTO' }));
                    } else if (v === 'KDTREE' || v === 'KD_TREE') {
                      setForm(s => ({ ...s, index_params: { algorithm: 'KDTREE', trees: 5 } }));
                    } else if (v === 'LSH') {
                      setForm(s => ({ ...s, index_params: { algorithm: 'LSH', table_number: 6, key_size: 12, multi_probe_level: 1 } }));
                    }
                  }}
                >
                  <option value="AUTO">AUTO</option>
                  <option value="KDTREE">KD-Tree (SIFT/SURF)</option>
                  <option value="LSH">LSH (ORB)</option>
                </select>
              </label>

              {form.index_params !== 'AUTO' && (form.index_params as any).algorithm &&
                String((form.index_params as any).algorithm).toUpperCase().includes('KD') && (
                  <label>
                    trees
                    <input
                      type="number" min={1}
                      className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                      value={(form.index_params as any).trees ?? 5}
                      onChange={(e) => setForm(s => ({
                        ...s,
                        index_params: { ...(s.index_params as any), algorithm: 'KDTREE', trees: Number(e.target.value) }
                      }))}
                    />
                  </label>
                )}

              {form.index_params !== 'AUTO' && String((form.index_params as any).algorithm).toUpperCase() === 'LSH' && (
                <>
                  <label>
                    table_number
                    <input
                      type="number" min={1}
                      className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                      value={(form.index_params as any).table_number ?? 6}
                      onChange={(e) => setForm(s => ({
                        ...s,
                        index_params: { ...(s.index_params as any), algorithm: 'LSH', table_number: Number(e.target.value) }
                      }))}
                    />
                  </label>
                  <label>
                    key_size
                    <input
                      type="number" min={1}
                      className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                      value={(form.index_params as any).key_size ?? 12}
                      onChange={(e) => setForm(s => ({
                        ...s,
                        index_params: { ...(s.index_params as any), algorithm: 'LSH', key_size: Number(e.target.value) }
                      }))}
                    />
                  </label>
                  <label>
                    multi_probe_level
                    <input
                      type="number" min={0}
                      className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                      value={(form.index_params as any).multi_probe_level ?? 1}
                      onChange={(e) => setForm(s => ({
                        ...s,
                        index_params: { ...(s.index_params as any), algorithm: 'LSH', multi_probe_level: Number(e.target.value) }
                      }))}
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Search params */}
          <div className="rounded border border-gray-700 p-2">
            <div className="mb-2 text-gray-300">Search params</div>
            <div className="grid grid-cols-2 gap-3">
              <label>
                Mode
                <select
                  className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                  value={form.search_params === 'AUTO' ? 'AUTO' : 'CUSTOM'}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm(s => ({
                      ...s,
                      search_params: v === 'AUTO' ? 'AUTO' : { checks: 50 },
                    }));
                  }}
                >
                  <option value="AUTO">AUTO</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </label>

              {form.search_params !== 'AUTO' && (
                <label>
                  checks
                  <input
                    type="number" min={1}
                    className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                    value={(form.search_params as any).checks ?? 50}
                    onChange={(e) =>
                      setForm(s => ({ ...s, search_params: { checks: Number(e.target.value) } }))
                    }
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button onClick={onClose} className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Close</button>
            <button onClick={onSave} className="px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default FLANNMatcherNode;