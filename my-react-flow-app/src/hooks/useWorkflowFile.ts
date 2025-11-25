// src/hooks/useWorkflowFile.ts
import { useCallback, useRef } from 'react';
import { useReactFlow, type Node, type Edge } from 'reactflow'; // เพิ่ม useReactFlow
import type { CustomNodeData, NodeStatus } from '../types';
import type { MutableRefObject } from 'react';

// ---------- Types ----------
type RFNode = Node<CustomNodeData>;

export type UseWorkflowFileArgs = {
  nodes: RFNode[];
  edges: Edge[];
  setNodes: (updater: (prev: RFNode[]) => RFNode[]) => void;
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
  isApplyingHistoryRef?: MutableRefObject<unknown>;
};

type SavedWorkflow = {
  version: number;
  timestamp?: string;
  nodes: RFNode[];
  edges: Edge[];
};

// ---------- Hook ----------
export function useWorkflowFile({
  nodes,
  edges,
  setNodes,
  setEdges,
  isApplyingHistoryRef,
}: UseWorkflowFileArgs) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // เรียกใช้ fitView เพื่อจัดมุมกล้องหลังโหลด
  const { fitView } = useReactFlow();

  // ---------- Save ----------
  const saveWorkflow = useCallback(() => {
    // ... (ส่วนนี้ของคุณดีอยู่แล้ว ไม่ต้องแก้) ...
    const payload: SavedWorkflow = {
      version: 1,
      timestamp: new Date().toISOString(),
      nodes,
      edges,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const defaultName = `workflow-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`;

    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  // ---------- Load ----------
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result;
          if (typeof text !== 'string') {
            throw new Error('Invalid file content');
          }

          const parsed = JSON.parse(text) as Partial<SavedWorkflow>;

          // ✅ Validation: เช็คว่าเป็น Array จริงๆ
          if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
            throw new Error('Invalid workflow JSON structure');
          }

          // ✅ Normalize: Reset status เป็น 'idle'
          // ⚠️ หมายเหตุ: functions (เช่น onRunNode) จะหายไปจากการ save/load
          // แต่ FlowCanvas.tsx ของคุณมี useEffect ที่คอยเติม onRunNode ให้อยู่แล้ว ดังนั้นตรงนี้ปลอดภัยครับ
          const loadedNodes: RFNode[] = parsed.nodes.map((n) => ({
            ...n,
            data: {
              ...(n.data || ({} as CustomNodeData)),
              status: 'idle' as NodeStatus,
            },
          }));

          const loadedEdges: Edge[] = parsed.edges.map((e) => ({ ...e }));

          // Pause History
          if (isApplyingHistoryRef) {
            (isApplyingHistoryRef.current as boolean) = true;
          }

          setNodes(() => loadedNodes);
          setEdges(() => loadedEdges);

          // ✅ Fit View: รอสักนิดให้ Render เสร็จ แล้วขยับกล้องให้เห็นครบทุกโหนด
          setTimeout(() => {
            window.requestAnimationFrame(() => {
                fitView({ padding: 0.2, duration: 800 }); // มี animation นุ่มๆ
            });
            
            // Resume History
            if (isApplyingHistoryRef) {
              (isApplyingHistoryRef.current as boolean) = false;
            }
          }, 50);

        } catch (err) {
          console.error('Failed to load workflow file:', err);
          alert('โหลด workflow ไม่ได้: ไฟล์ไม่ถูกต้องหรือเสียหาย');
        } finally {
          event.target.value = '';
        }
      };

      reader.onerror = () => {
        console.error('FileReader error:', reader.error);
        alert('เกิดข้อผิดพลาดในการอ่านไฟล์ workflow');
        event.target.value = '';
      };

      reader.readAsText(file);
    },
    [setNodes, setEdges, isApplyingHistoryRef, fitView]
  );

  const triggerLoadWorkflow = useCallback(() => {
    if (!fileInputRef.current) return;
    fileInputRef.current.click();
  }, []);

  return {
    saveWorkflow,
    triggerLoadWorkflow,
    fileInputRef,
    handleFileChange,
  };
}