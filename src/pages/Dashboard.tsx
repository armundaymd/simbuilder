import { useCallback, useEffect, useRef, useState } from 'react';
import { ExportDialog } from '../components/ExportDialog';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/ui/Icon';
import { Button, Field, Modal, formatDate } from '../components/ui/ui';
import { getRepository } from '../lib/db';
import { loadExampleProject } from '../lib/example';
import { backupAll, duplicateProject, importFile } from '../lib/export';
import { needsBackup, requestPersistentStorage } from '../lib/backups';
import { createProject, uid } from '../lib/model';
import { navigate } from '../lib/router';
import { flushSave } from '../store/editor';
import type { Folder, Project } from '../types';

const DEFAULT_FOLDERS = ['Emergency Department', 'Ambulatory', 'Inpatient', 'Radiology', 'General Training'];
const SEED_KEY = 'simbuilder.foldersSeeded';

type FolderFilter = 'all' | 'unfiled' | string;

let seeding: Promise<Folder[]> | null = null;
/** Create the starter folders once per browser (safe to call concurrently). */
function ensureDefaultFolders(): Promise<Folder[]> {
  const repo = getRepository();
  return (seeding ??= (async () => {
    let seeded = false;
    try {
      seeded = !!localStorage.getItem(SEED_KEY);
    } catch {
      /* storage unavailable */
    }
    if (!seeded && (await repo.listFolders()).length === 0) {
      for (const name of DEFAULT_FOLDERS) await repo.saveFolder({ id: uid('f_'), name, createdAt: Date.now() });
    }
    try {
      localStorage.setItem(SEED_KEY, '1');
    } catch {
      /* ignore */
    }
    return repo.listFolders();
  })()).finally(() => (seeding = null));
}

export default function Dashboard() {
  const repo = getRepository();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState<FolderFilter>('all');
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [folderEdit, setFolderEdit] = useState<{ id?: string; name: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'bad' } | null>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const fs = await ensureDefaultFolders();
    setFolders(fs);
    setProjects(await repo.listProjects());
  }, [repo]);

  useEffect(() => {
    void refresh();
    void requestPersistentStorage();
    // Clean up screenshots no longer used by any project (e.g. replaced or deleted screens),
    // but only after any save from the editor we just left has landed.
    void flushSave().then(() => repo.collectGarbage());
  }, [refresh, repo]);
  const [backupDismissed, setBackupDismissed] = useState(false);
  const unbacked = needsBackup(projects ?? []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const visible = (projects ?? []).filter((p) => (filter === 'all' ? true : filter === 'unfiled' ? !p.folderId || !folders.some((f) => f.id === p.folderId) : p.folderId === filter));
  const countIn = (id: FolderFilter) => (projects ?? []).filter((p) => (id === 'unfiled' ? !p.folderId : p.folderId === id)).length;

  async function onImport(file: File) {
    setBusy(true);
    try {
      const ps = await importFile(file);
      setMessage({ text: ps.length === 1 ? `Imported “${ps[0].title}”.` : `Imported ${ps.length} simulations.`, kind: 'ok' });
      await refresh();
    } catch (e) {
      setMessage({ text: (e as Error).message, kind: 'bad' });
    } finally {
      setBusy(false);
    }
  }

  async function onLoadExample() {
    setBusy(true);
    try {
      const folderId = folders.find((f) => f.name === 'Emergency Department')?.id ?? null;
      const p = await loadExampleProject(folderId);
      navigate(`/edit/${p.id}`);
    } catch (e) {
      setMessage({ text: `Couldn’t load the example: ${(e as Error).message}`, kind: 'bad' });
      setBusy(false);
    }
  }

  async function saveFolder() {
    if (!folderEdit?.name.trim()) return;
    const existing = folders.find((f) => f.id === folderEdit.id);
    await repo.saveFolder(existing ? { ...existing, name: folderEdit.name.trim() } : { id: uid('f_'), name: folderEdit.name.trim(), createdAt: Date.now() });
    setFolderEdit(null);
    await refresh();
  }

  async function deleteFolder(id: string) {
    await repo.deleteFolder(id);
    if (filter === id) setFilter('all');
    setFolderEdit(null);
    await refresh();
  }

  async function moveToFolder(p: Project, folderId: string | null) {
    await repo.saveProject({ ...p, folderId });
    await refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Icon name="sparkle" />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">SimBuilder</h1>
          <p className="text-xs text-slate-500">Interactive software training simulations</p>
        </div>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => navigate('/help')} data-testid="open-guide">
          Guide
        </Button>
        <Button icon="import" onClick={() => importRef.current?.click()} disabled={busy}>
          Import project
        </Button>
        <input ref={importRef} type="file" accept=".json,.zip,application/json,application/zip" className="hidden" data-testid="import-input" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0]).finally(() => (e.target.value = ''))} />
        <Button icon="sparkle" onClick={onLoadExample} disabled={busy} data-testid="load-example">
          Load EHR example
        </Button>
        <Button variant="primary" icon="plus" onClick={() => setCreating(true)} data-testid="new-simulation">
          New simulation
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-60 flex-none overflow-auto border-r border-slate-200 bg-white p-3">
          <FolderItem label="All simulations" count={projects?.length ?? 0} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FolderItem label="Unfiled" count={countIn('unfiled')} active={filter === 'unfiled'} onClick={() => setFilter('unfiled')} />
          <div className="mt-4 mb-1 flex items-center justify-between px-2">
            <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Folders</span>
            <button className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="New folder" onClick={() => setFolderEdit({ name: '' })} data-testid="new-folder">
              <Icon name="plus" />
            </button>
          </div>
          {folders.map((f) => (
            <FolderItem key={f.id} label={f.name} icon count={countIn(f.id)} active={filter === f.id} onClick={() => setFilter(f.id)} onEdit={() => setFolderEdit({ id: f.id, name: f.name })} />
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          {unbacked.length > 0 && !backupDismissed && (
            <div className="mb-5 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="backup-banner">
              <Icon name="alert" className="h-4 w-4 flex-none" />
              <span className="flex-1">
                {unbacked.length === 1 ? '1 simulation has' : `${unbacked.length} simulations have`} changes that aren’t backed up. Simulations are stored only in this browser — clearing browsing data
                would delete them.
              </span>
              <Button
                size="sm"
                variant="primary"
                icon="download"
                data-testid="backup-all"
                onClick={async () => {
                  await backupAll(projects!);
                  setMessage({ text: 'Backup downloaded. Keep it somewhere safe (e.g. a shared drive). Import it to restore.', kind: 'ok' });
                  await refresh();
                }}
              >
                Back up all
              </Button>
              <button className="text-amber-700 hover:text-amber-900" onClick={() => setBackupDismissed(true)} aria-label="Dismiss">
                <Icon name="x" />
              </button>
            </div>
          )}
          {projects === null ? null : visible.length === 0 ? (
            <EmptyState onNew={() => setCreating(true)} onExample={onLoadExample} filtered={projects.length > 0} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
              {visible.map((p) => (
                <article key={p.id} className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs" data-testid="project-card">
                  <button className="relative block aspect-[16/9] w-full" onClick={() => navigate(`/edit/${p.id}`)} title="Edit">
                    <Thumb imageId={p.screens.find((s) => s.id === p.startScreenId)?.imageId ?? p.screens[0]?.imageId} className="h-full w-full" />
                    {p.screens.length === 0 && <span className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">No screens yet</span>}
                  </button>
                  <div className="flex flex-1 flex-col gap-1 border-t border-slate-100 p-4">
                    <h3 className="truncate font-semibold" title={p.title}>
                      {p.title}
                    </h3>
                    {p.description && <p className="line-clamp-2 text-sm text-slate-600">{p.description}</p>}
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs text-slate-500">
                      <dt>Screens</dt>
                      <dd data-testid="screen-count">{p.screens.length}</dd>
                      <dt>Created</dt>
                      <dd>{formatDate(p.createdAt)}</dd>
                      <dt>Modified</dt>
                      <dd>{formatDate(p.updatedAt)}</dd>
                    </dl>
                    <select className="input mt-2 py-1 text-xs" value={p.folderId ?? ''} onChange={(e) => moveToFolder(p, e.target.value || null)} aria-label="Folder">
                      <option value="">Unfiled</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="primary" icon="edit" onClick={() => navigate(`/edit/${p.id}`)}>
                        Edit
                      </Button>
                      <Button size="sm" icon="play" onClick={() => navigate(`/preview/${p.id}`)} disabled={!p.screens.length}>
                        Preview
                      </Button>
                      <Button size="sm" icon="copy" onClick={async () => (await duplicateProject(p), refresh())}>
                        Duplicate
                      </Button>
                      <Button size="sm" icon="download" onClick={() => setExporting(p)}>
                        Export
                      </Button>
                      <Button size="sm" variant="danger" icon="trash" onClick={() => setDeleting(p)} aria-label="Delete" title="Delete" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>

      {creating && (
        <NewProjectDialog
          folders={folders}
          defaultFolder={filter !== 'all' && filter !== 'unfiled' ? filter : null}
          onClose={() => setCreating(false)}
          onCreate={async (title, description, folderId) => {
            const p = createProject(title, description, folderId);
            await repo.saveProject(p);
            navigate(`/edit/${p.id}`);
          }}
        />
      )}
      {exporting && <ExportDialog project={exporting} onClose={() => setExporting(null)} />}
      {deleting && (
        <Modal
          title="Delete simulation?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="primary"
                className="!border-red-600 !bg-red-600 hover:!bg-red-700"
                data-testid="confirm-delete"
                onClick={async () => {
                  await repo.deleteProject(deleting.id);
                  setDeleting(null);
                  await refresh();
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-sm">
            “{deleting.title}” and its screenshots will be permanently deleted from this computer. Export a project file first if you want a backup.
          </p>
        </Modal>
      )}
      {folderEdit && (
        <Modal
          title={folderEdit.id ? 'Rename folder' : 'New folder'}
          onClose={() => setFolderEdit(null)}
          footer={
            <>
              {folderEdit.id && (
                <Button variant="danger" className="mr-auto" onClick={() => deleteFolder(folderEdit.id!)}>
                  Delete folder
                </Button>
              )}
              <Button onClick={() => setFolderEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={saveFolder} disabled={!folderEdit.name.trim()}>
                Save
              </Button>
            </>
          }
        >
          <Field label="Folder name" hint={folderEdit.id ? 'Deleting a folder keeps its simulations (they become Unfiled).' : undefined}>
            <input className="input" autoFocus value={folderEdit.name} onChange={(e) => setFolderEdit({ ...folderEdit, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveFolder()} />
          </Field>
        </Modal>
      )}
      {message && (
        <div className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${message.kind === 'ok' ? 'bg-emerald-600' : 'bg-red-600'}`} role="status">
          {message.text}
        </div>
      )}
    </div>
  );
}

function FolderItem({ label, count, active, onClick, onEdit, icon }: { label: string; count: number; active: boolean; onClick: () => void; onEdit?: () => void; icon?: boolean }) {
  return (
    <div className={`group flex items-center rounded-md text-sm ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'}`}>
      <button className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left" onClick={onClick}>
        {icon && <Icon name="folder" className="h-4 w-4 flex-none opacity-60" />}
        <span className="truncate">{label}</span>
        <span className="ml-auto text-xs text-slate-400">{count}</span>
      </button>
      {onEdit && (
        <button className="mr-1 hidden rounded p-1 text-slate-400 group-hover:block hover:text-slate-700" title="Rename or delete" onClick={onEdit}>
          <Icon name="edit" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function EmptyState({ onNew, onExample, filtered }: { onNew: () => void; onExample: () => void; filtered: boolean }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Icon name="image" className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold">{filtered ? 'Nothing in this folder yet' : 'Create your first simulation'}</h2>
      <p className="mt-1 text-sm text-slate-600">Upload screenshots of any software, draw clickable areas over them, and export a training simulation that works offline.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="primary" icon="plus" onClick={onNew}>
          New simulation
        </Button>
        <Button icon="sparkle" onClick={onExample}>
          Explore the EHR example
        </Button>
      </div>
    </div>
  );
}

function NewProjectDialog({
  folders,
  defaultFolder,
  onClose,
  onCreate,
}: {
  folders: Folder[];
  defaultFolder: string | null;
  onClose: () => void;
  onCreate: (title: string, description: string, folderId: string | null) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState<string | null>(defaultFolder);
  const submit = () => title.trim() && onCreate(title.trim(), description.trim(), folderId);
  return (
    <Modal
      title="New simulation"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim()} data-testid="create-simulation">
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <input className="input" autoFocus placeholder="e.g. Placing a CBC order in the ED" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} data-testid="new-title" />
        </Field>
        <Field label="Description (optional)" hint="Shown to learners before they start.">
          <textarea className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="new-description" />
        </Field>
        <Field label="Folder">
          <select className="input" value={folderId ?? ''} onChange={(e) => setFolderId(e.target.value || null)}>
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
