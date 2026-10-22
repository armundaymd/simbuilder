import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { getRepository } from '../../lib/db';
import { forgetImageUrl, redactImage, storeImage, type RedactStyle } from '../../lib/images';
import { clamp, round2 } from '../../lib/model';
import { flushSave, useEditor } from '../../store/editor';
import type { Hotspot, Screen } from '../../types';
import { useImageUrl } from '../Thumb';
import { Icon } from '../ui/Icon';
import { Button, Modal } from '../ui/ui';
import { UploadButton } from './ScreenList';

type Rect = { x: number; y: number; w: number; h: number };
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type Drag =
  | { mode: 'draw'; start: { x: number; y: number } }
  | { mode: 'move'; id: string; start: { x: number; y: number }; orig: Rect }
  | { mode: 'resize'; id: string; handle: Handle; orig: Rect };

const MIN = 0.5; // minimum hotspot size in %
const ZOOMS = [0.5, 0.75, 1, 1.5, 2];

export const OUTCOME_STYLE: Record<Hotspot['outcome'], { border: string; fill: string; chip: string }> = {
  correct: { border: 'border-emerald-500', fill: 'bg-emerald-400/15', chip: 'bg-emerald-600' },
  alternative: { border: 'border-blue-500', fill: 'bg-blue-400/15', chip: 'bg-blue-600' },
  incorrect: { border: 'border-red-500', fill: 'bg-red-400/15', chip: 'bg-red-600' },
};

export function Canvas({ onPreview }: { onPreview: (fromScreen?: string) => void }) {
  const project = useEditor((s) => s.project)!;
  const screenId = useEditor((s) => s.selectedScreenId);
  const screen = project.screens.find((s) => s.id === screenId);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [redactState, setRedact] = useState<{ screenId: string; rects: Rect[]; style: RedactStyle } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const redact = redactState && redactState.screenId === screenId ? redactState : null;

  async function applyRedaction() {
    if (!screen || !redact?.rects.length) return;
    setApplying(true);
    const st = useEditor.getState();
    try {
      const rec = await getRepository().getImage(screen.imageId);
      if (!rec) throw new Error('Screenshot not found');
      const out = await storeImage(await redactImage(rec.blob, redact.rects, redact.style), { optimize: st.project!.settings.optimizeImages });
      const oldId = st.replaceScreenImage(screen.id, out, true);
      await flushSave();
      const deleted = await getRepository().deleteImageIfUnused(oldId);
      forgetImageUrl(oldId);
      st.setNotice(
        deleted
          ? `Redacted ${redact.rects.length} area${redact.rects.length > 1 ? 's' : ''}. The original screenshot was permanently deleted.`
          : 'Redacted — but another simulation (probably a duplicate) still uses the original screenshot. Redact or delete it there too.',
      );
      setRedact(null);
    } catch (e) {
      st.setNotice(`Redaction failed: ${(e as Error).message}`);
    } finally {
      setApplying(false);
      setConfirming(false);
    }
  }

  if (!screen) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-slate-100 p-8">
        <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center" data-testid="empty-canvas">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Icon name="upload" className="h-6 w-6" />
          </div>
          <h2 className="font-semibold">Add your screenshots</h2>
          <p className="mt-1 mb-5 text-sm text-slate-600">Drag and drop image files here, paste a screenshot with ⌘V, or choose files. They’ll be added in file-name order and stay on this computer.</p>
          <UploadButton label="Choose screenshots" variant="primary" />
        </div>
      </div>
    );
  }

  const index = project.screens.indexOf(screen);
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-slate-100">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5 text-sm whitespace-nowrap">
        <span className="truncate font-medium text-slate-700">
          {index + 1}. {screen.name}
        </span>
        <span className="text-xs text-slate-400">
          {screen.width}×{screen.height}
        </span>
        {redact ? (
          <>
            <span className="ml-2 rounded bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">Redact mode</span>
            <span className="hidden text-xs text-slate-500 xl:inline">Drag over patient names, MRNs, dates… </span>
            <div className="flex-1" />
            <select className="input w-auto py-0.5 text-xs" value={redact.style} onChange={(e) => setRedact({ ...redact, style: e.target.value as RedactStyle })} aria-label="Redaction style">
              <option value="black">Black box</option>
              <option value="white">White box</option>
              <option value="pixelate">Pixelate</option>
            </select>
            <Button size="sm" onClick={() => setRedact(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!redact.rects.length} onClick={() => setConfirming(true)} data-testid="apply-redaction">
              Apply {redact.rects.length || ''} redaction{redact.rects.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <span className="ml-2 hidden text-xs text-slate-500 xl:inline">Drag on the screenshot to draw a clickable area.</span>
            <div className="flex-1" />
            <Button size="sm" icon="eyeoff" onClick={() => setRedact({ screenId: screen.id, rects: [], style: 'black' })} title="Hide sensitive information on this screenshot" data-testid="redact-mode">
              Redact
            </Button>
          </>
        )}
        <select className="input w-auto py-0.5 text-xs" value={String(zoom)} onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))} aria-label="Zoom">
          <option value="fit">Fit</option>
          {ZOOMS.map((z) => (
            <option key={z} value={z}>
              {z * 100}%
            </option>
          ))}
        </select>
        {!redact && (
          <Button size="sm" icon="play" onClick={() => onPreview(screen.id)}>
            Preview from here
          </Button>
        )}
      </div>
      <div className={`min-h-0 flex-1 ${zoom === 'fit' ? 'overflow-hidden p-6' : 'overflow-auto p-6'}`} style={zoom === 'fit' ? { containerType: 'size' } : undefined}>
        <Stage
          key={screen.id}
          screen={screen}
          zoom={zoom}
          redaction={redact ? { rects: redact.rects, style: redact.style, onAdd: (r) => setRedact({ ...redact, rects: [...redact.rects, r] }), onRemove: (i) => setRedact({ ...redact, rects: redact.rects.filter((_, j) => j !== i) }) } : null}
        />
      </div>
      {confirming && (
        <Modal
          title="Permanently redact this screenshot?"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="primary" disabled={applying} onClick={applyRedaction} data-testid="confirm-redaction">
                {applying ? 'Redacting…' : 'Redact permanently'}
              </Button>
            </>
          }
        >
          <p className="text-sm">The covered areas are painted into the image and the original is deleted from this computer. This can’t be undone (undo history is cleared).</p>
        </Modal>
      )}
    </div>
  );
}

interface Redaction {
  rects: Rect[];
  style: RedactStyle;
  onAdd: (r: Rect) => void;
  onRemove: (index: number) => void;
}

function Stage({ screen, zoom, redaction }: { screen: Screen; zoom: 'fit' | number; redaction: Redaction | null }) {
  const url = useImageUrl(screen.imageId);
  const selectedId = useEditor((s) => s.selectedHotspotId);
  const { addHotspot, updateHotspot, selectHotspot } = useEditor.getState();
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<{ id: string | null; rect: Rect } | null>(null);

  const ratio = screen.width / screen.height;
  const size = zoom === 'fit' ? { width: `min(100cqw, calc(100cqh * ${ratio}))` } : { width: screen.width * zoom };

  function toPct(e: { clientX: number; clientY: number }) {
    const r = layerRef.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) };
  }

  function onPointerDown(e: RPointerEvent) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    const pt = toPct(e);
    if (t.closest('[data-redact-remove]')) return;
    const handle = redaction ? null : t.closest<HTMLElement>('[data-handle]');
    const hsEl = redaction ? null : t.closest<HTMLElement>('[data-hs]');
    if (handle && hsEl) {
      const h = screen.hotspots.find((x) => x.id === hsEl.dataset.hs)!;
      drag.current = { mode: 'resize', id: h.id, handle: handle.dataset.handle as Handle, orig: { x: h.x, y: h.y, w: h.w, h: h.h } };
    } else if (hsEl) {
      const h = screen.hotspots.find((x) => x.id === hsEl.dataset.hs)!;
      selectHotspot(h.id);
      drag.current = { mode: 'move', id: h.id, start: pt, orig: { x: h.x, y: h.y, w: h.w, h: h.h } };
    } else {
      drag.current = { mode: 'draw', start: pt };
    }
    layerRef.current!.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: RPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = toPct(e);
    if (d.mode === 'draw') {
      setDraft({ id: null, rect: { x: Math.min(p.x, d.start.x), y: Math.min(p.y, d.start.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) } });
    } else if (d.mode === 'move') {
      const o = d.orig;
      setDraft({ id: d.id, rect: { ...o, x: clamp(o.x + p.x - d.start.x, 0, 100 - o.w), y: clamp(o.y + p.y - d.start.y, 0, 100 - o.h) } });
    } else {
      const o = d.orig;
      let [l, t, r, b] = [o.x, o.y, o.x + o.w, o.y + o.h];
      if (d.handle.includes('w')) l = clamp(p.x, 0, r - MIN);
      if (d.handle.includes('e')) r = clamp(p.x, l + MIN, 100);
      if (d.handle.includes('n')) t = clamp(p.y, 0, b - MIN);
      if (d.handle.includes('s')) b = clamp(p.y, t + MIN, 100);
      setDraft({ id: d.id, rect: { x: l, y: t, w: r - l, h: b - t } });
    }
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    const r = draft?.rect;
    setDraft(null);
    if (!d) return;
    if (d.mode === 'draw') {
      if (r && r.w >= 0.4 && r.h >= 0.4 && redaction) redaction.onAdd(roundRect(r));
      else if (r && r.w >= 0.8 && r.h >= 0.8) addHotspot(screen.id, roundRect(r));
      else selectHotspot(null);
    } else if (r && (r.x !== d.orig.x || r.y !== d.orig.y || r.w !== d.orig.w || r.h !== d.orig.h)) {
      updateHotspot(d.id, roundRect(r));
    }
  }

  const correctOrder = screen.hotspots.filter((h) => h.outcome === 'correct').map((h) => h.id);

  return (
    <div className="relative mx-auto bg-white shadow-md ring-1 ring-slate-300 select-none" style={{ ...size, aspectRatio: `${screen.width} / ${screen.height}` }} data-testid="editor-stage">
      {url && <img src={url} alt={screen.name} className="pointer-events-none block h-full w-full" draggable={false} />}
      <div
        ref={layerRef}
        className="absolute inset-0 cursor-crosshair touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="hotspot-layer"
      >
        {screen.hotspots.map((h) => {
          const rect = draft?.id === h.id ? draft.rect : h;
          const sel = h.id === selectedId;
          const st = OUTCOME_STYLE[h.outcome];
          const order = correctOrder.indexOf(h.id);
          return (
            <div
              key={h.id}
              data-hs={h.id}
              data-testid="hotspot"
              data-name={h.name}
              className={`absolute cursor-move rounded-sm border-2 ${st.border} ${st.fill} ${sel && !redaction ? 'z-10 ring-2 ring-white outline-2 outline-blue-600' : ''} ${redaction ? 'pointer-events-none opacity-25' : ''}`}
              style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
              title={h.name}
            >
              <span className={`pointer-events-none absolute -top-[18px] left-[-2px] flex items-center gap-1 rounded-t px-1 text-[10px] leading-4 font-semibold whitespace-nowrap text-white ${st.chip}`}>
                {h.outcome === 'correct' ? `${order + 1}` : h.outcome === 'alternative' ? 'ALT' : '✕'}
                {(sel || h.kind !== 'click') && <span className="font-normal opacity-90">{sel ? h.name : h.kind}</span>}
              </span>
              {sel &&
                !redaction &&
                (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]).map((hd) => (
                  <span key={hd} data-handle={hd} className="absolute h-2.5 w-2.5 rounded-sm border border-blue-600 bg-white" style={handleStyle(hd)} />
                ))}
            </div>
          );
        })}
        {redaction?.rects.map((r, i) => (
          <div
            key={i}
            data-testid="redaction"
            className={`absolute ${redaction.style === 'black' ? 'bg-slate-900' : redaction.style === 'white' ? 'border border-slate-400 bg-white' : 'bg-[repeating-conic-gradient(#94a3b8_0%_25%,#cbd5e1_0%_50%)] bg-[length:12px_12px]'}`}
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
          >
            <button
              data-redact-remove
              className="absolute -top-2 -right-2 rounded-full bg-red-600 p-0.5 text-white shadow"
              onClick={() => redaction.onRemove(i)}
              aria-label="Remove redaction"
            >
              <Icon name="x" className="h-3 w-3" />
            </button>
          </div>
        ))}
        {draft?.id === null && (
          <div
            className={`pointer-events-none absolute border-2 border-dashed ${redaction ? 'border-slate-900 bg-slate-900/40' : 'border-blue-600 bg-blue-500/10'}`}
            style={{ left: `${draft.rect.x}%`, top: `${draft.rect.y}%`, width: `${draft.rect.w}%`, height: `${draft.rect.h}%` }}
          />
        )}
      </div>
    </div>
  );
}

function roundRect(r: Rect): Rect {
  return { x: round2(r.x), y: round2(r.y), w: round2(r.w), h: round2(r.h) };
}

const CURSORS: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };

function handleStyle(h: Handle): React.CSSProperties {
  const s: React.CSSProperties = { cursor: CURSORS[h] };
  s.left = h.includes('w') ? -6 : h.includes('e') ? 'calc(100% - 4px)' : 'calc(50% - 5px)';
  s.top = h.includes('n') ? -6 : h.includes('s') ? 'calc(100% - 4px)' : 'calc(50% - 5px)';
  return s;
}
