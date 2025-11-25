// src/hooks/useFlowHotkeys.ts
import { useEffect, useRef, useCallback } from 'react';
import { useReactFlow, type Node, type Edge } from 'reactflow';
import type { CustomNodeData } from '../types';

// ----- Types -----
type RFNode = Node<CustomNodeData>;
type RFEdge = Edge;

type ClipboardData = {
  nodes: RFNode[];
  edges: RFEdge[];
};

type PastePos = { x: number; y: number };

export type UseFlowHotkeysOptions = {
  /** ตำแหน่งใน flow-space ที่จะใช้เป็นจุดวางตอน paste (เช่น last mouse pos) */
  getPastePosition?: () => PastePos | null;
  /** ฟังก์ชันรัน node ตาม id (มาจาก FlowCanvas) */
  runNodeById: (id: string) => void | Promise<void>;
  /** ฟังก์ชัน undo/redo ที่ FlowCanvas เป็นคนจัดการ history จริง */
  undo: () => void;
  redo: () => void;
};

// ----- Helpers -----
const isCmdOrCtrl = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

  return false;
};

const makeId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ----- Hook -----
export function useFlowHotkeys(opts: UseFlowHotkeysOptions) {
  const { getPastePosition, runNodeById, undo, redo } = opts;
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow<CustomNodeData>();

  const clipboardRef = useRef<ClipboardData | null>(null);

  // -------- Copy --------
  const doCopy = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();

    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
    );

    clipboardRef.current = {
      nodes: selectedNodes.map((n) => ({ ...n })),
      edges: selectedEdges.map((e) => ({ ...e })),
    };
  }, [getNodes, getEdges]);

  // -------- Paste --------
  const doPaste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;

    const nodes = getNodes();
    const edges = getEdges();

    const idMap = new Map<string, string>();

    // offset ดีฟอลต์ ถ้าไม่มีตำแหน่งเมาส์
    let dx = 40;
    let dy = 40;

    const pastePos = getPastePosition?.();
    if (pastePos) {
      const xs = clip.nodes.map((n) => n.position.x);
      const ys = clip.nodes.map((n) => n.position.y);
      if (xs.length > 0 && ys.length > 0) {
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);

        // ✔ เอา "มุมซ้ายบน" ของกลุ่ม node ไปวางที่ cursor
        dx = pastePos.x - minX;
        dy = pastePos.y - minY;
      }
    }

    // สร้าง nodes ใหม่
    const newNodes: RFNode[] = clip.nodes.map((n) => {
      const newId = makeId();
      idMap.set(n.id, newId);

      return {
        ...n,
        id: newId,
        selected: true,
        position: {
          x: n.position.x + dx,
          y: n.position.y + dy,
        },
        data: {
          ...(n.data || {}),
          status: 'idle', // ให้พร้อม run ใหม่
          onRunNode: (id: string) => runNodeById(id),
        },
      };
    });

    // สร้าง edges ใหม่
    const mappedEdges: (RFEdge | null)[] = clip.edges.map((e) => {
      const newSource = idMap.get(e.source);
      const newTarget = idMap.get(e.target);
      if (!newSource || !newTarget) return null;

      return {
        ...e,
        id: makeId(),
        source: newSource,
        target: newTarget,
        selected: true,
      };
    });

    const newEdges: RFEdge[] = mappedEdges.filter(
      (e): e is RFEdge => e !== null
    );

    // clear selection เก่า แล้วเพิ่มใหม่
    const clearedOldNodes = nodes.map((n) => ({ ...n, selected: false }));
    const clearedOldEdges = edges.map((e) => ({ ...e, selected: false }));

    setNodes([...clearedOldNodes, ...newNodes]);
    setEdges([...clearedOldEdges, ...newEdges]);
    // history (undo/redo) จะถูกจัดการที่ FlowCanvas ผ่าน effect ของ nodes/edges
  }, [getNodes, getEdges, setNodes, setEdges, getPastePosition, runNodeById]);

  // -------- Delete --------
  const doDelete = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();

    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    const removeNodeIds = new Set(selectedNodes.map((n) => n.id));

    const keptNodes = nodes.filter((n) => !removeNodeIds.has(n.id));
    const keptEdges = edges.filter(
      (e) =>
        !removeNodeIds.has(e.source) &&
        !removeNodeIds.has(e.target) &&
        !selectedEdges.includes(e)
    );

    setNodes(keptNodes);
    setEdges(keptEdges);
    // history ก็ถูก trigger โดย nodes/edges เปลี่ยนเหมือนกัน
  }, [getNodes, getEdges, setNodes, setEdges]);

  // -------- Keyboard listener --------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      // Undo / Redo / Copy / Paste
      if (isCmdOrCtrl(e) && !e.altKey) {
        const key = e.key.toLowerCase();

        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo(); // Ctrl+Shift+Z / Cmd+Shift+Z
          } else {
            undo(); // Ctrl+Z / Cmd+Z
          }
          return;
        }

        if (key === 'c') {
          e.preventDefault();
          doCopy();
          return;
        }

        if (key === 'v') {
          e.preventDefault();
          doPaste();
          return;
        }
      }

      // Delete / Backspace
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          doDelete();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, doCopy, doPaste, doDelete]);
}