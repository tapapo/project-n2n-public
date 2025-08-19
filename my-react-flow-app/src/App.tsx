import { useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import Sidebar from './components/sidebar';
import FlowCanvas from './FlowCanvas';
import WorkflowControls from './components/WorkflowControls';
import './index.css';

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const handleStart = () => setIsRunning(true);
  const handleStop = () => setIsRunning(false);

  return (
    <div className="w-screen h-screen flex flex-col bg-gray-900 text-white">
      <h1 className="text-4xl font-extrabold p-4 text-center text-teal-400 border-b-2 border-teal-500 shadow-lg">
        N2N Image Processing
      </h1>

      {/* ทำให้ WorkflowControls เป็น "controlled component" */}
      <WorkflowControls isRunning={isRunning} onStart={handleStart} onStop={handleStop} />

      <div className="flex flex-grow overflow-hidden">
        <ReactFlowProvider>
          <Sidebar />
          <FlowCanvas
            isRunning={isRunning}
            onPipelineDone={handleStop}   // ให้ FlowCanvas เรียกเมื่อรันเสร็จ หรือพัง
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
