import { memo, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps, useEdges } from 'reactflow'; // ✅ ใช้ useEdges
import type { CustomNodeData } from '../../types';

const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

const SsimNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  // ✅ ใช้ useEdges เพื่อความ Real-time
  const edges = useEdges();

  // ✅ Check connections (แยก 2 เส้น)
  const isConnected1 = useMemo(() => edges.some(e => e.target === id && e.targetHandle === 'input1'), [edges, id]);
  const isConnected2 = useMemo(() => edges.some(e => e.target === id && e.targetHandle === 'input2'), [edges, id]);

  const isRunning = data?.status === 'start' || data?.status === 'running';
  const isFault = data?.status === 'fault';

  const handleRun = useCallback(() => {
    if (isRunning) return;
    data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const val = data?.payload?.json?.score;
  const caption =
    (typeof data?.description === 'string' && data.description) ||
    (typeof val === 'number' ? `SSIM = ${val.toFixed(4)}` : 'No score yet');

  // ✅ Theme: Blue (ฟ้าเสมอ)
  let borderColor = 'border-blue-500';
  if (selected) {
    borderColor = 'border-blue-400 ring-2 ring-blue-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  // ✅ Helper สร้าง Class ให้ Handle (แดงถ้าพังและไม่มีสาย)
  const getHandleClass = (connected: boolean) => `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !connected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 transition-all duration-200 ${borderColor}`}>
      
      {/* Input 1 (Top Left) - เอา style สีออก เหลือแค่ตำแหน่ง */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input1" 
        className={getHandleClass(isConnected1)} 
        style={{ top: '35%', transform: 'translateY(-50%)' }} 
      />
      
      {/* Input 2 (Bottom Left) */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input2" 
        className={getHandleClass(isConnected2)} 
        style={{ top: '65%', transform: 'translateY(-50%)' }} 
      />
      
      {/* Output (Right) */}
      <Handle 
        type="source" 
        position={Position.Right} 
        id="json" 
        className={getHandleClass(true)} 
        style={{ top: '50%', transform: 'translateY(-50%)' }} 
      />

      <div className="bg-gray-700 text-blue-400 rounded-t-xl px-2 py-2 flex items-center justify-between">
        <div className="font-bold">SSIM</div>
        <button
          title="Run this node"
          onClick={handleRun}
          disabled={isRunning}
          // ✅ ปุ่มฟ้าเสมอ
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
        {typeof val === 'number' && (
          <div className="text-[11px] text-gray-400">Closer to 1.0 is better</div>
        )}
      </div>

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

export default SsimNode;