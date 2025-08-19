import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';

const handleStyle = { 
  background: '#fff', 
  borderRadius: '50%', 
  width: 8, 
  height: 8, 
  border: '2px solid #6b7280', 
};

const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

const CustomNode = memo(({ data }: NodeProps<CustomNodeData>) => {
  const resultUrl =
    (data?.payload && (data.payload.result_image_url as string)) ||
    (data?.payload && (data.payload.sift_vis_url as string)) || // เผื่อกรณีเก่า
    (data?.payload && (data.payload.orb_vis_url as string))  || // เผื่ออนาคต
    undefined;

  const caption =
    (data?.description as string) ||
    (resultUrl ? 'Result preview' : undefined);

  return (
    <div className="bg-gray-800 border-2 border-teal-500 rounded-xl shadow-2xl w-72 text-gray-200 transform transition-all duration-300 hover:scale-105">

      {/* Handles (มีทั้งซ้าย/ขวา ถ้าไม่ใช้ ReactFlow จะไม่วาดให้เอง) */}
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

      {/* Header */}
      <div className="bg-gray-700 text-center font-bold p-2 text-teal-400 rounded-t-xl">
        {data?.label}
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* รูปผลลัพธ์ (ถ้ามี) */}
        {resultUrl && (
          <img
            src={resultUrl}
            alt="node-result"
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
          />
        )}

        {/* คำอธิบาย/สถานะล่าสุด */}
        {caption && <p className="text-xs text-gray-400 break-words">{caption}</p>}

       
      </div>

      {/* Status lights */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className={statusDot(data?.status === 'idle', 'bg-gray-600')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          <div className={statusDot(data?.status === 'success', 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          <div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-cyan-400">running</span>
          <div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} />
        </div>
      </div>
    </div>
  );
});

export default CustomNode;
