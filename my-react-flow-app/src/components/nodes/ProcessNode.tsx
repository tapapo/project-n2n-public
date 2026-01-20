// File: src/nodes/ProcessNode.tsx (หรือชื่อไฟล์ Custom Node ของคุณ)

import { useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from 'reactflow';
import type { ChangeEvent } from 'react';

// ⚠️ อย่าลืม Import Type ข้อมูลของคุณเข้ามาด้วย
// (เช็ค path ให้ถูกว่าไฟล์ types.ts อยู่ไหน)
import type { CustomNodeData } from '../../types';
export default function ProcessNode({ id, data }: NodeProps<CustomNodeData>) {
  
  const { setNodes } = useReactFlow();

  // ✅ กำหนด Type ให้ evt: บอกว่าเป็น Event ที่เกิดจาก HTMLInputElement
  const onChange = useCallback((evt: ChangeEvent<HTMLInputElement>) => {
    const newValue = evt.target.value;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              // ตรงนี้แก้ชื่อ field ให้ตรงกับที่คุณใช้จริง (เช่น sliderValue, threshold ฯลฯ)
              // สมมติว่าเก็บใน payload หรือ parameter ชื่อ 'avalue'
              ...node.data, // spread ของเดิมก่อน
              [evt.target.name]: newValue, // อัปเดตค่าตาม name ของ input
            },
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  return (
    <div className="p-4 bg-slate-800 rounded-md border border-slate-600 shadow-xl min-w-[200px]">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-teal-400" />
      
      <div className="text-sm font-bold text-slate-200 mb-2">
        {data.label}
      </div>

      {/* Input Example */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400">Parameter Adjustment</label>
        <input 
          name="myParam" // 👈 สำคัญ: ตั้งชื่อให้ตรงกับ key ใน data ที่อยากแก้
          type="number" 
          className="nodrag bg-slate-700 text-white px-2 py-1 rounded text-xs border border-slate-600 focus:border-teal-400 outline-none"
          
          // ⚠️ ถ้า data.payload หรือ parameter คุณชื่ออื่น ให้แก้ตรงนี้
          defaultValue={data.payload?.myParam || 0} 
          
          onChange={onChange} 
        />
        {/* Slider Example */}
        <input 
            name="mySlider"
            type="range"
            className="nodrag"
            onChange={onChange}
        />
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-teal-400" />
    </div>
  );
}