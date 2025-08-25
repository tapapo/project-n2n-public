// src/components/edges/EditableEdge.tsx
import React, { useEffect, useMemo, useRef } from 'react';import type { EdgeProps, XYPosition } from 'reactflow';
import { useReactFlow } from 'reactflow';

const GRID = 8;
const HANDLE_R = 6;
const HIT_STROKE = 18;
const THROTTLE_MS = 16;

const snap = (v: number) => Math.round(v / GRID) * GRID;
const snapPt = (p: XYPosition) => ({ x: snap(p.x), y: snap(p.y) });
const dist2 = (a: XYPosition, b: XYPosition) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const buildPath = (points: XYPosition[]) =>
  points.length ? `M ${points[0].x},${points[0].y}` + points.slice(1).map(p => ` L ${p.x},${p.y}`).join('') : '';

function projectToSegment(a: XYPosition, b: XYPosition, p: XYPosition) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  return { x: a.x + t * abx, y: a.y + t * aby };
}
function nearestSegmentIndex(poly: XYPosition[], p: XYPosition) {
  let bestIdx = 0, best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length - 1; i++) {
    const proj = projectToSegment(poly[i], poly[i + 1], p);
    const d2 = dist2(proj, p);
    if (d2 < best) { best = d2; bestIdx = i; }
  }
  return bestIdx;
}

const EditableEdge: React.FC<EdgeProps> = (props) => {
  const { id, sourceX, sourceY, targetX, targetY, selected, markerEnd, style, data } = props;
  const { setEdges, project } = useReactFlow();

  const paneRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    paneRef.current = document.querySelector('.react-flow__pane') as HTMLDivElement;
  }, []);

  const waypoints: XYPosition[] = Array.isArray(data?.points) ? data!.points : [];
  const poly: XYPosition[] = useMemo(
    () => [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }],
    [sourceX, sourceY, targetX, targetY, waypoints]
  );
  const d = useMemo(() => buildPath(poly), [poly]);

  // ===== refs เพื่อใช้กับ global listeners ที่คงที่ =====
  const dragIndexRef = useRef<number | null>(null);
  const dragStartRef = useRef<XYPosition | null>(null);
  const shiftLockRef = useRef<'h'|'v'|null>(null);
  const polyRef = useRef(poly);
  useEffect(() => { polyRef.current = poly; });

  const updatePoints = (points: XYPosition[]) => {
    const snapped = points.map(snapPt);
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, data: { ...(e.data || {}), points: snapped } } : e)));
  };

  // ===== stable global listeners =====
  useEffect(() => {
    if (!paneRef.current) return;
    let last = 0;

    const onMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - last < THROTTLE_MS) return;
      last = now;

      const idx = dragIndexRef.current;
      if (idx == null) return;

      const polyCur = polyRef.current;
      if (idx === 0 || idx === polyCur.length - 1) return; // ห้ามลากปลาย

      const rect = paneRef.current!.getBoundingClientRect();
      const p = project({ x: e.clientX - rect.left, y: e.clientY - rect.top });

      const start = dragStartRef.current;
      let q = p;
      if (e.shiftKey && start) {
        if (!shiftLockRef.current) {
          const dx = Math.abs(p.x - start.x), dy = Math.abs(p.y - start.y);
          shiftLockRef.current = dx >= dy ? 'h' : 'v';
        }
        q = shiftLockRef.current === 'h' ? { x: p.x, y: start.y } : { x: start.x, y: p.y };
      } else {
        shiftLockRef.current = null;
      }

      const next = [...polyCur];
      next[idx] = snapPt(q);
      updatePoints(next.slice(1, next.length - 1));
    };

    const onMouseUp = () => {
      dragIndexRef.current = null;
      dragStartRef.current = null;
      shiftLockRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [project, setEdges, id]);

  const onHandleMouseDown = (idx: number, e: React.MouseEvent) => {
    const polyCur = polyRef.current;
    if (idx === 0 || idx === polyCur.length - 1) return;
    dragIndexRef.current = idx;
    dragStartRef.current = polyCur[idx];
    e.stopPropagation();
  };

  const onHandleClick = (e: React.MouseEvent, idx: number) => {
    if (!e.altKey) return;
    const polyCur = polyRef.current;
    if (idx === 0 || idx === polyCur.length - 1) return;
    const wps = polyCur.slice(1, polyCur.length - 1);
    updatePoints([...wps.slice(0, idx - 1), ...wps.slice(idx)]);
    e.stopPropagation();
  };

  const onPathDoubleClick = (e: React.MouseEvent<SVGPathElement>) => {
    if (!paneRef.current) return;
    const rect = paneRef.current.getBoundingClientRect();
    const pScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const pFlow = project(pScreen);

    const polyCur = polyRef.current;
    if (dist2(pFlow, polyCur[0]) < 36 || dist2(pFlow, polyCur[polyCur.length - 1]) < 36) return;

    const segIdx = nearestSegmentIndex(polyCur, pFlow);
    const wps = polyCur.slice(1, polyCur.length - 1);
    const insertAt = segIdx;
    const proj = projectToSegment(polyCur[segIdx], polyCur[segIdx + 1], pFlow);
    updatePoints([...wps.slice(0, insertAt), snapPt(proj), ...wps.slice(insertAt)]);
    e.stopPropagation();
  };

  const stroke = (style?.stroke as string) || '#374151';
  const strokeWidth = style?.strokeWidth ? Number(style.strokeWidth) : 2;

  return (
    <g className="editable-edge">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        markerEnd={markerEnd}
        onDoubleClick={onPathDoubleClick}
        style={{ cursor: 'pointer' }}
      />
      <path d={d} fill="none" stroke="transparent" strokeWidth={HIT_STROKE} onDoubleClick={onPathDoubleClick} />
      {selected && poly.map((p, idx) => {
        const isEndpoint = idx === 0 || idx === poly.length - 1;
        return (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={HANDLE_R}
            fill={isEndpoint ? '#9ca3af' : '#10b981'}
            stroke="#111827"
            strokeWidth={1.5}
            onMouseDown={(e) => onHandleMouseDown(idx, e)}
            onClick={(e) => onHandleClick(e, idx)}
            style={{ cursor: isEndpoint ? 'not-allowed' : 'grab' }}
          />
        );
      })}
    </g>
  );
};

export default EditableEdge;