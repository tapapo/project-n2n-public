// File: my-react-flow-app/src/components/nodes/SnakeNode.tsx
import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges, useNodes } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import { abs } from '../../lib/api'; 
import Modal from '../common/Modal';
import { getNodeImageUrl } from '../../lib/runners/utils';

/* --- Helpers (Master Design) --- */
const statusDot = (active: boolean, color: string) => 
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner transition-colors duration-200`;

const SettingsSlidersIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="black" aria-hidden="true">
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
      <path d="M3 7h18" /><circle cx="9" cy="7" r="3.4" fill="white" />
      <path d="M3 17h18" /><circle cx="15" cy="17" r="3.4" fill="white" />
    </g>
  </svg>
);

const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();
const stopKeys: React.KeyboardEventHandler<HTMLInputElement | HTMLSelectElement> = (e) => {
  e.stopPropagation();
  const k = e.key;
  if (k === 'Backspace' || k === 'Delete' || k === 'Enter' || k === ' ') {}
};

// --- Types ---
type InitMode = 'circle' | 'point' | 'bbox';
type Numish = number | string | null | undefined;

type Params = {
  alpha: Numish; beta: Numish; gamma: Numish; w_line: Numish; w_edge: Numish;
  max_iterations: Numish; gaussian_blur_ksize: Numish; convergence: Numish;
  init_mode: InitMode; init_cx: Numish; init_cy: Numish; init_radius: Numish; init_points: Numish;
  from_point_x: Numish; from_point_y: Numish;
  bbox_x1: Numish; bbox_y1: Numish; bbox_x2: Numish; bbox_y2: Numish;
  real_width?: number;
  real_height?: number;
};

// --- Helpers ---
const normalize = (v?: string): InitMode => {
  if (v === 'auto_circle') return 'circle';
  if (v === 'auto_rect') return 'bbox';
  if (v === 'from_points') return 'point';
  if (v === 'circle' || v === 'point' || v === 'bbox') return v;
  return 'circle';
};

const toInt = (v: any, fallback: number) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const toFloat = (v: any, fallback: number) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// --- Helper Components (Updated to match Master Design Style) ---
interface NumProps { label: string; value: Numish; onChange: (v: Numish) => void; step?: number; min?: number; max?: number; }
const Num = ({ label, value, onChange, step = 1, min, max }: NumProps) => (
  <label className="block">
    <span className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">{label}</span>
    <input
      type="number"
      step={step}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-pink-400 font-mono outline-none focus:border-pink-500"
      value={value ?? ''}
      onChange={(e) => { const raw = e.target.value; if (raw === '') onChange(''); else onChange(raw); }}
      onMouseDown={stopAll} onClick={stopAll} onDoubleClick={stopAll} onKeyDown={stopKeys}
    />
  </label>
);

interface SelectProps { label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; }
const Select = ({ label, value, onChange, options }: SelectProps) => (
  <label className="block">
    <span className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">{label}</span>
    <select
      className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-pink-400 font-mono outline-none focus:border-pink-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={stopAll} onClick={stopAll} onDoubleClick={stopAll} onKeyDown={stopKeys}
    >
      {options.map((o) => ( <option key={o.value} value={o.value}> {o.label} </option> ))}
    </select>
  </label>
);

const DEFAULT_PARAMS: Params = {
  alpha: 0.2, beta: 0.2, gamma: 0.1, w_line: 0.0, w_edge: 1.0,
  max_iterations: 250, gaussian_blur_ksize: 0, convergence: 0.001,
  init_mode: 'circle', init_cx: null, init_cy: null, init_radius: null, init_points: 400,
  from_point_x: null, from_point_y: null,
  bbox_x1: null, bbox_y1: null, bbox_x2: null, bbox_y2: null
};

// --- Main Component ---
const SnakeNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes<CustomNodeData>(); 
  
  const [open, setOpen] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  
  // Interactive State
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState<{w: number, h: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
  const frameRef = useRef(0);
  
  const [isEditing, setIsEditing] = useState(true);

  useEffect(() => {
    if (data?.status === 'success') {
      setIsEditing(false);
    } else if (data?.status === 'fault' || data?.status === 'idle') {
      setIsEditing(true);
    }
  }, [data?.status]);

  const upstreamImage = useMemo(() => {
    const incoming = edges.find(e => e.target === id);
    if (!incoming) return null;
    const parent = nodes.find(n => n.id === incoming.source);
    return getNodeImageUrl(parent);
  }, [edges, nodes, id]);

  const prevInputRef = useRef(upstreamImage);
  useEffect(() => {
    if (upstreamImage !== prevInputRef.current) {
      rf.setNodes((nds) => nds.map((n) => {
        if (n.id === id) {
          const { result_image_url, preview_url, overlay_url, mask_url, contour_points, iterations, json, ...cleanPayload } = n.data.payload || {};
          return {
            ...n,
            data: { ...n.data, status: 'idle', description: 'Input changed. Ready.', payload: cleanPayload }
          };
        }
        return n;
      }));
      prevInputRef.current = upstreamImage;
      setIsEditing(true);
    }
  }, [upstreamImage, id, rf]);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const savedParams = useMemo(() => ({ ...DEFAULT_PARAMS, ...(data?.payload?.params || {}), init_mode: normalize((data?.payload?.params as any)?.init_mode) }), [data?.payload?.params]);
  const [form, setForm] = useState<Params>(savedParams);
  
  useEffect(() => {
      if (JSON.stringify(savedParams) !== JSON.stringify(form)) {
          setForm(savedParams);
      }
  }, [savedParams]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const onRun = useCallback(() => { if (!isRunning) data?.onRunNode?.(id); }, [data, id, isRunning]);
  const onClose = () => { setForm(savedParams); setOpen(false); };

  const updateNodeData = useCallback((newParams: Params) => { 
    rf.setNodes((nds) => nds.map((n) => 
      n.id === id ? { ...n, data: { ...n.data, payload: { ...(n.data?.payload || {}), params: newParams } } } : n
    ));
  }, [rf, id]);

  const onSave = useCallback(() => {
    const cleanParams: Params = {
      ...form,
      alpha: toFloat(form.alpha, 0.2), beta: toFloat(form.beta, 0.2), gamma: toFloat(form.gamma, 0.1),
      w_line: toFloat(form.w_line, 0.0), w_edge: toFloat(form.w_edge, 1.0),
      max_iterations: toInt(form.max_iterations, 250), gaussian_blur_ksize: toInt(form.gaussian_blur_ksize, 0),
      convergence: toFloat(form.convergence, 0.001), init_points: toInt(form.init_points, 400),
      init_cx: form.init_cx, init_cy: form.init_cy, init_radius: form.init_radius,
      from_point_x: form.from_point_x, from_point_y: form.from_point_y,
      bbox_x1: form.bbox_x1, bbox_y1: form.bbox_y1, bbox_x2: form.bbox_x2, bbox_y2: form.bbox_y2,
      real_width: imgSize?.w, real_height: imgSize?.h 
    };
    updateNodeData(cleanParams);
    setOpen(false);
  }, [form, imgSize, updateNodeData]);

  const resp = data?.payload?.json as any;
  const resultImage = data?.payload?.result_image_url || data?.payload?.preview_url || resp?.overlay_url || resp?.mask_url;
  
  const rawUrl = (!isEditing && resultImage) ? resultImage : upstreamImage;

  const displayImage = rawUrl ? `${abs(rawUrl)}?t=${Date.now()}` : undefined;

  const iterText = resp?.iterations ?? data?.payload?.iterations;

  let statusText = '';
  if (!displayImage) {
      statusText = 'Connect Image Input and run';
  } else {
      statusText = `Mode: ${form.init_mode}`;
      if (iterText) {
          statusText += ` • Done (${iterText} iters)`;
      }
  }

  let borderColor = 'border-pink-500';
  if (selected) borderColor = 'border-pink-400 ring-2 ring-pink-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const getImgCoords = (e: React.MouseEvent) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY)
    };
  };

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    const newWidth = img.naturalWidth;
    const newHeight = img.naturalHeight;
    
    if (imgSize === null || imgSize.w !== newWidth || imgSize.h !== newHeight) {
        setImgSize({ w: newWidth, h: newHeight });
    }
  }, [imgSize]); 

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); 

    if (form.init_mode === 'bbox' || form.init_mode === 'point') {
        e.preventDefault(); 
    }

    if (form.init_mode === 'bbox') {
        setIsEditing(true); 
        const coords = getImgCoords(e);
        if (coords) {
          setIsDragging(true);
          setDragStart(coords);
          const newParams = { ...form, bbox_x1: coords.x, bbox_y1: coords.y, bbox_x2: coords.x, bbox_y2: coords.y };
          setForm(newParams);
          updateNodeData(newParams);
        }
    }
  }, [form, getImgCoords, updateNodeData]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart || form.init_mode !== 'bbox') return;
    e.preventDefault(); e.stopPropagation();
    
    if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
    }
    
    frameRef.current = requestAnimationFrame(() => {
        const coords = getImgCoords(e);
        if (coords) {
          const newParams = {
            ...form,
            bbox_x1: Math.min(dragStart.x, coords.x),
            bbox_y1: Math.min(dragStart.y, coords.y),
            bbox_x2: Math.max(dragStart.x, coords.x),
            bbox_y2: Math.max(dragStart.y, coords.y)
          };
          setForm(newParams);
        }
    });
  }, [isDragging, dragStart, form, getImgCoords]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
        e.stopPropagation();
        setIsDragging(false);
        setDragStart(null);
        updateNodeData(form);
    }
    if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
    }
  }, [isDragging, form, updateNodeData]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); 
    e.preventDefault(); 

    if (form.init_mode === 'point') {
      setIsEditing(true);
      const coords = getImgCoords(e);
      if (coords) {
        const newParams = { ...form, from_point_x: coords.x, from_point_y: coords.y };
        setForm(newParams);
        updateNodeData(newParams);
      }
    }
  }, [form, getImgCoords, updateNodeData]);

  const getPercent = (val: Numish, dim: 'w' | 'h') => {
      if (val === null || val === undefined || !imgSize) return 0;
      const base = dim === 'w' ? imgSize.w : imgSize.h;
      if (base === 0) return 0;
      return (Number(val) / base) * 100;
  };

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${isFault && !isConnected ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' : 'bg-white border-gray-500'}`;
  const sourceHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={sourceHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      {/* Header (Master Design) */}
      <div className="bg-gray-700 text-pink-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>Snake</div>
        <div className="flex items-center gap-2"> {/* Gap-2 */}
            {/* Run Button (px-2 py-1) */}
            <button 
              onClick={onRun} 
              disabled={isRunning} 
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white ${
                isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-pink-600 hover:bg-pink-700'
              }`}
            >
              {isRunning ? 'Running...' : '▶ Run'}
            </button>
            
            <span className="relative inline-flex items-center group">
            <button 
              aria-label="Open Snake settings" 
              onClick={() => setOpen(true)} 
              // Settings Button (h-5 w-5)
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80 transition focus:outline-none"
            >
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            {/* Tooltip */}
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100 z-50 font-normal">
              Settings
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
            </span>
        </div>
      </div>

      <div 
        className="p-4 space-y-3 relative group nodrag" 
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      >
        {imgSize && (
            <div className="text-[10px] text-gray-400">
                Input: {imgSize.w}x{imgSize.h}px
            </div>
        )}

        <p className="text-sm text-gray-300">{statusText}</p>
        
        {displayImage && (
          <div 
             className="relative w-full cursor-crosshair border border-gray-700 rounded-lg overflow-hidden select-none"
          >
            <img 
                ref={imgRef}
                src={displayImage} 
                alt="snake" 
                onLoad={onImgLoad} 
                className="w-full h-auto object-contain max-h-56 block pointer-events-none" 
                draggable={false} 
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />

            {isEditing && form.init_mode === 'point' && form.from_point_x != null && form.from_point_y != null && imgSize && (
                <div 
                    className="absolute w-3 h-3 bg-red-500 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-sm"
                    style={{ 
                        left: `${getPercent(form.from_point_x, 'w')}%`,
                        top: `${getPercent(form.from_point_y, 'h')}%`
                    }}
                />
            )}

            {isEditing && form.init_mode === 'bbox' && form.bbox_x1 != null && form.bbox_y1 != null && imgSize && (
                <div 
                    className="absolute border-2 border-red-500 bg-red-500/20 pointer-events-none"
                    style={{
                        left: `${getPercent(Math.min(Number(form.bbox_x1), Number(form.bbox_x2||0)), 'w')}%`,
                        top: `${getPercent(Math.min(Number(form.bbox_y1), Number(form.bbox_y2||0)), 'h')}%`,
                        width: `${Math.abs(getPercent(form.bbox_x2, 'w') - getPercent(form.bbox_x1, 'w'))}%`,
                        height: `${Math.abs(getPercent(form.bbox_y2, 'h') - getPercent(form.bbox_y1, 'h'))}%`
                    }}
                />
            )}
          </div>
        )}
        
        {displayImage && isEditing && form.init_mode === 'point' && <div className="text-[10px] text-gray-400 text-center mt-1">Click to set seed point</div>}
        {displayImage && isEditing && form.init_mode === 'bbox' && <div className="text-[10px] text-gray-400 text-center mt-1">Drag to draw bounding box</div>}
      </div>

      {/* Status Table (Master Style) */}
      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="Snake Settings" onClose={onClose}>
         <div className="space-y-5 text-xs text-gray-300 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar" onMouseDown={stopAll} onClick={stopAll} onDoubleClick={stopAll}>
            <div className="space-y-2">
                <div className="font-semibold text-pink-300 uppercase text-[10px] tracking-wider mb-2">Core Parameters</div>
                <div className="grid grid-cols-2 gap-2">
                    <Num label="alpha" value={form.alpha} step={0.01} onChange={(v) => setForm((s) => ({ ...s, alpha: v }))} />
                    <Num label="beta" value={form.beta} step={0.1} onChange={(v) => setForm((s) => ({ ...s, beta: v }))} />
                    <Num label="gamma" value={form.gamma} step={0.01} onChange={(v) => setForm((s) => ({ ...s, gamma: v }))} />
                    <Num label="w_edge" value={form.w_edge} step={0.05} onChange={(v) => setForm((s) => ({ ...s, w_edge: v }))} />
                    <Num label="w_line" value={form.w_line} step={0.05} onChange={(v) => setForm((s) => ({ ...s, w_line: v }))} />
                    <Num label="max_iterations" value={form.max_iterations} min={1} step={1} onChange={(v) => setForm((s) => ({ ...s, max_iterations: v }))} />
                    <Num label="gaussian_blur_ksize" value={form.gaussian_blur_ksize} min={0} step={1} onChange={(v) => setForm((s) => ({ ...s, gaussian_blur_ksize: v }))} />
                </div>
            </div>
            
            <div className="space-y-2 border-t border-gray-700 pt-2">
                <button className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[10px] uppercase font-bold tracking-wider" onClick={(e) => { stopAll(e); setShowAdv((s) => !s); }}>{showAdv ? '▾ Advanced (hide)' : '▸ Advanced (show)'}</button>
                {showAdv && (
                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-3 gap-2"><Num label="convergence" value={form.convergence} min={0} step={0.0001} onChange={(v) => setForm((s) => ({ ...s, convergence: v }))} /></div>
                        <div className="space-y-2">
                            <div className="font-semibold text-pink-300 uppercase text-[10px] tracking-wider mb-2">Init</div>
                            <Select label="Init mode" value={form.init_mode} onChange={(v) => { 
                                const newMode = v as InitMode;
                                setForm(s => ({ ...s, init_mode: newMode }));
                                updateNodeData({ ...form, init_mode: newMode });
                                setIsEditing(true); 
                            }} options={[{ label: 'circle', value: 'circle' }, { label: 'point', value: 'point' }, { label: 'bbox', value: 'bbox' }]} />
                            <Num label="init_points" value={form.init_points} min={8} step={1} onChange={(v) => setForm((s) => ({ ...s, init_points: v }))} />
                            {form.init_mode === 'circle' && <div className="grid grid-cols-3 gap-2"><Num label="init_cx" value={form.init_cx} onChange={(v) => setForm((s) => ({ ...s, init_cx: v }))} /><Num label="init_cy" value={form.init_cy} onChange={(v) => setForm((s) => ({ ...s, init_cy: v }))} /><Num label="init_radius" value={form.init_radius} onChange={(v) => setForm((s) => ({ ...s, init_radius: v }))} /></div>}
                            {form.init_mode === 'point' && <div className="grid grid-cols-3 gap-2"><Num label="from_point_x" value={form.from_point_x} onChange={(v) => setForm((s) => ({ ...s, from_point_x: v }))} /><Num label="from_point_y" value={form.from_point_y} onChange={(v) => setForm((s) => ({ ...s, from_point_y: v }))} /><Num label="init_radius" value={form.init_radius} onChange={(v) => setForm((s) => ({ ...s, init_radius: v }))} /></div>}
                            {form.init_mode === 'bbox' && <div className="grid grid-cols-4 gap-2"><Num label="bbox_x1" value={form.bbox_x1} onChange={(v) => setForm((s) => ({ ...s, bbox_x1: v }))} /><Num label="bbox_y1" value={form.bbox_y1} onChange={(v) => setForm((s) => ({ ...s, bbox_y1: v }))} /><Num label="bbox_x2" value={form.bbox_x2} onChange={(v) => setForm((s) => ({ ...s, bbox_x2: v }))} /><Num label="bbox_y2" value={form.bbox_y2} onChange={(v) => setForm((s) => ({ ...s, bbox_y2: v }))} /></div>}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Buttons (Master Style) */}
            <div className="flex justify-between items-center pt-5 border-t border-gray-700 mt-4">
                <button onClick={(e) => { stopAll(e); setForm(DEFAULT_PARAMS); setIsEditing(true); }} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Reset</button>
                <div className="flex gap-2">
                    <button onClick={onClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Close</button>
                    <button onClick={(e) => { stopAll(e); onSave(); }} className="px-4 py-1.5 rounded bg-pink-600 text-white text-xs font-bold cursor-pointer hover:bg-pink-700 transition">Save</button>
                </div>
            </div>
         </div>
      </Modal>
    </div>
  );
});
export default SnakeNode;