// src/components/nodes/ImageInputNode.tsx
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

const ImageInputNode = memo(({ id, data }: Props) => {
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

      // ให้แน่ใจว่าเป็น string เสมอ (abs อาจคืน undefined ในบางโปรเจกต์)
      const absUrl: string = (abs(f.url) || f.url) as string;

      // ✅ อ่านขนาดรูปจริง
      let dims = { width: 0, height: 0 };
      try {
        dims = await readImageSize(absUrl);
      } catch {}

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
                    result_image_url: absUrl, // ให้พรีวิวได้
                    width: dims.width,
                    height: dims.height,
                  },
                  status: 'success',
                  description: `Image uploaded (${dims.width}×${dims.height})`,
                },
              }
            : n
        )
      );
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, status: 'fault', description: 'Upload failed' } } : n
        )
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resultUrl: string | undefined =
    (data?.payload && (data.payload.result_image_url as string)) ||
    (data?.payload && (data.payload.url as string)) ||
    undefined;

  return (
    <div className="bg-gray-800 border-2 border-teal-500 rounded-xl shadow-2xl w-72 text-gray-200">
      <Handle
        type="source"
        position={Position.Right}
        id="img"
        style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }}
      />

      <div className="bg-gray-700 text-center font-bold p-2 text-teal-400 rounded-t-xl">
        {data?.label || 'Image Input'}
      </div>

      <div className="p-4 space-y-3">
        <div className="text-sm text-gray-300">Select an image to upload:</div>

        <button
          disabled={uploading}
          onClick={onPick}
          className={`w-full rounded-lg px-3 py-2 font-semibold transition ${
            uploading ? 'bg-gray-600 text-gray-400' : 'bg-teal-600 hover:bg-teal-700'
          }`}
        >
          {uploading ? 'Uploading...' : 'Choose Image'}
        </button>

        <input ref={fileRef} type="file" accept="image/*" onChange={onChange} className="hidden" />

        {localName && (
          <div className="text-xs text-gray-400 break-all">
            Uploaded: <span className="text-gray-200">{localName}</span>
          </div>
        )}

        {data?.payload?.width && data?.payload?.height && (
          <div className="text-xs text-gray-400">{data.payload.width}×{data.payload.height}px</div>
        )}

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

        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className="h-4 w-4 bg-gray-600 rounded-full" />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          <div className={`h-4 w-4 rounded-full ${data?.status === 'success' ? 'bg-green-500' : 'bg-gray-600'}`} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          <div className={`h-4 w-4 rounded-full ${data?.status === 'fault' ? 'bg-yellow-500' : 'bg-gray-600'}`} />
        </div>
      </div>
    </div>
  );
});

export default ImageInputNode;