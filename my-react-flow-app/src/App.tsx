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

// Keys for LocalStorage
const STORAGE_KEY_APP_TABS = 'n2n_app_tabs';
const STORAGE_KEY_ACTIVE_TAB = 'n2n_active_tab_id';

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  
  // 1. LOAD STATE FROM STORAGE
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

  // 🔥🔥🔥 [FIXED v3] SMART AUTO-SAVE (แก้ไขชื่อตัวแปรให้ตรงกับ Node) 🔥🔥🔥
  useEffect(() => {
    try {
      const tabsToSave = tabs.map(tab => ({
        ...tab,
        nodes: tab.nodes.map(node => {
          const oldPayload = node.data.payload || {};
          let newPayload = undefined;

          // CASE 1: Image Input (เก็บทุกอย่างเหมือนเดิม เพราะต้องใช้ Path)
          if (node.type === 'image-input') {
             newPayload = oldPayload; 
          }
          
          // CASE 2: Success Nodes (Output จากอัลกอริทึม)
          else if (node.data.status === 'success') {
             // 1. หา URL ของรูปจากตัวแปรที่เป็นไปได้ทั้งหมด
             const imgUrl = 
                oldPayload.vis_url ||              // SIFT, SURF ใช้ตัวนี้
                oldPayload.output_image ||         // MSRCR บางทีใช้ตัวนี้
                oldPayload.result_image_url ||     // Standard ใหม่
                oldPayload.output?.image_url ||    
                oldPayload.output?.result_image_url ||
                oldPayload.url ||
                oldPayload.image_url;

             if (imgUrl) {
                // ✅ เจอรูป! สร้าง Payload ใหม่
                newPayload = { 
                    // ⚠️ ใส่ URL ลงไปในทุกชื่อที่เป็นไปได้ เพื่อกันพลาด
                    vis_url: imgUrl,           // เผื่อ SIFT เรียกหา
                    output_image: imgUrl,      // เผื่อ MSRCR เรียกหา
                    result_image_url: imgUrl,  // เผื่อตัวอื่นเรียกหา
                    url: imgUrl,

                    // ✅ เก็บค่า Settings (Params) ไว้ด้วย ไม่งั้นรีเฟรชแล้วค่าที่ปรับจะหาย
                    params: oldPayload.params,

                    // เก็บค่าตัวเลข Quality (ขนาดเล็ก เก็บได้)
                    psnr: oldPayload.psnr,
                    ssim: oldPayload.ssim,
                    brisque: oldPayload.brisque
                };
             } 
             // ถ้าเป็นโหนด Quality ที่ไม่มีรูป แต่มีตัวเลข
             else if (['psnr', 'ssim', 'brisque'].includes(node.type || '')) {
                newPayload = oldPayload;
             }
             // ❌ ข้อมูลขยะขนาดใหญ่ (Keypoints, Mask Array) จะถูกทิ้งตรงนี้
          }

          return {
            ...node,
            data: {
              ...node.data,
              payload: newPayload,
              // ถ้ามี Payload = Success, ถ้าไม่มี = Idle (ให้รันใหม่)
              status: newPayload ? 'success' : 'idle' 
            }
          };
        })
      }));

      localStorage.setItem(STORAGE_KEY_APP_TABS, JSON.stringify(tabsToSave));
      localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, activeTabId);

    } catch (e) {
      console.error("Failed to save tabs", e);
    }
  }, [tabs, activeTabId]);


  // 3. RESTORE VIEW ON LOAD
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

  // --- LOGIC การจัดการ TAB และ CANVAS ---

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

  const handleStart = useCallback(() => setIsRunning(true), []);
  const handleStop = useCallback(() => setIsRunning(false), []);

  const activeTabName = tabs.find(t => t.id === activeTabId)?.name || 'Untitled';

  return (
    <div className="w-screen h-[100dvh] flex flex-col bg-gray-900 text-white overflow-hidden">
      
      {/* Header */}
      <div className="relative z-30 bg-gray-900 shadow-lg border-b-2 border-teal-500 flex items-center justify-center p-3">
        <h1 className="text-2xl md:text-4xl font-extrabold text-teal-400 tracking-wide drop-shadow-md">
          N2N Image Processing
        </h1>
      </div>

      {/* Control Bar */}
      <WorkflowControls isRunning={isRunning} onStart={handleStart} onStop={handleStop} />

      {/* Tabs */}
      <WorkflowTabs 
        tabs={tabs.map(t => ({ id: t.id, name: t.name }))} 
        activeTabId={activeTabId}
        onSwitch={handleSwitchTab}
        onAdd={handleAddTab}
        onClose={handleCloseTab}
        onRename={handleRenameTab} 
      />

      {/* Main Workspace */}
      <div className="flex flex-grow overflow-hidden relative">
        <ReactFlowProvider>
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