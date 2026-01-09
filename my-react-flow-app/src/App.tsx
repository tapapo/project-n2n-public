// src/App.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

// Components
import Sidebar from './components/sidebar';
import FlowCanvas, { type FlowCanvasHandle } from './FlowCanvas';
import WorkflowControls from './components/WorkflowControls';
import WorkflowTabs from './components/WorkflowTabs';

// Types
import type { WorkflowTemplate } from './lib/workflowTemplates';
import type { WorkflowTab } from './types';

// Key 
const STORAGE_KEY_APP_TABS = 'n2n_app_tabs';
const STORAGE_KEY_ACTIVE_TAB = 'n2n_active_tab_id';

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  
  //  TAB MANAGEMENT STATE
  const [tabs, setTabs] = useState<WorkflowTab[]>(() => {
    try {
      const savedTabs = localStorage.getItem(STORAGE_KEY_APP_TABS);
      if (savedTabs) {
        return JSON.parse(savedTabs);
      }
    } catch (e) {
      console.error("Failed to load tabs", e);
    }
    return [{ 
      id: 'tab-1', 
      name: 'Workflow 1', 
      nodes: [], 
      edges: [], 
      viewport: { x: 0, y: 0, zoom: 1 } 
    }];
  });
  
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_TAB) || 'tab-1';
  });

  const canvasRef = useRef<FlowCanvasHandle>(null);

  //  AUTO-SAVE EFFECTS
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_APP_TABS, JSON.stringify(tabs));
      localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, activeTabId);
    } catch (e) {
      console.error("Failed to save tabs", e);
    }
  }, [tabs, activeTabId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const currentTab = tabs.find(t => t.id === activeTabId);
      if (currentTab && canvasRef.current) {
        canvasRef.current.restoreSnapshot(
          currentTab.nodes,
          currentTab.edges,
          currentTab.viewport
        );
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []); 

  //  TAB LOGIC HANDLERS
  const syncCanvasToCurrentTab = useCallback(() => {
    if (!canvasRef.current) return;
    const snapshot = canvasRef.current.getSnapshot();
    
    setTabs((prevTabs) => 
      prevTabs.map((tab) => 
        tab.id === activeTabId 
          ? { ...tab, ...snapshot }
          : tab
      )
    );
  }, [activeTabId]);

  const handleFlowChange = useCallback((changes: { nodes: any[], edges: any[], viewport: any }) => {
    setTabs((prevTabs) => 
      prevTabs.map((tab) => 
        tab.id === activeTabId 
          ? { ...tab, ...changes } 
          : tab
      )
    );
  }, [activeTabId]);

  const handleLoadTemplate = useCallback((template: WorkflowTemplate) => {
    syncCanvasToCurrentTab();

    const newId = `tab-${Date.now()}`;
    const newTab: WorkflowTab = {
      id: newId,
      name: template.name,
      nodes: template.nodes,
      edges: template.edges,
      viewport: { x: 0, y: 0, zoom: 1 }
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);

    setTimeout(() => {
        canvasRef.current?.restoreSnapshot(template.nodes, template.edges, { x: 0, y: 0, zoom: 1 });
    }, 0);

    setTimeout(() => {
        canvasRef.current?.fitView(); 
    }, 200);

  }, [syncCanvasToCurrentTab]);

  const handleSwitchTab = (newTabId: string) => {
    if (newTabId === activeTabId) return;
    syncCanvasToCurrentTab();

    const targetTab = tabs.find((t) => t.id === newTabId);
    if (targetTab && canvasRef.current) {
      setActiveTabId(newTabId);
      setTimeout(() => {
        canvasRef.current?.restoreSnapshot(
          targetTab.nodes, 
          targetTab.edges, 
          targetTab.viewport
        );
      }, 0);
    }
  };

  const handleAddTab = () => {
    syncCanvasToCurrentTab();
    const newId = `tab-${Date.now()}`;
    const newTab: WorkflowTab = {
      id: newId,
      name: `Workflow ${tabs.length + 1}`,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setTimeout(() => {
        canvasRef.current?.restoreSnapshot([], [], { x: 0, y: 0, zoom: 1 });
    }, 0);
  };

  const handleCloseTab = (targetId: string) => {
    if (tabs.length <= 1) {
        alert("At least one workflow must remain open.");
        return;
    }
    const targetIndex = tabs.findIndex(t => t.id === targetId);
    const newTabs = tabs.filter(t => t.id !== targetId);
    setTabs(newTabs);

    if (targetId === activeTabId) {
        const nextTab = newTabs[targetIndex - 1] || newTabs[0];
        setActiveTabId(nextTab.id);
        setTimeout(() => {
            canvasRef.current?.restoreSnapshot(nextTab.nodes, nextTab.edges, nextTab.viewport);
        }, 0);
    }
  };

  const handleRenameTab = (tabId: string, newName: string) => {
    setTabs((prevTabs) => 
      prevTabs.map((tab) => 
        tab.id === tabId 
          ? { ...tab, name: newName || 'Untitled' }
          : tab
      )
    );
  };

  const handleStart = () => setIsRunning(true);
  const handleStop = () => setIsRunning(false);

  const activeTabName = tabs.find(t => t.id === activeTabId)?.name || 'Untitled';

  return (
    // ✅ เปลี่ยน h-screen เป็น h-[100dvh] เพื่อความชัวร์ (Dynamic Viewport Height)
    <div className="w-screen h-[100dvh] flex flex-col bg-gray-900 text-white overflow-hidden">
      
      {/* Header แบบ Desktop สวยๆ */}
      <div className="relative z-30 bg-gray-900 shadow-lg border-b-2 border-teal-500 flex items-center justify-center p-3">
        <h1 className="text-2xl md:text-4xl font-extrabold text-teal-400 tracking-wide drop-shadow-md">
          N2N Image Processing
        </h1>
      </div>

      <WorkflowControls isRunning={isRunning} onStart={handleStart} onStop={handleStop} />

      <WorkflowTabs 
        tabs={tabs.map(t => ({ id: t.id, name: t.name }))} 
        activeTabId={activeTabId}
        onSwitch={handleSwitchTab}
        onAdd={handleAddTab}
        onClose={handleCloseTab}
        onRename={handleRenameTab} 
      />

      <div className="flex flex-grow overflow-hidden relative">
        <ReactFlowProvider>
          {/* Sidebar วางตรงๆ ไม่ต้องมี Wrapper ซับซ้อน */}
          <Sidebar onLoadTemplate={handleLoadTemplate} />
          
          <div className="flex-1 h-full relative">
            <FlowCanvas
              ref={canvasRef}
              isRunning={isRunning}
              onPipelineDone={handleStop}
              onFlowChange={handleFlowChange}
              currentTabName={activeTabName} 
            />
          </div>
        </ReactFlowProvider>
      </div>
    </div>
  );
}