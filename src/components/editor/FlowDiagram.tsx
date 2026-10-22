import { useMemo } from 'react';
import { hotspotTargets, reachableScreens } from '../../lib/validate';
import { useEditor } from '../../store/editor';
import type { Hotspot, Project } from '../../types';
import { Thumb } from '../Thumb';

const NODE_W = 200;
const NODE_H = 150;
const COL_GAP = 110;
const ROW_GAP = 60;
const PAD = 30;
const FINISH = '__finish__';

const EDGE_COLOR: Record<Hotspot['outcome'], string> = { correct: '#059669', alternative: '#2563eb', incorrect: '#dc2626' };

interface Edge {
  from: string;
  to: string;
  h: Hotspot;
}

function layout(project: Project) {
  // Columns = shortest distance from the start screen (BFS); unreachable screens go in a final column.
  const depth = new Map<string, number>();
  const byId = new Map(project.screens.map((s) => [s.id, s]));
  const queue: string[] = [];
  if (project.startScreenId && byId.has(project.startScreenId)) {
    depth.set(project.startScreenId, 0);
    queue.push(project.startScreenId);
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const h of byId.get(id)!.hotspots)
      for (const t of hotspotTargets(h))
        if (byId.has(t) && !depth.has(t)) {
          depth.set(t, depth.get(id)! + 1);
          queue.push(t);
        }
  }
  const maxDepth = Math.max(0, ...depth.values());
  const cols: string[][] = [];
  for (const s of project.screens) {
    const d = depth.get(s.id) ?? maxDepth + 1;
    (cols[d] ??= []).push(s.id);
  }
  const edges: Edge[] = [];
  let hasFinish = false;
  for (const s of project.screens)
    for (const h of s.hotspots) {
      for (const t of hotspotTargets(h)) if (byId.has(t)) edges.push({ from: s.id, to: t, h });
      if (h.action === 'finish' && h.outcome !== 'incorrect') {
        edges.push({ from: s.id, to: FINISH, h });
        hasFinish = true;
      }
    }
  const finishCol = cols.length;
  if (hasFinish) cols[finishCol] = [FINISH];
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((ids, c) => (ids ?? []).forEach((id, r) => pos.set(id, { x: PAD + c * (NODE_W + COL_GAP), y: PAD + r * (NODE_H + ROW_GAP) })));
  const width = PAD * 2 + cols.length * (NODE_W + COL_GAP);
  const height = PAD * 2 + Math.max(1, ...cols.map((c) => c?.length ?? 0)) * (NODE_H + ROW_GAP);
  return { pos, edges, width, height };
}

export function FlowDiagram({ onOpenScreen }: { onOpenScreen: (id: string) => void }) {
  const project = useEditor((s) => s.project)!;
  const { pos, edges, width, height } = useMemo(() => layout(project), [project]);
  const reachable = useMemo(() => reachableScreens(project), [project]);
  const byId = new Map(project.screens.map((s, i) => [s.id, { s, i }]));

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="flow-diagram">
      <div className="min-h-0 flex-1 overflow-auto">
      <div className="relative" style={{ width, height }}>
        <svg className="absolute inset-0" width={width} height={height}>
          <defs>
            {Object.entries(EDGE_COLOR).map(([k, c]) => (
              <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10z" fill={c} />
              </marker>
            ))}
          </defs>
          {edges.map((e, n) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            const siblings = edges.filter((x) => x.from === e.from);
            const k = siblings.indexOf(e);
            const sy = a.y + 40 + ((k + 1) * (NODE_H - 50)) / (siblings.length + 1);
            const forward = b.x > a.x;
            const x1 = a.x + NODE_W;
            const y2 = b.y + NODE_H / 2;
            const x2 = forward ? b.x : b.x + NODE_W / 2;
            const yEnd = forward ? y2 : b.y + NODE_H;
            const d = forward
              ? `M${x1} ${sy} C${x1 + COL_GAP / 2} ${sy}, ${x2 - COL_GAP / 2} ${y2}, ${x2} ${y2}`
              : `M${x1} ${sy} C${x1 + 60} ${sy}, ${x1 + 60} ${Math.max(a.y, b.y) + NODE_H + 45}, ${(x1 + x2) / 2} ${Math.max(a.y, b.y) + NODE_H + 45} S${x2} ${yEnd + 30}, ${x2} ${yEnd}`;
            return (
              <g key={n}>
                <path d={d} fill="none" stroke={EDGE_COLOR[e.h.outcome]} strokeWidth={2} strokeDasharray={e.h.outcome === 'alternative' ? '6 4' : undefined} markerEnd={`url(#arrow-${e.h.outcome})`} />
                <text x={x1 + 6} y={sy - 4} fontSize="10" fill={EDGE_COLOR[e.h.outcome]}>
                  {e.h.name.length > 18 ? e.h.name.slice(0, 17) + '…' : e.h.name}
                </text>
              </g>
            );
          })}
        </svg>
        {[...pos.entries()].map(([id, p]) => {
          if (id === FINISH)
            return (
              <div key={id} className="absolute flex items-center justify-center rounded-xl border-2 border-emerald-500 bg-emerald-50 font-semibold text-emerald-700" style={{ left: p.x, top: p.y + NODE_H / 2 - 30, width: NODE_W * 0.6, height: 60 }}>
                ✓ Finish
              </div>
            );
          const { s, i } = byId.get(id)!;
          const mistakes = s.hotspots.filter((h) => h.outcome === 'incorrect' && !hotspotTargets(h).length).length;
          return (
            <button
              key={id}
              className={`absolute overflow-hidden rounded-xl border-2 bg-white text-left shadow-sm hover:shadow-md ${project.startScreenId === id ? 'border-emerald-500' : reachable.has(id) ? 'border-slate-300' : 'border-dashed border-amber-400'}`}
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              onClick={() => onOpenScreen(id)}
              title="Edit this screen"
            >
              <Thumb imageId={s.imageId} className="h-[110px] w-full" />
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
                <span className="rounded bg-slate-800 px-1 font-semibold text-white">{i + 1}</span>
                <span className="truncate font-medium">{s.name}</span>
                {mistakes > 0 && <span className="ml-auto rounded bg-red-100 px-1 text-[10px] text-red-700" title="Incorrect actions with feedback">{mistakes}✕</span>}
              </div>
            </button>
          );
        })}
      </div>
      </div>
      <div className="flex gap-4 border-t border-slate-200 bg-white/90 px-6 py-2 text-xs text-slate-600">
        <span><span className="mr-1 inline-block h-0.5 w-5 bg-emerald-600 align-middle" />Correct</span>
        <span><span className="mr-1 inline-block w-5 border-t-2 border-dashed border-blue-600 align-middle" />Alternative</span>
        <span><span className="mr-1 inline-block h-0.5 w-5 bg-red-600 align-middle" />Incorrect (navigates)</span>
        <span><span className="mr-1 inline-block h-3 w-4 rounded border-2 border-dashed border-amber-400 align-middle" />Unreachable</span>
      </div>
    </div>
  );
}
