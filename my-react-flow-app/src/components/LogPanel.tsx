import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../types';

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

export default function LogPanel({ logs, onClear }: LogPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  
  // State สำหรับจัดการการแสดงผล
  const [isVisible, setIsVisible] = useState(false); // ควบคุมการ ปิด (X)
  const [isMinimized, setIsMinimized] = useState(false); // ควบคุมการ ย่อ (_)
  
  // เก็บจำนวน Log ก่อนหน้า เพื่อเช็คว่ามี Log ใหม่มาไหม
  const prevLogsLength = useRef(logs.length);

  useEffect(() => {
    // ถ้ามี Log เพิ่มขึ้น -> ให้เปิดหน้าต่างอัตโนมัติ
    if (logs.length > prevLogsLength.current) {
      setIsVisible(true);
      // ถ้าอยากให้เด้งขยายด้วยเมื่อมี Error ให้เปิดคอมเมนต์บรรทัดล่าง
      // if (logs[logs.length - 1].type === 'error') setIsMinimized(false);
    }
    
    // Auto scroll
    if (isVisible && !isMinimized) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    prevLogsLength.current = logs.length;
  }, [logs, isVisible, isMinimized]);

  // ถ้า isVisible เป็น false คือปิดไปเลย ไม่ต้อง render
  if (!isVisible) return null;

  return (
    <div 
      className={`absolute bottom-4 right-4 w-96 flex flex-col z-50 font-mono text-xs shadow-2xl rounded-xl overflow-hidden border border-gray-700 bg-gray-900/95 backdrop-blur-sm transition-all duration-300 ease-in-out
        ${isMinimized ? 'h-9' : 'max-h-64 h-64'}
      `}
    >
      
      {/* --- Header --- */}
      <div className="flex justify-between items-center px-3 py-2 bg-gray-800/90 border-b border-gray-700 select-none">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 font-bold flex items-center gap-2">
            📺 System Logs
          </span>
          {logs.length > 0 && (
            <span className="bg-gray-700 text-gray-300 px-1.5 rounded-full text-[10px]">
              {logs.length}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* 🧹 Clear Button */}
          <button 
            onClick={onClear}
            title="Clear logs"
            className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-700/50 transition mr-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* ➖ Minimize Button */}
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "Expand" : "Minimize"}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition"
          >
            {isMinimized ? (
              // Expand Icon (Square)
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth={2} />
              </svg>
            ) : (
              // Minimize Icon (Line)
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            )}
          </button>

          {/* ❌ Close Button */}
          <button 
            onClick={() => setIsVisible(false)}
            title="Close panel"
            className="text-gray-400 hover:text-white hover:bg-red-600/80 p-1 rounded transition ml-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* --- Log List --- */}
      {!isMinimized && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 italic opacity-50">
              <span>No logs available</span>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-2 items-start p-1.5 rounded hover:bg-white/5 transition group">
                {/* จุดสี */}
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 
                  ${log.type === 'error' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 
                    log.type === 'success' ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]' : 
                    log.type === 'warning' ? 'bg-yellow-500' : 
                    'bg-blue-500'}`} 
                />
                
                <div className="flex-1 break-words leading-tight">
                  <span className="text-gray-500 mr-2 select-none">[{log.timestamp}]</span>
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
            ))
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}