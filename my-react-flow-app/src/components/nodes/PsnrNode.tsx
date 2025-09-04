// src/components/nodes/PSNRNode.tsx
import { memo, useCallback, useMemo } from 'react';
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

const PSNRNode = memo(({ id, data }: NodeProps<CustomNodeData>) => {
  const psnr = useMemo(() => {
    const v = data?.payload?.json?.quality_score;
    return typeof v === 'number' ? v : undefined;
  }, [data?.payload?.json?.quality_score]);

  const caption =
    (typeof data?.description === 'string' && data.description) ||
    (psnr !== undefined ? `PSNR = ${psnr.toFixed(2)} dB` : 'No score yet');

  // --- Run เฉพาะ node นี้ ---
  const isBusy = data?.status === 'start' || data?.status === 'running';
  const handleRun = useCallback(() => {
    if (isBusy) return;
    data?.onRunNode?.(id);
  }, [data, id, isBusy]);

  return (
    <div className="bg-gray-800 border-2 border-blue-500 rounded-xl shadow-2xl w-72 text-gray-200">
      {/* inputs (สองเส้นเข้า) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input1"
        style={{ ...handleStyle, top: '35%', transform: 'translateY(-50%)' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="input2"
        style={{ ...handleStyle, top: '65%', transform: 'translateY(-50%)' }}
      />

      {/* output */}
      <Handle
        type="source"
        position={Position.Right}
        id="json"
        style={{ ...handleStyle, top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* header: ชื่อ + ปุ่ม Run */}
      <div className="bg-gray-700 text-blue-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">PSNR</div>
        <button
          title="Run this node"
          onClick={handleRun}
          disabled={isBusy}
          className={[
            'px-2 py-1 rounded text-xs font-semibold transition-colors',
            isBusy
              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white',
          ].join(' ')}
        >
          ▶ Run
        </button>
      </div>

      {/* body */}
      <div className="p-4 space-y-2">
        <p className="text-sm text-gray-300">{caption}</p>
        {psnr !== undefined && (
          <div className="text-[11px] text-gray-400">
            Higher is better (dB)
          </div>
        )}
      </div>

      {/* footer: start → running → success → fault */}
      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className={statusDot(data?.status === 'start', 'bg-red-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-cyan-400">running</span>
          <div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          <div className={statusDot(data?.status === 'success', 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          <div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} />
        </div>
      </div>
    </div>
  );
});

export default PSNRNode;