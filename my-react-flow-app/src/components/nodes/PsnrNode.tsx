import { memo, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';

const handleStyle = { background: '#fff', borderRadius: '50%', width: 8, height: 8, border: '2px solid #6b7280' };
const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

const PSNRNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const psnr = useMemo(() => {
    const v = data?.payload?.json?.quality_score;
    return typeof v === 'number' ? v : undefined;
  }, [data?.payload?.json?.quality_score]);

  const caption =
    (typeof data?.description === 'string' && data.description) ||
    (psnr !== undefined ? `PSNR = ${psnr.toFixed(2)} dB` : 'No score yet');

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const handleRun = useCallback(() => {
    if (isRunning) return;
    data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  // ✅ FIXED: ฟ้าเสมอ
  let borderColor = 'border-blue-500';
  if (selected) {
    borderColor = 'border-blue-400 ring-2 ring-blue-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} id="input1" style={{ ...handleStyle, top: '35%', transform: 'translateY(-50%)' }} />
      <Handle type="target" position={Position.Left} id="input2" style={{ ...handleStyle, top: '65%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} id="json" style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-blue-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">PSNR</div>
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
        {psnr !== undefined && <div className="text-[11px] text-gray-400">Higher is better (dB)</div>}
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

export default PSNRNode;