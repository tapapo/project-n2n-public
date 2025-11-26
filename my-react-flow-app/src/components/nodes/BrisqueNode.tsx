import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
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

const BrisqueNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  
  const isRunning = data?.status === 'start' || data?.status === 'running';

  const handleRun = useCallback(() => {
    if (isRunning) return;
    data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const caption =
    (typeof data?.description === 'string' && data.description) ||
    (typeof data?.payload?.quality_score === 'number'
      ? `BRISQUE score = ${Number(data.payload.quality_score).toFixed(2)}`
      : 'No score yet');

  // ✅ FIXED: ฟ้าเสมอ
  let borderColor = 'border-blue-500';
  if (selected) {
    borderColor = 'border-blue-400 ring-2 ring-blue-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-blue-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">BRISQUE</div>
        <button
          title="Run this node"
          onClick={handleRun}
          disabled={isRunning}
          // ✅ FIXED: ปุ่มฟ้าเสมอ
          className={[
            'px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white',
            isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-blue-600 hover:bg-blue-700',
          ].join(' ')}
        >
          {isRunning ? 'Running...' : '▶ Run'}
        </button>
      </div>

      <div className="p-4 space-y-2">
        <p className="text-sm text-gray-300">{caption}</p>
        {typeof data?.payload?.quality_score === 'number' && (
          <div className="text-xs text-gray-400">Lower is better (0 = ดีมาก, 100 = แย่)</div>
        )}
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>
    </div>
  );
});

export default BrisqueNode;