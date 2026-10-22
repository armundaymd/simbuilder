import { useMemo, useState } from 'react';
import { ACTION_LABELS, KIND_LABELS } from '../../lib/model';
import { reachableScreens, type Issue } from '../../lib/validate';
import { useEditor } from '../../store/editor';
import type { HotspotAction } from '../../types';
import { Thumb } from '../Thumb';
import { Icon } from '../ui/Icon';
import { OUTCOME_STYLE } from './Canvas';
import { FlowDiagram } from './FlowDiagram';

const OUTCOME_TEXT = { correct: 'Correct', alternative: 'Alternative', incorrect: 'Incorrect' } as const;

export function FlowView({ issues, onOpenScreen }: { issues: Issue[]; onOpenScreen: (screenId: string) => void }) {
  const project = useEditor((s) => s.project)!;
  const { updateHotspot, moveScreen } = useEditor.getState();
  const reachable = useMemo(() => reachableScreens(project), [project]);
  const [mode, setMode] = useState<'list' | 'diagram'>('list');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-2">
        <p className="text-sm text-slate-600">How learners move between screens. Change destinations here, or switch to the diagram for an overview.</p>
        <div className="flex-1" />
        <div className="flex rounded-md border border-slate-300 p-0.5 text-xs">
          {(['list', 'diagram'] as const).map((m) => (
            <button key={m} className={`rounded px-2.5 py-1 ${mode === m ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => setMode(m)} data-testid={`flow-${m}`}>
              {m === 'list' ? 'List' : 'Diagram'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'diagram' ? (
        <FlowDiagram onOpenScreen={onOpenScreen} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {project.screens.length === 0 && <p className="text-sm text-slate-500">No screens yet.</p>}
          <ol className="mx-auto max-w-4xl space-y-3" data-testid="flow-list">
            {project.screens.map((s, i) => {
              const screenIssues = issues.filter((x) => x.screenId === s.id);
              return (
                <li key={s.id} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-xs" data-testid="flow-screen">
                  <button className="w-40 flex-none" onClick={() => onOpenScreen(s.id)} title="Edit this screen">
                    <Thumb imageId={s.imageId} className="aspect-[16/10] w-full rounded border border-slate-200" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-800 px-1.5 text-xs font-semibold text-white">{i + 1}</span>
                      <button className="truncate font-medium hover:underline" onClick={() => onOpenScreen(s.id)}>
                        {s.name}
                      </button>
                      {project.startScreenId === s.id && <span className="rounded bg-emerald-600 px-1.5 text-[10px] font-semibold text-white uppercase">Start</span>}
                      {!reachable.has(s.id) && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800">Unreachable</span>}
                      {screenIssues.some((x) => x.level === 'error') && <span className="rounded bg-red-100 px-1.5 text-[11px] font-medium text-red-800">Needs attention</span>}
                      <div className="flex-1" />
                      <button className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-20" disabled={i === 0} onClick={() => moveScreen(s.id, i - 1)} aria-label="Move screen up">
                        <Icon name="up" />
                      </button>
                      <button className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-20" disabled={i === project.screens.length - 1} onClick={() => moveScreen(s.id, i + 1)} aria-label="Move screen down">
                        <Icon name="down" />
                      </button>
                    </div>
                    {s.instruction && <p className="mt-0.5 truncate text-xs text-slate-500">“{s.instruction}”</p>}
                    {s.hotspots.length === 0 ? (
                      <p className="mt-2 text-sm text-amber-700">No clickable areas — open the screen to draw some.</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {s.hotspots.map((h) => (
                          <li key={h.id} className="flex items-center gap-2 text-sm">
                            <span className={`w-20 flex-none rounded px-1.5 py-0.5 text-center text-[11px] font-medium text-white ${OUTCOME_STYLE[h.outcome].chip}`}>{OUTCOME_TEXT[h.outcome]}</span>
                            <span className="min-w-0 truncate" title={KIND_LABELS[h.kind]}>
                              {h.name}
                              {h.kind !== 'click' && <span className="ml-1 text-xs text-slate-400">({h.kind})</span>}
                            </span>
                            <Icon name="arrow" className="h-4 w-4 flex-none text-slate-400" />
                            <select
                              className="input w-auto max-w-56 py-0.5 text-xs"
                              aria-label={`Destination for ${h.name}`}
                              value={h.action === 'navigate' ? `screen:${h.targetScreenId ?? ''}` : `action:${h.action}`}
                              onChange={(e) => {
                                const [kind, v] = e.target.value.split(':');
                                if (kind === 'screen') updateHotspot(h.id, { action: 'navigate', targetScreenId: v || null });
                                else updateHotspot(h.id, { action: v as HotspotAction });
                              }}
                            >
                              {h.action === 'navigate' && !h.targetScreenId && <option value="screen:">Choose a screen…</option>}
                              <optgroup label="Go to screen">
                                {project.screens.map((t, j) => (
                                  <option key={t.id} value={`screen:${t.id}`}>
                                    {j + 1}. {t.name}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Other">
                                {(['popup', 'tooltip', 'setField', 'none', 'finish'] as HotspotAction[]).map((a) => (
                                  <option key={a} value={`action:${a}`}>
                                    {ACTION_LABELS[a]}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            {h.outcome === 'incorrect' && h.feedback && <span className="truncate text-xs text-slate-500">“{h.feedback}”</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
