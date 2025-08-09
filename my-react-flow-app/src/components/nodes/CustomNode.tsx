import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';

// กำหนด Handle ให้มีหลายจุด
const handleStyle = { 
  background: '#fff', 
  borderRadius: '50%', 
  width: 8, 
  height: 8, 
  border: '2px solid #6b7280', 
};

const CustomNode = memo(({ data }: NodeProps) => {
  return (
    <div className="bg-gray-800 border-2 border-teal-500 rounded-xl shadow-2xl w-64 text-gray-200 transform transition-all duration-300 hover:scale-105">
      
      {/* Handles และ Ports สำหรับ Input/Output */}
      {/* จัดการ Handle ให้อยู่ใน Div หลัก */}
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

      {/* Header ของ Node */}
      <div className="bg-gray-700 text-center font-bold p-2 text-teal-400 rounded-t-xl">
        {data.label}
      </div>

      {/* Body ของ Node สำหรับข้อมูลเพิ่มเติม */}
      <div className="p-4">
        {data.image && <img src={data.image} alt="node-image" className="w-full rounded-lg shadow-md mb-4" />}
        {data.description && <p className="text-sm text-gray-400">{data.description}</p>}
      </div>

      {/* Port Status UI และ Handles */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className="h-4 w-4 bg-gray-600 rounded-full flex-shrink-0 shadow-inner" />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          <div className="h-4 w-4 bg-gray-600 rounded-full flex-shrink-0 shadow-inner" />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          <div className="h-4 w-4 bg-gray-600 rounded-full flex-shrink-0 shadow-inner" />
        </div>
      </div>
    </div>
  );
});

export default CustomNode;