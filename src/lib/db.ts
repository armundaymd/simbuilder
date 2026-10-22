import { openDB, type IDBPDatabase } from 'idb';
import type { Folder, ImageRecord, Project } from '../types';
import { normalizeProject } from './model';

/**
 * Storage abstraction. The IndexedDB implementation keeps everything on the
 * user's machine; a server-backed implementation can be swapped in later.
 */
export interface Repository {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  saveProject(p: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listFolders(): Promise<Folder[]>;
  saveFolder(f: Folder): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  getImage(id: string): Promise<ImageRecord | undefined>;
  saveImage(img: ImageRecord): Promise<void>;
  deleteImage(id: string): Promise<void>;
  /** Delete the image unless a saved project still uses it. Returns true if deleted. */
  deleteImageIfUnused(id: string): Promise<boolean>;
  /** Remove images that no saved project references. */
  collectGarbage(): Promise<number>;
}

const DB_NAME = 'sim-builder';

/*
 * Unload journal: when the page closes with unsaved edits, the project is written synchronously to
 * localStorage (an IndexedDB write can be abandoned mid-unload). It's merged back on the next start.
 */
const JOURNAL = 'simbuilder.unsaved.';

export function journalProject(p: Project) {
  try {
    localStorage.setItem(JOURNAL + p.id, JSON.stringify(p));
  } catch {
    /* storage unavailable or full */
  }
}

export function clearJournal(id: string, savedUpTo = Infinity) {
  try {
    const raw = localStorage.getItem(JOURNAL + id);
    if (raw && (JSON.parse(raw) as Project).updatedAt <= savedUpTo) localStorage.removeItem(JOURNAL + id);
  } catch {
    /* ignore */
  }
}

async function recoverJournals(db: IDBPDatabase) {
  let keys: string[] = [];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(JOURNAL));
  } catch {
    return;
  }
  for (const k of keys) {
    try {
      const p = JSON.parse(localStorage.getItem(k)!) as Project;
      const existing = (await db.get('projects', p.id)) as Project | undefined;
      if (!existing || existing.updatedAt < p.updatedAt) await db.put('projects', p);
      localStorage.removeItem(k);
    } catch (e) {
      console.error('Could not recover unsaved changes', e);
    }
  }
}

/**
 * Images are stored as raw bytes rather than Blobs: Safari can't store Blobs in
 * IndexedDB in private windows, but ArrayBuffers work everywhere.
 */
interface StoredImage {
  id: string;
  data?: ArrayBuffer;
  type?: string;
  /** Older records stored the Blob directly. */
  blob?: Blob;
  width: number;
  height: number;
}

function fromStored(r: StoredImage | undefined): ImageRecord | undefined {
  if (!r) return undefined;
  const blob = r.blob ?? new Blob([r.data!], { type: r.type || 'image/png' });
  return { id: r.id, blob, width: r.width, height: r.height };
}

class IndexedDbRepository implements Repository {
  private db: Promise<IDBPDatabase>;
  constructor() {
    this.db = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('folders', { keyPath: 'id' });
        db.createObjectStore('images', { keyPath: 'id' });
      },
    }).then(async (db) => {
      await recoverJournals(db);
      return db;
    });
  }
  async listProjects() {
    const all = (await (await this.db).getAll('projects')) as Project[];
    return all.map(normalizeProject).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async getProject(id: string) {
    const p = (await (await this.db).get('projects', id)) as Project | undefined;
    return p && normalizeProject(p);
  }
  async saveProject(p: Project) {
    await (await this.db).put('projects', p);
  }
  async deleteProject(id: string) {
    const db = await this.db;
    const p = (await db.get('projects', id)) as Project | undefined;
    await db.delete('projects', id);
    clearJournal(id);
    if (p) await this.collectImages(p.screens.map((s) => s.imageId));
  }
  /** Delete images no longer referenced by any project. */
  private async collectImages(candidates: string[]) {
    const db = await this.db;
    const projects = (await db.getAll('projects')) as Project[];
    const used = new Set(projects.flatMap((p) => p.screens.map((s) => s.imageId)));
    for (const id of candidates) if (!used.has(id)) await db.delete('images', id);
  }
  async listFolders() {
    const all = (await (await this.db).getAll('folders')) as Folder[];
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }
  async saveFolder(f: Folder) {
    await (await this.db).put('folders', f);
  }
  async deleteFolder(id: string) {
    const db = await this.db;
    await db.delete('folders', id);
    // Move contained projects back to "Unfiled".
    for (const p of (await db.getAll('projects')) as Project[]) {
      if (p.folderId === id) await db.put('projects', { ...p, folderId: null });
    }
  }
  async getImage(id: string) {
    return fromStored((await (await this.db).get('images', id)) as StoredImage | undefined);
  }
  async saveImage(img: ImageRecord) {
    const data = await img.blob.arrayBuffer();
    const rec: StoredImage = { id: img.id, data, type: img.blob.type, width: img.width, height: img.height };
    await (await this.db).put('images', rec);
  }
  async deleteImage(id: string) {
    await (await this.db).delete('images', id);
  }
  private async usedImageIds() {
    const projects = (await (await this.db).getAll('projects')) as Project[];
    return new Set(projects.flatMap((p) => p.screens.map((s) => s.imageId)));
  }
  async deleteImageIfUnused(id: string) {
    if ((await this.usedImageIds()).has(id)) return false;
    await this.deleteImage(id);
    return true;
  }
  async collectGarbage() {
    const db = await this.db;
    const used = await this.usedImageIds();
    const ids = (await db.getAllKeys('images')) as string[];
    let n = 0;
    for (const id of ids) if (!used.has(id)) (await db.delete('images', id), n++);
    return n;
  }
}

let repo: Repository | null = null;
export function getRepository(): Repository {
  return (repo ??= new IndexedDbRepository());
}
