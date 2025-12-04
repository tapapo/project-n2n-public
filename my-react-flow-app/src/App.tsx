// App.tsx (ต้องใช้เวอร์ชันนี้เท่านั้น)
import { useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import Sidebar from './components/sidebar';
import FlowCanvas from './FlowCanvas';
import WorkflowControls from './components/WorkflowControls';
import './index.css';
import type { WorkflowTemplate } from './lib/workflowTemplates'; 

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  
  // ✅ State นี้จำเป็นต้องมี
  const [loadTemplateCallback, setLoadTemplateCallback] = useState<((template: WorkflowTemplate) => void) | null>(null);
  
  const handleStart = () => setIsRunning(true);
  const handleStop = () => setIsRunning(false);

  return (
    <div className="w-screen h-screen flex flex-col bg-gray-900 text-white">
      <h1 className="text-4xl font-extrabold p-4 text-center text-teal-400 border-b-2 border-teal-500 shadow-lg">
        N2N Image Processing
      </h1>

      <WorkflowControls isRunning={isRunning} onStart={handleStart} onStop={handleStop} />

      <div className="flex flex-grow overflow-hidden">
        <ReactFlowProvider>
          {/* ✅ ส่ง loadTemplateCallback (state) */}
          <Sidebar onLoadTemplate={loadTemplateCallback} /> 
          
          {/* ✅ ส่ง setLoadTemplateCallback (setter) */}
          <FlowCanvas
            isRunning={isRunning}
            onPipelineDone={handleStop}
            setLoadTemplateCallback={setLoadTemplateCallback} 
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}