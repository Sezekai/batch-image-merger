// ---------- sets: adding, scanning, the list on the left ----------
async function addFolders(paths) {
  if (!paths || !paths.length) return;
  
  const dirs = await api.engine('listDirs', { roots: paths });
  const have = new Set(P.sets.filter((s) => kindOf(s) === UI.tab).map((s) => s.path.toLowerCase()));
  const fresh = dirs.filter((d) => !have.has(d.toLowerCase())).sort(coll.compare);
  if (!fresh.length) { toast(dirs.length ? 'Those folders are already in the list' : 'No images found in those folders'); return; }
  const made = fresh.map((d) => ({ id: uid(), kind: UI.tab, path: d, name: baseName(d), items: [], overrides: {}, manualName: '', exported: null, missing: false, scanned: false }));
  P.sets.push(...made);
  if (!curSet() || kindOf(curSet()) !== UI.tab) { P.cur = made[0].id; UI.sel = new Set([P.cur]); }
  saveProject();
  drawSets(); drawAll();
  toast(`Added ${made.length} set${made.length === 1 ? '' : 's'}`, 'ok');
  const job = jobStart({ label: 'Reading the new folders', short: 'Reading', total: made.length });
  let n = 0;
  for (const s of made) { job.update({ done: n, extra: s.name }); await scanSet(s); n++; }
  job.finish({ message: `${n} set${n === 1 ? '' : 's'} added` });
}

async function scanSet(set, quiet = true) {
  const known = {};
  for (const it of set.items) if (!it.blank) known[it.file] = { size: it.size, mtime: it.mtime, w: it.w, h: it.h };
  // never treat a merged result as an input: anything exported before, or the name this set would save as
  const own = [];
  try {
    const e = eff(set);
    if (e.saveMode === 'inside') {
      const names = new Set([set.manualName, e.nameMode === 'folder' ? set.name : null, set.items.length ? previewName(set) : null].filter(Boolean));
      for (const n of names) for (const ext of ['.jpg', '.png']) own.push(joinPath(set.path, n + ext));
    }
  } catch {}
  const r = await api.engine('scan', { dir: set.path, known, exclude: [...outputsOf(), ...own] });
  set.missing = r.missing;
  set.scanned = true;
  dirtyStatus(set.id);
  if (!r.missing) {
    const byFile = new Map(r.files.map((f) => [f.file, f]));
    const kept = [];
    for (const it of set.items) {
      if (it.blank) { kept.push(it); continue; }
      const f = byFile.get(it.file);
      if (!f) continue; // removed from disk
      byFile.delete(it.file);
      if (f.err) { it.err = f.err; it.w = 0; }
      else { if (f.mtime !== it.mtime) it.bg = null; Object.assign(it, { w: f.w, h: f.h, size: f.size, mtime: f.mtime, err: null }); }
      kept.push(it);
    }
    for (const f of byFile.values()) kept.push({ key: f.file, file: f.file, w: f.err ? 0 : f.w, h: f.err ? 0 : f.h, size: f.size, mtime: f.mtime, ex: false, err: f.err || null });
    set.items = kept;
  }
  saveProject();
  if (set.id === P.cur) drawAll(); else { drawSetRow(set); drawExportBar(); }
  if (!quiet) toast(`${set.name}: ${set.items.filter((i) => !i.blank).length} images`);
}

async function rescanAll() {
  if (busyJobs().some((j) => j.label === 'Checking folders')) return toast('Already checking the folders');
  const job = jobStart({ label: 'Checking folders', short: 'Checking', total: P.sets.length });
  let n = 0;
  for (const s of P.sets) { job.update({ done: n, extra: s.name }); await scanSet(s); n++; }
  job.finish({ message: `${n} folder${n === 1 ? '' : 's'}`, next: null });
}

function selectSet(id, e) {
  const ids = visibleSets().map((s) => s.id);
  if (e && e.shiftKey && UI.lastSelSet) {
    const a = ids.indexOf(UI.lastSelSet), b = ids.indexOf(id);
    if (a >= 0 && b >= 0) { for (let i = Math.min(a, b); i <= Math.max(a, b); i++) UI.sel.add(ids[i]); }
  } else if (e && (e.ctrlKey || e.metaKey)) {
    if (UI.sel.has(id)) UI.sel.delete(id); else UI.sel.add(id);
    UI.lastSelSet = id;
  } else { UI.sel = new Set([id]); UI.lastSelSet = id; }
  if (!(e && (e.ctrlKey || e.metaKey) && !UI.sel.has(id))) P.cur = id;
  UI.tile = null;
  saveProject();
  drawAll();
}
function stepSet(d) {
  const ids = visibleSets().map((s) => s.id);
  if (!ids.length) return;
  const i = ids.indexOf(P.cur);
  const n = ids[clamp((i < 0 ? 0 : i) + d, 0, ids.length - 1)];
  selectSet(n);
  const row = $(`#setlist [data-id="${n}"]`); if (row) row.scrollIntoView({ block: 'nearest' });
}
const tabSets = () => P.sets.filter((s) => kindOf(s) === UI.tab);
const filteredSets = () => {
  const f = UI.filter.trim().toLowerCase(), sf = statusFilter();
  let l = tabSets();
  if (sf === 'done') l = l.filter((s) => s.exported); else if (sf === 'todo') l = l.filter((s) => !s.exported);
  return f ? l.filter((s) => s.name.toLowerCase().includes(f) || s.path.toLowerCase().includes(f)) : l;
};
// Sets that share a parent folder are listed under it, in a group that can be folded away.
function groupedSets() {
  const list = filteredSets();
  const byParent = new Map();
  for (const s of list) { const p = dirName(s.path); if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(s); }
  const out = [], seen = new Set();
  for (const s of list) {
    const p = dirName(s.path), g = byParent.get(p);
    if (g.length < 2) { out.push({ set: s }); continue; }
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ group: p, sets: g });
  }
  return out;
}
const folded = (p) => !!(UIP.folds && UIP.folds[p]) && !UI.filter.trim();
// the sets as they appear in the list, top to bottom (folded groups left out)
const visibleSets = () => groupedSets().flatMap((x) => (x.set ? [x.set] : folded(x.group) ? x.sets.filter((s) => s.id === P.cur) : x.sets));
function drawBadges() {
  for (const k of ['merge', 'freeform', 'overlay']) {
    const n = P.sets.filter((s) => kindOf(s) === k && s.scanned && !s.missing && setStatus(s) !== 'done').length;
    const b = $('#bdg-' + k); if (b) { b.textContent = n ? String(n) : ''; b.title = n ? `${n} set${n === 1 ? '' : 's'} not exported yet, or changed since` : ''; }
  }
}

async function removeSets(ids) {
  const list = P.sets.filter((s) => ids.includes(s.id));
  if (!list.length) return;
  const ok = await confirmBox(`Remove ${list.length} set${list.length === 1 ? '' : 's'} from the list?`, 'Nothing is deleted from your disk. You can add the folders again any time.', `Remove ${list.length} set${list.length === 1 ? '' : 's'}`);
  if (!ok) return;
  P.sets = P.sets.filter((s) => !ids.includes(s.id));
  ids.forEach((i) => UI.sel.delete(i));
  if (!getSet(P.cur)) { const t = tabSets()[0]; P.cur = t ? t.id : null; }
  saveProject(); drawAll();
}

const STATUS = { new: ['', 'Not exported yet'], done: ['ok', 'Exported'], changed: ['warn', 'Changed since it was exported'], missing: ['bad', 'Folder not found'] };
function setRowHtml(s) {
  const st = setStatus(s), k = kindOf(s), xs = exportState(s.id);
  const n = s.items.filter((i) => !i.blank && (k !== 'merge' || !i.ex)).length;
  const ov = Object.keys(s.overrides).length + (s.manualName ? 1 : 0);
  const extra = k === 'freeform' && s.ff ? ` · ${s.ff.placed.length} placed` : k === 'overlay' && s.ov && s.ov.base ? ` · ${s.ov.layers.length} close-up${s.ov.layers.length === 1 ? '' : 's'}` : '';
  return `<div class="sthumb" data-thumb="${s.id}"></div><div class="sinfo"><div class="sname" title="${esc(s.path)}">${esc(s.name)}</div>
    <div class="smeta">${xs ? `<span class="${xs.k}">${xs.t}</span> · ` : ''}${s.scanned ? `${n} image${n === 1 ? '' : 's'}${extra}` : 'Reading…'}${ov ? ` · <span title="Settings changed just for this set">${ov} own setting${ov === 1 ? '' : 's'}</span>` : ''}</div></div>
    <span class="dot ${STATUS[st][0]}" title="${STATUS[st][1]}"></span>`;
}
function drawSetRow(s) {
  const row = $(`#setlist [data-id="${s.id}"]`);
  if (!row) return;
  const html = setRowHtml(s);
  if (row._html === html) return;
  row.innerHTML = row._html = html;
  loadSetThumb(s, row);
}
function loadSetThumb(s, row) {
  const first = (kindOf(s) === 'overlay' && s.ov && s.ov.base && s.items.find((i) => i.file === s.ov.base)) || (kindOf(s) === 'merge' ? included(s) : s.items).find((i) => !i.blank && i.w);
  const el = $('.sthumb', row);
  if (!first || !el) return;
  thumbUrl(s, first).then((u) => { if (u) el.style.backgroundImage = `url("${u}")`; });
}
function drawSets() {
  const host = $('#setlist');
  const items = groupedSets();
  const all = tabSets();
  const n = all.length;
  $('#setcount').textContent = n ? `${n}` : '';
  drawBadges();
  // exported filter with counts
  const done = all.filter((s) => s.exported).length, fv = statusFilter();
  const sf = $('#setstatus');
  sf.innerHTML = [['all', 'All', n], ['todo', 'Not exported', n - done], ['done', 'Exported', done]].map(([k, l, c]) => `<button data-sf="${k}" class="${fv === k ? 'on' : ''}">${l}<em>${c}</em></button>`).join('');
  sf.classList.toggle('hidden', !n);
  $$('[data-sf]', sf).forEach((b) => (b.onclick = () => { UIP.doneFilter = Object.assign({}, UIP.doneFilter, { [UI.tab]: b.dataset.sf }); saveUIP(); drawSets(); }));
  if (!n || !items.length) {
    host.innerHTML = !n ? `<div class="hint">${ic('folders')}${{ merge: 'Each folder becomes one set, which turns into one merged picture.', freeform: 'Each folder becomes one set. Its pictures’ subjects are cut out so you can arrange them freely.', overlay: 'Each folder becomes one set: a wide shot plus its close-ups, which are placed over it.' }[UI.tab]} Drag folders here, or use <b>Add folders</b>.${P.sets.length ? `<br><br><span class="faint">In the other tabs: ${['merge', 'freeform', 'overlay'].filter((k) => k !== UI.tab).map((k) => `${TABNAME[k]} ${P.sets.filter((s) => kindOf(s) === k).length}`).join(', ')}</span>` : ''}</div>`
      : `<div class="hint">No sets match${fv !== 'all' ? ` while showing only ${fv === 'done' ? 'exported' : 'not exported'} sets` : ''}.</div>`;
    $('#setsel').textContent = '';
    return;
  }
  // update only the rows that changed
  $$('.hint', host).forEach((h) => h.remove());
  const rows = new Map($$('.setrow', host).map((r) => [r.dataset.id, r]));
  const heads = new Map($$('.ghead', host).map((r) => [r.dataset.g, r]));
  let prev = null;
  const place = (el) => { const want = prev ? prev.nextSibling : host.firstChild; if (want !== el) host.insertBefore(el, want); prev = el; };
  const putRow = (s, depth) => {
    let r = rows.get(s.id);
    const html = setRowHtml(s);
    if (!r) {
      r = document.createElement('div'); r.className = 'setrow'; r.dataset.id = s.id;
      r.onclick = (e) => selectSet(r.dataset.id, e);
      r.oncontextmenu = setRowMenu;
      r.innerHTML = html; r._html = html;
      SETIO.observe(r);
    } else {
      rows.delete(s.id);
      if (r._html !== html) { r.innerHTML = html; r._html = html; if (r._thumbed) loadSetThumb(s, r); }
    }
    r.style.setProperty('--d', depth);
    const cls = `setrow ${s.id === P.cur ? 'cur' : ''} ${UI.sel.has(s.id) ? 'sel' : ''}`;
    if (r.className !== cls) r.className = cls;
    place(r);
  };
  for (const x of items) {
    if (x.set) { putRow(x.set, 0); continue; }
    let h = heads.get(x.group);
    if (!h) { h = document.createElement('div'); h.className = 'ghead'; h.dataset.g = x.group; h.onclick = () => { UIP.folds = Object.assign({}, UIP.folds, { [x.group]: !folded(x.group) }); saveUIP(); drawSets(); }; }
    else heads.delete(x.group);
    const sh = folded(x.group);
    const todo = x.sets.filter((s) => setStatus(s) !== 'done').length;
    const hh = `${ic('chev', 'ic tw')}${ic('folder')}<span class="nm" title="${esc(x.group)}">${esc(baseName(x.group))}</span><span class="n" title="${todo} not exported yet">${x.sets.length}${todo && todo < x.sets.length ? ` · ${todo} to do` : ''}</span>`;
    if (h._html !== hh) { h.innerHTML = hh; h._html = hh; }
    h.classList.toggle('shut', sh);
    place(h);
    for (const s of x.sets) if (!sh || s.id === P.cur) putRow(s, 1);
  }
  for (const r of rows.values()) { SETIO.unobserve(r); r.remove(); }
  for (const h of heads.values()) h.remove();
  $('#setsel').textContent = UI.sel.size > 1 ? `${UI.sel.size} selected` : '';
}
// thumbnails load when a row scrolls into view
const SETIO = new IntersectionObserver((ents) => ents.forEach((en) => {
  if (!en.isIntersecting) return;
  SETIO.unobserve(en.target); en.target._thumbed = true;
  const s = getSet(en.target.dataset.id); if (s) loadSetThumb(s, en.target);
}), { root: document.getElementById('setlist') });
function setRowMenu(e) {
  e.preventDefault();
  const s = getSet(this.dataset.id);
  if (!s) return;
  if (!UI.sel.has(s.id)) selectSet(s.id);
  const ids = [...UI.sel];
  ctxMenu(e.clientX, e.clientY, [
    { label: 'Show folder', run: () => api.openPath(s.path) },
    ...(s.exported ? [{ label: 'Show exported file', run: () => api.showItem(s.exported.path) }, { label: ids.length > 1 ? `Mark ${ids.length} sets as not exported` : 'Mark as not exported', run: () => { ids.forEach((id) => { const t = getSet(id); if (t) t.exported = null; dirtyStatus(id); }); saveProject(); drawAll(); } }] : []),
    { label: 'Check folder for changes', run: () => scanSet(s, false) },
    '-',
    ...['merge', 'freeform', 'overlay'].filter((k) => k !== UI.tab).map((k) => ({ label: `Move ${ids.length > 1 ? ids.length + ' sets' : ''} to ${TABNAME[k]}`.replace('  ', ' '), run: () => moveSets(ids, k) })),
    { label: ids.length > 1 ? `Clear own settings of ${ids.length} sets` : 'Clear this set’s own settings', run: () => ids.forEach((id) => change(id, 'Clear own settings', () => { const t = getSet(id); t.overrides = {}; t.manualName = ''; })) || drawAll() },
    { label: ids.length > 1 ? `Remove ${ids.length} sets from list` : 'Remove from list', run: () => removeSets(ids) },
  ]);
}
const statusFilter = () => (UIP.doneFilter && UIP.doneFilter[UI.tab]) || 'all';
function moveSets(ids, kind) {
  change(ids.length === 1 ? ids[0] : 'sets:' + ids.join(','), `Move to ${TABNAME[kind]}`, () => ids.forEach((id) => (getSet(id).kind = kind)));
  const left = tabSets()[0];
  P.cur = left ? left.id : null; UI.sel = new Set(P.cur ? [P.cur] : []);
  saveProject(); drawAll();
  toast(`Moved to ${TABNAME[kind]}. Press ${{ merge: 1, freeform: 2, overlay: 3 }[kind]} to go there.`, 'ok');
}
