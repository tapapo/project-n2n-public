// src/hooks/useFlowHistory.ts
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData, NodeStatus } from '../types';

// ---------- Types ----------
type RFNode = Node<CustomNodeData>;

type GraphSnapshot = {
  nodes: RFNode[];
  edges: Edge[];
};

export type UseFlowHistoryArgs = {
  nodes: RFNode[];
  edges: Edge[];
  setNodes: (updater: (prev: RFNode[]) => RFNode[]) => void;
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
  isDraggingRef: MutableRefObject<boolean>;
};

// ---------- Helper: ตรวจสอบความเปลี่ยนแปลงโดยไม่สน Status ----------
const getCleanData = (data: any) => {
  // แยก status และ onRunNode ออก ไม่นำมาเทียบ
  const { status, onRunNode, ...rest } = data || {};
  return rest;
};

// เช็คว่า Node เปลี่ยนแบบมีนัยสำคัญไหม (Position, Data อื่นๆ)
const hasMeaningfulChange = (prevNodes: RFNode[], currNodes: RFNode[]) => {
  if (prevNodes.length !== currNodes.length) return true;

  // สร้าง Map เพื่อเทียบ ID
  const prevMap = new Map(prevNodes.map(n => [n.id, n]));

  for (const curr of currNodes) {
    const prev = prevMap.get(curr.id);
    if (!prev) return true; // มี Node ใหม่

    // 1. เทียบตำแหน่ง
    if (prev.position.x !== curr.position.x || prev.position.y !== curr.position.y) {
      return true;
    }
    
    // 2. เทียบ Data (ตัด status ทิ้ง)
    // ใช้ JSON.stringify เพื่อ Deep compare data ส่วนที่เหลือ
    if (JSON.stringify(getCleanData(prev.data)) !== JSON.stringify(getCleanData(curr.data))) {
      return true;
    }
  }

  return false;
};

const hasEdgeChange = (prevEdges: Edge[], currEdges: Edge[]) => {
  if (prevEdges.length !== currEdges.length) return true;
  // เทียบแบบง่าย (ถ้าจะละเอียดกว่านี้ต้องเทียบ source/target)
  return JSON.stringify(prevEdges) !== JSON.stringify(currEdges);
};


// ---------- Hook ----------
export function useFlowHistory({
  nodes,
  edges,
  setNodes,
  setEdges,
  isDraggingRef,
}: UseFlowHistoryArgs) {
  
  // State ล่าสุดเสมอ
  const nodesRef = useRef<RFNode[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // History State
  const historyRef = useRef<GraphSnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isApplyingHistoryRef = useRef(false);
  
  // Debounce Timer
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Snapshot Maker
  const makeSnapshot = useCallback((): GraphSnapshot => {
    return {
      nodes: nodesRef.current.map((n) => ({
        ...n,
        data: {
          ...(n.data || {}),
          status: 'idle' as NodeStatus, // เก็บสถานะเป็น idle ใน history
        },
      })),
      edges: edgesRef.current.map((e) => ({ ...e })),
    };
  }, []);

  const pushSnapshot = useCallback((snap: GraphSnapshot) => {
    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    const trimmed = hist.slice(0, idx + 1);
    
    trimmed.push({
      nodes: snap.nodes.map(n => ({...n})), // Clone ป้องกัน Reference ซ้ำ
      edges: snap.edges.map(e => ({...e}))
    });

    historyRef.current = trimmed;
    historyIndexRef.current = trimmed.length - 1;
  }, []);

  const applySnapshot = useCallback(
    (snap: GraphSnapshot) => {
      isApplyingHistoryRef.current = true;

      setNodes((currentNodes) => {
        const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
        return snap.nodes.map((snapNode) => {
          const current = currentMap.get(snapNode.id);
          const snapData = (snapNode.data || {}) as CustomNodeData;
          
          // ถ้า Node มีอยู่แล้ว ให้ใช้ status เดิมของปัจจุบัน (ไม่เอาจาก history มาทับ)
          const currentStatus = current ? (current.data?.status || 'idle') : 'idle';

          return {
            ...snapNode,
            data: {
              ...snapData,
              status: currentStatus, 
            },
          };
        });
      });

      setEdges(() => snap.edges.map((e) => ({ ...e })));

      // รอให้ Render เสร็จค่อยปลด Flag
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 50);
    },
    [setNodes, setEdges]
  );

  // ---------- MAIN EFFECT Logic ที่แก้บัค ----------
  useEffect(() => {
    // 1. ถ้ากำลัง Apply History ไม่ต้องทำอะไร
    if (isApplyingHistoryRef.current) return;

    // 2. ถ้ากำลัง Drag Node (isDraggingRef = true) ยังไม่บันทึก
    // รอจนกว่า Drag จะเสร็จ (isDraggingRef จะเป็น false และ effect นี้จะถูกเรียกอีกที)
    if (isDraggingRef.current) return;

    // 3. ใช้ Debounce เพื่อรวม update (แก้ Double Undo)
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      
      // ถ้า History ว่างเปล่า (Initial) ให้ใส่ Snapshot แรกเลย
      if (historyRef.current.length === 0) {
        pushSnapshot(makeSnapshot());
        return;
      }

      // 4. ตรวจสอบความเปลี่ยนแปลง (แก้ Status Undo)
      const lastSnap = historyRef.current[historyIndexRef.current];
      
      // ถ้า lastSnap ไม่มี (อาจจะเพราะ index เพี้ยน) ให้ข้าม
      if (!lastSnap) return;

      const nodesChanged = hasMeaningfulChange(lastSnap.nodes, nodes);
      const edgesChanged = hasEdgeChange(lastSnap.edges, edges);

      // ถ้ามีอะไรเปลี่ยนที่มีนัยสำคัญ ค่อยบันทึก
      if (nodesChanged || edgesChanged) {
        pushSnapshot(makeSnapshot());
      }

    }, 200); // รอ 200ms ถ้ามี setEdges ตามมาทันที มันจะถูกรวบเป็นรอบเดียว

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };

  }, [nodes, edges, isDraggingRef, makeSnapshot, pushSnapshot]); 
  // dependency list ครบถ้วน เพื่อให้ effect ทำงานทุกครั้งที่ node/edge เปลี่ยน

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const targetIdx = historyIndexRef.current - 1;
    historyIndexRef.current = targetIdx;
    applySnapshot(historyRef.current[targetIdx]);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    const targetIdx = historyIndexRef.current + 1;
    historyIndexRef.current = targetIdx;
    applySnapshot(historyRef.current[targetIdx]);
  }, [applySnapshot]);

  return { undo, redo, isApplyingHistoryRef };
}