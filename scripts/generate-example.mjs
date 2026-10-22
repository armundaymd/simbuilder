// Generates the bundled example simulation: synthetic EHR screenshots plus a
// manifest of hotspots whose coordinates are measured from the rendered DOM.
// All patient data is fictional. Run: npm run example
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'example');
const W = 1440;
const H = 900;

const CSS = `
*{box-sizing:border-box} body{margin:0;font:13px/1.4 "Segoe UI",Helvetica,Arial,sans-serif;color:#1f2937;background:#eef2f6;width:${W}px;height:${H}px;overflow:hidden}
.top{height:44px;background:#0f4c5c;color:#fff;display:flex;align-items:center;padding:0 16px;gap:18px}
.top b{font-size:15px;letter-spacing:.3px} .top .env{background:#f59e0b;color:#111;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px}
.top .menu{opacity:.85} .top .sp{flex:1} .top .user{font-size:12px;opacity:.9}
.banner{height:64px;background:#fff;border-bottom:1px solid #cbd5e1;display:flex;align-items:center;padding:0 18px;gap:28px}
.banner .nm{font-size:19px;font-weight:700;color:#0f4c5c} .banner .f{font-size:12px;color:#475569} .banner .f b{display:block;color:#111;font-size:13px}
.banner .alg{background:#fee2e2;color:#991b1b;padding:4px 10px;border-radius:4px;font-weight:600;font-size:12px}
.wrap{display:flex;height:${H - 44 - 64}px}
.side{width:180px;background:#e2e8f0;border-right:1px solid #cbd5e1;padding:10px 0}
.side div{padding:11px 18px;font-size:14px;color:#334155;border-left:4px solid transparent}
.side .on{background:#fff;border-left-color:#0f766e;font-weight:600;color:#0f4c5c}
.main{flex:1;padding:18px 22px;overflow:hidden}
h2{margin:0 0 12px;font-size:18px;color:#0f4c5c}
.card{background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:14px 16px;margin-bottom:14px}
.card h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#64748b}
table{width:100%;border-collapse:collapse;background:#fff}
th{background:#f1f5f9;text-align:left;font-weight:600;color:#475569;font-size:12px;padding:9px 10px;border-bottom:1px solid #cbd5e1}
td{padding:11px 10px;border-bottom:1px solid #e2e8f0;font-size:13px}
.acu{display:inline-block;width:22px;height:22px;border-radius:50%;color:#fff;text-align:center;line-height:22px;font-weight:700;font-size:12px}
.btn{display:inline-block;padding:8px 16px;border-radius:4px;border:1px solid #94a3b8;background:#fff;font-weight:600;font-size:13px}
.btn.pri{background:#0f766e;border-color:#0f766e;color:#fff}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.kv{display:grid;grid-template-columns:140px 1fr;row-gap:6px;font-size:13px} .kv span{color:#64748b}
.field{height:34px;border:1px solid #94a3b8;border-radius:4px;background:#fff;position:relative}
.dd::after{content:"▾";position:absolute;right:10px;top:7px;color:#475569}
label.l{display:block;font-size:12px;font-weight:600;color:#475569;margin:0 0 5px}
.shade{position:absolute;inset:0;background:rgba(15,23,42,.45)}
.modal{position:absolute;background:#fff;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.modal .hd{background:#0f4c5c;color:#fff;padding:12px 16px;font-weight:600;font-size:15px}
.modal .bd{padding:16px}
.muted{color:#64748b}
.tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
`;

const TOP = `<div class="top"><b>MedChart</b><span class="env">TRAINING — SYNTHETIC DATA</span><span class="menu" data-hs="nav-board">Track Board</span><span class="menu">Patient Lists</span><span class="menu">Reports</span><span class="sp"></span><span class="user">Dr. Demo User · ED Provider</span></div>`;
const banner = (p) => `<div class="banner"><div class="nm">${p.name}</div>
<div class="f"><b>${p.age}</b>DOB ${p.dob}</div><div class="f"><b>MRN ${p.mrn}</b>Synthetic record</div>
<div class="f"><b>ED Room ${p.room}</b>Arrived ${p.arrived}</div><div class="f"><b>Chief complaint</b>${p.cc}</div><div class="alg">Allergies: ${p.allergy}</div></div>`;
const ALEX = { name: 'Testpatient, Alex', age: '45 y.o. Male', dob: '01/01/1980', mrn: '000-0001', room: '12', arrived: '08:14', cc: 'Chest pain', allergy: 'Penicillin (synthetic)' };
const JORDAN = { name: 'Sample, Jordan', age: '62 y.o. Female', dob: '02/02/1963', mrn: '000-0002', room: '8', arrived: '07:22', cc: 'Shortness of breath', allergy: 'NKDA (synthetic)' };
const TABS = ['Summary', 'Triage', 'Workup', 'Results', 'Notes', 'Disposition'];
const side = (on) => `<div class="side">${TABS.map((t) => `<div class="${t === on ? 'on' : ''}" data-hs="tab-${t.toLowerCase()}">${t}</div>`).join('')}</div>`;
const chart = (on, body, extra = '', patient = ALEX) => `${TOP}${banner(patient)}<div class="wrap">${side(on)}<div class="main">${body}</div></div>${extra}`;

const ORDERS_EMPTY = `<div class="card"><h3>Active orders</h3><p class="muted" style="margin:6px 0 14px">No active orders for this encounter.</p>
<span class="btn pri" data-hs="new-order">+ New Order</span> <span class="btn" data-hs="order-sets">Order Sets</span></div>`;
const WORKUP = (orders) => `<h2>Workup</h2>${orders}
<div class="grid2"><div class="card"><h3>Vitals (synthetic)</h3><div class="kv"><span>BP</span>142/88<span>HR</span>96<span>RR</span>18<span>SpO₂</span>98% RA<span>Temp</span>37.0 °C</div></div>
<div class="card"><h3>Triage note</h3><p style="margin:0">45 y.o. with intermittent chest pressure since this morning. Fictional training scenario.</p></div></div>`;

const ORDER_COMPOSER = `<div class="shade"></div><div class="modal" style="left:360px;top:120px;width:720px;height:560px">
<div class="hd">Order Composer — New Order</div><div class="bd">
<label class="l">Search orders</label><div class="field" data-hs="order-search" style="width:100%"></div>
<p class="muted" style="margin-top:14px">Type the name of a lab, imaging study, or medication.</p>
<h3 style="font-size:12px;color:#64748b;text-transform:uppercase;margin:26px 0 8px">Frequently ordered</h3>
<div class="muted">ECG 12-lead · Troponin · Basic Metabolic Panel · Chest X-ray</div>
<div style="position:absolute;bottom:20px;right:20px"><span class="btn" data-hs="composer-cancel">Cancel</span></div></div></div>`;

const ORDER_DETAIL = `<div class="shade"></div><div class="modal" style="left:360px;top:120px;width:720px;height:560px">
<div class="hd">Order Composer — CBC with Differential</div><div class="bd">
<div class="grid2" style="margin-bottom:16px"><div><label class="l">Priority</label><div class="field dd" data-hs="priority"></div></div>
<div><label class="l">Specimen</label><div class="field" style="padding:7px 10px">Blood</div></div></div>
<div class="grid2" style="margin-bottom:16px"><div><label class="l">Collection</label><div class="field" style="padding:7px 10px">Nurse collect</div></div>
<div><label class="l">Frequency</label><div class="field" style="padding:7px 10px">Once</div></div></div>
<label class="l">Comments</label><div class="field" style="height:80px"></div>
<div style="position:absolute;bottom:20px;right:20px;display:flex;gap:10px"><span class="btn" data-hs="detail-cancel">Remove</span><span class="btn pri" data-hs="sign-order">Sign Order</span></div></div></div>`;

const ORDERS_SIGNED = `<div class="card"><h3>Active orders</h3><table><tr><th>Order</th><th>Priority</th><th>Status</th><th>Ordered by</th></tr>
<tr><td><b>CBC with Differential</b></td><td><span class="tag" style="background:#fee2e2;color:#991b1b">STAT</span></td><td><span class="tag" style="background:#dcfce7;color:#166534">Signed</span></td><td>Dr. Demo User</td></tr></table>
<div style="margin-top:12px"><span class="btn pri">+ New Order</span></div></div>`;

const DISPO = `<h2>Disposition</h2><div class="card" style="max-width:760px">
<label class="l">Clinical impression</label><div class="field" data-hs="impression" style="margin-bottom:16px"></div>
<label class="l">Disposition</label><div class="field dd" data-hs="dispo" style="width:320px;margin-bottom:16px"></div>
<label class="l">Follow-up</label><div class="field" style="padding:7px 10px;margin-bottom:20px">Primary care provider in 2–3 days</div>
<span class="btn pri" data-hs="accept-dispo">Accept Disposition</span> <span class="btn">Save Draft</span></div>`;

const CONFIRM = `<div class="shade"></div><div class="modal" style="left:470px;top:280px;width:500px;height:230px">
<div class="hd">Confirm disposition</div><div class="bd"><p style="font-size:14px;margin:4px 0 0">Discharge <b>Testpatient, Alex</b> with clinical impression <b>Chest pain</b>?</p>
<p class="muted">The patient will be removed from your Track Board.</p>
<div style="position:absolute;bottom:20px;right:20px;display:flex;gap:10px"><span class="btn" data-hs="confirm-cancel">Cancel</span><span class="btn pri" data-hs="confirm-ok">Confirm</span></div></div></div>`;

const PATIENTS = [
  ['8', 'Sample, Jordan', '62 F', 'Shortness of breath', 2, '#f97316', 'Dr. Lee', '1:42'],
  ['12', 'Testpatient, Alex', '45 M', 'Chest pain', 2, '#f97316', 'Dr. Demo', '0:38'],
  ['14', 'Example, Riley', '29 F', 'Ankle injury', 4, '#16a34a', '—', '0:21'],
  ['17', 'Mock, Casey', '71 M', 'Weakness', 3, '#eab308', 'Dr. Patel', '2:05'],
  ['21', 'Fictional, Sam', '8 M', 'Fever', 3, '#eab308', '—', '0:12'],
];
const TRACKBOARD = `${TOP}<div style="padding:18px 22px"><h2>ED Track Board — Main Department</h2>
<div class="card" style="padding:0"><table><tr><th>Room</th><th>Patient</th><th>Age/Sex</th><th>Chief complaint</th><th>Acuity</th><th>Provider</th><th>LOS</th></tr>
${PATIENTS.map((p, i) => `<tr data-hs="row-${i}"><td>${p[0]}</td><td><b>${p[1]}</b></td><td>${p[2]}</td><td>${p[3]}</td><td><span class="acu" style="background:${p[5]}">${p[4]}</span></td><td>${p[6]}</td><td>${p[7]}</td></tr>`).join('')}
</table></div><p class="muted">All names and data on this screen are fictional and for training only.</p></div>`;

const SUMMARY = `<h2>Summary</h2><div class="grid2"><div class="card"><h3>Visit</h3><div class="kv"><span>Arrival</span>08:14 by private vehicle<span>Chief complaint</span>Chest pain<span>Acuity</span>ESI 2<span>Attending</span>Dr. Demo User</div></div>
<div class="card"><h3>Vitals (synthetic)</h3><div class="kv"><span>BP</span>142/88<span>HR</span>96<span>SpO₂</span>98% RA</div></div></div>
<div class="card"><h3>Problem list</h3><div>Hypertension (synthetic) · Hyperlipidemia (synthetic)</div></div>`;

const SUMMARY_JORDAN = `<h2>Summary</h2><div class="grid2"><div class="card"><h3>Visit</h3><div class="kv"><span>Arrival</span>07:22 by ambulance<span>Chief complaint</span>Shortness of breath<span>Acuity</span>ESI 2<span>Attending</span>Dr. Lee</div></div>
<div class="card"><h3>Vitals (synthetic)</h3><div class="kv"><span>BP</span>128/76<span>HR</span>104<span>SpO₂</span>91% RA</div></div></div>
<div class="card"><h3>Problem list</h3><div>COPD (synthetic) · Atrial fibrillation (synthetic)</div></div>`;

/** Screen definitions. Hotspots reference elements by data-hs key. */
const SCREENS = [
  {
    key: 'board', name: 'Track Board', html: TRACKBOARD,
    instruction: 'Open the chart for Alex Testpatient (Room 12, chest pain).',
    hotspots: [
      { el: 'row-1', name: 'Alex Testpatient row', outcome: 'correct', action: 'navigate', target: 'summary', tooltip: 'Double-click a row to open the chart' },
      // A built-in mistake: opens the wrong chart without saying so. The learner has to notice and go back.
      { el: 'row-0', name: 'Wrong patient (Sample)', outcome: 'incorrect', action: 'navigate', target: 'wrongchart', silent: true, feedback: 'Opened the wrong patient’s chart.' },
      { el: 'row-3', name: 'Wrong patient (Mock)', outcome: 'incorrect', action: 'none', feedback: 'That is a different patient. Alex Testpatient is in Room 12.' },
    ],
  },
  {
    key: 'summary', name: 'Chart — Summary', html: chart('Summary', SUMMARY),
    instruction: 'Labs are ordered from the Workup activity. Click Workup.',
    hotspots: [
      { el: 'tab-workup', name: 'Workup tab', outcome: 'correct', action: 'navigate', target: 'workup' },
      { el: 'tab-results', name: 'Results tab', outcome: 'incorrect', action: 'none', feedback: 'Results shows completed tests. New orders are placed from Workup.' },
    ],
  },
  {
    key: 'workup', name: 'Workup', html: chart('Workup', WORKUP(ORDERS_EMPTY)),
    instruction: 'Open the order composer by clicking “+ New Order”.',
    hotspots: [
      { el: 'new-order', name: 'New Order button', outcome: 'correct', action: 'navigate', target: 'composer' },
      { el: 'order-sets', name: 'Order Sets', outcome: 'incorrect', action: 'none', feedback: 'Order sets bundle many orders. For a single lab, use + New Order.' },
    ],
  },
  {
    key: 'composer', name: 'Order Composer — Search', html: chart('Workup', WORKUP(ORDERS_EMPTY), ORDER_COMPOSER),
    instruction: 'Search for “CBC” and select CBC with Differential.',
    hotspots: [
      {
        el: 'order-search', name: 'Order search', kind: 'search', outcome: 'correct', action: 'navigate', target: 'detail', placeholder: 'Search…',
        searchTerms: ['cbc', 'complete blood count', 'blood count'],
        searchResults: [
          { id: 'r1', label: 'CBC with Differential', detail: 'Lab · Blood' },
          { id: 'r2', label: 'CBC without Differential', detail: 'Lab · Blood' },
          { id: 'r3', label: 'Blood Culture', detail: 'Lab · Microbiology' },
        ],
        correctResultId: 'r1',
      },
      { el: 'composer-cancel', name: 'Cancel', outcome: 'incorrect', action: 'none', feedback: 'Cancel closes the composer without ordering anything.' },
    ],
  },
  {
    key: 'detail', name: 'Order Composer — Details', html: chart('Workup', WORKUP(ORDERS_EMPTY), ORDER_DETAIL),
    instruction: 'Set the priority, then sign the order.',
    hotspots: [
      { el: 'priority', name: 'Priority', kind: 'dropdown', outcome: 'correct', action: 'none', options: ['Routine', 'STAT', 'Timed'], correctOption: 'STAT', instruction: 'Set Priority to STAT for this chest-pain patient.' },
      { el: 'sign-order', name: 'Sign Order', outcome: 'correct', action: 'navigate', target: 'signed', instruction: 'Click Sign Order.', feedback: 'Order signed.' },
      { el: 'detail-cancel', name: 'Remove', outcome: 'incorrect', action: 'none', feedback: 'Remove would discard this order.' },
    ],
  },
  {
    key: 'signed', name: 'Workup — Order Signed', html: chart('Workup', WORKUP(ORDERS_SIGNED)),
    instruction: 'The CBC is signed. Now go to Disposition.',
    hotspots: [{ el: 'tab-disposition', name: 'Disposition tab', outcome: 'correct', action: 'navigate', target: 'dispo' }],
  },
  {
    key: 'dispo', name: 'Disposition', html: chart('Disposition', DISPO),
    instruction: 'Complete the disposition.',
    hotspots: [
      { el: 'impression', name: 'Clinical impression', kind: 'text', outcome: 'correct', action: 'none', answers: ['Chest pain', 'Chest pain, unspecified', 'Atypical chest pain'], placeholder: 'Type and press Enter', instruction: 'Type the clinical impression “Chest pain” and press Enter.' },
      { el: 'dispo', name: 'Disposition', kind: 'dropdown', outcome: 'correct', action: 'none', options: ['Discharge', 'Admit', 'Observation', 'Transfer'], correctOption: 'Discharge', instruction: 'Choose Discharge.' },
      { el: 'accept-dispo', name: 'Accept Disposition', outcome: 'correct', action: 'navigate', target: 'confirm', instruction: 'Click Accept Disposition.' },
    ],
  },
  {
    key: 'confirm', name: 'Confirm Disposition', html: chart('Disposition', DISPO, CONFIRM),
    instruction: 'Confirm the disposition to finish.',
    hotspots: [
      { el: 'confirm-ok', name: 'Confirm', outcome: 'correct', action: 'finish', feedback: 'Disposition complete. Nice work!' },
      { el: 'confirm-cancel', name: 'Cancel', outcome: 'incorrect', action: 'none', feedback: 'Cancel returns without completing the disposition.' },
    ],
  },
  {
    key: 'wrongchart', name: 'Wrong patient’s chart (mistake)', html: chart('Summary', SUMMARY_JORDAN, '', JORDAN),
    instruction: 'Check the patient banner — is this the right patient?',
    hotspots: [{ el: 'nav-board', name: 'Back to Track Board', outcome: 'alternative', action: 'navigate', target: 'board' }],
  },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const manifest = {
  title: 'ED: Order a CBC and disposition a patient',
  description:
    'Synthetic EHR walkthrough: open a patient chart, go to Workup, use the order composer to order a STAT CBC, then complete the disposition. All patient data is fictional.',
  screens: [],
};
for (const [i, s] of SCREENS.entries()) {
  await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head><body>${s.html}</body></html>`);
  const file = `${String(i + 1).padStart(2, '0')}-${s.key}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  const hotspots = [];
  for (const h of s.hotspots) {
    const box = await page.locator(`[data-hs="${h.el}"]`).boundingBox();
    if (!box) throw new Error(`Missing element ${h.el} on ${s.key}`);
    const r = (v) => Math.round(v * 100) / 100;
    const { el, ...rest } = h;
    hotspots.push({ ...rest, x: r((box.x / W) * 100), y: r((box.y / H) * 100), w: r((box.width / W) * 100), h: r((box.height / H) * 100) });
  }
  manifest.screens.push({ key: s.key, name: s.name, file, width: W, height: H, instruction: s.instruction, hotspots });
}
await browser.close();
await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${SCREENS.length} screens to ${OUT}`);
