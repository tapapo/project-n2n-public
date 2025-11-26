import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';

const SaveJsonNode = ({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const isRunning = data.status === 'running';
  const isSuccess = data.status === 'success';
  const isFault = data.status === 'fault';

  let borderColor = 'border-slate-600';
  if (selected) borderColor = 'border-blue-500 ring-2 ring-blue-500/50';
  else if (isRunning) borderColor = 'border-yellow-400 ring-2 ring-yellow-400/50';
  else if (isSuccess) borderColor = 'border-green-500 ring-2 ring-green-500/50';
  else if (isFault) borderColor = 'border-red-500 ring-2 ring-red-500/50';

  const handleRun = useCallback(() => {
    if (data.onRunNode) {
      data.onRunNode(id);
    } else {
      console.warn("onRunNode function not found in data");
    }
  }, [data, id]);

  return (
    <div className={`bg-slate-900 text-white rounded-lg p-3 w-48 text-center border-2 shadow-md ${borderColor}`}>
      
      <div className="font-bold text-blue-400 mb-1">Save JSON</div>
      <p className="text-xs text-slate-400 mb-2">Export descriptors</p>

      <button
        onClick={handleRun}
        disabled={isRunning}
        className={`nodrag w-full px-3 py-1.5 rounded text-sm font-medium transition-colors duration-200
          ${
            isSuccess
              ? "bg-green-600"
              : isFault
              ? "bg-red-600"
              : "bg-blue-600 hover:bg-blue-700"
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
        <div className="mt-2 p-1 bg-black rounded text-[10px] text-green-400 break-all border border-blue-900">
          File: {data.output.saved_path.split(/[/\\]/).pop()}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="!bg-blue-500 w-3 h-3"
      />
    </div>
  );
}

export default memo(SaveJsonNode);