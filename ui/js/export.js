// ---------- exporting: a queue with pause, resume and stop ----------
// Starting an export while one runs adds the sets to the queue. One job in the status bar covers the
// whole queue. Pause finishes the current set and waits; Stop stops the current set straight away and
// empties the queue (finished files are kept). The queue is saved, so a paused or interrupted batch
// can carry on after a restart.
const EXQ = { queue: [], cur: null, done: [], job: null, pausing: false, waiting: null, frac: 0, reserved: [] };

function exportState(id) {
  if (EXQ.cur === id) return { k: 'cur', t: `Exporting${EXQ.frac ? ' ' + Math.floor(EXQ.frac * 100) + '%' : '…'}` };
  if (EXQ.queue.includes(id)) return { k: 'q', t: 'Queued' };
  const d = EXQ.job && EXQ.done.find((r) => r.setId === id);
  if (d && d.status === 'failed') return { k: 'f', t: 'Failed' };
  return null;
}
function queueExport(ids, label) {
  const want = ids.map(getSet).filter((s) => s && s.scanned && !s.missing).map((s) => s.id).filter((id) => id !== EXQ.cur && !EXQ.queue.includes(id));
  if (!want.length) { toast(ids.length ? 'Those sets are already queued' : 'Nothing to export'); return; }
  EXQ.queue.push(...want);
  saveQueue();
  if (EXQ.job) { toast(`Added ${want.length} set${want.length === 1 ? '' : 's'} to the queue`); EXQ.job.update({ total: EXQ.done.length + (EXQ.cur ? 1 : 0) + EXQ.queue.length }); drawSets(); return; }
  runQueue();
}
function saveQueue() { P.exportQueue = [...(EXQ.cur ? [EXQ.cur] : []), ...EXQ.queue]; saveProject(); }

async function runQueue() {
  EXQ.done = []; EXQ.reserved = []; EXQ.pausing = false; EXQ.stopped = false;
  const job = EXQ.job = jobStart({
    label: 'Exporting', short: 'Exporting', total: EXQ.queue.length, prio: 10,
    pause: () => { EXQ.pausing = true; job.update({ extra: 'pausing after this set' }); drawExportBar(); },
    resume: () => { EXQ.pausing = false; job.update({ extra: '' }); if (EXQ.waiting) EXQ.waiting(); },
    stop: () => stopExport(),
    details: (btn) => queuePopup(btn),
  });
  drawExportBar();
  while (EXQ.queue.length && !EXQ.stopped) {
    if (EXQ.pausing) {
      job.setPaused(true); drawExportBar();
      await new Promise((r) => (EXQ.waiting = r));
      EXQ.waiting = null; job.setPaused(false);
      if (EXQ.stopped) break;
    }
    const id = EXQ.queue.shift();
    const s = getSet(id);
    if (!s || !s.scanned || s.missing) { EXQ.done.push({ setId: id, status: 'failed', reason: s ? 'Folder not found' : 'The set was removed' }); continue; }
    EXQ.cur = id; EXQ.frac = 0; saveQueue();
    const queuedLeft = EXQ.queue.length;
    job.update({ name: s.name, done: EXQ.done.length, total: EXQ.done.length + 1 + queuedLeft, extra: EXQ.pausing ? 'pausing after this set' : queuedLeft ? `${queuedLeft} more queued` : '' });
    drawSetRow(s); drawExportBar();
    let r;
    try {
      await prepareSet(s);
      const j = exportJob(s);
      if (j.kind ? j.empty : !j.items.some((i) => !i.blank)) r = { setId: id, status: 'skipped', reason: 'Nothing to export' };
      else r = await api.exportOne(j, EXQ.reserved);
    } catch (err) { r = { setId: id, status: 'failed', reason: String(err.message || err) }; }
    if (r.status === 'ok') {
      s.exported = { path: r.path, time: Date.now(), hash: setHash(s), W: r.W, H: r.H, bytes: r.bytes };
      s.outputs = [...new Set([...(s.outputs || []), r.path])];
      EXQ.reserved.push(r.path);
      dirtyStatus(s.id);
    }
    EXQ.done.push(r);
    EXQ.cur = null; EXQ.frac = 0;
    saveQueue();
    job.update({ done: EXQ.done.length });
    drawSetRow(s); drawBadges();
  }
  const res = EXQ.done;
  const ok = res.filter((r) => r.status === 'ok').length, fail = res.filter((r) => r.status === 'failed').length, skip = res.filter((r) => r.status === 'skipped').length, stopped = res.filter((r) => r.status === 'cancelled').length;
  LASTRES = { results: res, ok, fail, skip };
  const msg = `${ok} made, ${fail} failed${skip ? `, ${skip} skipped` : ''}${EXQ.stopped && EXQ.leftAtStop ? `, ${EXQ.leftAtStop} not started` : ''}`;
  const one = ok === 1 && res.length === 1 ? res[0] : null;
  job.finish({ state: EXQ.stopped ? 'stopped' : fail && !ok ? 'error' : 'done', message: msg,
    next: one ? { label: 'Show the file', run: () => api.showItem(one.path) } : { label: 'Show results', run: showResults } });
  EXQ.job = null; EXQ.queue = []; EXQ.cur = null; saveQueue();
  saveProject();
  drawAll();
  if (one) toast(`Saved ${baseName(one.path)} · ${fmtPx(one.W, one.H)} · ${fmtBytes(one.bytes)}`, 'ok');
  else if (fail || skip) showResults();
}
async function stopExport() {
  if (!EXQ.job) return;
  EXQ.leftAtStop = EXQ.queue.length;
  EXQ.stopped = true; EXQ.queue = []; EXQ.pausing = false;
  saveQueue();
  if (EXQ.waiting) EXQ.waiting();
  await api.cancelExport();
  drawSets();
}
api.onExportProgress((d) => {
  if (!EXQ.job || d.setId !== EXQ.cur) return;
  EXQ.frac = d.of ? (d.done / d.of) * 0.95 : 0;
  EXQ.job.update({ done: EXQ.done.length + EXQ.frac });
  const s = getSet(d.setId); if (s) drawSetRow(s);
});
function queuePopup(btn) {
  const pop = $('#pop');
  if (!pop.classList.contains('hidden') && pop.dataset.kind === 'queue') { pop.classList.add('hidden'); return; }
  const name = (id) => (getSet(id) || { name: '(removed)' }).name;
  const st = { ok: 'Done', failed: 'Failed', skipped: 'Skipped', cancelled: 'Stopped' };
  const rows = [
    ...EXQ.done.map((r) => `<div class="qrow ${r.status === 'ok' ? 'ok' : r.status === 'failed' ? 'failed' : ''}" title="${esc(r.reason || r.path || '')}"><span class="nm">${esc(name(r.setId))}</span><span class="st">${st[r.status] || r.status}</span></div>`),
    ...(EXQ.cur ? [`<div class="qrow cur"><span class="nm">${esc(name(EXQ.cur))}</span><span class="st">Exporting ${Math.floor(EXQ.frac * 100)}%</span></div>`] : []),
    ...EXQ.queue.map((id) => `<div class="qrow"><span class="nm">${esc(name(id))}</span><span class="st">Queued</span></div>`),
  ];
  pop.dataset.kind = 'queue';
  pop.innerHTML = `<div class="row" style="margin-bottom:6px"><b>Export queue</b><span class="faint small">${EXQ.done.length} of ${EXQ.done.length + EXQ.queue.length + (EXQ.cur ? 1 : 0)} done</span></div><div class="qlist">${rows.join('')}</div>`;
  pop.classList.remove('hidden');
  const r = btn.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pr.width - 8)) + 'px';
  pop.style.top = Math.max(8, r.top - pr.height - 6) + 'px';
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#pop') && !e.target.closest('#s-det')) $('#pop').classList.add('hidden'); }, true);

// ---------- the export buttons (right of the status bar) ----------
function drawExportBar() {
  const host = $('#s-exp');
  const set = curSet();
  const nSel = [...UI.sel].filter(getSet).length;
  const ready = tabSets().filter((s) => s.scanned && !s.missing);
  const pending = ready.filter((s) => setStatus(s) !== 'done').length;
  const busy = !!EXQ.job;
  const e = set ? eff(set) : Object.assign({}, DEF, P.defaults);
  const where = { inside: 'inside each set’s folder', beside: 'next to each set’s folder', custom: e.customDir ? `in ${baseName(e.customDir)}` : 'in a folder you choose' }[e.saveMode];
  const add = busy ? 'Add ' : 'Export ';
  const q = busy ? ' to the queue' : '';
  host.innerHTML = `<span class="lbl" title="Saved ${esc(where)}"${busy ? ' hidden' : ''}>${e.format.toUpperCase()}${e.format === 'jpg' ? ` · ${e.quality}` : ''}</span>
    ${nSel > 1 ? `<button class="sm" id="expSel">${add}${nSel} selected${q}</button>` : ''}
    ${!busy && pending && pending < ready.length ? `<button class="sm" id="expPend" title="Sets never exported, or changed since">${add}new and changed (${pending})${q}</button>` : ''}
    <button class="sm" id="expAll" ${ready.length ? '' : 'disabled'} title="Ctrl+Shift+E">${add}all (${ready.length})${q}</button>
    <button class="sm ${busy ? '' : 'primary'}" id="expThis" ${set && set.scanned && !set.missing ? '' : 'disabled'} title="Ctrl+E"><span data-ic="save"></span>${busy ? 'Add this set to the queue' : 'Export this set'}</button>`;
  paintIcons(host);
  const on = (id, fn) => { const b = $('#' + id); if (b) b.onclick = fn; };
  on('expThis', () => queueExport([set.id]));
  on('expSel', () => queueExport([...UI.sel]));
  on('expAll', () => queueExport(ready.map((s) => s.id)));
  on('expPend', () => queueExport(ready.filter((s) => setStatus(s) !== 'done').map((s) => s.id)));
}

let LASTRES = null;
function showResults() {
  if (!LASTRES) return;
  const rows = LASTRES.results.map((r) => {
    const s = getSet(r.setId), name = s ? s.name : '?';
    if (r.status === 'ok') return `<tr><td><span class="dot ok"></span></td><td>${esc(name)}</td><td class="small">${esc(baseName(r.path))}<br><span class="muted">${fmtPx(r.W, r.H)} · ${fmtBytes(r.bytes)}</span></td><td><button class="sm" data-show="${esc(r.path)}">Show</button></td></tr>`;
    return `<tr><td><span class="dot ${r.status === 'failed' ? 'bad' : 'warn'}"></span></td><td>${esc(name)}</td><td class="small ${r.status === 'failed' ? 'badtx' : 'muted'}">${esc(r.status === 'cancelled' ? 'Stopped' : r.reason || r.status)}</td><td>${s ? `<button class="sm" data-go="${s.id}">Open set</button>` : ''}</td></tr>`;
  }).join('');
  const m = modal(`<h1>Export results</h1><p class="sub">${LASTRES.ok} made, ${LASTRES.fail} failed${LASTRES.skip ? `, ${LASTRES.skip} skipped` : ''}.</p>
    <div class="restable"><table>${rows}</table></div><div class="acts"><button class="primary" id="rClose">Close</button></div>`, { wide: true });
  $('#rClose', m).onclick = closeModal;
  $$('[data-show]', m).forEach((b) => (b.onclick = () => api.showItem(b.dataset.show)));
  $$('[data-go]', m).forEach((b) => (b.onclick = () => { closeModal(); const s = getSet(b.dataset.go); if (s && kindOf(s) !== UI.tab) setTab(kindOf(s)); selectSet(b.dataset.go); }));
}

// everything a set needs worked out before it can be saved
async function prepareSet(s) {
  const k = kindOf(s);
  if (k === 'freeform') return ffPrepare(s);
  if (k === 'overlay') return ovPrepare(s);
  const e = eff(s);
  if (e.match && e.matchTarget === 'auto') await ensureBgEstimates(s);
}
