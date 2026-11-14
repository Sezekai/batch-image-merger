// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const baseName = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;
const dirName = (p) => { const parts = String(p).split(/[\\/]/); parts.pop(); return parts.join(p.includes('\\') ? '\\' : '/'); };
const joinPath = (d, f) => d + (d.includes('\\') ? '\\' : '/') + f;
const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
const fmtPx = (w, h) => `${Math.round(w).toLocaleString()} × ${Math.round(h).toLocaleString()} px`;
const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
const debounce = (fn, ms) => { let t = null, args; const d = (...a) => { args = a; clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); }; d.flush = () => { if (t) { clearTimeout(t); t = null; return fn(...args); } }; return d; };
const isTyping = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'color', 'button'].includes(t.type) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };

const ICONS = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folders: '<path d="M8 4h3l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M3 9v9a2 2 0 0 0 2 2h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  log: '<path d="M4 6h16M4 10h16M4 14h10M4 18h7"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  flip: '<path d="M12 3v18"/><path d="M8 7 3 12l5 5V7zM16 7l5 5-5 5V7z"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  chevr: '<path d="m9 6 6 6-6 6"/>',
  chevl: '<path d="m15 6-6 6 6 6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  dropper: '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3z"/>',
  vertical: '<rect x="7" y="3" width="10" height="8" rx="1"/><rect x="7" y="13" width="10" height="8" rx="1"/>',
  horizontal: '<rect x="3" y="7" width="8" height="10" rx="1"/><rect x="13" y="7" width="8" height="10" rx="1"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  fit: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  dots: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  split: '<path d="M12 3v18M3 12h18"/>',
  warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  blank: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/>',
  drive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5 13 7.5 5h9L19 13M7 16.5h.01"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
const ic = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const paintIcons = (root = document) => $$('[data-ic]', root).forEach((el) => { if (!el.firstChild || el.tagName === 'BUTTON' && !el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', ic(el.dataset.ic)); });
// the one extra palette (DESIGN.md, "Category colours")
const CAT = ['#9b86ff', '#2fe0c0', '#ff6fb1', '#ffbf5a', '#5aa8ff', '#5be38a', '#ff8a5c', '#d07bff', '#7fd4ff', '#f2e05a'];

// ---------- state ----------
const DEF = BIMLayout.DEFAULTS;
let P = { ver: 1, defaults: { ...DEF }, sets: [], cur: null }; // the project (saved)
let UIP = { setsW: 270, panelW: 320 }; // panel sizes, filters, folds (saved)
let SETTINGS = {}; // app settings (Settings screen)
let INFO = {}; // folders, version, safe mode (from the main process)
let PRESETS = [];
const UI = { tab: 'merge', sel: new Set(), mode: 'set', tile: null, zoom: 0, before: false, hide: 0, exporting: false, filter: '', lastSelSet: null };

const getSet = (id) => P.sets.find((s) => s.id === id);
const curSet = () => getSet(P.cur);
const kindOf = (s) => s.kind || 'merge';
const TABNAME = { merge: 'Merge', freeform: 'Freeform', overlay: 'Overlay' };
const eff = (set) => Object.assign({}, DEF, P.defaults, set ? set.overrides : {});
const included = (set) => set.items.filter((it) => !it.ex);
const outputsOf = () => P.sets.flatMap((s) => [...(s.outputs || []), ...(s.exported && s.exported.path ? [s.exported.path] : [])]);

// background colours actually used for a set
function autoTarget(set) {
  const est = included(set).filter((i) => !i.blank && i.bg).map((i) => i.bg);
  if (!est.length) return null;
  const rgb = est.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  let best = 0, bestN = -1;
  rgb.forEach((a, i) => { const n = rgb.filter((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 10).length; if (n > bestN) { bestN = n; best = i; } });
  const near = rgb.filter((b) => Math.hypot(rgb[best][0] - b[0], rgb[best][1] - b[1], rgb[best][2] - b[2]) <= 10);
  const avg = [0, 1, 2].map((k) => Math.round(near.reduce((t, c) => t + c[k], 0) / near.length));
  return '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join('');
}
function colours(set, e = eff(set)) {
  const target = e.match ? (e.matchTarget === 'auto' ? autoTarget(set) || e.matchColor : e.matchColor) : null;
  const bg = e.match && e.padUsesMatch && target ? target : e.bgColor;
  return { target, bg };
}
function matchParams(set, it, e, c) {
  if (!e.match || it.noMatch || it.blank || !c.target) return null;
  return { target: c.target, tol: it.tol ?? e.tol, soft: e.soft, mode: e.matchMode, everywhere: !!e.everywhere };
}
function layoutItems(set) { return included(set).map((it) => ({ key: it.key, w: it.w, h: it.h, blank: !!it.blank, fx: it.fx, fy: it.fy })); }
function setLayout(set) { return BIMLayout.computeLayout(layoutItems(set), eff(set)); }
function exportJob(set) {
  if (kindOf(set) === 'freeform') return ffJob(set);
  if (kindOf(set) === 'overlay') return ovJob(set);
  const e = eff(set), c = colours(set, e);
  const items = included(set).filter((it) => it.blank || it.w).map((it) => ({ key: it.key, path: it.blank ? null : joinPath(set.path, it.file), w: it.w, h: it.h, blank: !!it.blank, fx: it.fx, fy: it.fy, m: matchParams(set, it, e, c) }));
  const imgs = items.filter((i) => !i.blank);
  const L = BIMLayout.computeLayout(items, e);
  return { setId: set.id, dir: set.path, items, settings: e, bg: c.bg, manualName: set.manualName || '', firstName: imgs.length ? baseName(imgs[0].path) : '', count: imgs.length, layoutLabel: BIMLayout.layoutLabel(e, L), prevOut: set.exported && set.exported.path };
}
function setHash(set) {
  const j = exportJob(set);
  if (j.kind) return hash(JSON.stringify([j.kind, j.payload, j.settings.format, j.settings.quality, j.settings.full444, j.settings.pngLevel, j.manualName]));
  return hash(JSON.stringify([j.items.map((i) => [i.key, i.fx, i.fy, i.m]), j.settings, j.bg, j.manualName, included(set).map((i) => i.mtime)]));
}
// exported / changed status is costly to work out, so it is remembered until the set changes
const STATC = new Map();
function setStatus(set) {
  if (set.missing) return 'missing';
  if (!set.exported) return 'new';
  const c = STATC.get(set.id);
  if (c && c.ex === set.exported && set.id !== P.cur) return c.v;
  const v = set.exported.hash === setHash(set) ? 'done' : 'changed';
  STATC.set(set.id, { v, ex: set.exported });
  return v;
}
function dirtyStatus(scope) {
  if (!scope || scope === 'defaults') STATC.clear();
  else if (scope.startsWith('sets:')) scope.slice(5).split(',').forEach((i) => STATC.delete(i));
  else STATC.delete(scope);
}

// ---------- saving ----------
const saveProject = debounce(() => api.save('project', JSON.stringify(P)), 500);
const saveUIP = debounce(() => api.save('uiprefs', UIP), 400);
const savePresets = () => api.save('presets', PRESETS);

// ---------- undo / redo ----------
const HIST = [], FUT = [];
const pickSet = (s) => ({ items: s.items, overrides: s.overrides, manualName: s.manualName, kind: s.kind, ff: s.ff, ov: s.ov });
function snap(scope) {
  if (scope === 'defaults') return JSON.stringify(P.defaults);
  if (scope.startsWith('sets:')) return JSON.stringify(scope.slice(5).split(',').map((id) => pickSet(getSet(id) || { items: [], overrides: {} })));
  return JSON.stringify(pickSet(getSet(scope) || { items: [], overrides: {} }));
}
function restore(scope, json) {
  const v = JSON.parse(json);
  if (scope === 'defaults') P.defaults = v;
  else if (scope.startsWith('sets:')) scope.slice(5).split(',').forEach((id, i) => { const s = getSet(id); if (s) Object.assign(s, v[i]); });
  else { const s = getSet(scope); if (!s) return; Object.assign(s, v); P.cur = s.id; }
}
// make a change that can be undone. scope: a set id or 'defaults'. ck merges quick repeats (sliders).
function change(scope, label, fn, ck) {
  const before = snap(scope);
  fn();
  const after = snap(scope);
  if (before === after) return;
  const last = HIST[HIST.length - 1];
  if (ck && last && last.ck === ck && last.scope === scope && Date.now() - last.t < 1500) { last.after = after; last.t = Date.now(); }
  else HIST.push({ scope, label, before, after, t: Date.now(), ck });
  if (HIST.length > 400) HIST.shift();
  FUT.length = 0;
  dirtyStatus(scope);
  saveProject();
  refreshUndo();
}
function undo() { const h = HIST.pop(); if (!h) return; restore(h.scope, h.before); FUT.push(h); toast(`Undid: ${h.label}`); afterHistory(); }
function redo() { const h = FUT.pop(); if (!h) return; restore(h.scope, h.after); HIST.push(h); toast(`Redid: ${h.label}`); afterHistory(); }
function afterHistory() { dirtyStatus(); saveProject(); refreshUndo(); const c = curSet(); if (c && kindOf(c) !== UI.tab) setTab(kindOf(c), true); drawAll(); }
function refreshUndo() {
  const u = $('#undoBtn'), r = $('#redoBtn');
  if (u) { u.disabled = !HIST.length; u.title = HIST.length ? `Undo: ${HIST[HIST.length - 1].label} (Ctrl+Z)` : 'Nothing to undo'; }
  if (r) { r.disabled = !FUT.length; r.title = FUT.length ? `Redo: ${FUT[FUT.length - 1].label} (Ctrl+Y)` : 'Nothing to redo'; }
}

// ---------- small UI bits ----------
// toasts: bottom right, 4–7 s, with an icon. toast(msg, kind?, ms?) – kind is 'ok', 'err' or 'info'.
function toast(msg, a, b) {
  let kind = typeof a === 'string' ? a : /fail|couldn.t|could not|error|not possible/i.test(msg) ? 'err' : /^(saved|exported|added|moved|copied|done|finished)/i.test(msg) ? 'ok' : 'info';
  let ms = typeof a === 'number' ? a : b || 0;
  ms = clamp(ms || (kind === 'err' ? 7000 : 4500), 4000, 7000);
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `${ic(kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'info')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
  if (kind === 'err') log(msg, 'e');
}
// dialogs: in the app, a title, a sentence, actions on the right. Enter confirms; Esc cancels.
let MODAL_DONE = null;
function modal(html, opts = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="mbox ${opts.wide ? 'wide' : ''} ${opts.cls || ''}">${html}</div>`;
  m.classList.remove('hidden'); m.dataset.kind = opts.kind || '';
  m.onmousedown = (e) => { if (e.target === m) closeModal(); };
  MODAL_DONE = null;
  const f = $('input[autofocus],input[type=text]', m); if (f) setTimeout(() => { f.focus(); f.select(); }, 20);
  return m;
}
const closeModal = () => { const m = $('#modal'); if (MODAL_DONE) { const d = MODAL_DONE; MODAL_DONE = null; d(false); return; } m.classList.add('hidden'); m.innerHTML = ''; m.dataset.kind = ''; };
const modalOpen = () => !$('#modal').classList.contains('hidden');
// a yes / no (or a text) question. Resolves with the value, true, or null/false when cancelled.
function dialog({ title, text = '', ok = 'OK', cancel = 'Cancel', danger = false, input = null, extra = '', wide = false }) {
  return new Promise((res) => {
    const m = modal(`<h1>${esc(title)}</h1>${text ? `<p class="sub">${text}</p>` : ''}${extra}
      ${input ? `<input type="text" id="dlgIn" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}">` : ''}
      <div class="acts">${cancel ? `<button id="dlgNo">${esc(cancel)}</button>` : ''}<button id="dlgOk" class="${danger ? 'danger' : 'primary'}">${esc(ok)}</button></div>`, { wide, kind: 'dialog' });
    const finish = (v) => { MODAL_DONE = null; m.classList.add('hidden'); m.innerHTML = ''; m.dataset.kind = ''; res(v); };
    MODAL_DONE = (v) => finish(input ? null : false);
    $('#dlgOk', m).onclick = () => finish(input ? $('#dlgIn', m).value : true);
    const no = $('#dlgNo', m); if (no) no.onclick = () => finish(input ? null : false);
    if (!input) setTimeout(() => $('#dlgOk', m) && $('#dlgOk', m).focus(), 20);
  });
}
const ask = (title, { value = '', placeholder = '', ok = 'OK', text = '' } = {}) => dialog({ title, text, ok, input: { value, placeholder } });
const confirmBox = (title, text, okLabel = 'OK', danger = false) => dialog({ title, text, ok: okLabel, danger });
// Enter confirms whichever dialog is open (the focused button wins), Esc cancels
addEventListener('keydown', (e) => {
  if (!modalOpen() || $('#modal').dataset.kind !== 'dialog') return;
  if (e.key === 'Enter' && !(e.target.tagName === 'BUTTON' && e.target.id !== 'dlgOk')) { e.preventDefault(); e.stopImmediatePropagation(); const b = $('#dlgOk'); if (b) b.click(); }
}, true);

// ---------- the log: in the app (L) and on disk ----------
const LOGL = [];
function log(text, kind = '') {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  for (const line of String(text).split(/\r?\n/)) { if (line.trim()) LOGL.push({ time, text: line, kind }); }
  if (LOGL.length > 3000) LOGL.splice(0, LOGL.length - 3000);
  try { api.log(String(text), kind); } catch {}
  drawLog();
  if (kind === 'e') setLog(true);
}
api.onLog((l) => { LOGL.push(l); drawLog(); if (l.kind === 'e') setLog(true); });
let LOG_OPEN = false;
function drawLog() {
  if (!LOG_OPEN) return;
  const pre = $('#logtext'); if (!pre) return;
  const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
  pre.innerHTML = LOGL.map((l) => `<span class="t">[${l.time}]</span> <span class="${l.kind}">${esc(l.text)}</span>`).join('\n');
  if (atEnd) pre.scrollTop = pre.scrollHeight;
}
function setLog(open) {
  LOG_OPEN = open;
  $('#drawer').classList.toggle('open', open);
  $('#logBtn').classList.toggle('on', open);
  $('#s-log').classList.toggle('on', open);
  if (open) { drawLog(); const pre = $('#logtext'); pre.scrollTop = pre.scrollHeight; }
}

function ctxMenu(x, y, items) {
  const m = $('#ctx');
  m.innerHTML = items.map((it, i) => (it === '-' ? '<hr>' : `<button data-i="${i}" ${it.disabled ? 'disabled' : ''}>${it.check != null ? `<span class="ck">${it.check ? ic('check') : ''}</span>` : ''}${esc(it.label)}${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`)).join('');
  m.classList.remove('hidden');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
  $$('button', m).forEach((b) => (b.onclick = () => { m.classList.add('hidden'); items[+b.dataset.i].run(); }));
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctx')) $('#ctx').classList.add('hidden'); }, true);

// ---------- thumbnails ----------
const THUMBS = new Map(); // key -> Promise<url>
function thumbUrl(set, it, m, flatten) {
  if (it.blank || !it.w) return Promise.resolve('');
  const file = joinPath(set.path, it.file);
  const k = m ? `m|${file}|${it.mtime}|${JSON.stringify(m)}|${flatten}` : `t|${file}|${it.mtime}`;
  if (!THUMBS.has(k)) {
    const p = (m ? api.engine('mthumb', { file, size: it.size, mtime: it.mtime, m: { ...m, bg: it.bg, flatten } }) : api.engine('thumb', { file, size: it.size, mtime: it.mtime }))
      .then((r) => api.fileUrl(r.path))
      .catch((e) => { THUMBS.delete(k); console.warn(e); return ''; });
    THUMBS.set(k, p);
  }
  return THUMBS.get(k);
}
// background estimates for auto colour matching
const BGQ = new Set();
async function ensureBgEstimates(set) {
  const need = included(set).filter((it) => !it.blank && it.w && !it.bg && !BGQ.has(set.id + it.key));
  if (!need.length) return false;
  await Promise.all(need.map(async (it) => {
    BGQ.add(set.id + it.key);
    try { const r = await api.engine('bgest', { file: joinPath(set.path, it.file), size: it.size, mtime: it.mtime }); it.bg = r.bg; } catch {}
    BGQ.delete(set.id + it.key);
  }));
  saveProject();
  return true;
}
