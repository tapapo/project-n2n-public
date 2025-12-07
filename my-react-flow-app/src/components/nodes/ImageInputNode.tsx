//src/components/nodes/ImageInputNode.tsx
import { memo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { uploadImages, abs } from '../../lib/api';

type Props = NodeProps<CustomNodeData>;

const ImageInputNode = memo(({ id, data, selected }: Props) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { setNodes } = useReactFlow();
  const [localName, setLocalName] = useState<string>(data?.payload?.name || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>('');

  const onPick = () => fileRef.current?.click();
  
  const readImageSize = (url: string) => 
    new Promise<{ width: number; height: number }>((resolve, reject) => { 
      const img = new Image(); 
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight }); 
      img.onerror = reject; 
      img.src = url; 
    });

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    setError(''); setUploading(true);
    try {
      const resp = await uploadImages(files);
      const f = resp.files[0];
      setLocalName(f.name);
      
      // ✅ FIX: เติม timestamp ตอนอัปโหลดด้วย
      const absUrl = (abs(f.url) || f.url) as string;
      
      let dims = { width: 0, height: 0 };
      try { dims = await readImageSize(absUrl); } catch {}
      
      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { 
          ...n.data, 
          status: 'success',
          payload: { 
            ...(n.data?.payload || {}), 
            name: f.name, 
            path: f.path, 
            url: absUrl, 
            result_image_url: absUrl, 
            width: dims.width, 
            height: dims.height 
          }, 
          description: `Image uploaded (${dims.width}×${dims.height})` 
        } 
      } : n));
    } catch (err: any) { 
      setError(err?.message || 'Upload failed'); 
    } finally { 
      setUploading(false); 
      if (fileRef.current) fileRef.current.value = ''; 
    }
  };

  // ✅ ดึง URL จาก payload
  const rawUrl = data?.payload?.result_image_url || data?.payload?.url;
  
  // ✅ FIX FINAL: ใส่ Timestamp เพื่อบังคับ Browser โหลดใหม่เสมอ!
  // ถ้า rawUrl มีค่า ให้แปลงเป็น absolute url แล้วเติม ?t=...
  const displayUrl = rawUrl 
    ? `${abs(rawUrl)}?t=${Date.now()}` // <-- จุดเปลี่ยนสำคัญ
    : undefined;

  const isFault = error !== '';

  let borderColor = 'border-teal-500';
  if (selected) borderColor = 'border-teal-400 ring-2 ring-teal-500';
  else if (uploading) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const handleClasses = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${isFault ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' : 'bg-white border-gray-500'}`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 transition-all duration-200 ${borderColor}`}>
      <Handle type="source" position={Position.Right} id="img" className={handleClasses} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      
      <div className="bg-gray-700 text-center font-bold p-2 text-teal-400 rounded-t-xl">
        {data?.label || 'Image Input'}
      </div>
      
      <div className="p-4 space-y-3">
        <div className="text-sm text-gray-300">Select an image to upload:</div>
        
        <button 
          disabled={uploading} 
          onClick={onPick} 
          className={['w-full rounded-lg px-3 py-2 font-semibold transition-colors text-white', uploading ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-teal-600 hover:bg-teal-700'].join(' ')}
        >
          {uploading ? 'Uploading...' : 'Choose Image'}
        </button>
        
        <input ref={fileRef} type="file" accept="image/*" onChange={onChange} className="hidden" />
        
        {(localName || data?.payload?.name) && (
          <div className="text-xs text-gray-400 break-all">
            File: <span className="text-gray-200">{localName || data?.payload?.name}</span>
          </div>
        )}
        
        {data?.payload?.width && (
          <div className="text-xs text-gray-400">
            {data.payload.width}×{data.payload.height}px
          </div>
        )}
        
        {displayUrl && (
          <img 
            src={displayUrl} 
            alt="preview" 
            className="w-full rounded-md border border-gray-700 object-contain max-h-48 bg-gray-900" 
            onError={(e) => { 
              // ลอง Log ดูว่า URL ที่พังคืออะไร
              console.error("Image load failed:", e.currentTarget.src);
              e.currentTarget.style.display = 'none'; 
            }}
          />
        )}
        
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
    </div>
  );
});

export default ImageInputNode;