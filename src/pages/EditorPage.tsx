import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '../components/editor/Canvas';
import { FlowView } from '../components/editor/FlowView';
import { Inspector } from '../components/editor/Inspector';
import { IssuesButton } from '../components/editor/IssuesButton';
import { ScreenList } from '../components/editor/ScreenList';
import { ShortcutsHelp } from '../components/editor/ShortcutsHelp';
import { GettingStarted } from '../components/editor/GettingStarted';
import { markStep } from '../lib/progress';
import { ExportDialog } from '../components/ExportDialog';
import { Icon } from '../components/ui/Icon';
import { Button, Field, Modal } from '../components/ui/ui';
import { getRepository } from '../lib/db';
import { MAX_IMAGE_WIDTH, isAcceptedImage, optimizeImage, storeImage } from '../lib/images';
import { ALL_MODES, type TrainingMode } from '../types';
import { addImageFiles } from '../lib/upload';
import { clamp, round2 } from '../lib/model';
import { navigate } from '../lib/router';
import { validateProject } from '../lib/validate';
import { findScreenOf, flushSave, useEditor } from '../store/editor';

export type View = 'screens' | 'flow';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export default function EditorPage({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const saveState = useEditor((s) => s.saveState);
  const notice = useEditor((s) => s.notice);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [missing, setMissing] = useState(false);
  const [view, setView] = useState<View>('screens');
  const [exporting, setExporting] = useState(false);
  const [details, setDetails] = useState(false);
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let live = true;
    getRepository()
      .getProject(id)
      .then((p) => {
        if (!live) return;
        if (p) useEditor.getState().load(p);
        else setMissing(true);
      });
    return () => {
      live = false;
      void useEditor.getState().close();
    };
  }, [id]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useEditor.getState().setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const issues = useMemo(() => (project ? validateProject(project) : []), [project]);

  const showIssue = useCallback((screenId?: string, hotspotId?: string) => {
    setView('screens');
    setExporting(false);
    if (screenId) useEditor.getState().selectScreen(screenId);
    if (hotspotId) useEditor.getState().selectHotspot(hotspotId);
  }, []);

  const preview = useCallback(async (fromScreen?: string) => {
    markStep(id, 'previewed');
    await flushSave();
    navigate(`/preview/${id}${fromScreen ? `?screen=${fromScreen}` : ''}`);
  }, [id]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      if (!st.project || document.querySelector('[role=dialog]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        void flushSave();
        return;
      }
      if (isTyping(e.target)) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          st.selectHotspot(null);
        }
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && key === 'd' && st.selectedHotspotId) {
        e.preventDefault();
        st.duplicateHotspot(st.selectedHotspotId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedHotspotId) {
        e.preventDefault();
        st.deleteHotspot(st.selectedHotspotId);
      } else if (e.key === 'Escape') {
        st.selectHotspot(null);
      } else if (e.key.startsWith('Arrow') && st.selectedHotspotId) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.25;
        const s = findScreenOf(st.project, st.selectedHotspotId)!;
        const h = s.hotspots.find((x) => x.id === st.selectedHotspotId)!;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.updateHotspot(h.id, { x: round2(clamp(h.x + dx, 0, 100 - h.w)), y: round2(clamp(h.y + dy, 0, 100 - h.h)) }, `nudge:${h.id}`);
      } else if (e.key === 'PageDown' || e.key === 'PageUp' || e.key === ']' || e.key === '[') {
        const screens = st.project.screens;
        const i = screens.findIndex((s) => s.id === st.selectedScreenId);
        const j = clamp(i + (e.key === 'PageDown' || e.key === ']' ? 1 : -1), 0, screens.length - 1);
        if (screens[j]) st.selectScreen(screens[j].id);
      } else if (e.key === '?') {
        setHelp(true);
      } else if (key === 'p' && !mod) {
        void preview(st.selectedScreenId ?? undefined);
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || !useEditor.getState().project) return;
      const files = [...(e.clipboardData?.files ?? [])].filter(isAcceptedImage);
      if (files.length) {
        e.preventDefault();
        void addImageFiles(files);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [preview]);

  if (missing)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p>This simulation couldn’t be found.</p>
        <Button onClick={() => navigate('/')}>Back to dashboard</Button>
      </div>
    );
  if (!project) return null;

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.relatedTarget === null && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void addImageFiles([...e.dataTransfer.files]);
      }}
    >
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <Button variant="ghost" icon="back" onClick={() => navigate('/')} title="Back to dashboard">
          Dashboard
        </Button>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <input
          className="min-w-0 max-w-sm flex-1 rounded-md border border-transparent px-2 py-1 text-base font-semibold outline-none hover:border-slate-200 focus:border-blue-500"
          value={project.title}
          onChange={(e) => useEditor.getState().update((d) => void (d.title = e.target.value), 'title')}
          aria-label="Simulation title"
          data-testid="project-title"
        />
        <Button variant="ghost" size="sm" onClick={() => setDetails(true)}>
          Details
        </Button>
        <SaveIndicator state={saveState} />
        <div className="flex-1" />
        <div className="flex rounded-md border border-slate-300 p-0.5 text-sm">
          {(['screens', 'flow'] as View[]).map((v) => (
            <button key={v} className={`rounded px-3 py-1 ${view === v ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => setView(v)} data-testid={`view-${v}`}>
              {v === 'screens' ? 'Editor' : 'Workflow'}
            </button>
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <Button variant="ghost" icon="undo" disabled={!canUndo} onClick={() => useEditor.getState().undo()} title="Undo (⌘Z)" aria-label="Undo" />
        <Button variant="ghost" icon="redo" disabled={!canRedo} onClick={() => useEditor.getState().redo()} title="Redo (⇧⌘Z)" aria-label="Redo" />
        <Button variant="ghost" onClick={() => navigate('/help')} title="How to build a simulation" data-testid="open-guide">
          Guide
        </Button>
        <IssuesButton issues={issues} onShow={showIssue} />
        <Button icon="play" onClick={() => preview()} disabled={!project.screens.length} data-testid="preview">
          Preview
        </Button>
        <Button variant="primary" icon="download" onClick={async () => (await flushSave(), setExporting(true))} data-testid="export">
          Export
        </Button>
      </header>

      {view === 'screens' ? (
        <div className="flex min-h-0 flex-1">
          <ScreenList issues={issues} />
          <div className="relative flex min-w-0 flex-1">
            <Canvas onPreview={preview} />
            <GettingStarted issues={issues} />
          </div>
          <Inspector issues={issues} />
        </div>
      ) : (
        <FlowView issues={issues} onOpenScreen={(sid) => showIssue(sid)} />
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-blue-600/10 ring-4 ring-blue-500 ring-inset">
          <div className="rounded-xl bg-white px-6 py-4 text-lg font-medium text-blue-700 shadow-xl">Drop screenshots to add them as screens</div>
        </div>
      )}
      {notice && (
        <div className="fixed bottom-5 left-1/2 z-50 flex max-w-xl -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg" role="status">
          <Icon name="alert" className="h-4 w-4 flex-none text-amber-300" />
          {notice}
          <button onClick={() => useEditor.getState().setNotice(null)} aria-label="Dismiss">
            <Icon name="x" />
          </button>
        </div>
      )}
      {exporting && <ExportDialog project={project} onClose={() => setExporting(false)} onShowIssue={showIssue} />}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      {details && (
        <Modal title="Simulation details" onClose={() => setDetails(false)} footer={<Button variant="primary" onClick={() => setDetails(false)}>Done</Button>}>
          <div className="space-y-4">
            <Field label="Title">
              <input className="input" value={project.title} onChange={(e) => useEditor.getState().update((d) => void (d.title = e.target.value), 'title')} />
            </Field>
            <Field label="Description" hint="Shown to learners on the start screen. For assessments, describe the task here (e.g. “Order a STAT CBC for Alex Testpatient”).">
              <textarea className="input min-h-24" value={project.description} onChange={(e) => useEditor.getState().update((d) => void (d.description = e.target.value), 'description')} />
            </Field>
            <ModeSettings modes={project.settings.modes} />
            <ImageSettings />
          </div>
        </Modal>
      )}
    </div>
  );
}

const MODE_TEXT: Record<TrainingMode, [string, string]> = {
  demo: ['Demonstration', 'Highlights each step; Next performs it.'],
  guided: ['Guided practice', 'Highlights + instructions + feedback on mistakes.'],
  independent: ['Independent practice', 'Instructions shown, no highlights; mistakes tracked.'],
  assessment: ['Assessment', 'No instructions, hints or feedback. Records mistakes and time per screen — shows whether the workflow is intuitive.'],
};

function ModeSettings({ modes }: { modes: TrainingMode[] }) {
  return (
    <div>
      <span className="label">Modes learners can choose</span>
      <div className="space-y-1.5 rounded-md border border-slate-200 p-3">
        {ALL_MODES.map((m) => (
          <label key={m} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={modes.includes(m)}
              disabled={modes.length === 1 && modes.includes(m)}
              data-testid={`mode-${m}`}
              onChange={(e) =>
                useEditor.getState().update((d) => {
                  d.settings.modes = e.target.checked ? ALL_MODES.filter((x) => x === m || d.settings.modes.includes(x)) : d.settings.modes.filter((x) => x !== m);
                })
              }
            />
            <span>
              <b className="font-medium">{MODE_TEXT[m][0]}</b>
              <span className="block text-xs text-slate-500">{MODE_TEXT[m][1]}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ImageSettings() {
  const project = useEditor((s) => s.project)!;
  const [busy, setBusy] = useState(false);
  async function optimizeExisting() {
    setBusy(true);
    const st = useEditor.getState();
    let saved = 0;
    try {
      for (const s of project.screens) {
        const rec = await getRepository().getImage(s.imageId);
        if (!rec) continue;
        const out = await optimizeImage(rec.blob);
        if (out === rec.blob || out.size >= rec.blob.size) continue;
        saved += rec.blob.size - out.size;
        st.replaceScreenImage(s.id, await storeImage(out));
      }
      st.setNotice(saved ? `Screenshots optimized — saved ${(saved / 1e6).toFixed(1)} MB.` : 'Screenshots are already optimized.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <span className="label">Screenshots</span>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={project.settings.optimizeImages} onChange={(e) => useEditor.getState().update((d) => void (d.settings.optimizeImages = e.target.checked))} />
        <span>
          Optimize screenshots when added (recommended)
          <span className="block text-xs text-slate-500">Shrinks very large images to {MAX_IMAGE_WIDTH}px wide and compresses them, keeping exported files small enough to email.</span>
        </span>
      </label>
      <Button size="sm" className="mt-2" disabled={busy || !project.screens.length} onClick={optimizeExisting}>
        {busy ? 'Optimizing…' : 'Optimize existing screenshots'}
      </Button>
    </div>
  );
}

function SaveIndicator({ state }: { state: string }) {
  const map: Record<string, [string, string]> = {
    saved: ['All changes saved', 'text-slate-400'],
    saving: ['Saving…', 'text-slate-400'],
    unsaved: ['Saving…', 'text-slate-400'],
    error: ['Couldn’t save — check disk space', 'text-red-600'],
  };
  const [text, cls] = map[state];
  return (
    <span className={`flex items-center gap-1 text-xs whitespace-nowrap ${cls}`} data-testid="save-state" data-state={state}>
      {state === 'saved' && <Icon name="check" className="h-3.5 w-3.5" />}
      {text}
    </span>
  );
}
