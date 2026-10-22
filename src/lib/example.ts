import type { Hotspot, Project } from '../types';
import { getRepository } from './db';
import { storeImage } from './images';
import { createHotspot, createProject, createScreen } from './model';

interface ManifestHotspot extends Partial<Omit<Hotspot, 'targetScreenId'>> {
  x: number;
  y: number;
  w: number;
  h: number;
  target?: string;
}
interface Manifest {
  title: string;
  description: string;
  screens: { key: string; name: string; file: string; instruction: string; hotspots: ManifestHotspot[] }[];
}

/** Build the bundled synthetic EHR example (public/example) as a new local project. */
export async function loadExampleProject(folderId: string | null): Promise<Project> {
  const base = `${import.meta.env.BASE_URL}example/`;
  const manifest: Manifest = await (await fetch(`${base}manifest.json`)).json();
  const project = createProject(manifest.title, manifest.description, folderId);
  const keyToId = new Map<string, string>();
  for (const s of manifest.screens) {
    const rec = await storeImage(await (await fetch(base + s.file)).blob());
    const screen = createScreen(rec.id, rec.width, rec.height, s.name);
    screen.instruction = s.instruction;
    keyToId.set(s.key, screen.id);
    project.screens.push(screen);
  }
  manifest.screens.forEach((s, i) => {
    project.screens[i].hotspots = s.hotspots.map(({ target, x, y, w, h, ...rest }) =>
      createHotspot({ x, y, w, h }, { ...rest, targetScreenId: target ? keyToId.get(target) ?? null : null }),
    );
  });
  project.startScreenId = project.screens[0].id;
  await getRepository().saveProject(project);
  return project;
}
