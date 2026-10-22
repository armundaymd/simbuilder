import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isAcceptedImage, storeImage } from '../../lib/images';
import { ACTION_LABELS, KIND_LABELS, OUTCOME_LABELS, clamp, round2, uid } from '../../lib/model';
import type { Issue } from '../../lib/validate';
import { useEditor } from '../../store/editor';
import type { Hotspot, HotspotAction, HotspotKind, HotspotOutcome, Project, Screen } from '../../types';
import { Icon } from '../ui/Icon';
import { Button, Field, Modal } from '../ui/ui';
import { OUTCOME_STYLE } from './Canvas';

export function Inspector({ issues }: { issues: Issue[] }) {
  const project = useEditor((s) => s.project)!;
  const screenId = useEditor((s) => s.selectedScreenId);
  const hotspotId = useEditor((s) => s.selectedHotspotId);
  const screen = project.screens.find((s) => s.id === screenId);
  const hotspot = screen?.hotspots.find((h) => h.id === hotspotId);

  return (
    <aside className="w-80 flex-none overflow-auto border-l border-slate-200 bg-white" data-testid="inspector">
      {!screen ? (
        <p className="p-4 text-sm text-slate-500">Add screenshots to get started.</p>
      ) : hotspot ? (
        <HotspotPanel key={hotspot.id} project={project} screen={screen} h={hotspot} issues={issues.filter((i) => i.hotspotId === hotspot.id)} />
      ) : (
        <ScreenPanel project={project} screen={screen} issues={issues.filter((i) => i.screenId === screen.id && !i.hotspotId)} />
      )}
    </aside>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-slate-100 px-4 py-4">
      {title && <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>}
      {children}
    </section>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <div className="space-y-1 px-4 pt-3" data-testid="inspector-issues">
      {issues.map((i, n) => (
        <p key={n} className={`flex gap-2 rounded-md px-2 py-1.5 text-xs ${i.level === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
          <Icon name="alert" className="mt-px h-3.5 w-3.5 flex-none" />
          {i.message}
        </p>
      ))}
    </div>
  );
}

// ---------------- Screen ----------------

function ScreenPanel({ project, screen, issues }: { project: Project; screen: Screen; issues: Issue[] }) {
  const { updateScreen, update, selectHotspot, moveHotspotOrder } = useEditor.getState();
  const isStart = project.startScreenId === screen.id;
  return (
    <div>
      <div className="px-4 pt-4">
        <h2 className="font-semibold">Screen</h2>
        <p className="text-xs text-slate-500">Select a clickable area to edit it, or drag on the screenshot to draw a new one.</p>
      </div>
      <IssueList issues={issues} />
      <Section>
        <Field label="Screen name">
          <input className="input" value={screen.name} onChange={(e) => updateScreen(screen.id, { name: e.target.value }, `sname:${screen.id}`)} data-testid="screen-name" />
        </Field>
        <Field label="Instruction for the learner" hint="Shown above the screenshot, e.g. “Open the patient’s chart by clicking their name.”">
          <textarea className="input min-h-20" value={screen.instruction} onChange={(e) => updateScreen(screen.id, { instruction: e.target.value }, `sinstr:${screen.id}`)} data-testid="screen-instruction" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isStart} disabled={isStart} onChange={() => update((d) => void (d.startScreenId = screen.id))} />
          Learners start on this screen
        </label>
        <ReplaceScreenshot project={project} screen={screen} />
      </Section>
      <Section title={`Clickable areas (${screen.hotspots.length})`}>
        {screen.hotspots.length === 0 ? (
          <p className="text-sm text-slate-500">None yet. Drag a rectangle over a button, tab or field on the screenshot.</p>
        ) : (
          <ul className="space-y-1">
            {screen.hotspots.map((h, i) => (
              <li key={h.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-sm hover:bg-slate-50">
                <span className={`h-2.5 w-2.5 flex-none rounded-full ${OUTCOME_STYLE[h.outcome].chip}`} />
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => selectHotspot(h.id)}>
                  {h.name}
                  <span className="ml-1 text-xs text-slate-400">· {describeAction(project, h)}</span>
                </button>
                <button className="text-slate-400 hover:text-slate-700 disabled:opacity-20" disabled={i === 0} onClick={() => moveHotspotOrder(h.id, -1)} aria-label="Move up">
                  <Icon name="up" className="h-3.5 w-3.5" />
                </button>
                <button className="text-slate-400 hover:text-slate-700 disabled:opacity-20" disabled={i === screen.hotspots.length - 1} onClick={() => moveHotspotOrder(h.id, 1)} aria-label="Move down">
                  <Icon name="down" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">When a screen has several correct actions, learners must do them in this order.</p>
      </Section>
      <Section title="Legend">
        <ul className="space-y-1 text-xs text-slate-600">
          {(Object.keys(OUTCOME_LABELS) as HotspotOutcome[]).map((o) => (
            <li key={o} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${OUTCOME_STYLE[o].chip}`} /> {OUTCOME_LABELS[o]}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function ReplaceScreenshot({ project, screen }: { project: Project; screen: Screen }) {
  const ref = useRef<HTMLInputElement>(null);
  async function onFile(file: File) {
    const st = useEditor.getState();
    if (!isAcceptedImage(file)) return st.setNotice('Please choose a PNG, JPG, WebP, GIF or BMP image.');
    const rec = await storeImage(file, { optimize: project.settings.optimizeImages });
    st.replaceScreenImage(screen.id, rec);
    const before = screen.width / screen.height;
    const after = rec.width / rec.height;
    st.setNotice(
      Math.abs(before - after) / before > 0.03
        ? 'Screenshot replaced. Its shape is different from the old one, so check that the clickable areas still line up.'
        : 'Screenshot replaced. Clickable areas and connections were kept.',
    );
  }
  return (
    <div>
      <Button size="sm" icon="image" onClick={() => ref.current?.click()} data-testid="replace-screenshot">
        Replace screenshot…
      </Button>
      <p className="mt-1 text-xs text-slate-500">For software updates: swaps the image, keeps the clickable areas.</p>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="replace-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onFile(f);
        }}
      />
    </div>
  );
}

export function describeAction(project: Project, h: Hotspot) {
  if (h.action === 'navigate') {
    const t = project.screens.findIndex((s) => s.id === h.targetScreenId);
    return t >= 0 ? `→ ${t + 1}. ${project.screens[t].name}` : '→ (no destination)';
  }
  return ACTION_LABELS[h.action].replace(' (step complete)', '');
}

// ---------------- Hotspot ----------------

const OUTCOME_HELP: Record<HotspotOutcome, string> = {
  correct: 'The step learners should take. Highlighted in guided mode.',
  alternative: 'Also allowed (e.g. a shortcut). Not highlighted, never counted as a mistake.',
  incorrect: 'A common mistake. Counts as an error. Set “Go to screen” to send learners to a wrong-place screenshot.',
};

function HotspotPanel({ project, screen, h, issues }: { project: Project; screen: Screen; h: Hotspot; issues: Issue[] }) {
  const { updateHotspot, deleteHotspot, duplicateHotspot, selectHotspot } = useEditor.getState();
  const set = (patch: Partial<Hotspot>, key?: string) => updateHotspot(h.id, patch, key ? `${key}:${h.id}` : undefined);
  const screenIndex = project.screens.indexOf(screen);
  const nextScreen = project.screens[screenIndex + 1];
  const others = screen.hotspots.filter((o) => o.id !== h.id);
  const [copying, setCopying] = useState(false);

  return (
    <div data-testid="hotspot-panel">
      <div className="flex items-center gap-2 px-4 pt-4">
        <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => selectHotspot(null)} aria-label="Back to screen" title="Back to screen (Esc)">
          <Icon name="back" />
        </button>
        <h2 className="flex-1 font-semibold">Clickable area</h2>
        <Button size="sm" variant="ghost" icon="copy" onClick={() => duplicateHotspot(h.id)} title="Duplicate (⌘D)" aria-label="Duplicate hotspot" />
        <Button size="sm" variant="ghost" icon="layers" onClick={() => setCopying(true)} title="Copy to other screens" aria-label="Copy to other screens" data-testid="copy-to-screens" />
        <Button size="sm" variant="ghost" icon="trash" className="!text-red-600" onClick={() => deleteHotspot(h.id)} title="Delete (⌫)" aria-label="Delete hotspot" />
      </div>
      <IssueList issues={issues} />

      <Section>
        <Field label="Name">
          <input className="input" value={h.name} onChange={(e) => set({ name: e.target.value }, 'name')} data-testid="hotspot-name" />
        </Field>
        <Field label="What kind of control is this?">
          <select className="input" value={h.kind} onChange={(e) => set({ kind: e.target.value as HotspotKind })} data-testid="hotspot-kind">
            {(Object.keys(KIND_LABELS) as HotspotKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="label">Is this the right thing to do?</span>
          <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1" role="radiogroup">
            {(Object.keys(OUTCOME_LABELS) as HotspotOutcome[]).map((o) => (
              <button
                key={o}
                role="radio"
                aria-checked={h.outcome === o}
                className={`rounded px-1 py-1 text-xs font-medium ${h.outcome === o ? 'bg-white shadow-sm ' + (o === 'correct' ? 'text-emerald-700' : o === 'incorrect' ? 'text-red-700' : 'text-blue-700') : 'text-slate-500 hover:text-slate-800'}`}
                onClick={() => set({ outcome: o })}
                data-testid={`outcome-${o}`}
              >
                {o === 'correct' ? 'Correct' : o === 'alternative' ? 'Alternative' : 'Incorrect'}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">{OUTCOME_HELP[h.outcome]}</p>
        </div>
      </Section>

      {h.kind === 'text' && (
        <Section title="Text entry">
          <ListField label="Accepted answers (one per line)" value={h.answers} onChange={(answers) => set({ answers }, 'answers')} placeholder={'chest pain\nchest pain, unspecified'} testId="hotspot-answers" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={h.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} />
            Answers are case-sensitive
          </label>
          <Field label="Placeholder (optional)">
            <input className="input" value={h.placeholder} onChange={(e) => set({ placeholder: e.target.value }, 'ph')} />
          </Field>
          <p className="text-xs text-slate-500">Learners type into the area and press Enter. Extra spaces are ignored.</p>
        </Section>
      )}
      {h.kind === 'dropdown' && (
        <Section title="Dropdown">
          <ListField label="Options (one per line)" value={h.options} onChange={(options) => set({ options }, 'options')} placeholder={'Routine\nSTAT\nTimed'} testId="hotspot-options" />
          <Field label="Correct option">
            <select className="input" value={h.correctOption} onChange={(e) => set({ correctOption: e.target.value })} data-testid="hotspot-correct-option">
              <option value="">Choose…</option>
              {h.options.filter((o) => o.trim()).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        </Section>
      )}
      {h.kind === 'search' && <SearchConfig h={h} set={set} />}

      <Section title="What happens next?">
        <Field label={h.outcome === 'incorrect' ? 'After the mistake' : 'Action'}>
          <select className="input" value={h.action} onChange={(e) => set({ action: e.target.value as HotspotAction })} data-testid="hotspot-action">
            {(Object.keys(ACTION_LABELS) as HotspotAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </Field>
        {(h.action === 'navigate' || h.action === 'popup') && (
          <Field label={h.action === 'popup' ? 'Then go to (optional)' : 'Destination screen'}>
            <div className="flex gap-1">
              <select className="input" value={h.targetScreenId ?? ''} onChange={(e) => set({ targetScreenId: e.target.value || null })} data-testid="hotspot-target">
                <option value="">{h.action === 'popup' ? 'Stay on this screen' : 'Choose a screen…'}</option>
                {project.screens.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {i + 1}. {s.name}
                    {s.id === screen.id ? ' (this screen)' : ''}
                  </option>
                ))}
              </select>
              {nextScreen && h.targetScreenId !== nextScreen.id && (
                <Button size="sm" onClick={() => set({ targetScreenId: nextScreen.id })} title={`Go to ${nextScreen.name}`}>
                  Next
                </Button>
              )}
            </div>
          </Field>
        )}
        {h.action === 'popup' && (
          <>
            <Field label="Popup title">
              <input className="input" value={h.popupTitle} onChange={(e) => set({ popupTitle: e.target.value }, 'pt')} data-testid="hotspot-popup-title" />
            </Field>
            <Field label="Popup message">
              <textarea className="input min-h-16" value={h.popupText} onChange={(e) => set({ popupText: e.target.value }, 'pm')} data-testid="hotspot-popup-text" />
            </Field>
          </>
        )}
        {h.action === 'tooltip' && (
          <Field label="Tooltip text" hint="Appears next to this area for a few seconds.">
            <textarea className="input min-h-16" value={h.popupText} onChange={(e) => set({ popupText: e.target.value }, 'pm')} />
          </Field>
        )}
        {h.action === 'setField' && (
          <>
            <Field label="Field to change" hint="Any other clickable area on this screen; the value is drawn inside it.">
              <select className="input" value={h.fieldTargetId ?? ''} onChange={(e) => set({ fieldTargetId: e.target.value || null })}>
                <option value="">Choose…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="New value">
              <input className="input" value={h.fieldValue} onChange={(e) => set({ fieldValue: e.target.value }, 'fv')} />
            </Field>
          </>
        )}
        {h.action === 'finish' && <p className="text-xs text-slate-500">The learner sees a completion summary.</p>}
      </Section>

      <Section title="Guidance">
        {h.outcome === 'correct' && (
          <Field label="Step instruction (optional)" hint="Shown when this is the next step. Falls back to the screen’s instruction.">
            <textarea className="input min-h-16" value={h.instruction} onChange={(e) => set({ instruction: e.target.value }, 'instr')} data-testid="hotspot-instruction" />
          </Field>
        )}
        {h.outcome === 'incorrect' && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={h.silent} onChange={(e) => set({ silent: e.target.checked })} data-testid="hotspot-silent" />
            <span>
              Let the learner discover the mistake
              <span className="block text-xs text-slate-500">No message is shown; it still counts as an error. Great with “Go to screen” → a wrong-place screenshot that has a way back.</span>
            </span>
          </label>
        )}
        <Field label={h.outcome === 'incorrect' ? (h.silent ? 'Feedback (not shown while “discover” is on)' : 'Feedback when clicked') : 'Feedback after success (optional)'}>
          <textarea className="input min-h-14" value={h.feedback} onChange={(e) => set({ feedback: e.target.value }, 'fb')} data-testid="hotspot-feedback" placeholder={h.outcome === 'incorrect' ? 'e.g. That opens the Results tab. Orders are under Workup.' : ''} />
        </Field>
        <Field label="Tooltip on hover (optional)">
          <input className="input" value={h.tooltip} onChange={(e) => set({ tooltip: e.target.value }, 'tt')} data-testid="hotspot-tooltip" />
        </Field>
      </Section>

      <Section title="Position (% of screenshot)">
        <div className="grid grid-cols-4 gap-2">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <label key={k} className="block">
              <span className="label uppercase">{k}</span>
              <NumberInput
                value={h[k]}
                onChange={(v) => {
                  const max = k === 'x' ? 100 - h.w : k === 'y' ? 100 - h.h : k === 'w' ? 100 - h.x : 100 - h.y;
                  set({ [k]: round2(clamp(v, k === 'w' || k === 'h' ? 0.5 : 0, max)) }, `pos${k}`);
                }}
              />
            </label>
          ))}
        </div>
      </Section>
      {copying && <CopyToScreens project={project} screen={screen} h={h} onClose={() => setCopying(false)} />}
    </div>
  );
}

function CopyToScreens({ project, screen, h, onClose }: { project: Project; screen: Screen; h: Hotspot; onClose: () => void }) {
  const targets = project.screens.filter((s) => s.id !== screen.id);
  const [picked, setPicked] = useState<string[]>([]);
  const [as, setAs] = useState<HotspotOutcome | 'same'>(h.outcome === 'correct' ? 'alternative' : 'same');
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal
      title={`Copy “${h.name}” to other screens`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!picked.length}
            data-testid="confirm-copy"
            onClick={() => {
              const n = useEditor.getState().copyHotspotToScreens(h.id, picked, as === 'same' ? null : as);
              useEditor.getState().setNotice(`Copied to ${n} screen${n > 1 ? 's' : ''}.`);
              onClose();
            }}
          >
            Copy to {picked.length || ''} screen{picked.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">Useful for tabs and menus that appear on every screen. The area is placed at the same position on each screen you pick.</p>
      <Field label="Copy as">
        <select className="input" value={as} onChange={(e) => setAs(e.target.value as HotspotOutcome | 'same')}>
          <option value="same">Same settings ({OUTCOME_LABELS[h.outcome]})</option>
          <option value="alternative">Alternative path (allowed, never a mistake)</option>
          <option value="incorrect">Incorrect action (counts as a mistake)</option>
        </select>
      </Field>
      <div className="mt-3 mb-1 flex items-center justify-between">
        <span className="label mb-0">Screens</span>
        <button className="text-xs font-medium text-blue-700" onClick={() => setPicked(picked.length === targets.length ? [] : targets.map((t) => t.id))}>
          {picked.length === targets.length ? 'Select none' : 'Select all'}
        </button>
      </div>
      <ul className="max-h-64 space-y-1 overflow-auto rounded-md border border-slate-200 p-2">
        {targets.map((t) => (
          <li key={t.id}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
              {project.screens.indexOf(t) + 1}. {t.name}
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="input px-1.5 text-xs"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/** Edits a string[] as a textarea (one item per line), keeping blank lines while typing. */
function ListField({ label, value, onChange, placeholder, testId }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; testId?: string }) {
  const [text, setText] = useState(value.join('\n'));
  useEffect(() => {
    if (text.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') !== value.join('\n')) setText(value.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field label={label}>
      <textarea
        className="input min-h-20 font-mono text-xs"
        value={text}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean));
        }}
      />
    </Field>
  );
}

function SearchConfig({ h, set }: { h: Hotspot; set: (p: Partial<Hotspot>, key?: string) => void }) {
  const updateResult = (id: string, patch: { label?: string; detail?: string }) =>
    set({ searchResults: h.searchResults.map((r) => (r.id === id ? { ...r, ...patch } : r)) }, `sr:${id}`);
  return (
    <Section title="Search box">
      <ListField label="Search words that show results (one per line)" value={h.searchTerms} onChange={(searchTerms) => set({ searchTerms }, 'terms')} placeholder={'cbc\ncomplete blood count'} testId="hotspot-search-terms" />
      <p className="-mt-1 text-xs text-slate-500">Partial matches count. Leave empty to show results for anything typed.</p>
      <div>
        <span className="label">Results (select the correct one)</span>
        <ul className="space-y-2">
          {h.searchResults.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-md border border-slate-200 p-2">
              <input type="radio" className="mt-2" name={`correct-${h.id}`} checked={h.correctResultId === r.id} onChange={() => set({ correctResultId: r.id })} aria-label="Correct result" />
              <div className="min-w-0 flex-1 space-y-1">
                <input className="input py-1 text-xs" placeholder="Result label" value={r.label} onChange={(e) => updateResult(r.id, { label: e.target.value })} data-testid="search-result-label" />
                <input className="input py-1 text-xs" placeholder="Detail (optional)" value={r.detail ?? ''} onChange={(e) => updateResult(r.id, { detail: e.target.value })} />
              </div>
              <button
                className="mt-1 text-slate-400 hover:text-red-600"
                aria-label="Remove result"
                onClick={() => set({ searchResults: h.searchResults.filter((x) => x.id !== r.id), correctResultId: h.correctResultId === r.id ? null : h.correctResultId })}
              >
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          icon="plus"
          className="mt-2"
          data-testid="add-search-result"
          onClick={() => {
            const r = { id: uid('r_'), label: '', detail: '' };
            set({ searchResults: [...h.searchResults, r], correctResultId: h.correctResultId ?? r.id });
          }}
        >
          Add result
        </Button>
      </div>
    </Section>
  );
}
