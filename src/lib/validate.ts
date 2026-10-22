import type { Hotspot, Project, Screen } from '../types';

export interface Issue {
  level: 'error' | 'warning';
  message: string;
  screenId?: string;
  hotspotId?: string;
}

/** Screens a hotspot can lead to (navigate, or popup followed by navigation). */
export function hotspotTargets(h: Hotspot): string[] {
  return (h.action === 'navigate' || h.action === 'popup') && h.targetScreenId ? [h.targetScreenId] : [];
}

export function reachableScreens(project: Project): Set<string> {
  const byId = new Map(project.screens.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const queue = project.startScreenId ? [project.startScreenId] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    for (const h of byId.get(id)!.hotspots) {
      if (h.outcome === 'incorrect' && h.action !== 'navigate') continue; // incorrect popups don't navigate
      queue.push(...hotspotTargets(h));
    }
  }
  return seen;
}

/** Can a learner reach a "finish" action from the start screen via correct/alternative actions? */
function canFinish(project: Project): boolean {
  const byId = new Map(project.screens.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const queue = project.startScreenId ? [project.startScreenId] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    for (const h of byId.get(id)!.hotspots) {
      if (h.outcome === 'incorrect') continue;
      if (h.action === 'finish') return true;
      queue.push(...hotspotTargets(h));
    }
  }
  return false;
}

function label(s: Screen, h?: Hotspot) {
  return h ? `“${s.name}” › “${h.name}”` : `“${s.name}”`;
}

export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set(project.screens.map((s) => s.id));

  if (!project.title.trim()) issues.push({ level: 'error', message: 'The simulation needs a title.' });
  if (project.screens.length === 0) {
    issues.push({ level: 'error', message: 'Add at least one screenshot.' });
    return issues;
  }
  if (!project.startScreenId || !ids.has(project.startScreenId)) {
    issues.push({ level: 'error', message: 'Choose a start screen.' });
  }

  for (const s of project.screens) {
    if (s.hotspots.length === 0) {
      issues.push({ level: 'warning', screenId: s.id, message: `${label(s)} has no clickable areas — learners will be stuck here.` });
    } else if (!s.hotspots.some((h) => h.outcome !== 'incorrect')) {
      issues.push({ level: 'error', screenId: s.id, message: `${label(s)} has no correct action — learners can’t continue.` });
    }
    for (const h of s.hotspots) {
      const at = { screenId: s.id, hotspotId: h.id };
      if (h.action === 'navigate') {
        if (!h.targetScreenId) issues.push({ level: 'error', ...at, message: `${label(s, h)} goes to a screen, but no destination is chosen.` });
        else if (!ids.has(h.targetScreenId)) issues.push({ level: 'error', ...at, message: `${label(s, h)} points to a screen that no longer exists.` });
        else if (h.targetScreenId === s.id && h.outcome !== 'incorrect')
          issues.push({ level: 'warning', ...at, message: `${label(s, h)} navigates to its own screen.` });
      }
      if (h.action === 'popup' && h.targetScreenId && !ids.has(h.targetScreenId))
        issues.push({ level: 'error', ...at, message: `${label(s, h)} goes to a screen after its popup that no longer exists.` });
      if (h.action === 'popup' && !h.popupText.trim() && !h.popupTitle.trim())
        issues.push({ level: 'error', ...at, message: `${label(s, h)} shows a popup, but the popup has no text.` });
      if (h.action === 'tooltip' && !h.popupText.trim() && !h.tooltip.trim())
        issues.push({ level: 'error', ...at, message: `${label(s, h)} shows a tooltip, but there is no tooltip text.` });
      if (h.action === 'setField') {
        const target = s.hotspots.find((o) => o.id === h.fieldTargetId);
        if (!target) issues.push({ level: 'error', ...at, message: `${label(s, h)} sets a field value, but no field is chosen.` });
      }
      if (h.kind === 'text' && h.answers.filter((a) => a.trim()).length === 0)
        issues.push({ level: 'error', ...at, message: `${label(s, h)} is a text field with no accepted answers.` });
      if (h.kind === 'dropdown') {
        if (h.options.filter((o) => o.trim()).length < 2)
          issues.push({ level: 'error', ...at, message: `${label(s, h)} is a dropdown with fewer than 2 options.` });
        else if (!h.options.includes(h.correctOption))
          issues.push({ level: 'error', ...at, message: `${label(s, h)} is a dropdown with no correct option chosen.` });
      }
      if (h.kind === 'search') {
        if (h.searchResults.length === 0)
          issues.push({ level: 'error', ...at, message: `${label(s, h)} is a search box with no results defined.` });
        else if (!h.searchResults.some((r) => r.id === h.correctResultId))
          issues.push({ level: 'error', ...at, message: `${label(s, h)} is a search box with no correct result chosen.` });
      }
      if (h.w < 0.5 || h.h < 0.5) issues.push({ level: 'warning', ...at, message: `${label(s, h)} is very small and may be hard to click.` });
    }
  }

  const reachable = reachableScreens(project);
  for (const s of project.screens) {
    if (!reachable.has(s.id))
      issues.push({ level: 'warning', screenId: s.id, message: `${label(s)} can’t be reached from the start screen.` });
  }
  if (!canFinish(project)) {
    issues.push({
      level: 'error',
      message: 'There is no way to finish: add a correct hotspot with the action “Finish the simulation” on the last screen.',
    });
  }
  return issues;
}
