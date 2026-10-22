import { useState } from 'react';
import { checklistHidden, hasStep, hideChecklist } from '../../lib/progress';
import { navigate } from '../../lib/router';
import type { Issue } from '../../lib/validate';
import { useEditor } from '../../store/editor';
import { Icon } from '../ui/Icon';

/** A self-ticking checklist that teaches the workflow inside the editor. */
export function GettingStarted({ issues }: { issues: Issue[] }) {
  const project = useEditor((s) => s.project)!;
  const [hidden, setHidden] = useState(checklistHidden);
  const [open, setOpen] = useState(true);
  if (hidden) return null;

  const s = project.screens;
  const steps: [boolean, string, string][] = [
    [s.length > 0, 'Add your screenshots', 'Drop image files onto the window or paste with ⌘V.'],
    [s.length > 0 && s.every((x) => x.hotspots.length > 0), 'Draw a clickable area on each screen', 'Drag over the button the learner should click. It links to the next screen automatically.'],
    [s.some((x) => x.instruction.trim() || x.hotspots.some((h) => h.instruction.trim())), 'Add instructions', 'Select a screen and type what the learner should do.'],
    [s.length > 0 && !issues.some((i) => i.level === 'error'), 'Fix any problems', 'The badge at the top right turns green (“Ready”).'],
    [hasStep(project.id, 'previewed'), 'Preview it as a learner', 'Click Preview and try each mode.'],
    [hasStep(project.id, 'exported'), 'Export and share', 'Export → Standalone HTML gives you one file to send.'],
  ];
  const done = steps.filter(([d]) => d).length;
  const next = steps.findIndex(([d]) => !d);

  return (
    <div className="absolute bottom-4 left-4 z-20 w-80 rounded-xl border border-slate-200 bg-white shadow-lg" data-testid="getting-started">
      <div className="flex items-center gap-2 px-3 py-2">
        <button className="flex flex-1 items-center gap-2 text-left text-sm font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="relative h-5 w-5">
            <svg viewBox="0 0 20 20" className="h-5 w-5 -rotate-90">
              <circle cx="10" cy="10" r="8" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle cx="10" cy="10" r="8" fill="none" stroke="#2563eb" strokeWidth="3" strokeDasharray={`${(done / steps.length) * 50.3} 50.3`} />
            </svg>
          </span>
          Getting started · {done}/{steps.length}
          <Icon name={open ? 'down' : 'up'} className="ml-auto h-4 w-4 text-slate-400" />
        </button>
        <button
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Hide this checklist (for all simulations)"
          aria-label="Hide checklist"
          onClick={() => {
            hideChecklist();
            setHidden(true);
          }}
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-100 px-3 pt-2 pb-3">
          <ol className="space-y-1.5">
            {steps.map(([d, title, hint], i) => (
              <li key={title} className="flex gap-2 text-sm">
                <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full ${d ? 'bg-emerald-600 text-white' : i === next ? 'border-2 border-blue-600' : 'border-2 border-slate-300'}`}>
                  {d && <Icon name="check" className="h-3 w-3" />}
                </span>
                <span className={d ? 'text-slate-400 line-through' : i === next ? 'font-medium text-slate-900' : 'text-slate-600'}>
                  {title}
                  {i === next && <span className="block text-xs font-normal text-slate-500">{hint}</span>}
                </span>
              </li>
            ))}
          </ol>
          <button className="mt-3 text-xs font-medium text-blue-700 hover:underline" onClick={() => navigate('/help')}>
            Open the full guide →
          </button>
        </div>
      )}
    </div>
  );
}
