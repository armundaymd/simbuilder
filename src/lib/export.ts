import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import playerSource from '../player/dist/player.iife.js?raw';
import type { Project } from '../types';
import { markBackedUp } from './backups';
import { markStep } from './progress';
import { getRepository } from './db';
import { blobToDataUrl, dataUrlToBlob } from './images';
import { normalizeProject, uid } from './model';

export const PROJECT_FORMAT = 'simbuilder-project';

export interface PortableProject {
  format: typeof PROJECT_FORMAT;
  version: 1;
  exportedAt: string;
  project: Project;
  /** imageId → data URL */
  images: Record<string, string>;
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'simulation';
}

/** JSON safe to embed inside a <script> element. */
function scriptSafeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
const scriptSafeJs = (js: string) => js.replace(/<\/script/gi, '<\\/script');

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

async function collectImages(project: Project, as: 'dataUrl' | 'blob') {
  const repo = getRepository();
  const out: Record<string, { dataUrl?: string; blob: Blob }> = {};
  for (const s of project.screens) {
    if (out[s.imageId]) continue;
    const rec = await repo.getImage(s.imageId);
    if (!rec) throw new Error(`Screenshot for “${s.name}” is missing.`);
    out[s.imageId] = { blob: rec.blob, dataUrl: as === 'dataUrl' ? await blobToDataUrl(rec.blob) : undefined };
  }
  return out;
}

function htmlShell(title: string, head: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="SimBuilder">
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;height:100%;}#sim{position:fixed;inset:0}</style>
${head}
</head>
<body>
<div id="sim"></div>
${body}
</body>
</html>
`;
}

const BOOT = `<script>SimPlayer.mount(document.getElementById('sim'), window.__SIM_DATA__, {});</script>`;

/**
 * SCORM 1.2 runtime glue: finds the LMS API, pre-fills the learner name, and reports
 * completion + score (accuracy). Demonstration runs only count if it's the only mode offered.
 */
const SCORM_BOOT = `<script>
(function () {
  function find(w) { for (var n = 0; w && n < 12; n++) { if (w.API) return w.API; if (w.parent === w) break; w = w.parent; } return null; }
  var api = find(window) || (window.opener && find(window.opener));
  var data = window.__SIM_DATA__, started = Date.now(), closed = false;
  var modes = (data.project.settings && data.project.settings.modes) || [];
  function pad(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
  function span(ms) { var s = Math.round(ms / 1000); return pad(Math.floor(s / 3600), 4) + ':' + pad(Math.floor(s % 3600 / 60), 2) + ':' + pad(s % 60, 2); }
  var name = '';
  if (api) {
    api.LMSInitialize('');
    var st = api.LMSGetValue('cmi.core.lesson_status');
    if (!st || st === 'not attempted') api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    name = api.LMSGetValue('cmi.core.student_name') || '';
    if (name.indexOf(',') > 0) { var p = name.split(','); name = (p[1] + ' ' + p[0]).trim(); }
    api.LMSCommit('');
  }
  function close() {
    if (!api || closed) return; closed = true;
    api.LMSSetValue('cmi.core.session_time', span(Date.now() - started));
    api.LMSCommit(''); api.LMSFinish('');
  }
  window.addEventListener('pagehide', close);
  window.addEventListener('beforeunload', close);
  SimPlayer.mount(document.getElementById('sim'), data, {
    learnerName: name,
    onComplete: function (r) {
      if (!api || (r.mode === 'demo' && modes.length > 1)) return;
      api.LMSSetValue('cmi.core.score.min', '0');
      api.LMSSetValue('cmi.core.score.max', '100');
      api.LMSSetValue('cmi.core.score.raw', String(r.accuracy));
      api.LMSSetValue('cmi.core.lesson_status', 'completed');
      api.LMSCommit('');
    }
  });
})();
</script>`;

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

function scormManifest(project: Project, files: string[]) {
  const t = xmlEscape(project.title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="simbuilder-${project.id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org1">
    <organization identifier="org1">
      <title>${t}</title>
      <item identifier="item1" identifierref="res1"><title>${t}</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${files.map((f) => `      <file href="${xmlEscape(f)}"/>`).join('\n')}
    </resource>
  </resources>
</manifest>
`;
}

/** One self-contained HTML file: player, data and screenshots all inlined. Works offline from file://. */
export async function buildStandaloneHtml(project: Project): Promise<string> {
  const imgs = await collectImages(project, 'dataUrl');
  const images = Object.fromEntries(Object.entries(imgs).map(([id, v]) => [id, v.dataUrl!]));
  return htmlShell(
    project.title,
    '',
    `<script>window.__SIM_DATA__=${scriptSafeJson({ project, images })};</script>
<script>${scriptSafeJs(playerSource)}</script>
${BOOT}`,
  );
}

export async function buildPortableProject(project: Project): Promise<PortableProject> {
  const imgs = await collectImages(project, 'dataUrl');
  return {
    format: PROJECT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    images: Object.fromEntries(Object.entries(imgs).map(([id, v]) => [id, v.dataUrl!])),
  };
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' };

/** ZIP with index.html + player.js + data.js + assets/. Unzip and open index.html — no server needed. */
export async function buildZip(project: Project, opts: { scorm?: boolean } = {}): Promise<Uint8Array> {
  const imgs = await collectImages(project, 'blob');
  const files: Record<string, Uint8Array> = {};
  const images: Record<string, string> = {};
  for (const [id, { blob }] of Object.entries(imgs)) {
    const path = `assets/${id}.${EXT[blob.type] ?? 'png'}`;
    images[id] = path;
    files[path] = new Uint8Array(await blob.arrayBuffer());
  }
  files['player.js'] = strToU8(playerSource);
  files['data.js'] = strToU8(`window.__SIM_DATA__=${scriptSafeJson({ project, images })};\n`);
  files['index.html'] = strToU8(htmlShell(project.title, '', `<script src="data.js"></script>\n<script src="player.js"></script>\n${opts.scorm ? SCORM_BOOT : BOOT}`));
  files['project.json'] = strToU8(JSON.stringify(await buildPortableProject(project), null, 2));
  files['README.txt'] = strToU8(
    `${project.title}\n\nOpen index.html in any modern browser to run the simulation. No internet connection or server is required.\nproject.json can be imported back into SimBuilder to keep editing.\n`,
  );
  if (opts.scorm) files['imsmanifest.xml'] = strToU8(scormManifest(project, Object.keys(files)));
  return zipSync(files, { level: 6 });
}

/** Every project as portable JSON inside one ZIP. */
export async function buildBackupZip(projects: Project[]): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const p of projects) files[`${slugify(p.title)}-${p.id}.simproject.json`] = strToU8(JSON.stringify(await buildPortableProject(p)));
  return zipSync(files, { level: 0 }); // images are already compressed
}

/** Import a .json project file, or every project inside a .zip (backup or export package). */
export async function importFile(file: File): Promise<Project[]> {
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new Error('This ZIP file couldn’t be opened.');
    }
    const out: Project[] = [];
    for (const [name, bytes] of Object.entries(entries)) {
      if (!name.endsWith('.json')) continue;
      try {
        out.push(await importPortableProject(strFromU8(bytes)));
      } catch {
        /* not a project file */
      }
    }
    if (!out.length) throw new Error('No SimBuilder projects were found in this ZIP.');
    return out;
  }
  return [await importPortableProject(await file.text())];
}

/** Import a portable project JSON file. Always creates a new project (never overwrites). */
export async function importPortableProject(text: string): Promise<Project> {
  let parsed: PortableProject;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (parsed?.format !== PROJECT_FORMAT || !parsed.project) throw new Error('This file is not a SimBuilder project.');
  const repo = getRepository();
  const idMap = new Map<string, string>();
  for (const [oldId, dataUrl] of Object.entries(parsed.images ?? {})) {
    const blob = await dataUrlToBlob(dataUrl);
    const newId = uid('img_');
    const screen = parsed.project.screens.find((s) => s.imageId === oldId);
    await repo.saveImage({ id: newId, blob, width: screen?.width ?? 0, height: screen?.height ?? 0 });
    idMap.set(oldId, newId);
  }
  const now = Date.now();
  const project = normalizeProject({
    ...parsed.project,
    id: uid('p_'),
    createdAt: now,
    updatedAt: now,
    screens: parsed.project.screens.map((s) => ({ ...s, imageId: idMap.get(s.imageId) ?? s.imageId })),
  });
  await repo.saveProject(project);
  return project;
}

export function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ExportFormat = 'html' | 'json' | 'zip' | 'scorm';

export async function exportProject(project: Project, format: ExportFormat) {
  const name = slugify(project.title);
  if (format === 'html') download(await buildStandaloneHtml(project), `${name}.html`, 'text/html');
  else if (format === 'json') download(JSON.stringify(await buildPortableProject(project)), `${name}.simproject.json`, 'application/json');
  else if (format === 'zip') download((await buildZip(project)) as BlobPart, `${name}.zip`, 'application/zip');
  else download((await buildZip(project, { scorm: true })) as BlobPart, `${name}-scorm.zip`, 'application/zip');
  markStep(project.id, 'exported');
  // JSON and both ZIP variants contain a full, re-importable project.
  if (format !== 'html') markBackedUp([project.id]);
}

export async function backupAll(projects: Project[]) {
  download((await buildBackupZip(projects)) as BlobPart, `simbuilder-backup-${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
  markBackedUp(projects.map((p) => p.id));
}

/** Duplicate a project (images are shared by id; they're immutable). */
export async function duplicateProject(p: Project): Promise<Project> {
  const now = Date.now();
  const copy: Project = { ...structuredClone(p), id: uid('p_'), title: `${p.title} (copy)`, createdAt: now, updatedAt: now };
  await getRepository().saveProject(copy);
  return copy;
}
