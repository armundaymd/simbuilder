// Per-project "have you done this yet?" flags for the Getting started checklist.
const key = (projectId: string, step: string) => `simbuilder.progress.${projectId}.${step}`;

export function markStep(projectId: string, step: 'previewed' | 'exported') {
  try {
    localStorage.setItem(key(projectId, step), '1');
  } catch {
    /* storage unavailable */
  }
}

export function hasStep(projectId: string, step: 'previewed' | 'exported') {
  try {
    return localStorage.getItem(key(projectId, step)) === '1';
  } catch {
    return false;
  }
}

const HIDE_KEY = 'simbuilder.hideGettingStarted';
export function checklistHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}
export function hideChecklist() {
  try {
    localStorage.setItem(HIDE_KEY, '1');
  } catch {
    /* ignore */
  }
}
