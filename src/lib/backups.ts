// Tracks when each project was last exported as a backup (per browser, like the projects themselves).
import type { Project } from '../types';

const KEY = 'simbuilder.backups';

function read(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function markBackedUp(ids: string[]) {
  const all = read();
  for (const id of ids) all[id] = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

/** Projects with changes newer than their last backup. */
export function needsBackup(projects: Project[]): Project[] {
  const all = read();
  return projects.filter((p) => p.screens.length > 0 && (all[p.id] ?? 0) < p.updatedAt);
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
