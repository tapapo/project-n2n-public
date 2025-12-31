import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
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

const FLANNMatcherNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  const isConnected1 = useMemo(() => edges.some(e => e.target === id && e.targetHandle === 'file1'), [edges, id]);
  const isConnected2 = useMemo(() => edges.some(e => e.target === id && e.targetHandle === 'file2'), [edges, id]);

  const params = useMemo(() => ({ ...DEFAULT_PARAMS, ...(data?.payload?.params || {}) }), [data?.payload?.params]);
  const [form, setForm] = useState<FLANNParams>(params);
  useEffect(() => setForm(params), [params]);

  const onClose = () => { setForm(params); setOpen(false); };
  
  const onSave = useCallback(() => {
    rf.setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, payload: { ...n.data?.payload, params: form } } } : n));
    setOpen(false);
  }, [rf, id, form]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';
  const isBusy = isRunning;

  const onRun = useCallback(() => {
    if (isBusy) return;
    data?.onRunNode?.(id);
  }, [data, id, isBusy]);

  const visUrl = data?.payload?.vis_url as string | undefined;
  const respJson = data?.payload?.json as any | undefined;

  // Logic ดึงข้อมูลหลังรัน
  const getMeta = (imgKey: 'image1' | 'image2') => {
    if (!respJson) return null;
    const featDetails = respJson?.input_features_details?.[imgKey];
    const inputDetails = respJson?.inputs?.[imgKey];
    
    let w = featDetails?.width || inputDetails?.width;
    let h = featDetails?.height || inputDetails?.height;
    const shape = featDetails?.image_shape || inputDetails?.image_shape;
    if (!w && Array.isArray(shape)) { h = shape[0]; w = shape[1]; }

    const kps = featDetails?.num_keypoints || featDetails?.kps_count;
    return { size: (w && h) ? `${w}×${h}px` : null, kps: kps ?? null };
  };

  const metaA = getMeta('image1');
  const metaB = getMeta('image2');

  // ✅ แก้ไข Logic Caption: ดึงข้อความมาแล้วลบ (FLANN) ออกอย่างเด็ดขาด
  const rawSummary = (data?.description && !/(running|start)/i.test(data?.description)) 
    ? data.description 
    : respJson?.matching_statistics?.summary;

  const caption = rawSummary 
    ? rawSummary.replace(/\(FLANN\)/gi, '').trim() 
    : (visUrl ? 'Matches preview' : 'Connect feature nodes and run');

  let borderColor = 'border-orange-500'; 
  if (selected) borderColor = 'border-orange-400 ring-2 ring-orange-500'; 
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50'; 

  const getHandleClass = (connected: boolean) => `w-2 h-2 rounded-full border-2 transition-all duration-300 ${isFault && !connected ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' : 'bg-white border-gray-500'}`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 max-w-sm text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      
      <Handle type="target" position={Position.Left} id="file1" className={getHandleClass(isConnected1)} style={{ top: '35%', transform: 'translateY(-50%)' }} />
      <Handle type="target" position={Position.Left} id="file2" className={getHandleClass(isConnected2)} style={{ top: '65%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={getHandleClass(true)} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-orange-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">FLANN Matcher</div>
        <div className="flex items-center gap-2">
          {/* ปุ่ม RUN */}
          <button onClick={onRun} disabled={isBusy} className={['px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white', isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-orange-600 hover:bg-orange-700'].join(' ')}>
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          {/* Settings + Tooltip */}
          <span className="relative inline-flex items-center group">
            <button aria-label="Open FLANN settings" onClick={() => setOpen(true)} className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70">
                <SettingsSlidersIcon />
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100 z-50 font-normal">
                Settings
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-300">{caption}</p>

        {(isConnected1 || isConnected2 || metaA?.kps != null || metaB?.kps != null) && (
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            {/* Input A */}
            <div className={`rounded border p-2 transition-colors flex flex-col justify-center ${isConnected1 ? 'border-gray-600 bg-gray-800/50' : 'border-gray-700 border-dashed opacity-50'}`}>
              <div className="text-gray-400 mb-1 truncate font-semibold border-b border-gray-700 pb-1" title="Input A">Input A</div>
              {metaA?.size || metaA?.kps ? (
                <div className="text-gray-200 font-mono text-[10px]">
                  <div>{metaA?.size || '-'}</div>
                  <div className="text-green-300 mt-0.5">Kps: {metaA?.kps || '-'}</div>
                </div>
              ) : <div className="text-gray-500">-</div>}
            </div>
            
            {/* Input B */}
            <div className={`rounded border p-2 transition-colors flex flex-col justify-center ${isConnected2 ? 'border-gray-600 bg-gray-800/50' : 'border-gray-700 border-dashed opacity-50'}`}>
              <div className="text-gray-400 mb-1 truncate font-semibold border-b border-gray-700 pb-1" title="Input B">Input B</div>
              {metaB?.size || metaB?.kps ? (
                <div className="text-gray-200 font-mono text-[10px]">
                  <div>{metaB?.size || '-'}</div>
                  <div className="text-green-300 mt-0.5">Kps: {metaB?.kps || '-'}</div>
                </div>
              ) : <div className="text-gray-500">-</div>}
            </div>
          </div>
        )}

        {visUrl && (
          <img src={abs(visUrl)} alt="flann-vis" className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
        )}
      </div>

      {/* Status Table */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      {/* Modal Settings */}
      <Modal open={open} title="FLANN Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <label>Lowe's ratio <input type="number" step="0.01" min={0} max={1} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={form.lowe_ratio} onChange={(e) => setForm(s => ({ ...s, lowe_ratio: Number(e.target.value) }))} /></label>
            <label>RANSAC thresh (px) <input type="number" step="0.1" min={0} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={form.ransac_thresh} onChange={(e) => setForm(s => ({ ...s, ransac_thresh: Number(e.target.value) }))} /></label>
            <label>Draw mode <select className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={form.draw_mode} onChange={(e) => setForm(s => ({ ...s, draw_mode: e.target.value as FLANNParams['draw_mode'] }))}><option value="good">Good matches</option><option value="inliers">Inliers only</option></select></label>
          </div>
          <div className="rounded border border-gray-700 p-2"><div className="mb-2 text-gray-300">Index params</div><div className="grid grid-cols-2 gap-3"><label>Algorithm <select className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={form.index_params === 'AUTO' ? 'AUTO' : (typeof (form.index_params as any).algorithm === 'string' ? (form.index_params as any).algorithm.toUpperCase() : String((form.index_params as any).algorithm))} onChange={(e) => { const v = e.target.value; if (v === 'AUTO') { setForm(s => ({ ...s, index_params: 'AUTO' })); } else if (v === 'KDTREE' || v === 'KD_TREE') { setForm(s => ({ ...s, index_params: { algorithm: 'KDTREE', trees: 5 } })); } else if (v === 'LSH') { setForm(s => ({ ...s, index_params: { algorithm: 'LSH', table_number: 6, key_size: 12, multi_probe_level: 1 } })); } }}><option value="AUTO">AUTO</option><option value="KDTREE">KD-Tree (SIFT/SURF)</option><option value="LSH">LSH (ORB)</option></select></label>{form.index_params !== 'AUTO' && (form.index_params as any).algorithm && String((form.index_params as any).algorithm).toUpperCase().includes('KD') && ( <label> trees <input type="number" min={1} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={(form.index_params as any).trees ?? 5} onChange={(e) => setForm(s => ({ ...s, index_params: { ...(s.index_params as any), algorithm: 'KDTREE', trees: Number(e.target.value) } }))} /> </label> )}{form.index_params !== 'AUTO' && String((form.index_params as any).algorithm).toUpperCase() === 'LSH' && ( <> <label> table_number <input type="number" min={1} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={(form.index_params as any).table_number ?? 6} onChange={(e) => setForm(s => ({ ...s, index_params: { ...(s.index_params as any), algorithm: 'LSH', table_number: Number(e.target.value) } }))} /> </label> <label> key_size <input type="number" min={1} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={(form.index_params as any).key_size ?? 12} onChange={(e) => setForm(s => ({ ...s, index_params: { ...(s.index_params as any), algorithm: 'LSH', key_size: Number(e.target.value) } }))} /> </label> <label> multi_probe_level <input type="number" min={0} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={(form.index_params as any).multi_probe_level ?? 1} onChange={(e) => setForm(s => ({ ...s, index_params: { ...(s.index_params as any), algorithm: 'LSH', multi_probe_level: Number(e.target.value) } }))} /> </label> </> )}</div></div>
          <div className="rounded border border-gray-700 p-2"><div className="mb-2 text-gray-300">Search params</div><div className="grid grid-cols-2 gap-3"><label>Mode <select className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={form.search_params === 'AUTO' ? 'AUTO' : 'CUSTOM'} onChange={(e) => { const v = e.target.value; setForm(s => ({ ...s, search_params: v === 'AUTO' ? 'AUTO' : { checks: 50 }, })); }}><option value="AUTO">AUTO</option><option value="CUSTOM">Custom</option></select></label>{form.search_params !== 'AUTO' && ( <label> checks <input type="number" min={1} className="w-full mt-1 px-2 py-1 rounded bg-gray-900 border border-gray-700" value={(form.search_params as any).checks ?? 50} onChange={(e) => setForm(s => ({ ...s, search_params: { checks: Number(e.target.value) } }))} /> </label> )}</div></div>
          <div className="flex justify-end gap-2 pt-3"><button onClick={onClose} className="px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Close</button><button onClick={onSave} className="px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700">Save</button></div>
        </div>
      </Modal>
    </div>
  );
});

export default FLANNMatcherNode;