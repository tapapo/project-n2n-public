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
  /** state ปัจจุบันของ nodes (มาจาก FlowCanvas) */
  nodes: RFNode[];
  /** state ปัจจุบันของ edges (มาจาก FlowCanvas) */
  edges: Edge[];
  /** setNodes จาก useNodesState ใน FlowCanvas */
  setNodes: (updater: (prev: RFNode[]) => RFNode[]) => void;
  /** setEdges จาก useEdgesState ใน FlowCanvas */
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
  /** flag จาก FlowCanvas: กำลัง drag node อยู่ไหม */
  isDraggingRef: MutableRefObject<boolean>;
};

// ---------- Helper ----------
const cloneSnapshot = (snap: GraphSnapshot): GraphSnapshot => ({
  nodes: snap.nodes.map((n) => ({ ...n })),
  edges: snap.edges.map((e) => ({ ...e })),
});

// ---------- Hook ----------
export function useFlowHistory({
  nodes,
  edges,
  setNodes,
  setEdges,
  isDraggingRef,
}: UseFlowHistoryArgs) {
  // เก็บ state ล่าสุดไว้ใน ref
  const nodesRef = useRef<RFNode[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // history internal state
  const historyRef = useRef<GraphSnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const historyInitializedRef = useRef(false);
  const isApplyingHistoryRef = useRef(false);
  const wasDraggingRef = useRef(false);

  // ✅ สร้าง snapshot โดย "บังคับ status = 'idle'" → ไม่ให้ undo/redo ย้อนสถานะไฟ
  const makeSnapshot = useCallback((): GraphSnapshot => {
    return {
      nodes: nodesRef.current.map((n) => ({
        ...n,
        data: {
          ...(n.data || {}),
          status: 'idle' as NodeStatus,
        },
      })),
      edges: edgesRef.current.map((e) => ({ ...e })),
    };
  }, []);

  const pushSnapshot = useCallback((snap: GraphSnapshot) => {
    const hist = historyRef.current;
    const idx = historyIndexRef.current;

    // ถ้าเคย undo ย้อนกลับไป แล้วมี action ใหม่ -> ตัดอนาคตทิ้ง
    const trimmed = hist.slice(0, idx + 1);
    trimmed.push(cloneSnapshot(snap));

    historyRef.current = trimmed;
    historyIndexRef.current = trimmed.length - 1;
  }, []);

  // ✅ applySnapshot: ย้อนโครงสร้าง แต่ "พยายามเก็บ status ปัจจุบันของ node ไว้"
  const applySnapshot = useCallback(
    (snap: GraphSnapshot) => {
      isApplyingHistoryRef.current = true;

      setNodes((currentNodes) => {
        const currentMap = new Map<string, RFNode>(
          currentNodes.map((n) => [n.id, n])
        );

        const mergedNodes: RFNode[] = snap.nodes.map((snapNode) => {
          const current = currentMap.get(snapNode.id);
          const snapData = (snapNode.data || {}) as CustomNodeData;

          if (!current) {
            // node ถูก restore กลับมา → ให้ status default = 'idle'
            return {
              ...snapNode,
              data: {
                ...snapData,
                status: 'idle' as NodeStatus,
              },
            };
          }

          const currData = (current.data || {}) as CustomNodeData;

          return {
            ...snapNode,
            data: {
              ...snapData,
              // ใช้ status ปัจจุบันของ node ตัวนี้ (ไม่ให้ undo ไปยุ่งไฟของมัน)
              status: currData.status,
            },
          };
        });

        return mergedNodes;
      });

      setEdges((_) => snap.edges.map((e) => ({ ...e })));

      // ปล่อยให้ render เสร็จก่อนค่อยปลด flag
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    },
    [setNodes, setEdges]
  );

  // ---------- ฟังทุกครั้งที่ nodes/edges เปลี่ยน แล้วบันทึก history ----------
  useEffect(() => {
    // ถ้ามาจาก applySnapshot → ไม่ต้องสร้าง snapshot ใหม่
    if (isApplyingHistoryRef.current) return;

    // ใช้ flag จาก FlowCanvas แทน n.dragging
    const anyDragging = !!isDraggingRef.current;

    if (!historyInitializedRef.current) {
      // snapshot แรกสุด
      const snap = makeSnapshot();
      historyRef.current = [snap];
      historyIndexRef.current = 0;
      historyInitializedRef.current = true;
      wasDraggingRef.current = anyDragging;
      return;
    }

    // ตอนกำลังลาก node → ยังไม่ push, รอจนลากเสร็จ
    if (anyDragging) {
      wasDraggingRef.current = true;
      return;
    }

    // ตอนนี้ไม่มี node ไหน dragging แล้ว → เกิด action ใหม่
    const snap = makeSnapshot();

    if (wasDraggingRef.current) {
      // เพิ่งลากเสร็จ → ให้ทั้ง drag เป็น 1 history step
      pushSnapshot(snap);
      wasDraggingRef.current = false;
    } else {
      // action ทั่วไป เช่น copy/paste/delete/add edge
      pushSnapshot(snap);
    }
  }, [nodes, edges, makeSnapshot, pushSnapshot, isDraggingRef]);

  // ---------- Undo / Redo ----------
  const undo = useCallback(() => {
    if (!historyInitializedRef.current) return;

    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx <= 0) return;

    const targetIdx = idx - 1;
    const snap = hist[targetIdx];
    historyIndexRef.current = targetIdx;

    applySnapshot(snap);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (!historyInitializedRef.current) return;

    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx >= hist.length - 1) return;

    const targetIdx = idx + 1;
    const snap = hist[targetIdx];
    historyIndexRef.current = targetIdx;

    applySnapshot(snap);
  }, [applySnapshot]);

  return {
    undo,
    redo,
    isApplyingHistoryRef,
  };
}