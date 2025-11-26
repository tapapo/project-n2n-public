import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';

const handleStyle = { background: '#fff', borderRadius: '50%', width: 8, height: 8, border: '2px solid #6b7280' };
const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

const DEFAULT_PARAMS = {
  warp_mode: 'image2_to_image1' as 'image2_to_image1' | 'image1_to_image2',
  blend: false,
};
type Params = typeof DEFAULT_PARAMS;

const isWebReachable = (p?: string) => !!p && /^(https?:|blob:|data:|\/static\/)/i.test(p);

const HomographyAlignNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);

  const savedParams: Params = useMemo(() => {
    const p = (data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.payload?.params]);

  const [form, setForm] = useState<Params>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const onClose = () => { setForm(savedParams); setOpen(false); };
  const onSave = () => {
    rf.setNodes(nds =>
      nds.map(n => n.id === id ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: { ...form } } } } : n)
    );
    setOpen(false);
  };

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const onRun = useCallback(() => {
    if (isRunning) return;
    data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const respJson = data?.payload?.json as any | undefined;
  const alignedFromUrl = respJson?.output?.aligned_url as string | undefined;
  const alignedFromImage = respJson?.output?.aligned_image as string | undefined;
  const chosenAligned = (isWebReachable(alignedFromUrl) ? alignedFromUrl : undefined) ?? (isWebReachable(alignedFromImage) ? alignedFromImage : undefined);
  const alignedUrl = chosenAligned ? abs(chosenAligned) : undefined;
  const inliers = typeof respJson?.num_inliers === 'number' ? respJson.num_inliers : undefined;
  const warpMode = typeof respJson?.warp_mode === 'string' ? respJson.warp_mode : undefined;
  const blend = typeof respJson?.blend === 'boolean' ? respJson.blend : undefined;

  const caption = alignedUrl ? `Alignment complete${inliers != null ? ` — ${inliers} inliers` : ''}` : 'Connect a Matcher node and run';

  // ✅ FIXED: ม่วงเสมอ
  let borderColor = 'border-purple-500';
  if (selected) {
    borderColor = 'border-purple-400 ring-2 ring-purple-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-88 max-w-sm text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-purple-500 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">Homography Align</div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={isRunning}
            // ✅ FIXED: ปุ่มม่วงเสมอ
            className={[
              'px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white',
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-purple-600 hover:bg-purple-700',
            ].join(' ')}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          <button onClick={() => setOpen(true)} className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80 transition-all">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="black"><g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}><path d="M3 7h18" /><circle cx="9" cy="7" r="3.4" fill="white" /><path d="M3 17h18" /><circle cx="15" cy="17" r="3.4" fill="white" /></g></svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-300">{caption}</p>
        {alignedUrl ? ( <a href={alignedUrl} target="_blank" rel="noreferrer"><img src={alignedUrl} alt="aligned" className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} /></a> ) : ( respJson?.output && <div className="text-xs text-amber-300">No web-served image URL.</div> )}
        {(warpMode || blend !== undefined) && (
          <div className="mt-1 text-[11px] text-gray-300 flex flex-wrap gap-2">
            {warpMode && <span className="px-2 py-0.5 rounded bg-gray-900/70 border border-gray-700">Warp: <span className="text-gray-100">{warpMode}</span></span>}
            {blend !== undefined && <span className="px-2 py-0.5 rounded bg-gray-900/70 border border-gray-700">Blend: <span className="text-gray-100">{blend ? 'ON' : 'OFF'}</span></span>}
          </div>
        )}
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="Homography Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-300">
          <label>Warp mode<select className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100" value={form.warp_mode} onChange={(e) => setForm(s => ({ ...s, warp_mode: e.target.value as Params['warp_mode'] }))}><option value="image2_to_image1">Img2 → Img1</option><option value="image1_to_image2">Img1 → Img2</option></select></label>
          <label className="flex items-center gap-2 mt-1"><input type="checkbox" checked={form.blend} onChange={(e) => setForm(s => ({ ...s, blend: e.target.checked }))} />Blend overlay</label>
          <div className="flex justify-end gap-2 pt-3"><button onClick={onClose} className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Close</button><button onClick={onSave} className="px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-700">Save</button></div>
        </div>
      </Modal>
    </div>
  );
});

export default HomographyAlignNode;