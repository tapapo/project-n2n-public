import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';

const SaveJsonNode = ({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const isRunning = data.status === 'running';
  const isSuccess = data.status === 'success';
  const isFault = data.status === 'fault';

  // ปรับสีขอบ: ปกติเป็นสีเทา (Gray)
  let borderColor = 'border-gray-500'; // ปกติ
  if (selected) {
    // ✨ Selected: เปลี่ยนจาก Blue เป็น Gray ที่เด่นขึ้น (เทาอ่อน + เงาเทาเข้ม)
    borderColor = 'border-gray-300 ring-2 ring-gray-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  } else if (isSuccess) {
    borderColor = 'border-green-500 ring-2 ring-green-500/50';
  } else if (isFault) {
    borderColor = 'border-red-500 ring-2 ring-red-500/50';
  }

  const handleRun = useCallback(() => {
    if (data.onRunNode) {
      data.onRunNode(id);
    } else {
      console.warn("onRunNode function not found in data");
    }
  }, [data, id]);

  return (
    // เปลี่ยนพื้นหลังเป็น gray-800 ให้เข้าธีม
    <div className={`bg-gray-800 text-white rounded-lg p-3 w-48 text-center border-2 shadow-md ${borderColor}`}>
      
      {/* Header: เปลี่ยนเป็นสีเทาอ่อน */}
      <div className="font-bold text-gray-300 mb-1">Save JSON</div>
      <p className="text-xs text-gray-400 mb-2">Export descriptors</p>

      {/* Button: เปลี่ยนเป็นสีเทา (Gray-600) เหมือน Sidebar */}
      <button
        onClick={handleRun}
        disabled={isRunning}
        className={`nodrag w-full px-3 py-1.5 rounded text-sm font-medium transition-colors duration-200 text-white
          ${
            isSuccess
              ? "bg-green-600 hover:bg-green-700"
              : isFault
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-600 hover:bg-gray-700"   // ✅ ปกติเป็นสีเทา
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
          : "Save JSON"}
      </button>

      {data.output?.saved_path && (
        <div className="mt-2 p-1 bg-gray-900 rounded text-[10px] text-gray-300 break-all border border-gray-700">
          File: {data.output.saved_path.split(/[/\\]/).pop()}
        </div>
      )}

      {/* Handle: เปลี่ยนเป็นสีเทา */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-gray-500 w-3 h-3"
      />
    </div>
  );
}

export default memo(SaveJsonNode);