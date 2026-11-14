// ---------- start-up, screens, keys, drawing everything ----------
function drawAll() {
  drawSets();
  drawStage();
  drawPanel();
  drawExportBar();
  drawBanners();
  refreshUndo();
}
async function pickAndAdd() { const r = await api.pickFolders({ title: 'Add folders (each becomes a set)' }); addFolders(r); }
async function pickParent() { const r = await api.pickFolders({ title: 'Choose a folder: every folder inside it with pictures becomes a set', single: true }); addFolders(r); }

const HEAD = {
  merge: 'Joins each folder’s pictures into one: a column, a row or a grid. Drag pictures to reorder them.',
  freeform: 'Cuts the subjects out of each folder’s pictures so you can arrange them freely on one canvas.',
  overlay: 'Lines detailed close-ups up over a wide shot of the same scene, so the result has the detail of both.',
};
// ---------- screens: the work, Settings and Look ----------
UI.screen = 'work';
function showScreen(name) {
  if (UI.screen === name) name = 'work';
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  UI.screen = name;
  for (const [n, id] of [['work', 'work'], ['settings', 'settingsScreen'], ['look', 'lookScreen']]) $('#' + id).classList.toggle('on', n === name);
  $('#settingsBtn').classList.toggle('on', name === 'settings');
  $('#lookBtn').classList.toggle('on', name === 'look');
  $$('#tabs button').forEach((b) => b.classList.toggle('on', name === 'work' && b.dataset.tab === UI.tab));
  $('#tbScreen').textContent = name === 'work' ? TABNAME[UI.tab] : name === 'settings' ? 'Settings' : 'Look';
  if (name === 'settings') drawSettings();
  if (name === 'look') drawLook();
  if (name === 'work') setTimeout(() => drawStage(), 20);
}

// ---------- keyboard shortcuts popup ----------
const KEYS = [
  ['Anywhere', [
    ['1 2 3', 'Merge / Freeform / Overlay'],
    ['PgUp PgDn', 'Previous / next set'],
    ['Home End', 'First / last set'],
    ['/ Ctrl+F', 'Filter the sets'],
    ['Ctrl+A', 'Select every set in the list'],
    ['Ctrl+Z Ctrl+Y', 'Undo / redo a change'],
    ['Ctrl+E', 'Export this set (or add it to the queue)'],
    ['Ctrl+Shift+E', 'Export all sets in this tab'],
    ['+ −', 'Zoom in / out (Ctrl + wheel too)'],
    ['0', 'Fit to the window'],
    ['Z', 'Actual size (100%)'],
    ['Space+drag', 'Pan (middle-drag too)'],
    ['S', 'Settings'],
    ['L', 'Open or close the log'],
    ['M', 'Show or hide the set list'],
    ['H', 'Hide the side panels, then everything but the picture (Esc brings them back)'],
    ['F F11', 'Full screen'],
    ['K', 'This list'],
    ['Esc', 'Close, innermost first'],
    ['Ctrl+Shift+I', 'Developer tools (for bug reports)'],
  ]],
  ['Merge', [
    ['Click', 'Select a picture'],
    ['Drag', 'Move a picture to a new place'],
    ['Drag to the strip', 'Leave a picture out'],
    ['Shift+drag', 'Choose which part is kept (Crop grids)'],
    ['← →', 'Select the previous / next picture'],
    ['Shift+← →', 'Move the selected picture earlier / later'],
    ['Delete', 'Leave the selected picture out'],
    ['T Enter', 'View the selected picture full size (double-click too)'],
    ['Tab', 'Before / after background matching'],
    ['Right-click', 'More options for a picture'],
  ]],
  ['Freeform', [
    ['Tab', 'Switch between the canvas and the source images'],
    ['Drag from the strip', 'Put a cutout on the canvas'],
    ['Drag', 'Move; corner resizes, round handle rotates (Shift = 15°)'],
    ['Alt', 'While dragging: don’t snap to other cutouts'],
    ['Ctrl+click Shift+click', 'Select several (or drag a box)'],
    ['← → ↑ ↓', 'Nudge the selected cutouts (Shift = 10 px)'],
    ['Ctrl+D', 'Duplicate'],
    ['Ctrl+] Ctrl+[', 'Bring forward / send back'],
    ['Delete', 'Remove from the canvas'],
    ['C', 'Crop the canvas (Enter applies)'],
    ['V X A E R', 'Source images: select / split / add region / erase / restore'],
    ['Q', 'Split by rectangle or freehand'],
    ['O', 'Cutouts / highlighted / original view'],
    ['[ ]', 'Brush smaller / bigger'],
  ]],
  ['Overlay', [
    ['V E R X', 'Move / erase brush / restore brush / erase area'],
    ['Drag', 'Move; corner resizes, round handle rotates'],
    ['← → ↑ ↓', 'Nudge the selected close-up (Shift = 10)'],
    ['D', 'Difference view on / off'],
    ['G', 'Show mask on / off'],
    ['[ ]', 'Brush smaller / bigger'],
    ['Ctrl+Z', 'In the points view: undo the last point'],
  ]],
  ['Full-size viewer', [
    ['← → PgUp PgDn', 'Previous / next (Space too)'],
    ['Home End', 'First / last'],
    ['↑ ↓ + −', 'Zoom'],
    ['0', 'Fit'],
    ['1 Z', 'Actual size'],
    ['Drag', 'Move a zoomed picture'],
    ['H', 'Hide the side panel'],
    ['T Esc', 'Close the viewer'],
  ]],
  ['Dialogs', [['Enter', 'Confirm'], ['Esc', 'Cancel']]],
];
const caps = (k) => (/^(Drag|Click|Right-click|Double-click)\b/.test(k) && !/\+/.test(k) ? [k] : k.split(' ')).map((c) => `<span class="cap">${esc(c)}</span>`).join('');
function shortcutsDialog() {
  if (modalOpen() && $('#modal').dataset.kind === 'keys') return closeModal();
  if (modalOpen()) return;
  const m = modal(`<div class="khead"><h1>Keyboard shortcuts</h1><span class="small faint">K or Esc closes</span></div>
    <div class="kcols">${KEYS.map(([t, rows]) => `<div class="kgrp"><h4>${esc(t)}</h4>${rows.map(([k, d]) => `<div class="krow"><span class="caps">${caps(k)}</span><span class="what">${esc(d)}</span></div>`).join('')}</div>`).join('')}</div>`, { kind: 'keys', cls: 'kpop' });
  m.querySelector('.mbox').style.width = 'calc(100vw - 48px)';
}

// ---------- hiding things ----------
function applyHide() {
  document.body.classList.toggle('nosets', UI.hide >= 1 || !!UIP.noSets);
  document.body.classList.toggle('nopanel', UI.hide >= 1);
  document.body.classList.toggle('bare', UI.hide >= 2);
  setTimeout(() => drawStage(), 30);
}
api.onWinState((w) => { UI.fullScreen = !!w.fullScreen; document.body.classList.toggle('fullscreen', UI.fullScreen); });

// ---------- keys ----------
addEventListener('keydown', (e) => {
  const k = e.key, lk = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (modalOpen()) {
    const kind = $('#modal').dataset.kind;
    if (k === 'Escape') { e.preventDefault(); closeModal(); }
    else if (kind === 'keys' && lk === 'k') closeModal();
    return;
  }
  if (V.open) { if (lk === 'k' && !ctrl) { shortcutsDialog(); return; } if (lk === 'l' && !ctrl) { setLog(!LOG_OPEN); return; } if (viewerKey(e)) return; }
  if (k === 'F11') { e.preventDefault(); api.fullscreen(); return; }
  if (ctrl && lk === 'f') { e.preventDefault(); if (UI.screen === 'work') { if (UIP.noSets) { UIP.noSets = false; applyHide(); } $('#setfilter').focus(); } return; }
  if (ctrl && lk === 'z' && !e.shiftKey) { if (!isTyping(e) && !(UI.tab === 'overlay' && OV.pp)) { e.preventDefault(); undo(); return; } }
  if (ctrl && (lk === 'y' || (lk === 'z' && e.shiftKey))) { if (!isTyping(e)) { e.preventDefault(); redo(); } return; }
  if (ctrl && lk === 'e' && UI.screen === 'work') { e.preventDefault(); if (e.shiftKey) $('#expAll') && $('#expAll').click(); else $('#expThis') && $('#expThis').click(); return; }
  if (isTyping(e)) { if (k === 'Escape') e.target.blur(); return; }
  if (k === 'Escape') {
    if (!$('#pop').classList.contains('hidden')) { $('#pop').classList.add('hidden'); return; }
    if (UI.screen !== 'work') { showScreen('work'); return; }
    if (UI.fullScreen) { api.fullscreen(false); return; }
    if (UI.hide) { UI.hide = 0; applyHide(); return; }
    if (LOG_OPEN) { setLog(false); return; }
  }
  if (!ctrl && !e.altKey) {
    if (lk === 'f') { api.fullscreen(); return; }
    if (lk === 'k') { shortcutsDialog(); return; }
    if (lk === 'l') { setLog(!LOG_OPEN); return; }
    if (lk === 's') { showScreen('settings'); return; }
  }
  if (UI.screen !== 'work') return;
  if (ctrl && lk === 'a') { e.preventDefault(); UI.sel = new Set(visibleSets().map((s) => s.id)); drawAll(); return; }
  if (k === 'PageDown' && !ctrl) { e.preventDefault(); stepSet(1); return; }
  if (k === 'PageUp' && !ctrl) { e.preventDefault(); stepSet(-1); return; }
  if ((k === 'Home' || k === 'End') && !ctrl) { e.preventDefault(); stepSet(k === 'Home' ? -1e9 : 1e9); return; }
  if (!ctrl && !e.altKey) {
    if (k === '/') { e.preventDefault(); if (UIP.noSets) { UIP.noSets = false; applyHide(); } $('#setfilter').focus(); return; }
    if (lk === 'm') { UIP.noSets = !UIP.noSets; saveUIP(); applyHide(); return; }
    if (lk === 'h') { UI.hide = (UI.hide + 1) % 3; applyHide(); return; }
    if (k === '1' || k === '2' || k === '3') { setTab(['merge', 'freeform', 'overlay'][+k - 1]); return; }
  }
  if (UI.tab === 'freeform') { if (ffKey(e)) e.preventDefault(); return; }
  if (UI.tab === 'overlay') { if (ovKey(e)) e.preventDefault(); return; }
  if (ctrl) return;
  if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); stepTile(1, e.shiftKey); }
  else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); stepTile(-1, e.shiftKey); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); excludeTile(); }
  else if ((lk === 't' || k === 'Enter') && UI.tile) { e.preventDefault(); const s = curSet(); const it = s && s.items.find((i) => i.key === UI.tile); if (it && !it.blank) openViewer(s, UI.tile); }
  else if (k === 'Tab') { e.preventDefault(); const s = curSet(); if (s && eff(s).match) toggleBefore(); }
  else if (k === '0') mergeZoomTo(0);
  else if (lk === 'z') mergeZoomTo(1);
  else if (k === '+' || k === '=') mergeZoomTo(lastZ * 1.25);
  else if (k === '-') mergeZoomTo(lastZ / 1.25);
  else if (k === 'Escape') { if (UI.tile) { UI.tile = null; drawStage(); } else if (UI.sel.size > 1) { UI.sel = new Set(P.cur ? [P.cur] : []); drawAll(); } }
});
function setTab(t, keepCur) {
  if (!P.curBy) P.curBy = {};
  const c = curSet();
  if (c && kindOf(c) === UI.tab) P.curBy[UI.tab] = P.cur;
  UI.tab = t; UIP.tab = t; saveUIP();
  if (UI.screen !== 'work') showScreen('work');
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.body.dataset.tab = t;
  $('#hdTitle').textContent = TABNAME[t]; $('#hdText').textContent = HEAD[t]; $('#tbScreen').textContent = TABNAME[t];
  if (!keepCur || !curSet() || kindOf(curSet()) !== t) { const want = getSet(P.curBy[t]); const s = want && kindOf(want) === t ? want : tabSets()[0]; P.cur = s ? s.id : null; }
  UI.sel = new Set(P.cur ? [P.cur] : []); UI.tile = null; UI.filter = ''; $('#setfilter').value = '';
  saveProject();
  drawAll();
}

// drag folders onto the window
function initDrop() {
  let depth = 0;
  addEventListener('dragenter', (e) => { if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; depth++; document.body.classList.add('filedrag'); });
  addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('filedrag'); });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; document.body.classList.remove('filedrag');
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) { if (UI.screen !== 'work') showScreen('work'); addFolders(paths); }
  });
}
// resizable side panels (sizes are remembered)
function initResizers() {
  const go = (el, side) => el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); document.body.classList.add('resizing');
    const body = $('#body').getBoundingClientRect();
    const mv = (ev) => {
      if (side === 'sets') UIP.setsW = clamp(ev.clientX - body.left - 4, 220, 480);
      else UIP.panelW = clamp(body.right - ev.clientX - 4, 280, 520);
      applySizes();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); document.body.classList.remove('resizing'); saveUIP(); drawStage(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  go($('#rzSets'), 'sets'); go($('#rzPanel'), 'panel');
}
function applySizes() { document.documentElement.style.setProperty('--setsw', UIP.setsW + 'px'); document.documentElement.style.setProperty('--panelw', UIP.panelW + 'px'); }

(async function boot() {
  let ok = true;
  try {
    const d = await api.init();
    INFO = d;
    SETTINGS = { ...d.settingsDef, ...d.settings };
    if (d.project && d.project.sets) { P = Object.assign(P, d.project); P.defaults = Object.assign({}, DEF, P.defaults); }
    // "Replace it" is gone: nothing is ever overwritten
    if (P.defaults.clash === 'overwrite') P.defaults.clash = 'number';
    for (const s of P.sets) if (s.overrides && s.overrides.clash === 'overwrite') delete s.overrides.clash;
    UIP = Object.assign(UIP, d.uiprefs || {});
    // the panels are narrower now; very wide old sizes come down to the new defaults
    if (!UIP.v2) { UIP.setsW = Math.min(UIP.setsW || 270, 300); UIP.panelW = Math.min(UIP.panelW || 320, 340); UIP.v2 = true; saveUIP(); }
    PRESETS = Array.isArray(d.presets) ? d.presets : [];
    if (P.cur && !getSet(P.cur)) P.cur = P.sets[0] ? P.sets[0].id : null;
    if (P.cur) UI.sel = new Set([P.cur]);
    await loadLook(d.appearance, UIP);
    paintIcons();
    applySizes(); applyHide();
    $('#addBtn').onclick = pickAndAdd;
    $('#addParentBtn').onclick = pickParent;
    $('#rescanBtn').onclick = rescanAll;
    $('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
    $('#lookBtn').onclick = () => showScreen('look');
    $('#settingsBtn').onclick = () => showScreen('settings');
    $('#keysBtn').onclick = shortcutsDialog;
    $('#logBtn').onclick = () => setLog(!LOG_OPEN);
    $('#s-log').onclick = () => setLog(!LOG_OPEN);
    $('#d-close').onclick = () => setLog(false);
    $('#d-clear').onclick = () => { LOGL.length = 0; drawLog(); };
    $('#d-copy').onclick = () => navigator.clipboard.writeText(LOGL.map((l) => `[${l.time}] ${l.text}`).join('\n')).then(() => toast('Copied the log', 'ok'), () => toast('Couldn’t copy the log'));
    $('#d-open').onclick = () => api.openLogs();
    $('#logpath').textContent = d.logDir;
    $('#setfilter').oninput = (e) => { UI.filter = e.target.value; drawSets(); };
    $$('#tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
    initStage(); initDrop(); initResizers();
    UI.tab = ['merge', 'freeform', 'overlay'].includes(UIP.tab) ? UIP.tab : 'merge';
    setTab(UI.tab, true);
    drawStatus();
    if (d.safeMode) log('Safe mode: the last two runs didn’t close properly, so drawing with the graphics card is off.', 'w');
  } catch (err) { ok = false; console.error(err); log(`Start-up failed: ${err.message}`, 'e'); }
  if (INFO.selftest) api.selftestReady({ ok, sets: P.sets.length, version: INFO.version });
  // the cache moves off C: once, with progress
  if (INFO.oldCache) {
    const job = jobStart({ id: 'move', label: 'Moving the cache off C:', short: 'Moving cache', unit: 'bytes', prio: 5 });
    try { const r = await api.migrateCache(); job.finish({ message: r ? `${r.files.toLocaleString()} files, ${fmtSize(r.bytes)} → ${INFO.cacheDir}` : 'Nothing to move' }); }
    catch (e) { job.finish({ state: 'error', message: e.message }); }
  }
  // check every folder for changes in the background
  if (SETTINGS.checkOnStart !== false && P.sets.length) {
    const job = jobStart({ label: 'Checking folders', short: 'Checking', total: P.sets.length });
    let n = 0;
    for (const s of P.sets) { job.update({ done: n, extra: s.name }); await scanSet(s); n++; }
    job.finish({ message: `${n} folder${n === 1 ? '' : 's'}` });
  }
})();
