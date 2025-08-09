import { useState } from 'react';

interface WorkflowControlsProps {
  // หากต้องการให้ App Component ควบคุมสถานะ isRunning
  // คุณสามารถรับ prop นี้และ function setState ได้
  // ตัวอย่างนี้เราจะให้ Component นี้จัดการ State เอง
}

const WorkflowControls = () => {
  const [isRunning, setIsRunning] = useState(false);

  const handleStart = () => {
    console.log('Workflow Started!');
    setIsRunning(true);
  };

  const handleStop = () => {
    console.log('Workflow Stopped!');
    setIsRunning(false);
  };

  return (
    <div className="bg-gray-800 p-3 border-b-2 border-gray-700 flex justify-between items-center px-6">
      <div className="flex items-center space-x-3">
        <div 
          className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} 
        />
        <span className="text-sm font-semibold text-gray-200">
          Status: <span className={`${isRunning ? 'text-green-400' : 'text-red-400'} font-bold`}>
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </span>
      </div>

      <div className="flex space-x-2">
        <button
          onClick={handleStart}
          disabled={isRunning}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-bold transition-all duration-200 shadow-md
            ${isRunning ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white transform hover:scale-105'}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
          <span>Start</span>
        </button>
        
        <button
          onClick={handleStop}
          disabled={!isRunning}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-bold transition-all duration-200 shadow-md
            ${!isRunning ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white transform hover:scale-105'}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
          </svg>
          <span>Stop</span>
        </button>
      </div>
    </div>
  );
};

export default WorkflowControls;