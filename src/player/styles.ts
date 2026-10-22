// Player styles are injected at runtime so the exported HTML needs no CSS files.
export const PLAYER_CSS = `
.simp{--accent:#2563eb;--ok:#059669;--bad:#dc2626;--hl:#f59e0b;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--panel:#fff;--bg:#f1f5f9;
  position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--bg);color:var(--ink);
  font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow:hidden}
.simp *{box-sizing:border-box}
.simp button{font:inherit;cursor:pointer}
.simp-bar{display:flex;align-items:center;gap:12px;padding:8px 14px;background:var(--panel);border-bottom:1px solid var(--line);flex:none}
.simp-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.simp-chip{font-size:12px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;white-space:nowrap}
.simp-spacer{flex:1}
.simp-progress{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);white-space:nowrap}
.simp-progress-track{width:120px;height:6px;border-radius:3px;background:var(--line);overflow:hidden}
.simp-progress-fill{height:100%;background:var(--accent);transition:width .3s}
.simp-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:8px;padding:6px 12px}
.simp-btn:hover{background:#f8fafc}
.simp-btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.simp-btn-primary:hover{background:#1d4ed8}
.simp-instr{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fffbeb;border-bottom:1px solid #fde68a;flex:none;min-height:44px}
.simp-instr-text{flex:1;font-size:15px}
.simp-instr-text b{font-weight:600}
.simp-viewport{position:relative;flex:1;min-height:0;container-type:size;display:flex;align-items:center;justify-content:center;padding:12px}
.simp-stage{position:relative;container-type:size;box-shadow:0 1px 3px rgba(0,0,0,.15);background:#fff;user-select:none}
.simp-stage img{display:block;width:100%;height:100%;pointer-events:none;-webkit-user-drag:none}
.simp-layer{position:absolute;inset:0;cursor:default}
.simp-hs{position:absolute;border-radius:3px;cursor:pointer}
.simp-hs.simp-hl{outline:3px solid var(--hl);outline-offset:1px;box-shadow:0 0 0 6px rgba(245,158,11,.25);animation:simp-pulse 1.4s ease-in-out infinite}
@keyframes simp-pulse{50%{box-shadow:0 0 0 12px rgba(245,158,11,0)}}
.simp-hs input,.simp-hs .simp-dd{position:absolute;inset:0;width:100%;height:100%;border:0;outline:0;background:transparent;color:#111;padding:0 .35em;
  font-size:calc(var(--h) * 0.55cqh);font-family:inherit;text-align:left;display:flex;align-items:center;white-space:nowrap;overflow:hidden}
.simp-hs input:focus{background:rgba(255,255,255,.6);box-shadow:inset 0 0 0 2px var(--accent)}
.simp-hs .simp-dd.simp-has{background:#fff}
.simp-value{position:absolute;inset:0;display:flex;align-items:center;padding:0 .35em;background:#fff;color:#111;font-size:calc(var(--h) * 0.55cqh);pointer-events:none;white-space:nowrap;overflow:hidden}
.simp-menu{position:absolute;z-index:5;min-width:160px;max-height:50%;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px 0;font-size:max(12px,1.4cqh)}
.simp-menu button{display:block;width:100%;text-align:left;border:0;background:none;padding:6px 10px;color:var(--ink)}
.simp-menu button:hover,.simp-menu button:focus{background:#eff6ff;outline:none}
.simp-menu .simp-detail{display:block;font-size:.85em;color:var(--muted)}
.simp-menu .simp-empty{padding:6px 10px;color:var(--muted)}
.simp-tip{position:absolute;z-index:6;max-width:280px;background:#0f172a;color:#fff;font-size:13px;padding:6px 10px;border-radius:6px;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.simp-ripple{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid var(--bad);pointer-events:none;animation:simp-ripple .6s ease-out forwards}
@keyframes simp-ripple{from{transform:scale(.4);opacity:1}to{transform:scale(1.6);opacity:0}}
.simp-toast{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:40;max-width:min(560px,90%);padding:10px 16px;border-radius:10px;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.2);font-size:14px;animation:simp-in .2s}
.simp-toast.ok{background:var(--ok)}.simp-toast.bad{background:var(--bad)}.simp-toast.info{background:#334155}
@keyframes simp-in{from{opacity:0;transform:translate(-50%,8px)}}
.simp-overlay{position:absolute;inset:0;z-index:30;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:20px}
.simp-card{background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.25);padding:24px;max-width:560px;width:100%;max-height:100%;overflow:auto}
.simp-card h2{margin:0 0 8px;font-size:20px}
.simp-card p{margin:0 0 16px;color:#334155;white-space:pre-wrap}
.simp-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.simp-intro{position:absolute;inset:0;z-index:25;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto}
.simp-intro .simp-card{max-width:720px}
.simp-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:16px 0 20px}
.simp-mode{text-align:left;border:2px solid var(--line);background:#fff;border-radius:12px;padding:12px}
.simp-mode b{display:block;margin-bottom:4px}
.simp-mode span{font-size:12.5px;color:var(--muted)}
.simp-mode.sel{border-color:var(--accent);background:#eff6ff}
.simp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
.simp-stat{background:#f8fafc;border-radius:10px;padding:10px;text-align:center}
.simp-stat b{display:block;font-size:22px}
.simp-stat span{font-size:12px;color:var(--muted)}
.simp-table{width:100%;border-collapse:collapse;margin:0 0 16px;font-size:13px}
.simp-table td,.simp-table th{border-bottom:1px solid var(--line);padding:6px 4px;text-align:left}
.simp-table th{color:var(--muted);font-weight:500}

.simp-name{width:100%;margin:0 0 16px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit}
.simp-table tr.simp-flag td{background:#fff7ed}
.simp-menu button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.simp-cert{display:none}
@media print{
  body>*:not(.simp-cert){display:none!important}
  .simp-cert{display:block!important;position:static;height:auto;background:#fff;padding:40px}
  .simp-cert .simp-card{box-shadow:none;max-width:none;padding:0;margin-top:24px}
  .simp-cert-inner{text-align:center;border:3px double #1e3a8a;padding:40px 20px;border-radius:12px}
  .simp-cert-kicker{text-transform:uppercase;letter-spacing:3px;color:#64748b;font-size:13px}
  .simp-cert h1{font-size:36px;margin:16px 0 8px}
  .simp-cert-inner h2{font-size:22px;color:#1e3a8a}
}
`;
