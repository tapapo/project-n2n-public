// src/hooks/useWorkflowFile.ts
import { useCallback, useRef } from 'react';
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData, NodeStatus } from '../types';
import type { MutableRefObject } from 'react';

// ---------- Types ----------
type RFNode = Node<CustomNodeData>;

export type UseWorkflowFileArgs = {
  /** state ปัจจุบันของ nodes (มาจาก FlowCanvas) */
  nodes: RFNode[];
  /** state ปัจจุบันของ edges (มาจาก FlowCanvas) */
  edges: Edge[];
  /** setNodes จาก useNodesState */
  setNodes: (updater: (prev: RFNode[]) => RFNode[]) => void;
  /** setEdges จาก useEdgesState */
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
  /**
   * ref จาก useFlowHistory (ใช้กัน history effect ไม่ให้ snapshot ตอน load workflow)
   * คือ isApplyingHistoryRef ที่ useFlowHistory return ออกมา
   */
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

  // ---------- Save ----------
  const saveWorkflow = useCallback(() => {
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

  // ---------- Internal: handle file input change ----------
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

          if (!parsed.nodes || !parsed.edges) {
            throw new Error('Invalid workflow JSON (missing nodes/edges)');
          }

          // ✅ normalize nodes: ensure status exists (reset เป็น 'idle' เวลาโหลด)
          const loadedNodes: RFNode[] = parsed.nodes.map((n) => ({
            ...n,
            data: {
              ...(n.data || ({} as CustomNodeData)),
              status: 'idle' as NodeStatus,
            },
          }));

          const loadedEdges: Edge[] = parsed.edges.map((e) => ({ ...e }));

          // ⚠️ แจ้งให้ history รู้ว่า "กำลัง apply จากไฟล์" → ไม่ต้อง snapshot
          if (isApplyingHistoryRef) {
            (isApplyingHistoryRef.current as boolean) = true;
          }

          // setNodes/setEdges แบบ replace ทั้งชุด
          setNodes(() => loadedNodes);
          setEdges(() => loadedEdges);

          // ปล่อยให้ render เสร็จก่อน reset flag
          setTimeout(() => {
            if (isApplyingHistoryRef) {
              (isApplyingHistoryRef.current as boolean) = false;
            }
          }, 0);
        } catch (err) {
          console.error('Failed to load workflow file:', err);
          alert('โหลด workflow ไม่ได้: ไฟล์ไม่ถูกต้องหรือเสียหาย');
        } finally {
          // เคลียร์ค่า input เพื่อให้เลือกไฟล์เดิมซ้ำได้ถ้าต้องการ
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
    [setNodes, setEdges, isApplyingHistoryRef]
  );

  // ---------- Public: trigger open file dialog ----------
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