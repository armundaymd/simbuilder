import { useMemo, useState } from 'react';
import { exportProject, type ExportFormat } from '../lib/export';
import { validateProject } from '../lib/validate';
import type { Project } from '../types';
import { Icon } from './ui/Icon';
import { Button, Modal } from './ui/ui';

const FORMATS: { id: ExportFormat; title: string; desc: string; learner: boolean }[] = [
  { id: 'html', title: 'Standalone HTML', desc: 'One file with everything inside. Email it or put it on a shared drive — opens in any browser, works offline.', learner: true },
  { id: 'zip', title: 'ZIP package', desc: 'index.html with separate screenshot files and a project backup. Unzip and open index.html.', learner: true },
  { id: 'scorm', title: 'SCORM 1.2 package (for an LMS)', desc: 'Upload to HealthStream, Cornerstone, Moodle, etc. Reports completion, score (accuracy) and time. Practice modes count; demonstration doesn’t unless it’s the only mode.', learner: true },
  { id: 'json', title: 'Project file (JSON)', desc: 'A backup you can import into SimBuilder later, on this or another computer, to keep editing.', learner: false },
];

export function ExportDialog({ project, onClose, onShowIssue }: { project: Project; onClose: () => void; onShowIssue?: (screenId?: string, hotspotId?: string) => void }) {
  const issues = useMemo(() => validateProject(project), [project]);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ExportFormat | null>(null);

  async function run(f: ExportFormat) {
    setBusy(f);
    setError(null);
    try {
      await exportProject(project, f);
      setDone(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={`Export “${project.title}”`} onClose={onClose} width="max-w-2xl" footer={<Button onClick={onClose}>Close</Button>}>
      {issues.length > 0 && (
        <div className="mb-4 space-y-2" data-testid="export-issues">
          {errors.length > 0 && (
            <p className="text-sm font-medium text-red-700">Fix {errors.length === 1 ? 'this problem' : `these ${errors.length} problems`} before exporting for learners:</p>
          )}
          <ul className="max-h-48 space-y-1 overflow-auto">
            {[...errors, ...warnings].map((i, n) => (
              <li key={n} className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${i.level === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
                <span className="flex-1">{i.message}</span>
                {onShowIssue && i.screenId && (
                  <button className="text-xs font-medium underline" onClick={() => onShowIssue(i.screenId, i.hotspotId)}>
                    Show me
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3">
        {FORMATS.map((f) => {
          const blocked = f.learner && errors.length > 0;
          return (
            <div key={f.id} className="flex items-center gap-4 rounded-lg border border-slate-200 p-3">
              <div className="flex-1">
                <div className="font-medium">{f.title}</div>
                <div className="text-sm text-slate-500">{f.desc}</div>
              </div>
              <Button variant={f.id === 'html' ? 'primary' : 'secondary'} icon={done === f.id ? 'check' : 'download'} disabled={blocked || busy !== null} onClick={() => run(f.id)} data-testid={`export-${f.id}`}>
                {busy === f.id ? 'Exporting…' : done === f.id ? 'Downloaded' : 'Export'}
              </Button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <p className="mt-4 text-xs text-slate-500">Exports are created on this computer. Nothing is uploaded.</p>
    </Modal>
  );
}
