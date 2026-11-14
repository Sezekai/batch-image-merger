// ---------- Freeform tab ----------
const FFG = BIMGeom;
const FF = { view: null, mode: 'canvas', sel: new Set(), srcSel: new Set(), tool: 'select', shape: 'free', srcView: 'cut', pend: null, crop: null, cuts: new Map(), detecting: new Set(), raf: 0, drag: null, guides: [] };
const FFTOOLS = { select: ['V', 'Select'], split: ['X', 'Split (click a separate piece, or drag around part of a cutout)'], add: ['A', 'Add region (draw around something that was missed)'], erase: ['E', 'Erase brush'], restore: ['R', 'Restore brush'] };

function ffState(set) { if (!set.ff) set.ff = { subjects: {}, det: {}, placed: [], src: null }; return set.ff; }
const ffImages = (set) => set.items.filter((i) => !i.blank && i.w);
const ffDetKey = (e, it) => JSON.stringify([e.ffTol, e.ffSoft, e.ffHoles, e.ffGap, e.ffMinSize, it.mtime]);
function ffIou(a, b) { const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]); const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0); return i / (a[2] * a[3] + b[2] * b[3] - i || 1); }
const newSubj = (c) => ({ id: uid(), def: { parts: [{ comps: [{ id: c.id, bbox: c.bbox }] }], ops: [] } });

// every subject with its file and image item
function ffSubjects(set) {
  const ff = ffState(set), out = [];
  for (const it of ffImages(set)) for (const s of ff.subjects[it.file] || []) out.push({ subj: s, it, file: it.file });
  return out;
}
// fast lookup of a subject by id (rebuilt when the subjects change)
const FFIDX = new WeakMap();
function ffFind(set, sid) {
  const ff = ffState(set);
  let c = FFIDX.get(ff);
  let r = c && c.map.get(sid);
  if (r && ff.subjects[r.file] && ff.subjects[r.file].includes(r.subj) && r.it === set.items.find((i) => i.file === r.file)) return r;
  const map = new Map();
  for (const x of ffSubjects(set)) map.set(x.subj.id, x);
  FFIDX.set(ff, { map });
  return map.get(sid) || null;
}
// ---------- detection ----------
async function ffEnsureDetect(set) {
  if (FF.detecting.has(set.id)) return false;
  const e = eff(set), ff = ffState(set);
  const todo = ffImages(set).filter((it) => !ff.det[it.file] || ff.det[it.file].key !== ffDetKey(e, it));
  if (!todo.length) return false;
  FF.detecting.add(set.id);
  let stop = false;
  const job = jobStart({ label: 'Finding subjects', short: 'Finding subjects', name: set.name, total: todo.length, stop: () => { stop = true; job.update({ extra: 'stopping after this picture' }); } });
  try {
    let n = 0;
    for (const it of todo) {
      if (stop) break;
      job.update({ done: n, extra: it.file });
      const key = ffDetKey(e, it);
      const det = await api.engine('ffDetect', { file: joinPath(set.path, it.file), size: it.size, mtime: it.mtime, w: it.w, h: it.h, P: e });
      ffReconcile(set, it.file, det);
      ffState(set).det[it.file] = { key, bg: det.bg, useAlpha: det.useAlpha, n: det.comps.length };
      n++;
      job.update({ done: n });
    }
    job.finish({ state: stop ? 'stopped' : 'done', message: `${set.name} · ${n} of ${todo.length} pictures` });
    // drop placements whose subject is gone
    const now = ffState(set);
    const ids = new Set(ffSubjects(set).map((x) => x.subj.id));
    now.placed = now.placed.filter((p) => ids.has(p.sid));
    if (!now.src || !ffImages(set).some((i) => i.file === now.src)) now.src = ffImages(set)[0] ? ffImages(set)[0].file : null;
    saveProject();
  } catch (err) { job.finish({ state: 'error', message: err.message }); toast('Finding subjects failed: ' + err.message); }
  FF.detecting.delete(set.id);
  dirtyStatus(set.id);
  return true;
}
// keep manual edits when the detection settings change: map old pieces onto new ones by overlap
function ffReconcile(set, file, det) {
  const ff = ffState(set), old = ff.subjects[file] || [];
  if (!old.length) { ff.subjects[file] = det.comps.map(newSubj); return; }
  const used = new Set();
  const leaf = (p) => {
    p.comps = p.comps.map((c) => {
      let best = null, bi = 0.3;
      for (const n of det.comps) { const v = ffIou(c.bbox, n.bbox); if (v > bi) { bi = v; best = n; } }
      if (best) used.add(best.id);
      return best ? { id: best.id, bbox: best.bbox } : null;
    }).filter(Boolean);
  };
  const walk = (d) => (d.parts || []).forEach((p) => (p.comps ? leaf(p) : walk(p)));
  const hasContent = (d) => (d.parts || []).some((p) => (p.comps ? p.comps.length : hasContent(p))) || (d.ops || []).some((o) => o.m === 'add');
  old.forEach((s) => walk(s.def));
  const kept = old.filter((s) => hasContent(s.def));
  for (const n of det.comps) if (!used.has(n.id)) kept.push(newSubj(n));
  ff.subjects[file] = kept;
}

// ---------- cutout previews ----------
function ffCutDef(set, it, def, prio = 1) {
  const e = eff(set);
  const k = JSON.stringify([set.path, it.file, it.mtime, e.ffTol, e.ffSoft, e.ffHoles, e.ffGap, e.ffMinSize, e.ffFeather, def]);
  let p = FF.cuts.get(k);
  if (!p) {
    p = api.engine('ffCutout', { file: joinPath(set.path, it.file), size: it.size, mtime: it.mtime, w: it.w, h: it.h, P: e, def }, prio)
      .then((r) => (r.empty ? { empty: true } : { url: api.fileUrl(r.path), box: r.box }))
      .catch((err) => { FF.cuts.delete(k); return { error: err.message }; });
    FF.cuts.set(k, p);
    if (FF.cuts.size > 3000) FF.cuts.delete(FF.cuts.keys().next().value);
  }
  return p;
}
function ffCut(set, it, subj, prio) {
  return ffCutDef(set, it, subj.def, prio).then((r) => {
    if (r.box && JSON.stringify(subj.box) !== JSON.stringify(r.box)) { subj.box = r.box; dirtyStatus(set.id); saveProject(); ffSoon(); }
    if (r.empty && subj.box) { subj.box = null; ffSoon(); }
    return r;
  });
}

function ffSoon() { if (FF.raf) return; FF.raf = requestAnimationFrame(() => { FF.raf = 0; if (UI.tab === 'freeform') { drawStage(); drawExportBar(); } }); }

// ---------- export job ----------
function ffCanvasOf(set) {
  const ff = ffState(set), e = eff(set);
  const placed = ff.placed.map((p) => ({ p, f: ffFind(set, p.sid) })).filter((x) => x.f && x.f.subj.box);
  return { placed, canvas: FFG.ffCanvas(placed.map((x) => x.p), (p) => ffFind(set, p.sid).subj.box, e) };
}
function ffBg(set, e = eff(set)) {
  if (e.ffBgMode === 'custom') return e.ffBgColor;
  const ff = ffState(set), first = ffImages(set).find((i) => ff.det[i.file]);
  return (first && ff.det[first.file].bg) || e.ffBgColor;
}
function ffJob(set) {
  const e = eff(set), { placed, canvas } = ffCanvasOf(set);
  const items = placed.map(({ p, f }) => ({ file: joinPath(set.path, f.it.file), w: f.it.w, h: f.it.h, size: f.it.size, mtime: f.it.mtime, def: f.subj.def, box: f.subj.box, cx: p.cx, cy: p.cy, s: p.s, r: p.r, flip: !!p.flip }));
  const first = ffImages(set)[0];
  return { setId: set.id, kind: 'freeform', dir: set.path, settings: e, manualName: set.manualName || '', firstName: first ? first.file : '', count: placed.length, layoutLabel: 'freeform', prevOut: set.exported && set.exported.path,
    payload: { P: e, canvas, bg: ffBg(set, e), transparent: !!e.ffTransparent, items }, size: { W: canvas.W, H: canvas.H }, empty: !items.length };
}
async function ffPrepare(set) {
  await ffEnsureDetect(set);
  await Promise.all(ffState(set).placed.map((p) => { const f = ffFind(set, p.sid); return f ? ffCut(set, f.it, f.subj) : null; }));
}

// ---------- drawing ----------
function ffInit() {
  const st = $('#ffStage');
  st.innerHTML = `<div class="tbar" id="ffbar"></div>
    <div class="srcstrip hidden" id="ffstrip"></div>
    <div class="pzwrap" id="ffwrap"><div class="world"></div><div class="uilayer"></div><div class="actbar hidden" id="ffpend"></div><div class="emptymsg hidden" id="ffempty"></div></div>
    <div class="fftray" id="fftray"></div>`;
  FF.shape = UIP.ffShape || 'free'; FF.srcView = UIP.ffSrcView || 'cut';
  FF.view = new PanZoom($('#ffwrap'), () => ffDrawUI());
  PanZoom.all.push(FF.view);
  $('#ffwrap').addEventListener('pointerdown', ffDown);
  $('#ffwrap').addEventListener('pointermove', (e) => brushCursor($('#ffwrap'), FF.mode === 'source' && (FF.tool === 'erase' || FF.tool === 'restore'), e.clientX, e.clientY));
  $('#ffwrap').addEventListener('pointerleave', () => brushCursor($('#ffwrap'), false));
  $('#ffwrap').addEventListener('contextmenu', ffMenu);
  $('#ffwrap').addEventListener('dblclick', (e) => { if (e.target === $('#ffwrap') || e.target.classList.contains('world')) FF.view.fit(); });
}

function ffDraw() {
  const set = curSet();
  if (!FF.view) ffInit();
  const wrap = $('#ffwrap'), world = $('.world', wrap), em = $('#ffempty');
  ffBar(set);
  if (!set || !set.scanned || set.missing || !ffImages(set).length) {
    world.innerHTML = ''; $('.uilayer', wrap).innerHTML = ''; $('#fftray').innerHTML = ''; $('#ffstrip').classList.add('hidden');
    em.classList.remove('hidden');
    em.innerHTML = !P.sets.some((s) => kindOf(s) === 'freeform') ? `${ic('folders')}<p>Each folder becomes a set. The subjects in its pictures are found for you, so you can arrange them freely.</p><button class="primary" onclick="pickAndAdd()">${ic('plus')}Add folders</button>`
      : !set ? `${ic('image')}<p>Pick a set on the left.</p>` : set.missing ? `${ic('drive')}<p><b>Folder not found</b></p><p class="mono">${esc(set.path)}</p>` : !set.scanned ? `${ic('image')}<p>Reading the folder…</p>` : `${ic('image')}<p>No pictures in this folder.</p>`;
    return;
  }
  em.classList.add('hidden');
  ffEnsureDetect(set).then((changed) => { if (changed && set.id === P.cur) ffSoon(); });
  if (FF.mode === 'source') ffDrawSource(set); else ffDrawCanvas(set);
  ffDrawTray(set);
  wrap.dataset.tool = FF.mode === 'source' ? FF.tool : 'select';
  if (FF.mode !== 'source' || !['erase', 'restore'].includes(FF.tool)) brushCursor(wrap, false);
}

function ffDrawCanvas(set) {
  const e = eff(set), ff = ffState(set), world = $('#ffwrap .world');
  $('#ffstrip').classList.add('hidden');
  if (world.dataset.mode !== 'canvas') { world.innerHTML = ''; world.dataset.mode = 'canvas'; FF.view.fitted = true; }
  const { placed, canvas } = ffCanvasOf(set);
  let bg = $('.ffbg', world);
  if (!bg) { bg = document.createElement('div'); bg.className = 'ffbg'; world.prepend(bg); }
  const transparent = e.ffTransparent && e.format === 'png';
  Object.assign(bg.style, { left: canvas.x + 'px', top: canvas.y + 'px', width: canvas.W + 'px', height: canvas.H + 'px', background: transparent ? '' : ffBg(set, e) });
  bg.classList.toggle('transparent', transparent);
  bg.classList.toggle('isempty', !placed.length);
  bg.innerHTML = placed.length ? '' : '<span>Drag cutouts here from the strip below, or use “Place all”.</span>';
  const old = new Map($$('.ffitem', world).map((el) => [el.dataset.pid, el]));
  for (const { p, f } of placed) {
    let el = old.get(p.id);
    if (el) old.delete(p.id);
    else { el = document.createElement('div'); el.className = 'ffitem'; el.dataset.pid = p.id; el.innerHTML = '<img draggable="false" alt="" decoding="async">'; world.appendChild(el); }
    world.appendChild(el); // keep stacking order
    const b = f.subj.box;
    Object.assign(el.style, { left: p.cx + 'px', top: p.cy + 'px', width: b[2] * p.s + 'px', height: b[3] * p.s + 'px', transform: `translate(-50%,-50%) rotate(${p.r || 0}deg) scaleX(${p.flip ? -1 : 1})` });
    el.classList.toggle('sel', FF.sel.has(p.id));
    el.classList.toggle('up', p.s > 1.02);
    const img = $('img', el);
    ffCut(set, f.it, f.subj).then((r) => { if (r.url && img.dataset.src !== r.url) { img.dataset.src = r.url; img.src = r.url; } });
  }
  for (const el of old.values()) el.remove();
  for (const id of [...FF.sel]) if (!ff.placed.some((p) => p.id === id)) FF.sel.delete(id);
  if (!FF.drag) FF.view.setBounds({ x: canvas.x, y: canvas.y, W: canvas.W, H: canvas.H });
  ffDrawUI();
}

// handles, outlines and snap guides (screen space)
function ffDrawUI() {
  const set = curSet(), ui = $('#ffwrap .uilayer');
  if (!set || !ui || UI.tab !== 'freeform') return;
  const v = FF.view;
  if (FF.mode !== 'canvas') {
    let svg = '';
    if (FF.lasso) svg += `<path d="${svgPath(FF.lasso.map(([x, y]) => v.toScreen(x, y)))}Z" class="lasso ${FF.tool}"/>`;
    const pd = FF.pend;
    if (pd && pd.pts) svg += `<path d="${svgPath(pd.pts.map(([x, y]) => v.toScreen(x, y)))}Z" class="lasso pend"/>`;
    if (pd && pd.pt) { const [x, y] = v.toScreen(...pd.pt); svg += `<circle cx="${x}" cy="${y}" r="6" class="pendpt"/>`; }
    ui.innerHTML = `<svg class="uisvg">${svg}</svg>`;
    ffPendBar(set);
    return;
  }
  ffPendBar(set);
  const ff = ffState(set);
  let svg = '';
  const sel = FF.crop ? [] : ff.placed.filter((p) => FF.sel.has(p.id));
  for (const p of sel) {
    const f = ffFind(set, p.sid); if (!f || !f.subj.box) continue;
    const z = FFG.placedSize(p, f.subj.box), a = ((p.r || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const pt = (dx, dy) => v.toScreen(p.cx + dx * c - dy * s, p.cy + dx * s + dy * c);
    const corners = [[-z.w / 2, -z.h / 2], [z.w / 2, -z.h / 2], [z.w / 2, z.h / 2], [-z.w / 2, z.h / 2]].map(([x, y]) => pt(x, y));
    svg += `<polygon points="${corners.map((q) => q.join(',')).join(' ')}" class="selbox"/>`;
    if (sel.length === 1 || p.id === FF.primary) {
      const top = pt(0, -z.h / 2), rot = pt(0, -z.h / 2 - 28 / v.z);
      svg += `<line x1="${top[0]}" y1="${top[1]}" x2="${rot[0]}" y2="${rot[1]}" class="selbox"/><circle cx="${rot[0]}" cy="${rot[1]}" r="6" class="hrot" data-h="rot" data-pid="${p.id}"/>`;
      corners.forEach((q) => (svg += `<rect x="${q[0] - 5}" y="${q[1] - 5}" width="10" height="10" class="hsc" data-h="sc" data-pid="${p.id}"/>`));
    }
  }
  for (const g of FF.guides) {
    if (g.x != null) { const [x] = v.toScreen(g.x, 0); svg += `<line x1="${x}" y1="0" x2="${x}" y2="5000" class="guide"/>`; }
    else { const [, y] = v.toScreen(0, g.y); svg += `<line x1="0" y1="${y}" x2="9000" y2="${y}" class="guide"/>`; }
  }
  if (FF.marquee) { const [a, b, c, d] = FF.marquee; const [x0, y0] = v.toScreen(Math.min(a, c), Math.min(b, d)), [x1, y1] = v.toScreen(Math.max(a, c), Math.max(b, d)); svg += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" class="marq"/>`; }
  if (FF.crop) {
    const c = FF.crop, [x0, y0] = v.toScreen(c.x, c.y), [x1, y1] = v.toScreen(c.x + c.W, c.y + c.H);
    svg += `<path d="M-9999,-9999H19999V19999H-9999Z M${x0},${y0}V${y1}H${x1}V${y0}Z" class="cropshade" fill-rule="evenodd"/>`;
    for (const f of [1 / 3, 2 / 3]) svg += `<line x1="${x0 + (x1 - x0) * f}" y1="${y0}" x2="${x0 + (x1 - x0) * f}" y2="${y1}" class="cropthird"/><line x1="${x0}" y1="${y0 + (y1 - y0) * f}" x2="${x1}" y2="${y0 + (y1 - y0) * f}" class="cropthird"/>`;
    svg += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" class="cropbox"/>`;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (const [k, x, y] of [['nw', x0, y0], ['n', mx, y0], ['ne', x1, y0], ['e', x1, my], ['se', x1, y1], ['s', mx, y1], ['sw', x0, y1], ['w', x0, my]]) svg += `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" class="croph ch-${k}" data-ch="${k}"/>`;
  }
  ui.innerHTML = `<svg class="uisvg">${svg}</svg>`;
}
function ffDrawSource(set) {
  const ff = ffState(set), world = $('#ffwrap .world');
  const it = ffImages(set).find((i) => i.file === ff.src) || ffImages(set)[0];
  if (!it) return;
  ff.src = it.file;
  // strip of source images (always looks up the current set when clicked)
  const strip = $('#ffstrip');
  strip.classList.remove('hidden');
  const skey = set.id + '|' + ffImages(set).map((i) => i.file).join('|');
  if (strip.dataset.key !== skey) {
    strip.dataset.key = skey;
    strip.innerHTML = ffImages(set).map((i) => `<div class="sitem" data-file="${esc(i.file)}" title="${esc(i.file)}"><img alt="" decoding="async"><span></span></div>`).join('');
    $$('.sitem', strip).forEach((el) => {
      const im = set.items.find((x) => x.file === el.dataset.file);
      thumbUrl(set, im).then((u) => { if (u) $('img', el).src = u; });
      el.onclick = () => ffShowSource(el.dataset.file);
    });
  }
  $$('.sitem', strip).forEach((el) => { el.classList.toggle('on', el.dataset.file === it.file); const n = (ff.subjects[el.dataset.file] || []).filter((s) => !s.hidden).length; $('span', el).textContent = n; });
  const key = 'src:' + set.id + ':' + it.file;
  if (world.dataset.mode !== key) {
    world.innerHTML = `<img class="srcimg" alt="" draggable="false" decoding="async" style="width:${it.w}px;height:${it.h}px"><div class="subs"></div><div class="pendhost"></div><svg class="wsvg" width="${it.w}" height="${it.h}" viewBox="0 0 ${it.w} ${it.h}"></svg>`;
    world.dataset.mode = key;
    const want = key;
    // the small thumbnail shows at once; the sharper preview replaces it when ready
    thumbUrl(set, it).then((u) => { const im = $('.srcimg', world); if (im && world.dataset.mode === want && !im.dataset.big && u) im.src = u; });
    api.engine('preview', { file: joinPath(set.path, it.file), size: it.size, mtime: it.mtime, max: 2048 }, 0).then((r) => { const im = $('.srcimg', world); if (im && world.dataset.mode === want) { im.dataset.big = 1; im.src = api.fileUrl(r.path); } });
    FF.view.fitted = true;
    FF.view.setBounds({ x: 0, y: 0, W: it.w, H: it.h });
  }
  world.dataset.view = FF.srcView;
  const host = $('.subs', world);
  const subs = ff.subjects[it.file] || [];
  const old = new Map($$('.srcsub', host).map((el) => [el.dataset.sid, el]));
  subs.forEach((s, i) => {
    let el = old.get(s.id);
    if (el) old.delete(s.id); else { el = document.createElement('div'); el.className = 'srcsub'; el.dataset.sid = s.id; el.innerHTML = '<img alt="" draggable="false" decoding="async">'; host.appendChild(el); }
    el.classList.toggle('sel', FF.srcSel.has(s.id));
    el.classList.toggle('hid', !!s.hidden);
    el.style.setProperty('--cat', CAT[i % CAT.length]);
    if (s.box) Object.assign(el.style, { left: s.box[0] + 'px', top: s.box[1] + 'px', width: s.box[2] + 'px', height: s.box[3] + 'px', display: '' });
    else el.style.display = 'none';
    ffCut(set, it, s).then((r) => { if (r.url && el.dataset.src !== r.url) { el.dataset.src = r.url; $('img', el).src = r.url; el.style.setProperty('--u', `url("${r.url}")`); } });
  });
  for (const el of old.values()) el.remove();
  for (const id of [...FF.srcSel]) if (!subs.some((s) => s.id === id)) FF.srcSel.delete(id);
  // the piece a pending split would make
  const ph = $('.pendhost', world);
  const pr = FF.pend && FF.pend.res;
  ph.innerHTML = pr && pr.url ? `<div class="pendpiece" style="left:${pr.box[0]}px;top:${pr.box[1]}px;width:${pr.box[2]}px;height:${pr.box[3]}px;--u:url('${pr.url}')"></div>` : '';
  ffDrawUI();
}
function ffShowSource(file) {
  const set = curSet(); if (!set) return;
  const ff = ffState(set);
  if (ff.src === file && FF.mode === 'source') return;
  ff.src = file; FF.srcSel.clear(); FF.pend = null; FF.lasso = null;
  saveProject();
  if (FF.mode !== 'source') return ffSetMode('source');
  ffDraw();
}
function ffBar(set) {
  const bar = $('#ffbar');
  if (!set) { bar.innerHTML = ''; return; }
  const nSel = FF.sel.size, src = FF.mode === 'source';
  const { canvas } = set.scanned ? ffCanvasOf(set) : { canvas: null };
  const tool = (k) => `<button class="${FF.tool === k ? 'on' : ''}" data-tool="${k}" title="${FFTOOLS[k][1]} (${FFTOOLS[k][0]})">${esc(FFTOOLS[k][1].split(' (')[0])}</button>`;
  const lassoTool = FF.tool === 'split' || FF.tool === 'add';
  bar.innerHTML = `<div class="stitle"><b title="${esc(set.path)}">${esc(set.name)}</b><span class="muted small">${canvas && !canvas.empty ? fmtPx(canvas.W, canvas.H) : ''}</span></div>
    <div class="seg"><button data-mode="canvas" class="${!src ? 'on' : ''}" title="Arrange cutouts (Tab)">Canvas</button><button data-mode="source" class="${src ? 'on' : ''}" title="Fix how the subjects were cut out (Tab)">Source images</button></div>
    ${src ? `<div class="seg tools">${['select', 'split', 'add', 'erase', 'restore'].map(tool).join('')}</div>
      ${lassoTool ? `<div class="seg" title="Shape of the selection (Q switches)"><button data-shape="free" class="${FF.shape === 'free' ? 'on' : ''}">Freehand</button><button data-shape="rect" class="${FF.shape === 'rect' ? 'on' : ''}">Rectangle</button></div>` : ''}
      ${FF.tool === 'erase' || FF.tool === 'restore' ? `<span class="small muted">Size</span><input type="range" min="4" max="300" value="${BRUSH.size}" id="ffBsize" style="width:90px" title="[ and ]"><span class="small muted">Hardness</span><input type="range" min="0" max="100" value="${Math.round(BRUSH.hard * 100)}" id="ffBhard" style="width:70px">` : ''}
      <button class="ghost sm" id="ffMerge" ${FF.srcSel.size >= 2 ? '' : 'disabled'} title="Join the selected cutouts into one (Ctrl + click to select several)">Merge</button>
      <button class="ghost sm" id="ffHide" ${FF.srcSel.size ? '' : 'disabled'} title="Hide / show the selected cutouts in the strip below">Hide / show</button>
      <button class="ghost sm" id="ffRedetect" title="Throw away the changes to this image's cutouts and find the subjects again">Find again</button>
      <div class="seg" title="What to show (O switches)"><button data-sv="cut" class="${FF.srcView === 'cut' ? 'on' : ''}" title="Cutouts over a faded original">Cutouts</button><button data-sv="hl" class="${FF.srcView === 'hl' ? 'on' : ''}" title="The original with every cutout highlighted — anything not highlighted is missing">Original + highlight</button><button data-sv="orig" class="${FF.srcView === 'orig' ? 'on' : ''}" title="The original, with only the selected cutout highlighted">Original</button></div>`
    : `<button class="ghost sm" id="ffPlaceAll" title="Put every cutout that isn't on the canvas yet in a row">Place all</button>
      <button class="ghost sm ${FF.crop ? 'on' : ''}" id="ffTrim" title="Crop the canvas (C)">Trim canvas</button>
      <span class="sepv"></span>
      <div class="seg icons" title="Align the selected cutouts">${[['top', 'Align tops'], ['middle', 'Align middles'], ['bottom', 'Align bottoms'], ['left', 'Align left edges'], ['centre', 'Align centres'], ['right', 'Align right edges']].map(([k, t]) => `<button data-align="${k}" ${nSel >= 2 ? '' : 'disabled'} title="${t}">${alignIcon(k)}</button>`).join('')}</div>
      <button class="ghost sm" data-dist="h" ${nSel >= 3 ? '' : 'disabled'} title="Even gaps left to right">Distribute ↔</button>
      <button class="ghost sm" data-dist="v" ${nSel >= 3 ? '' : 'disabled'} title="Even gaps top to bottom">Distribute ↕</button>
      <button class="ghost sm" id="ffArrange" ${nSel >= 2 ? '' : 'disabled'} title="Put the selected cutouts in a row, evenly spaced, bottoms lined up">Auto-arrange</button>
      <span class="sepv"></span>
      <button class="ghost icon sm" id="ffFlip" ${nSel ? '' : 'disabled'} title="Flip">${ic('flip')}</button>
      <button class="ghost icon sm" id="ffFwd" ${nSel ? '' : 'disabled'} title="Bring forward (Ctrl + ])">${ic('up')}</button>
      <button class="ghost icon sm" id="ffBack" ${nSel ? '' : 'disabled'} title="Send back (Ctrl + [)">${ic('down')}</button>
      <button class="ghost icon sm" id="ffDup" ${nSel ? '' : 'disabled'} title="Duplicate (Ctrl + D)">${ic('copy')}</button>
      <button class="ghost icon sm" id="ffDel" ${nSel ? '' : 'disabled'} title="Remove from canvas (Delete)">${ic('trash')}</button>`}
    <div class="grow"></div>
    <button class="ghost sm" id="exactBtn2" title="Render the real result at screen size">${ic('eye')} Exact preview</button>
    <button class="quiet icon sm" id="ffFit" title="Fit (0)">${ic('fit')}</button><button class="quiet sm" id="ffZ100" title="Actual size (Z)">100%</button>`;
  $$('[data-mode]', bar).forEach((b) => (b.onclick = () => ffSetMode(b.dataset.mode)));
  $$('[data-tool]', bar).forEach((b) => (b.onclick = () => ffSetTool(b.dataset.tool)));
  $$('[data-shape]', bar).forEach((b) => (b.onclick = () => { FF.shape = b.dataset.shape; UIP.ffShape = FF.shape; saveUIP(); ffBar(set); }));
  $$('[data-sv]', bar).forEach((b) => (b.onclick = () => { FF.srcView = b.dataset.sv; UIP.ffSrcView = FF.srcView; saveUIP(); ffDraw(); }));
  const on = (id, fn) => { const b = $('#' + id, bar); if (b) b.onclick = fn; };
  const bs = $('#ffBsize', bar); if (bs) bs.oninput = () => (BRUSH.size = +bs.value);
  const bh = $('#ffBhard', bar); if (bh) bh.oninput = () => (BRUSH.hard = +bh.value / 100);
  on('ffMerge', () => ffMergeSel(set));
  on('ffHide', () => { change(set.id, 'Hide / show cutout', () => ffSubjects(set).forEach((x) => { if (FF.srcSel.has(x.subj.id)) x.subj.hidden = !x.subj.hidden; })); ffDraw(); });
  on('ffRedetect', async () => {
    if (!(await confirmBox('Find the subjects again?', 'Splits, merges and brush changes for this image are thrown away. Cutouts that are on the canvas stay where they are if they’re found again.', 'Find again'))) return;
    const f2 = ffState(curSet());
    change(set.id, 'Find subjects again', () => { f2.subjects[f2.src] = []; delete f2.det[f2.src]; });
    FF.pend = null; ffDraw();
  });
  on('ffPlaceAll', () => ffPlaceAll(set));
  on('ffTrim', () => (FF.crop ? ffCropEnd(false) : ffCropStart(set)));
  $$('[data-align]', bar).forEach((b) => (b.onclick = () => ffAlign(set, b.dataset.align)));
  $$('[data-dist]', bar).forEach((b) => (b.onclick = () => ffDistribute(set, b.dataset.dist)));
  on('ffArrange', () => ffArrange(set));
  on('ffFlip', () => ffSelChange(set, 'Flip', (p) => (p.flip = !p.flip)));
  on('ffFwd', () => ffOrder(set, 1)); on('ffBack', () => ffOrder(set, -1));
  on('ffDup', () => ffDuplicate(set)); on('ffDel', () => ffDelete(set));
  on('exactBtn2', exactPreview);
  on('ffFit', () => FF.view.fit());
  on('ffZ100', () => FF.view.actual());
}
function alignIcon(k) {
  const p = { top: 'M4 4h16M8 4v10M16 4v6', middle: 'M4 12h16M8 6v12M16 8v8', bottom: 'M4 20h16M8 20V10M16 20v-6', left: 'M4 4v16M4 8h10M4 16h6', centre: 'M12 4v16M6 8h12M8 16h8', right: 'M20 4v16M20 8H10M20 16h-6' }[k];
  return `<svg class="ic" viewBox="0 0 24 24"><path d="${p}"/></svg>`;
}
function ffSetMode(m) { FF.mode = m; FF.tool = m === 'source' ? FF.tool : 'select'; FF.lasso = null; FF.pend = null; if (m !== 'canvas') FF.crop = null; const w = $('#ffwrap .world'); if (w) w.dataset.mode = ''; ffDraw(); }
function ffSetTool(t) { FF.tool = t; FF.lasso = null; if (t !== 'split') FF.pend = null; ffDraw(); }
// ---------- tray of cutouts ----------
function ffDrawTray(set) {
  const tray = $('#fftray'), ff = ffState(set);
  const counts = new Map(); ff.placed.forEach((p) => counts.set(p.sid, (counts.get(p.sid) || 0) + 1));
  const groups = ffImages(set).map((it) => {
    const subs = (ff.subjects[it.file] || []).filter((s) => !s.hidden || UI.ffShowHidden);
    return `<div class="tgroup"><div class="tglabel" title="${esc(it.file)}">${esc(it.file.replace(/\.[^.]+$/, ''))}</div><div class="tgitems">${subs.map((s) => `<div class="tsub ${counts.get(s.id) ? 'placed' : ''} ${s.hidden ? 'hid' : ''}" data-sid="${s.id}" title="${counts.get(s.id) ? `On the canvas ${counts.get(s.id) > 1 ? counts.get(s.id) + ' times' : ''}` : 'Drag onto the canvas'}"><img alt="" draggable="false" decoding="async">${counts.get(s.id) ? `<b>${counts.get(s.id)}</b>` : ''}</div>`).join('') || `<span class="muted small">${ff.det[it.file] ? 'Nothing found — try lowering the tolerance' : 'Looking…'}</span>`}</div></div>`;
  }).join('');
  const hiddenN = ffSubjects(set).filter((x) => x.subj.hidden).length;
  const html = `<div class="trayhead"><span class="small muted">Cutouts — drag onto the canvas</span>${hiddenN ? `<label class="small muted chk"><input type="checkbox" id="ffShowHid" ${UI.ffShowHidden ? 'checked' : ''}> show ${hiddenN} hidden</label>` : ''}</div><div class="tgroups">${groups}</div>`;
  if (tray._html === html && tray._set === set.id) return;
  const scroll = $('.tgroups', tray) ? $('.tgroups', tray).scrollLeft : 0;
  tray._html = html; tray._set = set.id; tray.innerHTML = html;
  $('.tgroups', tray).scrollLeft = scroll;
  const sh = $('#ffShowHid', tray); if (sh) sh.onchange = () => { UI.ffShowHidden = sh.checked; ffDrawTray(set); };
  $$('.tsub', tray).forEach((el) => {
    const f = ffFind(set, el.dataset.sid);
    if (!f) return;
    ffCut(set, f.it, f.subj).then((r) => { if (r.url) $('img', el).src = r.url; });
    el.addEventListener('pointerdown', (e) => ffTrayDrag(e, set, f));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ctxMenu(e.clientX, e.clientY, [
        { label: 'Add to canvas', run: () => ffPlace(set, f, null) },
        { label: f.subj.hidden ? 'Show in this strip' : 'Hide from this strip', run: () => { change(set.id, 'Hide cutout', () => (f.subj.hidden = !f.subj.hidden)); ffDraw(); } },
        { label: 'Edit in source image', run: () => { ffState(set).src = f.file; FF.srcSel = new Set([f.subj.id]); ffSetMode('source'); } },
      ]);
    });
  });
}
function ffTrayDrag(e, set, f) {
  if (e.button !== 0) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  let ghost = null;
  const mv = (ev) => {
    if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'dragghost contain'; ghost.innerHTML = `<img src="${$(`.tsub[data-sid="${f.subj.id}"] img`).src}">`; document.body.appendChild(ghost); }
    ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
  };
  const up = (ev) => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (!ghost) { // click: select its placements on the canvas
      const ids = ffState(set).placed.filter((p) => p.sid === f.subj.id).map((p) => p.id);
      if (ids.length && FF.mode === 'canvas') { FF.sel = new Set(ids); ffDraw(); }
      return;
    }
    ghost.remove();
    const r = $('#ffwrap').getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
    if (FF.mode !== 'canvas') ffSetMode('canvas');
    ffPlace(set, f, FF.view.toWorld(ev.clientX, ev.clientY));
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function ffPlace(set, f, at) {
  const ff = ffState(set);
  let pt = at;
  if (!pt) { const { canvas } = ffCanvasOf(set); pt = canvas.empty ? [0, 0] : [canvas.x + canvas.W / 2, canvas.y + canvas.H / 2]; }
  const p = { id: uid(), sid: f.subj.id, cx: Math.round(pt[0]), cy: Math.round(pt[1]), s: 1, r: 0, flip: false };
  change(set.id, 'Add cutout', () => ff.placed.push(p));
  FF.sel = new Set([p.id]); FF.primary = p.id;
  ffDraw(); drawSetRow(set);
}
function ffPlaceAll(set) {
  const ff = ffState(set);
  const on = new Set(ff.placed.map((p) => p.sid));
  const todo = ffSubjects(set).filter((x) => !x.subj.hidden && !on.has(x.subj.id) && x.subj.box);
  if (!todo.length) return toast(ffSubjects(set).some((x) => !x.subj.hidden && !x.subj.box) ? 'Still preparing cutouts — try again in a moment' : 'Every cutout is already on the canvas');
  const { canvas } = ffCanvasOf(set);
  const gap = 40;
  let x = canvas.empty ? 0 : canvas.x + canvas.W - (+eff(set).ffPad || 0) + gap;
  const base = canvas.empty ? 0 : canvas.y + canvas.H - (+eff(set).ffPad || 0);
  const add = [];
  for (const t of todo) { const b = t.subj.box; add.push({ id: uid(), sid: t.subj.id, cx: Math.round(x + b[2] / 2), cy: Math.round(base - b[3] / 2), s: 1, r: 0, flip: false }); x += b[2] + gap; }
  change(set.id, 'Place all', () => ff.placed.push(...add));
  FF.sel = new Set(add.map((p) => p.id));
  FF.view.fitted = true;
  ffDraw(); drawSetRow(set);
}

// ---------- canvas actions ----------
function ffSel(set) { return ffState(set).placed.filter((p) => FF.sel.has(p.id)); }
function ffBounds(set, p) { const f = ffFind(set, p.sid); return f && f.subj.box ? FFG.placedBounds(p, f.subj.box) : null; }
function ffSelChange(set, label, fn) { change(set.id, label, () => ffSel(set).forEach(fn)); ffDraw(); }
function ffAlign(set, how) {
  const sel = ffSel(set).map((p) => ({ p, b: ffBounds(set, p) })).filter((x) => x.b);
  if (sel.length < 2) return;
  const t = {
    top: Math.min(...sel.map((x) => x.b.y0)), bottom: Math.max(...sel.map((x) => x.b.y1)), left: Math.min(...sel.map((x) => x.b.x0)), right: Math.max(...sel.map((x) => x.b.x1)),
    middle: sel.reduce((a, x) => a + (x.b.y0 + x.b.y1) / 2, 0) / sel.length, centre: sel.reduce((a, x) => a + (x.b.x0 + x.b.x1) / 2, 0) / sel.length,
  }[how];
  change(set.id, 'Align ' + how, () => sel.forEach(({ p, b }) => {
    if (how === 'top') p.cy += t - b.y0; else if (how === 'bottom') p.cy += t - b.y1; else if (how === 'middle') p.cy = t;
    else if (how === 'left') p.cx += t - b.x0; else if (how === 'right') p.cx += t - b.x1; else p.cx = t;
  }));
  ffDraw();
}
function ffDistribute(set, dir) {
  const h = dir === 'h';
  const sel = ffSel(set).map((p) => ({ p, b: ffBounds(set, p) })).filter((x) => x.b).sort((a, b) => (h ? a.p.cx - b.p.cx : a.p.cy - b.p.cy));
  if (sel.length < 3) return;
  const lo = h ? sel[0].b.x0 : sel[0].b.y0, hi = h ? sel[sel.length - 1].b.x1 : sel[sel.length - 1].b.y1;
  const total = sel.reduce((a, x) => a + (h ? x.b.x1 - x.b.x0 : x.b.y1 - x.b.y0), 0);
  const gap = (hi - lo - total) / (sel.length - 1);
  change(set.id, 'Distribute', () => { let pos = lo; for (const { p, b } of sel) { const size = h ? b.x1 - b.x0 : b.y1 - b.y0; if (h) p.cx = pos + size / 2; else p.cy = pos + size / 2; pos += size + gap; } });
  ffDraw();
}
function ffArrange(set) {
  const sel = ffSel(set).map((p) => ({ p, b: ffBounds(set, p) })).filter((x) => x.b).sort((a, b) => a.p.cx - b.p.cx);
  if (sel.length < 2) return;
  const gap = 40, base = Math.max(...sel.map((x) => x.b.y1));
  let x = Math.min(...sel.map((x) => x.b.x0));
  change(set.id, 'Auto-arrange', () => { for (const { p, b } of sel) { const w = b.x1 - b.x0, hh = b.y1 - b.y0; p.cx = x + w / 2; p.cy = base - hh / 2; x += w + gap; } });
  ffDraw();
}
function ffOrder(set, d) {
  const ff = ffState(set);
  change(set.id, d > 0 ? 'Bring forward' : 'Send back', () => {
    const arr = ff.placed;
    const idx = arr.map((p, i) => (FF.sel.has(p.id) ? i : -1)).filter((i) => i >= 0);
    if (d > 0) for (const i of idx.reverse()) { if (i < arr.length - 1 && !FF.sel.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
    else for (const i of idx) { if (i > 0 && !FF.sel.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; }
  });
  ffDraw();
}
function ffDuplicate(set) {
  const add = ffSel(set).map((p) => ({ ...p, id: uid(), cx: p.cx + 30, cy: p.cy + 30 }));
  if (!add.length) return;
  change(set.id, 'Duplicate', () => ffState(set).placed.push(...add));
  FF.sel = new Set(add.map((p) => p.id)); ffDraw(); drawSetRow(set);
}
function ffDelete(set) {
  if (!FF.sel.size) return;
  change(set.id, 'Remove from canvas', () => { const ff = ffState(set); ff.placed = ff.placed.filter((p) => !FF.sel.has(p.id)); });
  FF.sel.clear(); ffDraw(); drawSetRow(set);
}
function ffMergeSel(set) {
  const ff = ffState(set), list = (ff.subjects[ff.src] || []).filter((s) => FF.srcSel.has(s.id));
  if (list.length < 2) return;
  const keep = list[0];
  change(set.id, 'Merge cutouts', () => {
    const merged = { id: keep.id, def: { parts: list.map((s) => s.def), ops: [] } };
    const gone = new Set(list.slice(1).map((s) => s.id));
    ff.subjects[ff.src] = ff.subjects[ff.src].filter((s) => !gone.has(s.id)).map((s) => (s.id === keep.id ? merged : s));
    ff.placed = ff.placed.filter((p) => !gone.has(p.sid));
  });
  FF.srcSel = new Set([keep.id]);
  ffDraw();
}

// ---------- pointer handling ----------
function ffDown(e) {
  if (e.button !== 0 || FF.view.space) return;
  const set = curSet(); if (!set) return;
  if (FF.mode === 'source') return ffSourceDown(e, set);
  if (FF.crop) return ffCropDown(e, set);
  const v = FF.view, ff = ffState(set);
  const h = e.target.closest('[data-h]'), item = e.target.closest('.ffitem');
  const [wx, wy] = v.toWorld(e.clientX, e.clientY);
  const before = snap(set.id);
  if (h) {
    const p = ff.placed.find((q) => q.id === h.dataset.pid); if (!p) return;
    const sel = ffSel(set), start = sel.map((q) => ({ q, s: q.s, r: q.r || 0 }));
    const d0 = Math.hypot(wx - p.cx, wy - p.cy) || 1, a0 = Math.atan2(wy - p.cy, wx - p.cx);
    FF.drag = 'h';
    const mv = (ev) => {
      const [x, y] = v.toWorld(ev.clientX, ev.clientY);
      if (h.dataset.h === 'sc') { const f = Math.max(0.02, Math.hypot(x - p.cx, y - p.cy) / d0); start.forEach(({ q, s }) => (q.s = Math.max(0.01, +(s * f).toFixed(4)))); }
      else { let da = ((Math.atan2(y - p.cy, x - p.cx) - a0) * 180) / Math.PI; start.forEach(({ q, r }) => { let n = r + da; if (ev.shiftKey) n = Math.round(n / 15) * 15; q.r = +(((n + 540) % 360) - 180).toFixed(2); }); }
      ffDrawCanvas(set);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); FF.drag = null; commitFrom(set.id, h.dataset.h === 'sc' ? 'Resize' : 'Rotate', before); ffDraw(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  if (item) {
    const id = item.dataset.pid;
    if (e.ctrlKey || e.shiftKey) { if (FF.sel.has(id)) FF.sel.delete(id); else FF.sel.add(id); }
    else if (!FF.sel.has(id)) FF.sel = new Set([id]);
    FF.primary = id;
    const sel = ffSel(set), start = sel.map((q) => ({ q, cx: q.cx, cy: q.cy }));
    const prim = ff.placed.find((q) => q.id === id), pb0 = ffBounds(set, prim);
    // snap targets: other cutouts and the canvas
    const others = ff.placed.filter((q) => !FF.sel.has(q.id)).map((q) => ffBounds(set, q)).filter(Boolean);
    const xs = [], ys = [];
    for (const b of others) { xs.push(b.x0, (b.x0 + b.x1) / 2, b.x1); ys.push(b.y0, (b.y0 + b.y1) / 2, b.y1); }
    const e2 = eff(set);
    if (e2.ffCanvas === 'fixed') { xs.push(0, e2.ffW / 2, e2.ffW); ys.push(0, e2.ffH / 2, e2.ffH); }
    let moved = false;
    FF.drag = 'move';
    const mv = (ev) => {
      const [x, y] = v.toWorld(ev.clientX, ev.clientY);
      let dx = x - wx, dy = y - wy;
      if (!moved && Math.hypot(dx * v.z, dy * v.z) < 3) return;
      moved = true;
      FF.guides = [];
      if (pb0 && !ev.altKey) {
        const thr = 7 / v.z;
        const mx = [pb0.x0 + dx, (pb0.x0 + pb0.x1) / 2 + dx, pb0.x1 + dx], my = [pb0.y0 + dy, (pb0.y0 + pb0.y1) / 2 + dy, pb0.y1 + dy];
        let bx = null, by = null;
        for (const m of mx) for (const t of xs) if (Math.abs(t - m) < thr && (!bx || Math.abs(t - m) < Math.abs(bx.d))) bx = { d: t - m, t };
        for (const m of my) for (const t of ys) if (Math.abs(t - m) < thr && (!by || Math.abs(t - m) < Math.abs(by.d))) by = { d: t - m, t };
        if (bx) { dx += bx.d; FF.guides.push({ x: bx.t }); }
        if (by) { dy += by.d; FF.guides.push({ y: by.t }); }
      }
      start.forEach(({ q, cx, cy }) => { q.cx = Math.round((cx + dx) * 10) / 10; q.cy = Math.round((cy + dy) * 10) / 10; });
      ffDrawCanvas(set);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); FF.drag = null; FF.guides = []; if (moved) commitFrom(set.id, 'Move', before); ffDraw(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    ffDrawUI(); ffBar(set);
    return;
  }
  // outside the canvas: move the view; on the canvas: draw a box to select
  if (v.outside(e.clientX, e.clientY)) { v.pan(e); return; }
  if (!e.ctrlKey && !e.shiftKey) FF.sel.clear();
  const keep = new Set(FF.sel);
  FF.marquee = [wx, wy, wx, wy];
  const mv = (ev) => {
    const [x, y] = v.toWorld(ev.clientX, ev.clientY);
    FF.marquee = [wx, wy, x, y];
    const [x0, x1] = [Math.min(wx, x), Math.max(wx, x)], [y0, y1] = [Math.min(wy, y), Math.max(wy, y)];
    FF.sel = new Set(keep);
    for (const p of ff.placed) { const b = ffBounds(set, p); if (b && b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1) FF.sel.add(p.id); }
    ffDrawCanvas(set);
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); FF.marquee = null; ffDraw(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
  ffDraw();
}

function ffSourceDown(e, set) {
  const v = FF.view, ff = ffState(set), subs = ff.subjects[ff.src] || [];
  const [wx, wy] = v.toWorld(e.clientX, e.clientY);
  const hitEl = e.target.closest('.srcsub');
  const hit = hitEl ? subs.find((s) => s.id === hitEl.dataset.sid) : null;
  const pd = FF.pend;
  // drag the pending selection to move it
  if (FF.tool === 'split' && pd && pd.pts && pointInPoly(wx, wy, pd.pts)) {
    const p0 = pd.pts.map((p) => p.slice());
    const mv = (ev) => { const [x, y] = v.toWorld(ev.clientX, ev.clientY); pd.pts = p0.map(([a, b]) => [Math.round(a + x - wx), Math.round(b + y - wy)]); pd.res = null; ffDrawSource(set); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); ffPendUpdate(set); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  if (v.outside(e.clientX, e.clientY) && !hitEl) { v.pan(e); return; }
  if (FF.tool === 'select') {
    if (hit) { if (e.ctrlKey || e.shiftKey) { if (FF.srcSel.has(hit.id)) FF.srcSel.delete(hit.id); else FF.srcSel.add(hit.id); } else FF.srcSel = new Set([hit.id]); }
    else FF.srcSel.clear();
    ffDraw(); return;
  }
  if (FF.tool === 'erase' || FF.tool === 'restore') {
    let target = hit && (!FF.srcSel.size || FF.srcSel.has(hit.id)) ? hit : subs.find((s) => FF.srcSel.has(s.id));
    if (!target) return toast('Click a cutout first (Select tool), then paint on it');
    FF.srcSel = new Set([target.id]);
    const r = BRUSH.size / 2 / v.z;
    const pts = [[wx, wy]];
    const svg = $('#ffwrap .wsvg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'stroke ' + FF.tool); path.setAttribute('stroke-width', 2 * r);
    svg.appendChild(path);
    const draw = () => path.setAttribute('d', svgPath(pts.length === 1 ? [pts[0], [pts[0][0] + 0.01, pts[0][1]]] : pts));
    draw();
    const mv = (ev) => { pts.push(v.toWorld(ev.clientX, ev.clientY)); draw(); brushCursor($('#ffwrap'), true, ev.clientX, ev.clientY); };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      const op = { t: 'brush', m: FF.tool, r: +r.toFixed(2), h: BRUSH.hard, pts: simplify(pts, Math.max(1, r / 4)).map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]) };
      change(set.id, FF.tool === 'erase' ? 'Erase' : 'Restore', () => target.def.ops.push(op));
      ffCut(set, ffImages(set).find((i) => i.file === ff.src), target).then(() => path.remove());
      ffDraw();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  // split / add region: a click picks a separate piece, a drag draws a selection
  const rect = FF.shape === 'rect';
  let moved = false;
  FF.lasso = [[wx, wy]];
  const mv = (ev) => {
    const [x, y] = v.toWorld(ev.clientX, ev.clientY);
    if (!moved && Math.hypot((x - wx) * v.z, (y - wy) * v.z) < 4) return;
    moved = true;
    if (rect) FF.lasso = [[wx, wy], [x, wy], [x, y], [wx, y]]; else FF.lasso.push([x, y]);
    ffDrawUI();
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    const raw = FF.lasso; FF.lasso = null;
    if (!moved) {
      ffDrawUI();
      if (FF.tool !== 'split') return toast('Drag to draw around the area to add');
      const target = hit && FF.srcSel.has(hit.id) ? hit : hit || subs.find((s) => FF.srcSel.has(s.id));
      if (!target) return toast('Click on a separate piece of a cutout to split it off, or drag to draw around part of one');
      FF.pend = { sid: target.id, pt: [Math.round(wx), Math.round(wy)], r: Math.max(2, Math.round(10 / v.z)) };
      FF.srcSel = new Set([target.id]);
      ffPendUpdate(set);
      return;
    }
    const pts = (rect ? raw : simplify(raw, 2 / v.z)).map(([x, y]) => [Math.round(x), Math.round(y)]);
    if (pts.length < 3) { ffDrawUI(); return; }
    if (FF.tool === 'add') {
      const s = { id: uid(), def: { parts: [], ops: [{ t: 'poly', m: 'add', pts }] } };
      change(set.id, 'Add region', () => ffState(set).subjects[ff.src].push(s));
      FF.srcSel = new Set([s.id]);
      ffDraw(); return;
    }
    // which cutout: the one it was started on, else the one the shape covers most (the selected one wins a tie)
    let target = hit;
    if (!target) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const sb = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
      let best = 0;
      for (const s of subs) {
        if (!s.box || s.hidden) continue;
        const x0 = Math.max(sb[0], s.box[0]), y0 = Math.max(sb[1], s.box[1]), x1 = Math.min(sb[0] + sb[2], s.box[0] + s.box[2]), y1 = Math.min(sb[1] + sb[3], s.box[1] + s.box[3]);
        const ov = Math.max(0, x1 - x0) * Math.max(0, y1 - y0) * (FF.srcSel.has(s.id) ? 1.05 : 1);
        if (ov > best) { best = ov; target = s; }
      }
    }
    if (!target) { toast('Draw around part of a cutout to split it off'); ffDrawUI(); return; }
    FF.pend = { sid: target.id, pts };
    FF.srcSel = new Set([target.id]);
    ffPendUpdate(set);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

// ---------- pending split selection ----------
function ffPendOps(pd) {
  return pd.pts ? [{ t: 'poly', m: 'keep', pts: pd.pts }, { t: 'poly', m: 'cut', pts: pd.pts }] : [{ t: 'island', m: 'keep', pt: pd.pt, r: pd.r }, { t: 'island', m: 'cut', pt: pd.pt, r: pd.r }];
}
function ffPendTarget(set) { const pd = FF.pend; if (!pd) return null; const f = ffFind(set, pd.sid); return f || null; }
function ffPendUpdate(set) {
  const pd = FF.pend, f = ffPendTarget(set);
  if (!pd || !f) { FF.pend = null; ffDraw(); return; }
  const [keep] = ffPendOps(pd);
  const def = { parts: JSON.parse(JSON.stringify(f.subj.def.parts)), ops: [...JSON.parse(JSON.stringify(f.subj.def.ops)), keep] };
  pd.res = null; pd.busy = true;
  ffDraw();
  ffCutDef(set, f.it, def, 0).then((r) => { if (FF.pend !== pd) return; pd.busy = false; pd.res = r; ffDraw(); });
}
function ffPendApply(set, copy) {
  const pd = FF.pend, f = ffPendTarget(set);
  if (!pd || !f) return;
  if (pd.busy) return toast('Still working out the selection…');
  if (!pd.res || pd.res.empty) return toast('None of the cutout is inside the selection');
  const [keep, cut] = ffPendOps(pd);
  const piece = { id: uid(), def: { parts: JSON.parse(JSON.stringify(f.subj.def.parts)), ops: [...JSON.parse(JSON.stringify(f.subj.def.ops)), keep] } };
  change(set.id, copy ? 'Copy to new cutout' : 'Split cutout', () => {
    const arr = ffState(set).subjects[f.file];
    if (!copy) f.subj.def.ops.push(cut);
    arr.splice(arr.indexOf(f.subj) + 1, 0, piece);
  });
  FF.pend = null; FF.srcSel = new Set([piece.id]);
  toast(copy ? 'Copied to a new cutout — the original is unchanged' : 'Split into two cutouts');
  ffDraw();
}
function ffPendBar(set) {
  const bar = $('#ffpend'); if (!bar) return;
  const pd = FF.pend, c = FF.crop;
  if (c && FF.mode === 'canvas') {
    bar.classList.remove('hidden');
    if (bar.dataset.kind !== 'crop') {
      bar.dataset.kind = 'crop';
      bar.innerHTML = `<b>Trim canvas</b><select id="cropRatio" title="Shape">${[['free', 'Free'], ['orig', 'Current shape'], ['1', '1 : 1'], ['1.3333', '4 : 3'], ['0.75', '3 : 4'], ['1.5', '3 : 2'], ['0.6667', '2 : 3'], ['1.7778', '16 : 9'], ['0.5625', '9 : 16']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <input type="number" id="cropW" min="1" title="Width (px)"><span class="muted">×</span><input type="number" id="cropH" min="1" title="Height (px)">
        <button class="ghost sm" id="cropFit" title="Back to the cutouts plus the space-around setting">Fit to cutouts</button>
        <button class="primary" id="cropOk" title="Enter">Apply</button><button class="ghost" id="cropNo" title="Esc">Cancel</button>`;
      $('#cropRatio').onchange = (e) => { const s = curSet(); c.ratio = e.target.value === 'orig' ? c.W / c.H : e.target.value === 'free' ? 0 : +e.target.value; if (c.ratio) { const cx = c.x + c.W / 2; c.W = Math.round(c.H * c.ratio); c.x = Math.round(cx - c.W / 2); } ffDrawUI(); };
      $('#cropW').onchange = (e) => { c.W = Math.max(1, Math.round(+e.target.value || c.W)); if (c.ratio) c.H = Math.round(c.W / c.ratio); ffDrawUI(); };
      $('#cropH').onchange = (e) => { c.H = Math.max(1, Math.round(+e.target.value || c.H)); if (c.ratio) c.W = Math.round(c.H * c.ratio); ffDrawUI(); };
      $('#cropFit').onclick = () => { const s = curSet(); const e2 = Object.assign({}, eff(s), { ffCanvas: 'auto' }); const { placed } = ffCanvasOf(s); const r = FFG.ffCanvas(placed.map((x) => x.p), (p) => ffFind(s, p.sid).subj.box, e2); Object.assign(c, { x: r.x, y: r.y, W: r.W, H: r.H }); ffDrawUI(); };
      $('#cropOk').onclick = () => ffCropEnd(true);
      $('#cropNo').onclick = () => ffCropEnd(false);
    }
    if (document.activeElement !== $('#cropW')) $('#cropW').value = Math.round(c.W);
    if (document.activeElement !== $('#cropH')) $('#cropH').value = Math.round(c.H);
    return;
  }
  if (!pd || FF.mode !== 'source') { bar.classList.add('hidden'); bar.dataset.kind = ''; bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  const kind = 'pend' + (pd.busy ? 1 : 0) + (pd.res && pd.res.empty ? 'e' : '') + (pd.pts ? 'p' : 'i');
  if (bar.dataset.kind === kind) return;
  bar.dataset.kind = kind;
  bar.innerHTML = `<span>${pd.busy ? 'Working out the selection…' : pd.res && pd.res.empty ? '<span class="badtx">None of the cutout is inside the selection</span>' : pd.pts ? 'Highlighted part will be split off. <span class="muted">Drag the outline to move it.</span>' : 'This separate piece will be split off.'}</span>
    <button class="primary" id="pendCut" title="Enter">Cut into two</button><button id="pendCopy" title="C">Copy to new cutout</button><button class="ghost" id="pendNo" title="Esc">Cancel</button>`;
  $('#pendCut').onclick = () => ffPendApply(curSet(), false);
  $('#pendCopy').onclick = () => ffPendApply(curSet(), true);
  $('#pendNo').onclick = () => { FF.pend = null; ffDraw(); };
}

// ---------- trim canvas ----------
function ffCropStart(set) {
  const { canvas } = ffCanvasOf(set);
  if (canvas.empty) return toast('Put some cutouts on the canvas first');
  FF.crop = { x: canvas.x, y: canvas.y, W: canvas.W, H: canvas.H, ratio: 0 };
  FF.sel.clear();
  $('#ffpend').dataset.kind = '';
  ffDraw();
}
function ffCropEnd(apply) {
  const set = curSet(), c = FF.crop;
  FF.crop = null;
  if (apply && set && c) {
    const x = Math.round(c.x), y = Math.round(c.y), W = Math.max(1, Math.round(c.W)), H = Math.max(1, Math.round(c.H));
    change(set.id, 'Trim canvas', () => {
      Object.assign(set.overrides, { ffCanvas: 'fixed', ffW: W, ffH: H });
      ffState(set).placed.forEach((p) => { p.cx -= x; p.cy -= y; });
    });
    FF.view.fitted = true;
    toast(`Canvas trimmed to ${W} × ${H} px. Set “Size” back to “Fit what’s placed” to undo the trim later.`, 3500);
    drawAll(); return;
  }
  ffDraw();
}
function ffCropDown(e, set) {
  const v = FF.view, c = FF.crop;
  const h = e.target.closest('[data-ch]');
  const [wx, wy] = v.toWorld(e.clientX, e.clientY);
  const inside = wx >= c.x && wy >= c.y && wx <= c.x + c.W && wy <= c.y + c.H;
  if (!h && !inside) { v.pan(e); return; }
  const c0 = { ...c }, k = h ? h.dataset.ch : 'move';
  const mv = (ev) => {
    const [x, y] = v.toWorld(ev.clientX, ev.clientY), dx = x - wx, dy = y - wy;
    if (k === 'move') { c.x = c0.x + dx; c.y = c0.y + dy; }
    else {
      let x0 = c0.x, y0 = c0.y, x1 = c0.x + c0.W, y1 = c0.y + c0.H;
      if (k.includes('w')) x0 = Math.min(x1 - 1, x0 + dx);
      if (k.includes('e')) x1 = Math.max(x0 + 1, x1 + dx);
      if (k.includes('n')) y0 = Math.min(y1 - 1, y0 + dy);
      if (k.includes('s')) y1 = Math.max(y0 + 1, y1 + dy);
      let W = x1 - x0, H = y1 - y0;
      if (c.ratio) {
        if (k === 'n' || k === 's') { W = H * c.ratio; x0 = c0.x + (c0.W - W) / 2; }
        else if (k === 'e' || k === 'w') { H = W / c.ratio; y0 = c0.y + (c0.H - H) / 2; }
        else { H = W / c.ratio; if (k.includes('n')) y0 = y1 - H; }
        if (k.includes('w') && (k.length === 2)) x0 = x1 - W;
      }
      Object.assign(c, { x: x0, y: y0, W, H });
    }
    ffDrawUI();
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); c.x = Math.round(c.x); c.y = Math.round(c.y); c.W = Math.round(c.W); c.H = Math.round(c.H); ffDrawUI(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function ffMenu(e) {
  e.preventDefault();
  const set = curSet(); if (!set || FF.mode !== 'canvas') return;
  const item = e.target.closest('.ffitem');
  if (item && !FF.sel.has(item.dataset.pid)) { FF.sel = new Set([item.dataset.pid]); ffDraw(); }
  if (!FF.sel.size) return ctxMenu(e.clientX, e.clientY, [{ label: 'Place all cutouts', run: () => ffPlaceAll(set) }, { label: 'Fit to window', key: '0', run: () => FF.view.fit() }]);
  const one = ffSel(set)[0];
  ctxMenu(e.clientX, e.clientY, [
    { label: 'Flip', run: () => ffSelChange(set, 'Flip', (p) => (p.flip = !p.flip)) },
    { label: 'Reset size and angle', run: () => ffSelChange(set, 'Reset size', (p) => { p.s = 1; p.r = 0; }) },
    { label: 'Set size…', run: async () => { const v = await ask('Size (%)', { value: Math.round(one.s * 100) }); if (v && +v > 0) ffSelChange(set, 'Set size', (p) => (p.s = +v / 100)); } },
    '-',
    { label: 'Bring to front', run: () => { change(set.id, 'Bring to front', () => { const ff = ffState(set); ff.placed = [...ff.placed.filter((p) => !FF.sel.has(p.id)), ...ff.placed.filter((p) => FF.sel.has(p.id))]; }); ffDraw(); } },
    { label: 'Bring forward', key: 'Ctrl+]', run: () => ffOrder(set, 1) },
    { label: 'Send back', key: 'Ctrl+[', run: () => ffOrder(set, -1) },
    { label: 'Send to back', run: () => { change(set.id, 'Send to back', () => { const ff = ffState(set); ff.placed = [...ff.placed.filter((p) => FF.sel.has(p.id)), ...ff.placed.filter((p) => !FF.sel.has(p.id))]; }); ffDraw(); } },
    '-',
    { label: 'Duplicate', key: 'Ctrl+D', run: () => ffDuplicate(set) },
    { label: 'Edit cutout in source image', run: () => { const f = ffFind(set, one.sid); ffState(set).src = f.file; FF.srcSel = new Set([one.sid]); ffSetMode('source'); } },
    { label: 'Remove from canvas', key: 'Del', run: () => ffDelete(set) },
  ]);
}

function ffKey(e) {
  const set = curSet(); if (!set) return false;
  const k = e.key, lk = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (FF.crop) {
    if (k === 'Enter') { ffCropEnd(true); return true; }
    if (k === 'Escape' || lk === 'c') { ffCropEnd(false); return true; }
    if (k === '0') { FF.view.fit(); return true; }
    return k === 'Tab';
  }
  if (k === 'Tab') { ffSetMode(FF.mode === 'canvas' ? 'source' : 'canvas'); return true; }
  if (k === '0' && !ctrl) { FF.view.fit(); return true; }
  if (lk === 'z' && !ctrl) { FF.view.actual(); return true; }
  if ((k === '+' || k === '=') && !ctrl) { FF.view.zoomAt(1.25); return true; }
  if (k === '-' && !ctrl) { FF.view.zoomAt(0.8); return true; }
  if (FF.mode === 'source') {
    if (FF.pend) {
      if (k === 'Enter') { ffPendApply(set, false); return true; }
      if (lk === 'c' && !ctrl) { ffPendApply(set, true); return true; }
      if (k === 'Escape') { FF.pend = null; ffDraw(); return true; }
    }
    const t = { v: 'select', x: 'split', a: 'add', e: 'erase', r: 'restore' }[lk];
    if (t && !ctrl) { ffSetTool(t); return true; }
    if (lk === 'q' && !ctrl) { FF.shape = FF.shape === 'rect' ? 'free' : 'rect'; UIP.ffShape = FF.shape; saveUIP(); ffBar(set); return true; }
    if (lk === 'o' && !ctrl) { FF.srcView = { cut: 'hl', hl: 'orig', orig: 'cut' }[FF.srcView]; UIP.ffSrcView = FF.srcView; saveUIP(); ffDraw(); return true; }
    if (k === '[' || k === ']') { BRUSH.size = clamp(Math.round(BRUSH.size * (k === ']' ? 1.2 : 1 / 1.2)), 4, 400); ffBar(set); return true; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { const im = ffImages(set), i = im.findIndex((x) => x.file === ffState(set).src); const n = im[clamp(i + (k === 'ArrowRight' ? 1 : -1), 0, im.length - 1)]; if (n) ffShowSource(n.file); return true; }
    if (k === 'Escape') { FF.srcSel.clear(); FF.lasso = null; ffDraw(); return true; }
    return false;
  }
  if (lk === 'c' && !ctrl) { ffCropStart(set); return true; }
  if (ctrl && lk === 'd') { ffDuplicate(set); return true; }
  if (ctrl && k === ']') { ffOrder(set, 1); return true; }
  if (ctrl && k === '[') { ffOrder(set, -1); return true; }
  if (k === 'Delete' || k === 'Backspace') { ffDelete(set); return true; }
  if (k === 'Escape' && FF.sel.size) { FF.sel.clear(); ffDraw(); return true; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
  if (arrows && FF.sel.size && !ctrl) { const d = e.shiftKey ? 10 : 1; change(set.id, 'Nudge', () => ffSel(set).forEach((p) => { p.cx += arrows[0] * d; p.cy += arrows[1] * d; }), 'nudge'); ffDraw(); return true; }
  return false;
}
