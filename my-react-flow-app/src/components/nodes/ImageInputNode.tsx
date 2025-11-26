import { memo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { uploadImages, abs } from '../../lib/api';

const handleStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '50%',
  width: 8,
  height: 8,
  border: '2px solid #6b7280',
};

type Props = NodeProps<CustomNodeData>;

// ✅ เพิ่ม prop 'selected'
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

    setError('');
    setUploading(true);
    try {
      const resp = await uploadImages(files);
      const f = resp.files[0];
      setLocalName(f.name);

      const absUrl: string = (abs(f.url) || f.url) as string;

      let dims = { width: 0, height: 0 };
      try {
        dims = await readImageSize(absUrl);
      } catch {
        // ignore
      }

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  payload: {
                    ...(n.data?.payload || {}),
                    name: f.name,
                    path: f.path,
                    url: absUrl,
                    result_image_url: absUrl,
                    width: dims.width,
                    height: dims.height,
                  },
                  description: `Image uploaded (${dims.width}×${dims.height})`,
                },
              }
            : n
        )
      );
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resultUrl: string | undefined =
    (data?.payload && (data.payload.result_image_url as string)) ||
    (data?.payload && (data.payload.url as string)) ||
    undefined;

  // ✅ Logic สีขอบ (Theme: Teal)
  let borderColor = 'border-teal-500'; // Default
  
  if (selected) {
    // ✨ Selected: เขียวอมฟ้าสว่าง + เงา
    borderColor = 'border-teal-400 ring-2 ring-teal-500';
  } else if (uploading) {
    // 🟡 Uploading (ถือเป็น Running state)
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  return (
    // ✅ เพิ่ม transition และ borderColor
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 transition-all duration-200 ${borderColor}`}>
      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="img"
        style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* Header */}
      <div className="bg-gray-700 text-center font-bold p-2 text-teal-400 rounded-t-xl">
        {data?.label || 'Image Input'}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="text-sm text-gray-300">Select an image to upload:</div>

        <button
          disabled={uploading}
          onClick={onPick}
          // ✅ Logic สีปุ่ม (Theme: Teal)
          className={[
            'w-full rounded-lg px-3 py-2 font-semibold transition-colors duration-200 text-white',
            uploading
              ? 'bg-yellow-600 cursor-wait opacity-80' // กำลังอัปโหลด = สีเหลือง
              : 'bg-teal-600 hover:bg-teal-700',       // ปกติ = สี Teal
          ].join(' ')}
        >
          {uploading ? 'Uploading...' : 'Choose Image'}
        </button>

        <input ref={fileRef} type="file" accept="image/*" onChange={onChange} className="hidden" />

        {/* ชื่อไฟล์ */}
        {localName && (
          <div className="text-xs text-gray-400 break-all">
            Uploaded: <span className="text-gray-200">{localName}</span>
          </div>
        )}

        {/* ขนาดรูป */}
        {data?.payload?.width && data?.payload?.height && (
          <div className="text-xs text-gray-400">
            {data.payload.width}×{data.payload.height}px
          </div>
        )}

        {/* พรีวิว */}
        {resultUrl && (
          <a href={resultUrl} target="_blank" rel="noreferrer">
            <img
              src={resultUrl}
              alt="preview"
              className="w-full rounded-md border border-gray-700 object-contain max-h-56"
              draggable={false}
            />
          </a>
        )}

        {/* Error */}
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
    </div>
  );
});

export default ImageInputNode;