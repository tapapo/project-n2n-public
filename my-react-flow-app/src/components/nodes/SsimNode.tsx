// src/components/nodes/SsimNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';

const handleStyle = { background: '#fff', borderRadius: '50%', width: 8, height: 8, border: '2px solid #6b7280' };
const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner`;

const SsimNode = memo(({ data }: NodeProps<CustomNodeData>) => {
  const caption = (data?.description as string) || 'No score yet';

  return (
    <div className="bg-gray-800 border-2 border-teal-500 rounded-xl shadow-2xl w-72 text-gray-200">
      <Handle type="target" position={Position.Left} id="input1" style={{ ...handleStyle, top: '30%' }} />
      <Handle type="target" position={Position.Left} id="input2" style={{ ...handleStyle, bottom: '30%' }} />
      <Handle type="source" position={Position.Right} id="json" style={{ ...handleStyle, top: '50%' }} />

      <div className="bg-gray-700 text-center font-bold p-2 text-teal-400 rounded-t-xl">SSIM</div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-300">{caption}</p>
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'idle','bg-gray-600')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(data?.status === 'success','bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault','bg-yellow-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running','bg-cyan-400 animate-pulse')} /></div>
      </div>
    </div>
  );
});

export default SsimNode;