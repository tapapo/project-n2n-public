import { useEffect, useRef } from 'react';
import type { LogEntry } from '../types';

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

export default function LogPanel({ logs, onClear }: LogPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className="absolute bottom-4 right-4 w-96 max-h-64 flex flex-col z-50 font-mono text-xs shadow-2xl rounded-xl overflow-hidden border border-gray-700 bg-gray-900/95 backdrop-blur-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-2 bg-gray-800/80 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 font-bold">System Logs</span>
          <span className="bg-gray-700 text-gray-300 px-1.5 rounded-full text-[10px]">
            {logs.length}
          </span>
        </div>
        <button 
          onClick={onClear}
          className="text-gray-400 hover:text-white hover:bg-gray-700/50 px-2 py-0.5 rounded transition"
        >
          Clear
        </button>
      </div>

      {/* Log List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 items-start p-1.5 rounded hover:bg-white/5 transition">
            {/* จุดสีบอกสถานะ */}
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 
              ${log.type === 'error' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 
                log.type === 'success' ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 
                log.type === 'warning' ? 'bg-yellow-500' : 
                'bg-blue-500'}`} 
            />
            
            <div className="flex-1 break-words leading-tight">
              {/* เวลา */}
              <span className="text-gray-500 mr-2">[{log.timestamp}]</span>

              {/* ❌ ผมลบส่วนแสดง [log.nodeId] ออกไปแล้วครับ */}
              {/* ตอนนี้จะเหลือแค่ข้อความ Log ที่เราจัด Format ไว้สวยๆ จาก FlowCanvas */}

              <span className={`
                ${log.type === 'error' ? 'text-red-300' : 
                  log.type === 'success' ? 'text-green-300' : 
                  log.type === 'warning' ? 'text-yellow-300' : 
                  'text-gray-300'}
              `}>
                {log.message}
              </span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}