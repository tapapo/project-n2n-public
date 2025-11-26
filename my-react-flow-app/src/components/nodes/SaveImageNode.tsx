import  { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';

const SaveImageNode = ({ id, data, selected }: NodeProps<CustomNodeData>) => {
  // เช็คสถานะ
  const isRunning = data.status === 'running';
  const isSuccess = data.status === 'success'; // ใช้ success ตามที่ตกลง
  const isFault = data.status === 'fault';     // ใช้ fault ตามที่ตกลง

  // กำหนดสีขอบตามสถานะ
  let borderColor = 'border-slate-600';
  if (selected) borderColor = 'border-blue-500 ring-2 ring-blue-500/50';
  else if (isRunning) borderColor = 'border-yellow-400 ring-2 ring-yellow-400/50';
  else if (isSuccess) borderColor = 'border-green-500 ring-2 ring-green-500/50';
  else if (isFault) borderColor = 'border-red-500 ring-2 ring-red-500/50';

  // ✅ ฟังก์ชันกดปุ่ม: เรียก onRunNode ที่ส่งมาจาก FlowCanvas
  const handleRun = useCallback(() => {
    if (data.onRunNode) {
      data.onRunNode(id);
    } else {
      console.warn("onRunNode function not found in data");
    }
  }, [data, id]);

  return (
    <div className={`bg-slate-800 text-white rounded-lg p-3 w-48 text-center border-2 shadow-md ${borderColor}`}>
      
      {/* Header */}
      <div className="font-bold text-teal-400 mb-1">Save Image</div>
      <p className="text-xs text-slate-300 mb-2">Export processed output</p>

      {/* Button */}
      <button
        onClick={handleRun}
        disabled={isRunning}
        className={`nodrag w-full px-3 py-1.5 rounded text-sm font-medium transition-colors duration-200
          ${
            isSuccess
              ? "bg-green-600 hover:bg-green-700"
              : isFault
              ? "bg-red-600 hover:bg-red-700"
              : "bg-teal-600 hover:bg-teal-700"
          }
          ${isRunning ? "opacity-70 cursor-wait" : "cursor-pointer"}
        `}
      >
        {isRunning
          ? "Saving..."
          : isSuccess
          ? "✅ Saved!"
          : isFault
          ? "❌ Failed"
          : "Save Image"}
      </button>

      {/* Output Path Display (ถ้ามี) */}
      {data.output?.saved_path && (
        <div className="mt-2 p-1 bg-slate-900 rounded text-[10px] text-green-400 break-all border border-slate-700">
          Path: {data.output.saved_path.split(/[/\\]/).pop()}
        </div>
      )}

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-teal-500 w-3 h-3"
      />
    </div>
  );
}

export default memo(SaveImageNode);