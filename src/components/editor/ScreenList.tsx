import { useRef, useState } from 'react';
import { addImageFiles } from '../../lib/upload';
import type { Issue } from '../../lib/validate';
import { useEditor } from '../../store/editor';
import { Thumb } from '../Thumb';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/ui';

export function UploadButton({ label = 'Add screenshots', variant = 'secondary' as const }: { label?: string; variant?: 'primary' | 'secondary' }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} icon="upload" className="w-full" onClick={() => ref.current?.click()}>
        {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="upload-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void addImageFiles(files);
        }}
      />
    </>
  );
}

export function ScreenList({ issues }: { issues: Issue[] }) {
  const project = useEditor((s) => s.project)!;
  const selected = useEditor((s) => s.selectedScreenId);
  const { selectScreen, moveScreen, deleteScreen, duplicateScreen, update } = useEditor.getState();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const issueLevel = (id: string) => {
    const mine = issues.filter((i) => i.screenId === id);
    return mine.some((i) => i.level === 'error') ? 'error' : mine.length ? 'warning' : null;
  };

  return (
    <aside className="flex w-60 flex-none flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Screens ({project.screens.length})</h2>
      </div>
      <ol className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-2" data-testid="screen-list">
        {project.screens.map((s, i) => {
          const level = issueLevel(s.id);
          const isStart = project.startScreenId === s.id;
          return (
            <li
              key={s.id}
              draggable
              onDragStart={(e) => {
                setDragId(s.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.id);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropIndex(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.stopPropagation();
                const from = project.screens.findIndex((x) => x.id === dragId);
                if (dropIndex !== null) moveScreen(dragId, dropIndex > from ? dropIndex - 1 : dropIndex);
                setDragId(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropIndex(null);
              }}
              className={`group relative cursor-pointer rounded-lg border p-1.5 ${s.id === selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-transparent hover:bg-slate-50'} ${dragId === s.id ? 'opacity-40' : ''}`}
              onClick={() => selectScreen(s.id)}
              data-testid="screen-item"
            >
              {dropIndex === i && dragId && <div className="absolute -top-1 right-1 left-1 h-0.5 rounded bg-blue-500" />}
              {dropIndex === i + 1 && i === project.screens.length - 1 && dragId && <div className="absolute right-1 -bottom-1 left-1 h-0.5 rounded bg-blue-500" />}
              <div className="relative">
                <Thumb imageId={s.imageId} className="aspect-[16/10] w-full rounded border border-slate-200" />
                <span className="absolute top-1 left-1 rounded bg-slate-900/75 px-1.5 text-xs font-medium text-white">{i + 1}</span>
                {isStart && <span className="absolute top-1 right-1 rounded bg-emerald-600 px-1.5 text-[10px] font-semibold text-white uppercase">Start</span>}
                {level && (
                  <span className={`absolute right-1 bottom-1 rounded-full p-0.5 text-white ${level === 'error' ? 'bg-red-600' : 'bg-amber-500'}`} title={level === 'error' ? 'Has problems' : 'Has warnings'}>
                    <Icon name="alert" className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate px-0.5 text-xs font-medium" title={s.name}>
                  {s.name}
                </span>
                <span className="text-[10px] text-slate-400">{s.hotspots.length} ◻︎</span>
              </div>
              <div className="absolute top-8 right-2 hidden flex-col gap-1 group-hover:flex">
                {!isStart && (
                  <IconBtn title="Make this the start screen" icon="flag" onClick={() => update((d) => void (d.startScreenId = s.id))} />
                )}
                <IconBtn title="Duplicate screen" icon="copy" onClick={() => duplicateScreen(s.id)} />
                <IconBtn title="Delete screen" icon="trash" danger onClick={() => deleteScreen(s.id)} />
              </div>
            </li>
          );
        })}
        {project.screens.length === 0 && <li className="px-2 py-6 text-center text-xs text-slate-500">Drop screenshots anywhere, paste one (⌘V), or use the button below.</li>}
      </ol>
      <div className="border-t border-slate-200 p-2">
        <UploadButton />
      </div>
    </aside>
  );
}

function IconBtn({ icon, title, onClick, danger }: { icon: string; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      className={`rounded-md border border-slate-200 bg-white p-1 shadow-sm ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-50'}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
    </button>
  );
}
