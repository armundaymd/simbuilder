// Framework-free simulation player. Used for the in-app preview AND bundled
// into exported HTML files (see vite.player.config.ts), so both behave
// identically. Keep this file free of React and of any network access.
import type { CompletionResult, Hotspot, PlayerData, PlayerOptions, Project, Screen, TrainingMode } from '../types';
import { PLAYER_CSS } from './styles';

type Attrs = Record<string, string | number | boolean | undefined | ((e: any) => void)>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | false)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') node.className = String(v);
    else if (k === 'style') node.setAttribute('style', String(v));
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== false) node.append(c);
  return node;
}

const MODE_INFO: Record<TrainingMode, { label: string; desc: string }> = {
  demo: { label: 'Demonstration', desc: 'Watch the workflow. The correct action is highlighted; press Next to advance.' },
  guided: { label: 'Guided practice', desc: 'Perform each step yourself with highlights and feedback.' },
  independent: { label: 'Independent practice', desc: 'Instructions only — no highlights. Mistakes are tracked and summarized at the end.' },
  assessment: { label: 'Assessment', desc: 'No instructions, hints or feedback — just like the real software. Mistakes and time are recorded.' },
};
const MODE_ORDER: TrainingMode[] = ['demo', 'guided', 'independent', 'assessment'];

const norm = (s: string, cs: boolean) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return cs ? t : t.toLowerCase();
};

function injectStyles() {
  if (document.getElementById('simp-style')) return;
  document.head.append(el('style', { id: 'simp-style' }, PLAYER_CSS));
}

function fmtTime(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Number of correct steps along the main (first-correct-path) route. */
function estimateSteps(project: Project, startId: string): number {
  const byId = new Map(project.screens.map((s) => [s.id, s]));
  const seen = new Set<string>();
  let id: string | null = startId;
  let total = 0;
  while (id && byId.has(id) && !seen.has(id)) {
    seen.add(id);
    const correct: Hotspot[] = byId.get(id)!.hotspots.filter((h) => h.outcome === 'correct');
    total += correct.length;
    const next: Hotspot | undefined = correct.find((h) => h.action === 'navigate' || h.action === 'finish' || (h.action === 'popup' && h.targetScreenId));
    id = next && next.action !== 'finish' ? next.targetScreenId : null;
  }
  return Math.max(total, 1);
}

export function mount(root: HTMLElement, data: PlayerData, options: PlayerOptions = {}) {
  injectStyles();
  const project = data.project;
  const screens = new Map(project.screens.map((s) => [s.id, s]));
  const startId = options.startScreenId && screens.has(options.startScreenId) ? options.startScreenId : project.startScreenId ?? project.screens[0]?.id;

  let mode: TrainingMode = options.mode ?? 'guided';
  let screenId = startId!;
  let done = new Set<string>();
  let values = new Map<string, string>();
  let openMenu: { hotspotId: string } | null = null;
  let finished = false;
  let busy = false;
  const newStats = () => ({ start: Date.now(), steps: 0, incorrect: 0, perScreen: new Map<string, number>(), time: new Map<string, number>(), visited: [] as string[], enteredAt: Date.now() });
  let stats = newStats();
  let learnerName = options.learnerName ?? '';
  const offered = MODE_ORDER.filter((m) => (project.settings?.modes?.length ? project.settings.modes : MODE_ORDER).includes(m));
  if (!offered.includes(mode)) mode = offered.includes('guided') ? 'guided' : offered[0];
  let totalSteps = estimateSteps(project, startId!);
  let toastTimer = 0;
  let tipTimer = 0;
  let pendingSearch = new Map<string, string>();
  const lastTried = new Map<string, string>();

  root.innerHTML = '';
  const app = el('div', { class: 'simp', 'data-testid': 'sim-player' });
  root.append(app);

  const bar = el('div', { class: 'simp-bar' });
  const instr = el('div', { class: 'simp-instr', 'data-testid': 'sim-instruction' });
  const viewport = el('div', { class: 'simp-viewport' });
  const stage = el('div', { class: 'simp-stage', 'data-testid': 'sim-stage' });
  const img = el('img', { alt: '' });
  const layer = el('div', { class: 'simp-layer' });
  stage.append(img, layer);
  viewport.append(stage);
  app.append(bar, instr, viewport);

  const screen = (): Screen => screens.get(screenId)!;
  const expected = (): Hotspot | undefined => screen().hotspots.find((h) => h.outcome === 'correct' && !done.has(h.id));
  /** Demo and guided modes coach the learner; independent/assessment don't highlight. */
  const highlights = () => mode === 'demo' || mode === 'guided';

  // ---------- chrome ----------
  function renderBar() {
    const pct = Math.min(100, Math.round((stats.steps / totalSteps) * 100));
    bar.replaceChildren(
      el('div', { class: 'simp-title' }, project.title),
      el('span', { class: 'simp-chip', 'data-testid': 'sim-mode' }, MODE_INFO[mode].label),
      el('div', { class: 'simp-spacer' }),
      el(
        'div',
        { class: 'simp-progress' },
        el('div', { class: 'simp-progress-track' }, el('div', { class: 'simp-progress-fill', style: `width:${pct}%` })),
        `${pct}%`,
      ),
      el('button', { class: 'simp-btn', onClick: () => showIntro() }, 'Restart'),
      options.onExit ? el('button', { class: 'simp-btn', onClick: () => options.onExit!() }, 'Exit') : '',
    );
  }

  function renderInstruction() {
    const exp = expected();
    const text = (exp?.instruction || screen().instruction || '').trim();
    const children: (Node | string)[] = [el('div', { class: 'simp-instr-text' }, text || (exp ? 'Perform the next step.' : 'Explore this screen.'))];
    if (mode === 'demo' && exp) {
      children.push(el('button', { class: 'simp-btn simp-btn-primary', 'data-testid': 'sim-next', onClick: () => autoPerform(exp) }, 'Next ▶'));
    }
    instr.replaceChildren(...children);
    instr.style.display = (text || mode === 'demo') && !finished && mode !== 'assessment' ? '' : 'none';
  }

  // ---------- stage ----------
  function renderStage() {
    const s = screen();
    const ratio = s.width / s.height;
    stage.style.aspectRatio = `${s.width} / ${s.height}`;
    stage.style.width = `min(100cqw, calc(100cqh * ${ratio}))`;
    if (img.getAttribute('src') !== data.images[s.imageId]) img.src = data.images[s.imageId] ?? '';
    stage.dataset.screenId = s.id;
    const exp = expected();
    // On a "wrong place" screen with no correct step, guide the learner to the way back.
    const hl = new Set(highlights() ? (exp ? [exp.id] : s.hotspots.filter((h) => h.outcome === 'alternative').map((h) => h.id)) : []);
    layer.replaceChildren(
      ...s.hotspots.map((h) => {
        const node = el('div', {
          class: 'simp-hs' + (hl.has(h.id) ? ' simp-hl' : ''),
          'data-hotspot-id': h.id,
          'data-hotspot-name': h.name,
          style: `left:${h.x}%;top:${h.y}%;width:${h.w}%;height:${h.h}%;--h:${h.h}`,
        });
        if (h.tooltip) {
          node.addEventListener('mouseenter', () => showTip(h, h.tooltip, 0));
          node.addEventListener('mouseleave', hideTip);
        }
        const v = values.get(h.id);
        if (h.kind === 'text' || h.kind === 'search') {
          const input = el('input', {
            type: 'text',
            'aria-label': h.name,
            placeholder: h.placeholder || '',
            autocomplete: 'off',
            spellcheck: 'false',
          }) as HTMLInputElement;
          input.value = v ?? pendingSearch.get(h.id) ?? '';
          if (h.kind === 'text') {
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') submitText(h, input.value);
            });
            input.addEventListener('blur', () => {
              if (input.value.trim() && values.get(h.id) !== input.value && lastTried.get(h.id) !== input.value) submitText(h, input.value);
            });
          } else {
            input.addEventListener('input', () => {
              pendingSearch.set(h.id, input.value);
              openMenu = input.value.trim() ? { hotspotId: h.id } : null;
              renderMenu();
            });
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                openMenu = { hotspotId: h.id };
                renderMenu();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                layer.querySelector<HTMLButtonElement>('.simp-menu button')?.focus();
              }
            });
          }
          input.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (!gate(h)) e.preventDefault();
          });
          node.append(input);
        } else if (h.kind === 'dropdown') {
          node.append(el('div', { class: 'simp-dd' + (v ? ' simp-has' : '') }, v ?? ''));
        } else if (v) {
          node.append(el('div', { class: 'simp-value' }, v));
        }
        return node;
      }),
    );
    renderMenu();
  }

  function renderMenu() {
    layer.querySelector('.simp-menu')?.remove();
    if (!openMenu) return;
    const h = screen().hotspots.find((x) => x.id === openMenu!.hotspotId);
    if (!h) return;
    const menu = el('div', {
      class: 'simp-menu',
      'data-testid': 'sim-menu',
      style: `left:${h.x}%;top:${h.y + h.h}%;min-width:max(160px, ${h.w}cqw)`,
    });
    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll<HTMLButtonElement>('button')];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      } else if (e.key === 'Escape') {
        openMenu = null;
        renderMenu();
      }
    });
    if (h.kind === 'dropdown') {
      for (const opt of h.options.filter((o) => o.trim())) {
        menu.append(el('button', { onClick: () => chooseOption(h, opt) }, opt));
      }
      setTimeout(() => menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
    } else if (h.kind === 'search') {
      const q = norm(pendingSearch.get(h.id) ?? '', false);
      const terms = h.searchTerms.map((t) => norm(t, false)).filter(Boolean);
      const matches = q.length > 0 && (terms.length === 0 ? true : terms.some((t) => t.includes(q) || q.includes(t)));
      if (!matches) menu.append(el('div', { class: 'simp-empty' }, q ? 'No results found' : 'Type to search'));
      else
        for (const r of h.searchResults) {
          menu.append(el('button', { onClick: () => chooseResult(h, r.id, r.label) }, r.label, r.detail ? el('span', { class: 'simp-detail' }, r.detail) : null));
        }
    }
    layer.append(menu);
  }

  // ---------- feedback ----------
  function toast(text: string, kind: 'ok' | 'bad' | 'info') {
    app.querySelector('.simp-toast')?.remove();
    clearTimeout(toastTimer);
    const t = el('div', { class: `simp-toast ${kind}`, role: 'status', 'data-testid': `sim-toast-${kind}` }, text);
    app.append(t);
    toastTimer = window.setTimeout(() => t.remove(), kind === 'bad' ? 3500 : 2500);
  }

  function showTip(h: Hotspot, text: string, autoHideMs: number) {
    hideTip();
    const below = h.y + h.h < 80;
    const tip = el('div', {
      class: 'simp-tip',
      'data-testid': 'sim-tooltip',
      style: `left:${h.x}%;${below ? `top:calc(${h.y + h.h}% + 6px)` : `bottom:calc(${100 - h.y}% + 6px)`}`,
    }, text);
    layer.append(tip);
    if (autoHideMs) tipTimer = window.setTimeout(hideTip, autoHideMs);
  }
  function hideTip() {
    clearTimeout(tipTimer);
    layer.querySelector('.simp-tip')?.remove();
  }

  function ripple(e: MouseEvent) {
    const r = stage.getBoundingClientRect();
    const dot = el('div', { class: 'simp-ripple', style: `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px` });
    layer.append(dot);
    setTimeout(() => dot.remove(), 650);
  }

  function recordError(message: string, silent = false) {
    stats.incorrect++;
    stats.perScreen.set(screenId, (stats.perScreen.get(screenId) ?? 0) + 1);
    // Assessment mode and "silent" mistakes give no feedback: the learner must notice for themselves.
    if (mode === 'assessment' || silent) return;
    if (mode === 'independent') toast('Not quite — try again.', 'bad');
    else {
      const exp = expected();
      const hint = exp?.instruction || screen().instruction;
      toast(message + (hint && mode === 'guided' && !message.includes(hint) ? ` Hint: ${hint}` : ''), 'bad');
    }
  }

  // ---------- interaction ----------
  /** Is the learner allowed to use this hotspot now? Records an error if not. */
  function gate(h: Hotspot): boolean {
    if (finished || busy) return false;
    if (h.outcome === 'incorrect') {
      recordError(h.feedback || 'That’s not the right step.', h.silent);
      if (h.action === 'navigate' && h.targetScreenId) goTo(h.targetScreenId);
      else if (h.action === 'popup') performAction(h);
      return false;
    }
    if (h.outcome === 'correct' && done.has(h.id)) return h.kind !== 'click';
    if (h.outcome === 'correct' && expected()?.id !== h.id) {
      if (mode === 'demo') toast('Follow the highlighted step first.', 'info');
      else recordError('Not yet — there’s another step to do first.');
      return false;
    }
    if (mode === 'demo' && h.outcome !== 'correct') {
      toast('In demonstration mode, follow the highlighted step.', 'info');
      return false;
    }
    return true;
  }

  function onLayerClick(e: MouseEvent) {
    if (finished || busy) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('.simp-hs');
    if (openMenu && !target?.contains(e.target as Node)) {
      openMenu = null;
      renderMenu();
      if (!target) return;
    }
    if (!target) {
      if (mode === 'demo') {
        toast('Click the highlighted area, or press Next.', 'info');
        return;
      }
      if (mode !== 'assessment') ripple(e);
      recordError('That area isn’t part of this step.');
      return;
    }
    const h = screen().hotspots.find((x) => x.id === target.dataset.hotspotId)!;
    if (h.kind === 'text' || h.kind === 'search') return; // handled by input
    if (!gate(h)) return;
    if (h.kind === 'dropdown') {
      openMenu = openMenu?.hotspotId === h.id ? null : { hotspotId: h.id };
      renderMenu();
      return;
    }
    succeed(h);
  }
  layer.addEventListener('click', onLayerClick);

  function submitText(h: Hotspot, raw: string) {
    if (finished) return;
    if (!gate(h)) return;
    lastTried.set(h.id, raw);
    const ok = h.answers.some((a) => a.trim() && norm(a, h.caseSensitive) === norm(raw, h.caseSensitive));
    if (!ok) {
      recordError(h.feedback && h.outcome === 'incorrect' ? h.feedback : `“${raw.trim()}” isn’t what’s expected here.`);
      return;
    }
    values.set(h.id, raw.trim());
    succeed(h);
  }

  function chooseOption(h: Hotspot, opt: string) {
    openMenu = null;
    if (opt !== h.correctOption) {
      renderMenu();
      recordError(`“${opt}” isn’t the right choice.`);
      return;
    }
    values.set(h.id, opt);
    succeed(h);
  }

  function chooseResult(h: Hotspot, id: string, labelText: string) {
    if (id !== h.correctResultId) {
      // Keep the results open so the learner can pick again.
      recordError(`“${labelText}” isn’t the right result.`);
      return;
    }
    openMenu = null;
    values.set(h.id, labelText);
    succeed(h);
  }

  /** Demonstration mode: perform the expected step automatically. */
  function autoPerform(h: Hotspot) {
    if (busy) return;
    if (h.kind === 'text') values.set(h.id, h.answers.find((a) => a.trim()) ?? '');
    if (h.kind === 'dropdown') values.set(h.id, h.correctOption);
    if (h.kind === 'search') values.set(h.id, h.searchResults.find((r) => r.id === h.correctResultId)?.label ?? '');
    openMenu = null;
    renderStage();
    busy = true;
    setTimeout(() => {
      busy = false;
      succeed(h);
    }, h.kind === 'click' ? 150 : 600);
  }

  function succeed(h: Hotspot) {
    hideTip();
    if (h.outcome === 'correct' && !done.has(h.id)) {
      done.add(h.id);
      stats.steps++;
    }
    if (h.feedback && h.action !== 'tooltip' && mode !== 'assessment') toast(h.feedback, 'ok');
    performAction(h);
  }

  function performAction(h: Hotspot) {
    switch (h.action) {
      case 'navigate':
        if (h.targetScreenId && screens.has(h.targetScreenId)) return goTo(h.targetScreenId);
        break;
      case 'popup':
        return showPopup(h.popupTitle, h.popupText, () => {
          if (h.targetScreenId && screens.has(h.targetScreenId) && h.outcome !== 'incorrect') goTo(h.targetScreenId);
          else render();
        });
      case 'tooltip':
        render();
        showTip(h, h.popupText || h.tooltip, 3500);
        return;
      case 'setField':
        if (h.fieldTargetId) values.set(h.fieldTargetId, h.fieldValue);
        break;
      case 'finish':
        return finish();
    }
    render();
  }

  /** Add the time spent on the current screen to its running total. */
  function trackTime() {
    const now = Date.now();
    if (screenId) stats.time.set(screenId, (stats.time.get(screenId) ?? 0) + now - stats.enteredAt);
    stats.enteredAt = now;
  }

  function goTo(id: string) {
    if (!finished) trackTime();
    screenId = id;
    if (!stats.visited.includes(id)) stats.visited.push(id);
    done = new Set();
    values = new Map();
    pendingSearch = new Map();
    openMenu = null;
    hideTip();
    render();
  }

  function showPopup(title: string, text: string, onClose: () => void) {
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') close();
    };
    const overlay = el(
      'div',
      { class: 'simp-overlay', 'data-testid': 'sim-popup' },
      el('div', { class: 'simp-card', role: 'dialog' }, title ? el('h2', {}, title) : null, el('p', {}, text), el('div', { class: 'simp-actions' }, el('button', { class: 'simp-btn simp-btn-primary', onClick: close }, 'OK'))),
    );
    document.addEventListener('keydown', onKey);
    app.append(overlay);
  }

  function render() {
    renderBar();
    renderInstruction();
    renderStage();
  }

  // ---------- intro & summary ----------
  function start(m: TrainingMode) {
    mode = m;
    finished = false;
    stats = newStats();
    screenId = '';
    totalSteps = estimateSteps(project, startId!);
    app.querySelectorAll('.simp-intro,.simp-overlay').forEach((n) => n.remove());
    goTo(startId!);
  }

  function showIntro() {
    finished = true;
    app.querySelectorAll('.simp-intro,.simp-overlay').forEach((n) => n.remove());
    let selected: TrainingMode = mode;
    const cards = offered.map((m) =>
      el('button', { class: 'simp-mode' + (m === selected ? ' sel' : ''), 'data-mode': m, onClick: () => select(m) }, el('b', {}, MODE_INFO[m].label), el('span', {}, MODE_INFO[m].desc)),
    );
    function select(m: TrainingMode) {
      selected = m;
      cards.forEach((c) => c.classList.toggle('sel', c.dataset.mode === m));
    }
    const nameInput = el('input', { class: 'simp-name', type: 'text', placeholder: 'Your name (optional, for the certificate)', 'aria-label': 'Your name', 'data-testid': 'sim-learner-name' }) as HTMLInputElement;
    nameInput.value = learnerName;
    const intro = el(
      'div',
      { class: 'simp-intro', 'data-testid': 'sim-intro' },
      el(
        'div',
        { class: 'simp-card' },
        el('h2', {}, project.title),
        project.description ? el('p', {}, project.description) : null,
        el('div', { style: 'font-size:13px;color:#64748b' }, `${project.screens.length} screens · ${offered.length > 1 ? 'choose how you’d like to train:' : MODE_INFO[offered[0]].label}`),
        el('div', { class: 'simp-modes' }, ...cards),
        nameInput,
        el(
          'div',
          { class: 'simp-actions' },
          options.onExit ? el('button', { class: 'simp-btn', onClick: () => options.onExit!() }, 'Exit') : null,
          el('button', { class: 'simp-btn simp-btn-primary', 'data-testid': 'sim-start', onClick: () => ((learnerName = nameInput.value.trim()), start(selected)) }, 'Start'),
        ),
      ),
    );
    app.append(intro);
  }

  function finish() {
    trackTime();
    finished = true;
    render();
    const attempts = stats.steps + stats.incorrect;
    const result: CompletionResult = {
      mode,
      learnerName,
      steps: stats.steps,
      incorrect: stats.incorrect,
      accuracy: attempts ? Math.round((stats.steps / attempts) * 100) : 100,
      timeMs: Date.now() - stats.start,
      screens: stats.visited.map((id) => ({ screenId: id, name: screens.get(id)!.name, incorrect: stats.perScreen.get(id) ?? 0, timeMs: stats.time.get(id) ?? 0 })),
    };
    try {
      options.onComplete?.(result);
    } catch (e) {
      console.error(e);
    }
    const card = summaryCard(result);
    card.append(
      el(
        'div',
        { class: 'simp-actions simp-noprint' },
        options.onExit ? el('button', { class: 'simp-btn', onClick: () => options.onExit!() }, 'Exit') : null,
        el('button', { class: 'simp-btn', 'data-testid': 'sim-print', onClick: () => printCertificate(result) }, 'Print certificate'),
        offered.length > 1 ? el('button', { class: 'simp-btn', onClick: () => showIntro() }, 'Choose another mode') : null,
        el('button', { class: 'simp-btn simp-btn-primary', onClick: () => start(mode) }, 'Restart'),
      ),
    );
    app.append(el('div', { class: 'simp-overlay', 'data-testid': 'sim-summary' }, card));
  }

  function summaryCard(r: CompletionResult) {
    const slowest = Math.max(...r.screens.map((x) => x.timeMs));
    return el(
      'div',
      { class: 'simp-card' },
      el('h2', {}, '✅ Simulation complete'),
      el('p', {}, `${r.learnerName ? r.learnerName + ' · ' : ''}${project.title} — ${MODE_INFO[r.mode].label} · ${new Date().toLocaleDateString()}`),
      el(
        'div',
        { class: 'simp-stats' },
        el('div', { class: 'simp-stat' }, el('b', {}, String(r.steps)), el('span', {}, 'steps completed')),
        el('div', { class: 'simp-stat' }, el('b', { 'data-testid': 'sim-incorrect-count' }, String(r.incorrect)), el('span', {}, 'incorrect clicks')),
        el('div', { class: 'simp-stat' }, el('b', {}, `${r.accuracy}%`), el('span', {}, 'accuracy')),
        el('div', { class: 'simp-stat' }, el('b', {}, fmtTime(r.timeMs)), el('span', {}, 'time')),
      ),
      r.incorrect === 0 && (r.mode === 'independent' || r.mode === 'assessment') ? el('p', {}, 'Perfect run — no incorrect clicks.') : null,
      el(
        'table',
        { class: 'simp-table', 'data-testid': 'sim-screen-table' },
        el('tr', {}, el('th', {}, 'Screen'), el('th', {}, 'Time'), el('th', {}, 'Incorrect clicks')),
        ...r.screens.map((x) =>
          el('tr', { class: x.incorrect || (x.timeMs === slowest && r.screens.length > 1) ? 'simp-flag' : '' }, el('td', {}, x.name), el('td', {}, fmtTime(x.timeMs)), el('td', {}, String(x.incorrect))),
        ),
      ),
    );
  }

  function printCertificate(r: CompletionResult) {
    const cert = el(
      'div',
      { class: 'simp simp-cert' },
      el('div', { class: 'simp-cert-inner' }, el('div', { class: 'simp-cert-kicker' }, 'Certificate of completion'), el('h1', {}, r.learnerName || 'Learner'), el('p', {}, 'has completed the training simulation'), el('h2', {}, project.title)),
      summaryCard(r),
    );
    document.body.append(cert);
    const cleanup = () => cert.remove();
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    setTimeout(() => {
      if (cert.isConnected && !window.matchMedia('print').matches) cleanup();
    }, 1000);
  }

  // ---------- boot ----------
  if (!startId || !screens.size) {
    app.replaceChildren(el('div', { style: 'padding:40px;text-align:center' }, 'This simulation has no screens yet.'));
    return { destroy: () => root.replaceChildren() };
  }
  goTo(startId);
  if (options.showIntro !== false) showIntro();
  else start(mode);

  return {
    destroy() {
      clearTimeout(toastTimer);
      clearTimeout(tipTimer);
      root.replaceChildren();
    },
  };
}
