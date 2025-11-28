// src/components/nodes/BFMatcherNode.tsx
import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow'; // ✅ ใช้ useEdges
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

const DEFAULT_PARAMS = {
  norm_type: 'AUTO' as 'AUTO' | 'L2' | 'L1' | 'HAMMING' | 'HAMMING2',
  cross_check: undefined as boolean | undefined,
  lowe_ratio: 0.75,
  ransac_thresh: 5.0,
  draw_mode: 'good' as 'good' | 'inliers',
};
type BFParams = typeof DEFAULT_PARAMS;

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

const BFMatcherNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); // ✅ ใช้ useEdges เพื่อความ Real-time
  const [open, setOpen] = useState(false);
  
  // ✅ เช็ค Connection แยกราย Input (file1, file2)
  const isConnected1 = useMemo(() => edges.some(e => e.target === id && e.targetHandle === 'file1'), [edges, id]);
  const isConnected2 = useMemo(() => edges.some(e => e.target === id && e.targetHandle === 'file2'), [edges, id]);

  const savedParams: BFParams = useMemo(() => {
    const p = (data?.payload?.params || {}) as Partial<BFParams>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.payload?.params]);

  const [form, setForm] = useState<BFParams>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const onClose = () => { setForm(savedParams); setOpen(false); };
  const onSave = () => {
    rf.setNodes(nds =>
      nds.map(n => n.id === id
        ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: { ...form } } } }
        : n
      )
    );
    setOpen(false);
  };

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const onRun = useCallback(() => {
    if (isBusy) return;
    data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  // Alias
  const isBusy = isRunning;

  const visUrl = data?.payload?.vis_url as string | undefined;
  const respJson = data?.payload?.json as any | undefined;

  const inliers =
    typeof respJson?.inliers === 'number'
      ? respJson.inliers
      : respJson?.matching_statistics?.num_inliers;

  const goodCount =
    typeof respJson?.good_matches === 'number'
      ? respJson.good_matches
      : Array.isArray(respJson?.good_matches)
        ? respJson.good_matches.length
        : respJson?.matching_statistics?.num_good_matches;

  const summary =
    respJson?.matching_statistics?.summary ??
    (inliers != null && goodCount != null ? `${inliers} inliers / ${goodCount} good matches` : undefined);

  const { metaA, metaB } = extractInputMeta(respJson || {});
  const usedNorm: string | undefined = respJson?.bfmatcher_parameters_used?.norm_type;
  const usedCross: boolean | undefined = respJson?.bfmatcher_parameters_used?.cross_check;
  const usedDraw: string | undefined = respJson?.bfmatcher_parameters_used?.draw_mode;

  const caption = summary || (visUrl ? 'Matches preview' : 'Connect two feature nodes and run');

  // ✅ Theme: Orange (ส้มเสมอ)
  let borderColor = 'border-orange-500';
  if (selected) {
    borderColor = 'border-orange-400 ring-2 ring-orange-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  // ✅ Helper สร้าง Class ให้ Handle
  const getHandleClass = (connected: boolean) => `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !connected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-88 max-w-sm text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      
      {/* Input 1 (Left Top) - เช็ค isConnected1 */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="file1"
        className={getHandleClass(isConnected1)} 
        style={{ top: '35%', transform: 'translateY(-50%)' }} 
      />
      
      {/* Input 2 (Left Bottom) - เช็ค isConnected2 */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="file2"
        className={getHandleClass(isConnected2)} 
        style={{ top: '65%', transform: 'translateY(-50%)' }} 
      />
      
      {/* Output (Right) - Always Normal (true) */}
      <Handle 
        type="source" 
        position={Position.Right}
        className={getHandleClass(true)} 
        style={{ top: '50%', transform: 'translateY(-50%)' }} 
      />

      {/* Header */}
      <div className="bg-gray-700 text-orange-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">BFMatcher</div>

        <div className="flex items-center gap-2">
          {/* Run Button */}
          <button
            onClick={onRun}
            disabled={isBusy}
            // ✅ ปุ่มเป็นสีส้มเสมอ
            className={[
              'px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white',
              isRunning
                ? 'bg-yellow-600 cursor-wait opacity-80'
                : 'bg-orange-600 hover:bg-orange-700',
            ].join(' ')}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>

          {/* Settings */}
          <span className="relative inline-flex items-center group">
            <button
              aria-label="Open BFMatcher settings"
              onClick={() => setOpen(true)}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center
                         shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80
                         transition focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-orange-500/70"
            >
              <SettingsSlidersIcon />
            </button>
          </span>
        </div>
      </div>

      {/* Body */}
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
            alt="bf-vis"
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
          />
        )}

        {(usedNorm || usedCross !== undefined || usedDraw) && (
          <div className="mt-1 text-[11px] text-gray-300">
            {usedNorm && <span className="mr-2"><span className="text-gray-400">Norm:</span> {usedNorm}</span>}
            {usedCross !== undefined && <span className="mr-2"><span className="text-gray-400">Cross-check:</span> {usedCross ? 'TRUE' : 'FALSE'}</span>}
            {usedDraw && <span><span className="text-gray-400">Draw:</span> {usedDraw}</span>}
          </div>
        )}
      </div>

      {/* Status */}
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

      {/* Settings modal */}
      <Modal open={open} title="BFMatcher Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-300">
          <div className="grid grid-cols-2 gap-3">
            <label>
              Norm
              <select
                className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
                value={form.norm_type}
                onChange={(e) => setForm(s => ({ ...s, norm_type: e.target.value as BFParams['norm_type'] }))}
              >
                <option value="AUTO">AUTO</option>
                <option value="L2">L2 (SIFT/SURF)</option>
                <option value="L1">L1 (SIFT/SURF)</option>
                <option value="HAMMING">HAMMING (ORB)</option>
                <option value="HAMMING2">HAMMING2 (ORB)</option>
              </select>
            </label>

            <label>
              Cross-check
              <select
                className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
                value={form.cross_check === undefined ? 'AUTO' : form.cross_check ? 'TRUE' : 'FALSE'}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm(s => ({ ...s, cross_check: v === 'AUTO' ? undefined : v === 'TRUE' }));
                }}
              >
                <option value="AUTO">AUTO (ORB=true, else=false)</option>
                <option value="TRUE">TRUE (BF.match)</option>
                <option value="FALSE">FALSE (KNN + Lowe)</option>
              </select>
            </label>

            <label>
              Lowe's ratio
              <input
                type="number" step="0.01" min={0} max={1}
                className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
                value={form.lowe_ratio}
                onChange={(e) => setForm(s => ({ ...s, lowe_ratio: Number(e.target.value) }))}
                disabled={form.cross_check === true}
                title={form.cross_check === true ? 'Disabled when cross-check = TRUE' : ''}
              />
            </label>

            <label>
              RANSAC thresh (px)
              <input
                type="number" step="0.1" min={0}
                className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
                value={form.ransac_thresh}
                onChange={(e) => setForm(s => ({ ...s, ransac_thresh: Number(e.target.value) }))}
              />
            </label>

            <label>
              Draw
              <select
                className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100"
                value={form.draw_mode}
                onChange={(e) => setForm(s => ({ ...s, draw_mode: e.target.value as 'good' | 'inliers' }))}
              >
                <option value="good">Good matches</option>
                <option value="inliers">Inliers only</option>
              </select>
            </label>
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

export default BFMatcherNode;