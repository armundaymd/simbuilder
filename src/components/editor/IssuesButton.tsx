import { useState } from 'react';
import type { Issue } from '../../lib/validate';
import { Icon } from '../ui/Icon';

export function IssuesButton({ issues, onShow }: { issues: Issue[]; onShow: (screenId?: string, hotspotId?: string) => void }) {
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  const ok = issues.length === 0;
  return (
    <div className="relative">
      <button
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : errors ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
        onClick={() => setOpen(!open)}
        data-testid="issues-button"
      >
        <Icon name={ok ? 'check' : 'alert'} />
        {ok ? 'Ready' : errors ? `${errors} problem${errors > 1 ? 's' : ''}` : `${warnings} warning${warnings > 1 ? 's' : ''}`}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-2 shadow-xl" data-testid="issues-popover">
            {ok ? (
              <p className="p-2 text-sm text-slate-600">No problems found. Your simulation is ready to export.</p>
            ) : (
              <ul className="max-h-96 space-y-1 overflow-auto">
                {issues.map((i, n) => (
                  <li key={n}>
                    <button
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i.level === 'error' ? 'text-red-800 hover:bg-red-50' : 'text-amber-800 hover:bg-amber-50'}`}
                      onClick={() => {
                        onShow(i.screenId, i.hotspotId);
                        setOpen(false);
                      }}
                    >
                      <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
                      {i.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
