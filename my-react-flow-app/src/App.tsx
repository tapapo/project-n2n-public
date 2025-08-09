import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import Sidebar from './components/sidebar';
import FlowCanvas from './FlowCanvas';
import WorkflowControls from './components/WorkflowControls'; // <-- Import Component ใหม่
import './index.css';

export default function App() {
  
  return (
    <div className="w-screen h-screen flex flex-col bg-gray-900 text-white">
      <h1 className="text-4xl font-extrabold p-4 text-center text-teal-400 border-b-2 border-teal-500 shadow-lg">
        N2N Image Processing
      </h1>
      <WorkflowControls />

      <div className="flex flex-grow overflow-hidden">
        <ReactFlowProvider>
          <Sidebar />
          <FlowCanvas isRunning={false} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}