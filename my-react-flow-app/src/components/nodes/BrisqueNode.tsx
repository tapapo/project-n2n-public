// File: my-react-flow-app/src/components/nodes/BrisqueNode.tsx
import { memo, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';

// ✅ Helper (Master Design)
const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner transition-colors duration-200`;

const BrisqueNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const edges = useEdges();

  const isConnected = useMemo(() => edges.some((e) => e.target === id), [edges, id]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const handleRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const caption =
  (typeof data?.description === 'string' && !/(running|start)/i.test(data.description)) 
    ? data.description
    : (typeof data?.payload?.quality_score === 'number'
        ? `BRISQUE score = ${Number(data.payload.quality_score).toFixed(2)}`
        : 'Connect Image Input and run');

  // Style (Blue Theme)
  let borderColor = 'border-blue-500';
  if (selected) borderColor = 'border-blue-400 ring-2 ring-blue-500'; 
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50'; 

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;
  const sourceHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={sourceHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      {/* Header (Master Design: px-2 py-2) */}
      <div className="bg-gray-700 text-blue-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>BRISQUE</div>
        {/* Run Button (Copy exact classes from SwinIR) */}
        <button
          onClick={handleRun}
          disabled={isRunning}
          className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
            isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isRunning ? 'Running...' : '▶ Run'}
        </button>
      </div>

      <div className="p-4 space-y-2">
        <p className="text-sm text-gray-300">{caption}</p>
        {typeof data?.payload?.quality_score === 'number' && (
          <div className="text-[10px] text-gray-400">
            Lower is better (0=Best, 100=Worst)
          </div>
        )}
      </div>

      {/* Status Table (Master Style) */}
      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success', 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>
    </div>
  );
});

export default BrisqueNode;