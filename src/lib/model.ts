import { ALL_MODES, type Hotspot, type Project, type ProjectSettings, type Screen } from '../types';

export const defaultSettings = (): ProjectSettings => ({ modes: [...ALL_MODES], optimizeImages: true });

export const uid = (prefix = '') =>
  prefix + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 12);

export function createProject(title: string, description = '', folderId: string | null = null): Project {
  const now = Date.now();
  return { id: uid('p_'), title, description, folderId, createdAt: now, updatedAt: now, startScreenId: null, screens: [], settings: defaultSettings() };
}

export function createScreen(imageId: string, width: number, height: number, name: string): Screen {
  return { id: uid('s_'), name, imageId, width, height, instruction: '', hotspots: [] };
}

export function createHotspot(rect: { x: number; y: number; w: number; h: number }, partial: Partial<Hotspot> = {}): Hotspot {
  return {
    id: uid('h_'),
    name: 'Hotspot',
    ...rect,
    kind: 'click',
    outcome: 'correct',
    action: 'navigate',
    targetScreenId: null,
    instruction: '',
    tooltip: '',
    feedback: '',
    silent: false,
    popupTitle: '',
    popupText: '',
    fieldTargetId: null,
    fieldValue: '',
    answers: [],
    caseSensitive: false,
    placeholder: '',
    options: [],
    correctOption: '',
    searchTerms: [],
    searchResults: [],
    correctResultId: null,
    ...partial,
  };
}

/** Fill in any fields missing from older/imported data. */
export function normalizeProject(p: Project): Project {
  return {
    ...p,
    description: p.description ?? '',
    folderId: p.folderId ?? null,
    startScreenId: p.startScreenId ?? p.screens[0]?.id ?? null,
    settings: { ...defaultSettings(), ...p.settings, modes: p.settings?.modes?.length ? p.settings.modes : [...ALL_MODES] },
    screens: (p.screens ?? []).map((s) => ({
      ...s,
      instruction: s.instruction ?? '',
      hotspots: (s.hotspots ?? []).map((h) => createHotspot({ x: h.x, y: h.y, w: h.w, h: h.h }, h)),
    })),
  };
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const round2 = (v: number) => Math.round(v * 100) / 100;

export const KIND_LABELS: Record<Hotspot['kind'], string> = {
  click: 'Click (button, tab, link, menu…)',
  text: 'Text entry',
  dropdown: 'Dropdown',
  search: 'Search box',
};

export const ACTION_LABELS: Record<Hotspot['action'], string> = {
  navigate: 'Go to screen',
  popup: 'Show a popup message',
  tooltip: 'Show a tooltip',
  setField: 'Set a field value',
  none: 'Stay on this screen (step complete)',
  finish: 'Finish the simulation',
};

export const OUTCOME_LABELS: Record<Hotspot['outcome'], string> = {
  correct: 'Correct action',
  alternative: 'Alternative path',
  incorrect: 'Incorrect action',
};
