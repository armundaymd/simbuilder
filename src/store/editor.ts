import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { clearJournal, getRepository, journalProject } from '../lib/db';
import { createHotspot, createScreen, uid } from '../lib/model';
import type { Hotspot, ImageRecord, Project, Screen } from '../types';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;
const AUTOSAVE_MS = 400;

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface EditorState {
  project: Project | null;
  past: Project[];
  future: Project[];
  lastEdit: { key: string; at: number } | null;
  selectedScreenId: string | null;
  selectedHotspotId: string | null;
  saveState: SaveState;
  notice: string | null;

  load(p: Project): void;
  close(): Promise<void>;
  /** Apply an edit. Edits sharing a coalesceKey within ~1s become one undo step (e.g. typing). */
  update(recipe: (d: Draft<Project>) => void, coalesceKey?: string): void;
  undo(): void;
  redo(): void;
  setNotice(n: string | null): void;

  selectScreen(id: string | null): void;
  selectHotspot(id: string | null): void;

  addScreens(images: { rec: ImageRecord; name: string }[]): void;
  deleteScreen(id: string): void;
  duplicateScreen(id: string): void;
  moveScreen(id: string, toIndex: number): void;
  updateScreen(id: string, patch: Partial<Screen>, coalesceKey?: string): void;

  addHotspot(screenId: string, rect: { x: number; y: number; w: number; h: number }): string;
  updateHotspot(id: string, patch: Partial<Hotspot>, coalesceKey?: string): void;
  deleteHotspot(id: string): void;
  duplicateHotspot(id: string): void;
  moveHotspotOrder(id: string, dir: -1 | 1): void;
  copyHotspotToScreens(id: string, screenIds: string[], outcome: Hotspot['outcome'] | null): number;
  /** Swap a screen's screenshot, keeping its hotspots. `permanent` also clears undo history (used for redaction). */
  replaceScreenImage(screenId: string, rec: ImageRecord, permanent?: boolean): string;
}

export const findScreenOf = (p: Project | Draft<Project>, hotspotId: string) => p.screens.find((s) => s.hotspots.some((h) => h.id === hotspotId));

export const useEditor = create<EditorState>()((set, get) => ({
  project: null,
  past: [],
  future: [],
  lastEdit: null,
  selectedScreenId: null,
  selectedHotspotId: null,
  saveState: 'saved',
  notice: null,

  load(p) {
    set({ project: p, past: [], future: [], lastEdit: null, selectedScreenId: p.startScreenId ?? p.screens[0]?.id ?? null, selectedHotspotId: null, saveState: 'saved', notice: null });
  },
  async close() {
    await flushSave();
    set({ project: null, past: [], future: [] });
  },

  update(recipe, coalesceKey) {
    const { project, past, lastEdit } = get();
    if (!project) return;
    const next = produce(project, (d) => {
      recipe(d);
      d.updatedAt = Date.now();
    });
    if (next === project) return;
    const now = Date.now();
    const coalesce = coalesceKey && lastEdit && lastEdit.key === coalesceKey && now - lastEdit.at < COALESCE_MS;
    set({
      project: next,
      past: coalesce ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
      future: [],
      lastEdit: coalesceKey ? { key: coalesceKey, at: now } : null,
    });
  },
  undo() {
    const { project, past, future } = get();
    if (!project || !past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], lastEdit: null });
    fixSelection();
  },
  redo() {
    const { project, past, future } = get();
    if (!project || !future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), lastEdit: null });
    fixSelection();
  },
  setNotice: (notice) => set({ notice }),

  selectScreen: (id) => set({ selectedScreenId: id, selectedHotspotId: null }),
  selectHotspot: (id) => set({ selectedHotspotId: id }),

  addScreens(images) {
    const screens = images.map(({ rec, name }) => createScreen(rec.id, rec.width, rec.height, name));
    if (!screens.length) return;
    get().update((d) => {
      d.screens.push(...screens);
      if (!d.startScreenId) d.startScreenId = screens[0].id;
    });
    set({ selectedScreenId: screens[0].id, selectedHotspotId: null });
  },
  deleteScreen(id) {
    const p = get().project!;
    const idx = p.screens.findIndex((s) => s.id === id);
    let broken = 0;
    get().update((d) => {
      d.screens = d.screens.filter((s) => s.id !== id);
      // Never leave dangling links: clear anything that pointed at the removed screen.
      for (const s of d.screens)
        for (const h of s.hotspots)
          if (h.targetScreenId === id) {
            h.targetScreenId = null;
            broken++;
          }
      if (d.startScreenId === id) d.startScreenId = d.screens[0]?.id ?? null;
    });
    const remaining = get().project!.screens;
    set({ selectedScreenId: remaining[Math.min(idx, remaining.length - 1)]?.id ?? null, selectedHotspotId: null });
    if (broken) set({ notice: `${broken} hotspot link${broken > 1 ? 's' : ''} pointed to the deleted screen and now need a new destination.` });
  },
  duplicateScreen(id) {
    const p = get().project!;
    const src = p.screens.find((s) => s.id === id);
    if (!src) return;
    const copy: Screen = { ...structuredClone(src), id: uid('s_'), name: `${src.name} (copy)` };
    const idMap = new Map(src.hotspots.map((h) => [h.id, uid('h_')]));
    copy.hotspots = copy.hotspots.map((h) => ({ ...h, id: idMap.get(h.id)!, fieldTargetId: h.fieldTargetId ? idMap.get(h.fieldTargetId) ?? null : null }));
    get().update((d) => {
      d.screens.splice(d.screens.findIndex((s) => s.id === id) + 1, 0, copy);
    });
    set({ selectedScreenId: copy.id, selectedHotspotId: null });
  },
  moveScreen(id, toIndex) {
    get().update((d) => {
      const from = d.screens.findIndex((s) => s.id === id);
      if (from < 0) return;
      const [s] = d.screens.splice(from, 1);
      d.screens.splice(Math.max(0, Math.min(toIndex, d.screens.length)), 0, s);
    });
  },
  updateScreen(id, patch, coalesceKey) {
    get().update((d) => {
      const s = d.screens.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    }, coalesceKey);
  },

  addHotspot(screenId, rect) {
    const p = get().project!;
    const idx = p.screens.findIndex((s) => s.id === screenId);
    const screen = p.screens[idx];
    const next = p.screens[idx + 1];
    const first = screen.hotspots.length === 0;
    // Sensible defaults: the first hotspot on a screen is the correct action that
    // leads to the next screen (or finishes, on the last screen).
    const h = createHotspot(rect, {
      name: `Hotspot ${screen.hotspots.length + 1}`,
      outcome: first ? 'correct' : 'alternative',
      action: next ? 'navigate' : first ? 'finish' : 'navigate',
      targetScreenId: next?.id ?? null,
    });
    get().update((d) => {
      d.screens[idx].hotspots.push(h);
    });
    set({ selectedHotspotId: h.id });
    return h.id;
  },
  updateHotspot(id, patch, coalesceKey) {
    get().update((d) => {
      const s = findScreenOf(d, id);
      const h = s?.hotspots.find((x) => x.id === id);
      if (h) Object.assign(h, patch);
    }, coalesceKey);
  },
  deleteHotspot(id) {
    get().update((d) => {
      const s = findScreenOf(d, id);
      if (!s) return;
      s.hotspots = s.hotspots.filter((h) => h.id !== id);
      for (const h of s.hotspots) if (h.fieldTargetId === id) h.fieldTargetId = null;
    });
    if (get().selectedHotspotId === id) set({ selectedHotspotId: null });
  },
  duplicateHotspot(id) {
    const p = get().project!;
    const s = findScreenOf(p, id);
    const src = s?.hotspots.find((h) => h.id === id);
    if (!s || !src) return;
    const copy: Hotspot = {
      ...structuredClone(src),
      id: uid('h_'),
      name: `${src.name} (copy)`,
      x: Math.min(src.x + 2, 100 - src.w),
      y: Math.min(src.y + 2, 100 - src.h),
    };
    get().update((d) => {
      const ds = d.screens.find((x) => x.id === s.id)!;
      ds.hotspots.splice(ds.hotspots.findIndex((h) => h.id === id) + 1, 0, copy);
    });
    set({ selectedHotspotId: copy.id });
  },
  copyHotspotToScreens(id, screenIds, outcome) {
    const p = get().project!;
    const src = findScreenOf(p, id)?.hotspots.find((h) => h.id === id);
    if (!src) return 0;
    get().update((d) => {
      for (const s of d.screens) {
        if (!screenIds.includes(s.id)) continue;
        s.hotspots.push({ ...structuredClone(src), id: uid('h_'), fieldTargetId: null, outcome: outcome ?? src.outcome });
      }
    });
    return screenIds.length;
  },
  replaceScreenImage(screenId, rec, permanent) {
    const old = get().project!.screens.find((s) => s.id === screenId)!.imageId;
    get().update((d) => {
      const s = d.screens.find((x) => x.id === screenId);
      if (s) Object.assign(s, { imageId: rec.id, width: rec.width, height: rec.height });
    });
    // Undo must not be able to bring back a redacted image.
    if (permanent) set({ past: [], future: [], lastEdit: null });
    return old;
  },
  moveHotspotOrder(id, dir) {
    get().update((d) => {
      const s = findScreenOf(d, id);
      if (!s) return;
      const i = s.hotspots.findIndex((h) => h.id === id);
      const j = i + dir;
      if (j < 0 || j >= s.hotspots.length) return;
      [s.hotspots[i], s.hotspots[j]] = [s.hotspots[j], s.hotspots[i]];
    });
  },
}));

function fixSelection() {
  const { project, selectedScreenId, selectedHotspotId } = useEditor.getState();
  if (!project) return;
  const screen = project.screens.find((s) => s.id === selectedScreenId) ?? project.screens[0];
  const hs = screen?.hotspots.some((h) => h.id === selectedHotspotId) ? selectedHotspotId : null;
  useEditor.setState({ selectedScreenId: screen?.id ?? null, selectedHotspotId: hs });
}

// ---------- autosave ----------
// Debounced, but never postponed more than MAX_WAIT_MS during continuous editing.
// Saves run one at a time so they always land in order.
const MAX_WAIT_MS = 1500;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending: Project | null = null;
let pendingSince = 0;
let chain: Promise<void> = Promise.resolve();

function doSave(): Promise<void> {
  clearTimeout(saveTimer);
  const p = pending;
  pending = null;
  pendingSince = 0;
  if (!p) return chain;
  useEditor.setState({ saveState: 'saving' });
  chain = chain.then(async () => {
    try {
      await getRepository().saveProject(p);
      clearJournal(p.id, p.updatedAt);
      if (!pending) useEditor.setState({ saveState: 'saved' });
    } catch (e) {
      console.error(e);
      useEditor.setState({ saveState: 'error' });
    }
  });
  return chain;
}

export function flushSave() {
  return doSave();
}

useEditor.subscribe((s, prev) => {
  if (!s.project || s.project === prev.project || prev.project?.id !== s.project.id) return;
  pending = s.project;
  pendingSince ||= Date.now();
  useEditor.setState({ saveState: 'unsaved' });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, Math.max(0, Math.min(AUTOSAVE_MS, pendingSince + MAX_WAIT_MS - Date.now())));
});

// Closing or reloading the page: write unsaved edits synchronously, then try the normal save too.
function saveOnExit() {
  if (!pending) return;
  journalProject(pending);
  void doSave();
}
window.addEventListener('pagehide', saveOnExit);
window.addEventListener('beforeunload', saveOnExit);
// Switching tabs/apps: flush right away (pages can be discarded while hidden).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void doSave();
});
