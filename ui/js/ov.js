// ---------- Overlay tab ----------
const OV = { view: null, sel: null, tool: 'move', mode: 'normal', showMask: false, busy: new Map(), comp: new Map(), prev: new Map(), raf: 0, pp: null };
const OVTOOLS = { move: ['V', 'Move / resize'], erase: ['E', 'Erase brush'], restore: ['R', 'Restore brush'], lasso: ['X', 'Erase by drawing around'] };
const G2 = BIMGeom;

function ovState(set) { if (!set.ov) set.ov = { base: null, layers: [] }; return set.ov; }
const ovImages = (set) => set.items.filter((i) => !i.blank && i.w);
const ovItem = (set, file) => set.items.find((i) => i.file === file);
// keep the layer list in step with the folder
function ovSync(set) {
  const ov = ovState(set), files = ovImages(set).map((i) => i.file);
  if (ov.base && !files.includes(ov.base)) ov.base = null;
  ov.layers = ov.layers.filter((l) => files.includes(l.file) && l.file !== ov.base);
  for (const f of files) if (f !== ov.base && ov.base && !ov.layers.some((l) => l.file === f)) ov.layers.push({ file: f, m: null, status: 'pending', opacity: 1, visible: true, locked: false, color: null, feather: null, ops: [] });
}
const ovSel = (set) => ovState(set).layers.find((l) => l.file === OV.sel) || null;
function ovBusy(set, msg) { if (msg) OV.busy.set(set.id, msg); else OV.busy.delete(set.id); }
function ovSoon() { if (OV.raf) return; OV.raf = requestAnimationFrame(() => { OV.raf = 0; if (UI.tab === 'overlay') { drawStage(); drawPanel(); drawExportBar(); } }); }
const engFile = (set, it) => ({ file: joinPath(set.path, it.file), w: it.w, h: it.h, size: it.size, mtime: it.mtime });

// default spot for a close-up that couldn't be matched: centred, a third of the width
function ovDefaultM(set, l) {
  const b = ovItem(set, ovState(set).base), c = ovItem(set, l.file);
  const s = (b.w / 3) / c.w;
  return G2.simFromParts(b.w / 2, b.h / 2, s, 0, c.w, c.h);
}

// find the base and line everything up
const OVRUN = new Set();
async function ovEnsure(set) {
  if (OVRUN.has(set.id) || !set.scanned || set.missing) return;
  const ov = ovState(set);
  const imgs = ovImages(set);
  if (imgs.length < 1) return;
  ovSync(set);
  if (ov.base && !ov.layers.some((l) => l.status === 'pending')) return;
  OVRUN.add(set.id);
  let stop = false;
  const needBase = !ov.base && imgs.length > 1;
  const job = jobStart({ label: 'Lining up close-ups', short: 'Lining up', name: set.name, total: null, stop: () => { stop = true; job.update({ extra: 'stopping after this one' }); } });
  let n = 0, todo = [];
  try {
    if (!ov.base) {
      if (imgs.length === 1) ov.base = imgs[0].file;
      else {
        ovBusy(set, 'Finding the wide shot…');
        job.update({ extra: 'finding the wide shot' });
        const r = await api.engine('ovGuessBase', { items: imgs.map((i) => engFile(set, i)) });
        ov.base = baseName(r.base);
      }
      ovSync(set); saveProject(); ovSoon();
    }
    ovSync(set);
    todo = ov.layers.filter((l) => l.status === 'pending');
    const step0 = needBase ? 1 : 0;
    job.update({ total: todo.length + step0, done: step0, extra: '' });
    for (const l of todo) {
      if (stop) break;
      ovBusy(set, `Lining up ${n + 1} of ${todo.length}…`);
      job.update({ done: step0 + n, extra: l.file });
      await ovAlignLayer(set, l, false);
      n++;
      job.update({ done: step0 + n });
      saveProject(); ovSoon();
    }
    job.finish({ state: stop ? 'stopped' : 'done', message: `${set.name} · ${n} close-up${n === 1 ? '' : 's'} lined up` });
  } catch (err) { job.finish({ state: 'error', message: err.message }); toast('Lining up failed: ' + err.message); }
  OVRUN.delete(set.id);
  ovBusy(set, '');
  ovSoon();
}
async function ovRealign(set, l) {
  const job = jobStart({ label: 'Lining up a close-up', short: 'Lining up', name: l.file, total: 1 });
  ovBusy(set, 'Lining up…');
  try { await ovAlignLayer(set, l, true); job.finish({ message: l.file }); } catch (err) { job.finish({ state: 'error', message: err.message }); toast('Lining up failed: ' + err.message); }
  ovBusy(set, ''); ovDraw(); drawPanel();
}
async function ovAlignLayer(set, l, undoable) {
  const b = ovItem(set, ovState(set).base), c = ovItem(set, l.file);
  const r = await api.engine('ovAlign', { base: engFile(set, b), close: engFile(set, c), kind: eff(set).ovKind });
  const apply = () => {
    if (r.ok) Object.assign(l, { m: r.m, status: 'ok', conf: r.conf, inliers: r.inliers, reason: null });
    else Object.assign(l, { m: l.m || ovDefaultM(set, l), status: 'failed', conf: 0, reason: r.reason });
  };
  if (undoable) change(set.id, 'Line up again', apply); else { apply(); dirtyStatus(set.id); }
  if (!r.ok) toast(`${l.file}: couldn't find matching details. Line it up by hand or with points.`, 4500);
  return r;
}
async function ovGainsFor(set, l) {
  const key = JSON.stringify(l.m.map((v) => +v.toFixed(4)));
  if (l.gains && l.gainsKey === key) return l.gains;
  const b = ovItem(set, ovState(set).base), c = ovItem(set, l.file);
  const r = await api.engine('ovGains', { base: engFile(set, b), close: engFile(set, c), m: l.m });
  l.gains = r.gains; l.gainsKey = key; dirtyStatus(set.id); saveProject();
  return l.gains;
}
const ovColourOn = (l, e) => (l.color == null ? !!e.ovColor : !!l.color);
const ovFeather = (l, e) => (l.feather == null ? +e.ovFeather || 0 : +l.feather);

// ---------- export ----------
function ovJob(set) {
  const e = eff(set), ov = ovState(set), b = ov.base && ovItem(set, ov.base);
  if (!b) return { setId: set.id, kind: 'overlay', empty: true, dir: set.path, settings: e, payload: {}, size: { W: 1, H: 1 } };
  const layers = ov.layers.filter((l) => l.visible !== false && l.m).map((l) => { const it = ovItem(set, l.file); return { file: joinPath(set.path, l.file), w: it.w, h: it.h, mtime: it.mtime, m: l.m, opacity: l.opacity ?? 1, gains: ovColourOn(l, e) ? l.gains || null : null, feather: ovFeather(l, e), ops: l.ops || [] }; });
  const k = G2.ovOutScale(e, b, layers);
  return { setId: set.id, kind: 'overlay', dir: set.path, settings: e, manualName: set.manualName || '', firstName: b.file, count: layers.length + 1, layoutLabel: 'overlay', prevOut: set.exported && set.exported.path,
    payload: { base: { file: joinPath(set.path, b.file), w: b.w, h: b.h }, layers, k }, size: { W: Math.round(b.w * k), H: Math.round(b.h * k) } };
}
async function ovPrepare(set) {
  await ovEnsure(set);
  const e = eff(set);
  for (const l of ovState(set).layers) if (l.m && l.visible !== false && ovColourOn(l, e)) await ovGainsFor(set, l);
}

// ---------- drawing ----------
function ovInit() {
  $('#ovStage').innerHTML = `<div class="tbar" id="ovbar"></div>
    <div class="pzwrap" id="ovwrap"><div class="world"></div><div class="uilayer"></div><div class="emptymsg hidden" id="ovempty"></div></div>
    <div id="ppview" class="hidden"></div>`;
  OV.view = new PanZoom($('#ovwrap'), () => ovDrawUI());
  PanZoom.all.push(OV.view);
  $('#ovwrap').addEventListener('pointerdown', ovDown);
  $('#ovwrap').addEventListener('pointermove', (e) => brushCursor($('#ovwrap'), OV.tool === 'erase' || OV.tool === 'restore', e.clientX, e.clientY));
  $('#ovwrap').addEventListener('pointerleave', () => brushCursor($('#ovwrap'), false));
  $('#ovwrap').addEventListener('contextmenu', ovMenu);
}
function ovPreview(set, it, max) {
  const k = `${set.path}|${it.file}|${it.mtime}|${max}`;
  if (!OV.prev.has(k)) OV.prev.set(k, api.engine('preview', { file: joinPath(set.path, it.file), size: it.size, mtime: it.mtime, max }).then((r) => ({ ...r, url: api.fileUrl(r.path) })).catch((err) => { OV.prev.delete(k); throw err; }));
  return OV.prev.get(k);
}
const loadImg = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });

function ovDraw() {
  const set = curSet();
  if (!OV.view) ovInit();
  const wrap = $('#ovwrap'), world = $('.world', wrap), em = $('#ovempty');
  ovBar(set);
  const b = set && ovState(set).base && ovItem(set, ovState(set).base);
  if (!set || !set.scanned || set.missing || !ovImages(set).length) {
    world.innerHTML = ''; $('.uilayer', wrap).innerHTML = '';
    em.classList.remove('hidden');
    em.innerHTML = !P.sets.some((s) => kindOf(s) === 'overlay') ? `${ic('folders')}<p>Put a wide shot and its close-ups in one folder. The close-ups are lined up on the wide shot for you.</p><button class="primary" onclick="pickAndAdd()">${ic('plus')}Add folders</button>`
      : !set ? `${ic('image')}<p>Pick a set on the left.</p>` : set.missing ? `${ic('drive')}<p><b>Folder not found</b></p><p class="mono">${esc(set.path)}</p>` : !set.scanned ? `${ic('image')}<p>Reading the folder…</p>` : `${ic('image')}<p>No pictures in this folder.</p>`;
    return;
  }
  em.classList.add('hidden');
  ovSync(set);
  ovEnsure(set);
  if (!b) { world.innerHTML = ''; return; }
  const ov = ovState(set), e = eff(set);
  if (!OV.sel || !ov.layers.some((l) => l.file === OV.sel)) OV.sel = ov.layers.length ? ov.layers[ov.layers.length - 1].file : null;
  const key = set.id + '|' + b.file;
  if (world.dataset.key !== key) {
    world.dataset.key = key;
    world.innerHTML = `<img class="ovbase" draggable="false" alt="" style="width:${b.w}px;height:${b.h}px">`;
    ovPreview(set, b, 2048).then((r) => { const im = $('.ovbase', world); if (im) im.src = r.url; });
    OV.view.fitted = true;
  }
  OV.view.setBounds({ x: 0, y: 0, W: b.w, H: b.h });
  const k = G2.ovOutScale(e, b, ov.layers.filter((l) => l.m));
  const old = new Map($$('.ovlayer', world).map((el) => [el.dataset.file, el]));
  for (const l of ov.layers) {
    if (!l.m) continue;
    const it = ovItem(set, l.file);
    let el = old.get(l.file);
    if (el) old.delete(l.file);
    else { el = document.createElement('div'); el.className = 'ovlayer'; el.dataset.file = l.file; el.innerHTML = '<svg class="lsvg"></svg>'; }
    world.appendChild(el);
    el.classList.toggle('sel', OV.sel === l.file);
    el.classList.toggle('hiddenL', l.visible === false);
    el.style.opacity = l.opacity ?? 1;
    const isSel = OV.sel === l.file;
    el.style.mixBlendMode = isSel && OV.mode === 'diff' ? 'difference' : '';
    if (isSel && OV.mode === 'see') el.style.opacity = 0.5 * (l.opacity ?? 1);
    ovCompose(set, l, it, k).then((c) => {
      if (!c || !el.isConnected) return;
      const { canvas, pw, ph, red } = c;
      el.style.width = pw + 'px'; el.style.height = ph + 'px';
      el.style.transform = G2.css(G2.mul(l.m, G2.S(it.w / pw, it.h / ph)));
      const svg = $('.lsvg', el); svg.setAttribute('width', pw); svg.setAttribute('height', ph); svg.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
      if (el.dataset.ck !== c.key) {
        el.dataset.ck = c.key;
        $$('canvas', el).forEach((x) => x.remove());
        el.prepend(canvas);
        if (red) { red.classList.add('redmask'); el.insertBefore(red, svg); }
      }
      $$('.redmask', el).forEach((x) => x.classList.toggle('hidden', !(OV.showMask && isSel)));
      $$('.stroke', svg).forEach((x) => x.remove());
      if (isSel) ovDrawUI();
    });
  }
  for (const el of old.values()) el.remove();
  wrap.dataset.tool = OV.tool;
  if (!['erase', 'restore'].includes(OV.tool)) brushCursor(wrap, false);
  ovDrawUI();
}

// build the visible picture of a layer: colours matched, edges feathered, erased parts removed
async function ovCompose(set, l, it, k) {
  const e = eff(set);
  const pv = await ovPreview(set, it, 1600);
  const pw = pv.w, ph = pv.h, sc = pw / it.w;
  const s = G2.linScale(l.m);
  const fpx = (ovFeather(l, e) / Math.max(1e-6, k * s)) * sc;
  const colour = ovColourOn(l, e);
  let gains = null;
  if (colour) { try { gains = await ovGainsFor(set, l); } catch {} }
  const key = JSON.stringify([pv.url, Math.round(fpx * 2) / 2, gains, l.ops, OV.showMask && OV.sel === l.file]);
  const cached = OV.comp.get(l.file + '|' + set.id);
  if (cached && cached.key === key) return cached;
  const img = await loadImg(pv.url);
  const out = document.createElement('canvas'); out.width = pw; out.height = ph;
  const c = out.getContext('2d');
  c.drawImage(img, 0, 0, pw, ph);
  if (gains) {
    const d = c.getImageData(0, 0, pw, ph), a = d.data;
    for (let i = 0; i < a.length; i += 4) for (let ch = 0; ch < 3; ch++) a[i + ch] = a[i + ch] * gains.g[ch] + gains.o[ch];
    c.putImageData(d, 0, 0);
  }
  const mask = ovMaskCanvas(l, pw, ph, sc, fpx);
  c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0); c.globalCompositeOperation = 'source-over';
  let red = null;
  if (OV.showMask && OV.sel === l.file) {
    red = document.createElement('canvas'); red.width = pw; red.height = ph;
    const r = red.getContext('2d'); r.fillStyle = 'rgba(255,40,60,0.55)'; r.fillRect(0, 0, pw, ph);
    r.globalCompositeOperation = 'destination-out'; r.drawImage(mask, 0, 0);
  }
  const res = { key, canvas: out, pw, ph, red };
  OV.comp.set(l.file + '|' + set.id, res);
  return res;
}
function ovMaskCanvas(l, pw, ph, sc, f) {
  const mk = document.createElement('canvas'); mk.width = pw; mk.height = ph;
  const c = mk.getContext('2d');
  c.fillStyle = '#fff';
  if (f > 0.6) { c.filter = `blur(${(f / 2.6).toFixed(2)}px)`; c.fillRect(f * 0.55, f * 0.55, pw - f * 1.1, ph - f * 1.1); c.filter = 'none'; } else c.fillRect(0, 0, pw, ph);
  for (const op of l.ops || []) {
    c.globalCompositeOperation = op.m === 'restore' ? 'source-over' : 'destination-out';
    if (op.t === 'poly') { c.beginPath(); op.pts.forEach(([x, y], i) => (i ? c.lineTo(x * sc, y * sc) : c.moveTo(x * sc, y * sc))); c.closePath(); c.fill(); continue; }
    const r = op.r * sc, blur = r * (1 - (op.h ?? 0.7)) * 0.5;
    c.filter = blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : 'none';
    c.strokeStyle = '#fff'; c.lineWidth = 2 * (blur > 0.3 ? r - blur : r); c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); const pts = op.pts.length === 1 ? [op.pts[0], [op.pts[0][0] + 0.01, op.pts[0][1]]] : op.pts;
    pts.forEach(([x, y], i) => (i ? c.lineTo(x * sc, y * sc) : c.moveTo(x * sc, y * sc))); c.stroke();
    c.filter = 'none';
  }
  c.globalCompositeOperation = 'source-over';
  return mk;
}

// handles for the selected layer (screen space)
function ovDrawUI() {
  const set = curSet(), ui = $('#ovwrap .uilayer');
  if (!set || !ui || UI.tab !== 'overlay') return;
  const l = ovSel(set), v = OV.view;
  let svg = '';
  if (l && l.m && l.visible !== false) {
    const it = ovItem(set, l.file);
    const cs = [[0, 0], [it.w, 0], [it.w, it.h], [0, it.h]].map(([x, y]) => v.toScreen(...G2.apply(l.m, x, y)));
    svg += `<polygon points="${cs.map((q) => q.join(',')).join(' ')}" class="selbox ${l.locked ? 'locked' : ''}"/>`;
    if (OV.tool === 'move' && !l.locked) {
      const tm = v.toScreen(...G2.apply(l.m, it.w / 2, 0));
      const [cx, cy] = v.toScreen(...G2.apply(l.m, it.w / 2, it.h / 2));
      const dx = tm[0] - cx, dy = tm[1] - cy, dl = Math.hypot(dx, dy) || 1;
      const rot = [tm[0] + (dx / dl) * 28, tm[1] + (dy / dl) * 28];
      svg += `<line x1="${tm[0]}" y1="${tm[1]}" x2="${rot[0]}" y2="${rot[1]}" class="selbox"/><circle cx="${rot[0]}" cy="${rot[1]}" r="6" class="hrot" data-h="rot"/>`;
      cs.forEach((q) => (svg += `<rect x="${q[0] - 5}" y="${q[1] - 5}" width="10" height="10" class="hsc" data-h="sc"/>`));
    }
  }
  if (OV.lasso) svg += `<path d="${svgPath(OV.lasso.map(([x, y]) => v.toScreen(x, y)))}Z" class="lasso cut"/>`;
  ui.innerHTML = `<svg class="uisvg">${svg}</svg>`;
}

function ovBar(set) {
  const bar = $('#ovbar');
  if (!set) { bar.innerHTML = ''; return; }
  const ov = ovState(set), e = eff(set), b = ov.base && ovItem(set, ov.base);
  const k = b ? G2.ovOutScale(e, b, ov.layers.filter((l) => l.m)) : 1;
  const tool = (t) => `<button class="${OV.tool === t ? 'on' : ''}" data-tool="${t}" title="${OVTOOLS[t][1]} (${OVTOOLS[t][0]})">${esc(OVTOOLS[t][1].replace(' by drawing around', ' area'))}</button>`;
  const l = ovSel(set);
  bar.innerHTML = `<div class="stitle"><b title="${esc(set.path)}">${esc(set.name)}</b><span class="muted small">${b ? `Saves at ${fmtPx(b.w * k, b.h * k)}` : ''}</span></div>
    <div class="seg tools">${Object.keys(OVTOOLS).map(tool).join('')}</div>
    ${OV.tool === 'erase' || OV.tool === 'restore' ? `<span class="small muted">Size</span><input type="range" min="4" max="300" value="${BRUSH.size}" id="ovBsize" style="width:90px" title="[ and ]"><span class="small muted">Hardness</span><input type="range" min="0" max="100" value="${Math.round(BRUSH.hard * 100)}" id="ovBhard" style="width:70px">` : ''}
    <div class="seg" title="How the selected close-up is shown"><button data-vm="normal" class="${OV.mode === 'normal' ? 'on' : ''}">Normal</button><button data-vm="see" class="${OV.mode === 'see' ? 'on' : ''}" title="Half see-through">See-through</button><button data-vm="diff" class="${OV.mode === 'diff' ? 'on' : ''}" title="Perfectly lined-up areas go black (D)">Difference</button></div>
    <button class="ghost sm ${OV.showMask ? 'on' : ''}" id="ovMask" title="Show in red what the selected close-up hides (G)">Show mask</button>
    <div class="grow"></div>
    <button class="ghost sm" id="ovAlignAll" title="Run the automatic line-up again for every close-up">Line up all again</button>
    <button class="ghost sm" id="ovPts" ${l ? '' : 'disabled'} title="Click matching spots on the close-up and the wide shot">Line up by points</button>
    <button class="ghost sm" id="exactBtn3">${ic('eye')} Exact preview</button>
    <button class="quiet icon sm" id="ovFit" title="Fit (0)">${ic('fit')}</button><button class="quiet sm" id="ovZ100" title="Actual size (Z)">100%</button>`;
  $$('[data-tool]', bar).forEach((x) => (x.onclick = () => { OV.tool = x.dataset.tool; ovDraw(); }));
  $$('[data-vm]', bar).forEach((x) => (x.onclick = () => { OV.mode = x.dataset.vm; ovDraw(); }));
  const on = (id, fn) => { const x = $('#' + id, bar); if (x) x.onclick = fn; };
  const bs = $('#ovBsize', bar); if (bs) bs.oninput = () => (BRUSH.size = +bs.value);
  const bh = $('#ovBhard', bar); if (bh) bh.oninput = () => (BRUSH.hard = +bh.value / 100);
  on('ovMask', () => { OV.showMask = !OV.showMask; ovDraw(); });
  on('ovAlignAll', async () => {
    if (!(await confirmBox('Line up every close-up again?', 'Positions you changed by hand are replaced. Erased areas are kept.', 'Line up again'))) return;
    change(set.id, 'Line up all again', () => ovState(set).layers.forEach((x) => { x.status = 'pending'; }));
    ovEnsure(set); ovDraw();
  });
  on('ovPts', () => ovPointPairs(set, ovSel(set)));
  on('exactBtn3', exactPreview);
  on('ovFit', () => OV.view.fit());
  on('ovZ100', () => OV.view.actual());
}

// ---------- layers panel (top of the settings panel) ----------
function ovPanelTop(set) {
  if (!set || !set.scanned) return '';
  const ov = ovState(set), e = eff(set), b = ov.base && ovItem(set, ov.base);
  if (!b) return `<div class="psec"><h3>Layers</h3><p class="small muted">${OV.busy.get(set.id) || 'Working out which picture is the wide shot…'}</p></div>`;
  const k = G2.ovOutScale(e, b, ov.layers.filter((l) => l.m));
  const rows = [...ov.layers].reverse().map((l) => {
    const st = l.status === 'ok' ? `<span class="chip ${l.conf < 0.4 ? 'warn' : 'ok'}" title="${l.inliers} matching details">${l.conf < 0.4 ? 'Check this' : 'Matched'} ${Math.round(l.conf * 100)}%</span>`
      : l.status === 'manual' ? '<span class="chip">By hand</span>' : l.status === 'failed' ? `<span class="chip bad" title="${esc(l.reason || '')}">Not matched</span>` : '<span class="chip">Lining up…</span>';
    const enl = l.m && G2.linScale(l.m) * k > 1.05;
    return `<div class="lrow ${OV.sel === l.file ? 'sel' : ''}" data-file="${esc(l.file)}">
      <span class="grip" title="Drag to change the order">${ic('grip')}</span>
      <button class="quiet icon sm eye ${l.visible === false ? 'off' : ''}" data-eye title="Show / hide">${ic('eye')}</button>
      <div class="lname"><div title="${esc(l.file)}">${esc(l.file)}</div><div class="row small">${st}${enl ? `<span class="chip warn" title="This close-up has less detail than the area it covers at this output size, so it will look softer">${ic('warn')} softer</span>` : ''}${(l.ops || []).length ? '<span class="chip">erased</span>' : ''}</div></div>
      <button class="quiet icon sm lock ${l.locked ? 'on' : ''}" data-lock title="${l.locked ? 'Unlock' : 'Lock so it can’t be moved'}">${ic(l.locked ? 'lock' : 'unlock')}</button></div>
      ${OV.sel === l.file ? ovLayerDetails(set, l, e) : ''}`;
  }).join('');
  return `<div class="psec layers"><h3>Layers <span class="faint small" style="font-weight:400;margin-left:8px">top to bottom</span></h3>
    <div class="lrows">${rows || '<p class="small muted">Only one picture in this folder — add close-ups next to the wide shot.</p>'}</div>
    <div class="lrow base"><span class="grip"></span><span class="basetag">Base</span><div class="lname"><select id="ovBaseSel" title="The wide shot everything is placed on">${ovImages(set).map((i) => `<option ${i.file === ov.base ? 'selected' : ''}>${esc(i.file)}</option>`).join('')}</select></div></div></div>`;
}
function ovLayerDetails(set, l, e) {
  return `<div class="ldet">
    <div class="field"><div class="flabel"><span>Opacity</span><input class="rnum" type="number" id="lOpN" value="${Math.round((l.opacity ?? 1) * 100)}" min="0" max="100"></div><input type="range" id="lOp" min="0" max="100" value="${Math.round((l.opacity ?? 1) * 100)}"></div>
    <div class="field half"><div class="flabel"><span>Match colours</span></div><select id="lCol"><option value="" ${l.color == null ? 'selected' : ''}>Default (${e.ovColor ? 'on' : 'off'})</option><option value="1" ${l.color === true ? 'selected' : ''}>On</option><option value="0" ${l.color === false ? 'selected' : ''}>Off</option></select></div>
    <div class="field half"><div class="flabel"><span>Edge softness</span></div><div class="numwrap"><input type="number" id="lFea" min="0" max="2000" value="${l.feather ?? ''}" placeholder="${e.ovFeather}"><span class="unit">px</span></div></div>
    <div class="row wrap" style="gap:6px;margin-top:4px">
      <button class="ghost sm" id="lRealign">Line up again</button>
      <button class="ghost sm" id="lPts">By points…</button>
      ${(l.ops || []).length ? '<button class="ghost sm" id="lClear">Clear erasing</button>' : ''}
      <button class="ghost sm" id="lBase" title="Use this picture as the wide shot instead">Make base</button>
    </div></div>`;
}
function ovPanelWire(set, host) {
  const ov = ovState(set);
  $$('.lrow[data-file]', host).forEach((row) => {
    const l = ov.layers.find((x) => x.file === row.dataset.file);
    row.onclick = (e) => { if (e.target.closest('button,input,select')) return; OV.sel = l.file; drawPanel(); ovDraw(); };
    $('[data-eye]', row).onclick = () => { change(set.id, 'Show / hide layer', () => (l.visible = l.visible === false)); ovDraw(); drawPanel(); };
    $('[data-lock]', row).onclick = () => { change(set.id, 'Lock layer', () => (l.locked = !l.locked)); ovDraw(); drawPanel(); };
    $('.grip', row).onpointerdown = (e) => ovRowDrag(e, set, l, row);
  });
  const l = ovSel(set);
  const on = (id, ev, fn) => { const x = $('#' + id, host); if (x) x[ev] = fn; };
  if (l) {
    on('lOp', 'oninput', (e) => { if (OV.op0 == null) OV.op0 = l.opacity ?? 1; l.opacity = +e.target.value / 100; $('#lOpN').value = e.target.value; ovDraw(); });
    on('lOp', 'onchange', (e) => { const v = +e.target.value / 100; l.opacity = OV.op0 ?? l.opacity; OV.op0 = null; change(set.id, 'Opacity', () => (l.opacity = v)); ovDraw(); });
    on('lOpN', 'onchange', (e) => { change(set.id, 'Opacity', () => (l.opacity = clamp(+e.target.value || 0, 0, 100) / 100)); ovDraw(); drawPanel(); });
    on('lCol', 'onchange', (e) => { change(set.id, 'Match colours', () => (l.color = e.target.value === '' ? null : e.target.value === '1')); ovDraw(); });
    on('lFea', 'onchange', (e) => { change(set.id, 'Edge softness', () => (l.feather = e.target.value === '' ? null : clamp(+e.target.value || 0, 0, 2000))); ovDraw(); });
    on('lRealign', 'onclick', () => ovRealign(set, l));
    on('lPts', 'onclick', () => ovPointPairs(set, l));
    on('lClear', 'onclick', () => { change(set.id, 'Clear erasing', () => (l.ops = [])); ovDraw(); drawPanel(); });
    on('lBase', 'onclick', () => ovMakeBase(set, l.file));
  }
  on('ovBaseSel', 'onchange', (e) => ovMakeBase(set, e.target.value));
}
async function ovMakeBase(set, file) {
  const ov = ovState(set);
  if (file === ov.base) return;
  if (!(await confirmBox('Use this as the wide shot?', `Every close-up is lined up again on <b>${esc(file)}</b>. Erased areas are kept.`, 'Change base'))) { drawPanel(); return; }
  change(set.id, 'Change base', () => {
    const keep = new Map(ov.layers.map((l) => [l.file, l]));
    const oldBase = ov.base;
    ov.base = file;
    ov.layers = ov.layers.filter((l) => l.file !== file);
    if (oldBase) ov.layers.unshift({ file: oldBase, m: null, status: 'pending', opacity: 1, visible: true, locked: false, color: null, feather: null, ops: [] });
    ov.layers.forEach((l) => { l.status = 'pending'; l.m = null; });
    keep.clear();
  });
  OV.comp.clear();
  ovEnsure(set); drawAll();
}
function ovRowDrag(e, set, l, row) {
  e.preventDefault();
  const host = row.parentElement, rows = $$('.lrow[data-file]', host);
  const before = snap(set.id);
  const ov = ovState(set);
  let target = null;
  row.classList.add('dragging');
  const mv = (ev) => {
    rows.forEach((r) => r.classList.remove('dropabove', 'dropbelow'));
    let best = null, bd = 1e9;
    for (const r of rows) { const b = r.getBoundingClientRect(); const d = Math.abs(ev.clientY - (b.top + b.height / 2)); if (d < bd) { bd = d; best = r; } }
    if (!best) return;
    const b = best.getBoundingClientRect(), above = ev.clientY < b.top + b.height / 2;
    best.classList.add(above ? 'dropabove' : 'dropbelow');
    target = { file: best.dataset.file, above };
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    rows.forEach((r) => r.classList.remove('dropabove', 'dropbelow', 'dragging'));
    if (!target || target.file === l.file) return;
    // the list shows top first; the array is bottom first
    const arr = ov.layers.filter((x) => x !== l);
    let i = arr.findIndex((x) => x.file === target.file);
    arr.splice(target.above ? i + 1 : i, 0, l);
    ov.layers = arr;
    commitFrom(set.id, 'Change layer order', before);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

// ---------- pointer handling ----------
function ovDown(e) {
  if (e.button !== 0 || OV.view.space) return;
  const set = curSet(); if (!set) return;
  const ov = ovState(set), v = OV.view;
  const [wx, wy] = v.toWorld(e.clientX, e.clientY);
  const h = e.target.closest('[data-h]');
  const layerEl = e.target.closest('.ovlayer');
  if (OV.tool === 'move') {
    if (!h && layerEl && layerEl.dataset.file !== OV.sel) { OV.sel = layerEl.dataset.file; drawPanel(); ovDraw(); }
    const l = ovSel(set);
    // nothing to move under the pointer: move the view instead
    if (!h && !layerEl) { v.pan(e); return; }
    if (!l || !l.m) return;
    if (!h && (!layerEl || layerEl.dataset.file !== l.file)) return;
    if (l.locked) return toast('This layer is locked');
    const it = ovItem(set, l.file), m0 = l.m.slice();
    const [cx, cy] = G2.apply(m0, it.w / 2, it.h / 2);
    const d0 = Math.hypot(wx - cx, wy - cy) || 1, a0 = Math.atan2(wy - cy, wx - cx);
    const before = snap(set.id);
    let moved = false;
    const mv = (ev) => {
      const [x, y] = v.toWorld(ev.clientX, ev.clientY);
      moved = true;
      let T;
      if (h && h.dataset.h === 'sc') { const f = Math.max(0.01, Math.hypot(x - cx, y - cy) / d0); T = G2.mul(G2.Tr(cx, cy), G2.mul(G2.S(f), G2.Tr(-cx, -cy))); }
      else if (h) { let a = Math.atan2(y - cy, x - cx) - a0; if (ev.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); const c = Math.cos(a), s = Math.sin(a); T = G2.mul(G2.Tr(cx, cy), G2.mul([c, -s, 0, s, c, 0, 0, 0, 1], G2.Tr(-cx, -cy))); }
      else T = G2.Tr(x - wx, y - wy);
      l.m = G2.mul(T, m0);
      ovPlaceOnly(set, l);
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (!moved) return;
      if (l.status !== 'manual') l.status = 'manual';
      commitFrom(set.id, h ? (h.dataset.h === 'sc' ? 'Resize close-up' : 'Rotate close-up') : 'Move close-up', before);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  if (v.outside(e.clientX, e.clientY) && !layerEl) { v.pan(e); return; }
  const l = ovSel(set);
  if (!l || !l.m) return toast('Select a close-up in the layer list first');
  const it = ovItem(set, l.file), inv = G2.inv(l.m);
  const toClose = (x, y) => G2.apply(inv, x, y);
  if (OV.tool === 'lasso') {
    OV.lasso = [[wx, wy]];
    const mv = (ev) => { OV.lasso.push(v.toWorld(ev.clientX, ev.clientY)); ovDrawUI(); };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      const pts = simplify(OV.lasso, 2 / v.z).map(([x, y]) => toClose(x, y).map((q) => +q.toFixed(1)));
      OV.lasso = null;
      if (pts.length >= 3) { change(set.id, 'Erase area', () => (l.ops = [...(l.ops || []), { t: 'poly', m: 'cut', pts }])); ovDraw(); drawPanel(); }
      else ovDrawUI();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  // brush: points are kept in the close-up's own pixels
  const r = BRUSH.size / 2 / v.z / G2.linScale(l.m);
  const pts = [toClose(wx, wy)];
  const el = $(`.ovlayer[data-file="${CSS.escape(l.file)}"]`);
  const svg = el && $('.lsvg', el);
  const pv = svg ? +svg.getAttribute('width') / it.w : 1;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'stroke ' + OV.tool); path.setAttribute('stroke-width', 2 * r * pv);
  if (svg) svg.appendChild(path);
  const draw = () => path.setAttribute('d', svgPath((pts.length === 1 ? [pts[0], [pts[0][0] + 0.01, pts[0][1]]] : pts).map(([x, y]) => [x * pv, y * pv])));
  draw();
  const mv = (ev) => { pts.push(toClose(...v.toWorld(ev.clientX, ev.clientY))); draw(); brushCursor($('#ovwrap'), true, ev.clientX, ev.clientY); };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    const op = { t: 'brush', m: OV.tool, r: +r.toFixed(2), h: BRUSH.hard, pts: simplify(pts, Math.max(1, r / 4)).map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]) };
    change(set.id, OV.tool === 'erase' ? 'Erase' : 'Restore', () => (l.ops = [...(l.ops || []), op]));
    ovDraw(); drawPanel();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
// fast update of one layer's position while dragging
function ovPlaceOnly(set, l) {
  const el = $(`.ovlayer[data-file="${CSS.escape(l.file)}"]`), it = ovItem(set, l.file);
  if (el && el.style.width) { const pw = parseFloat(el.style.width), ph = parseFloat(el.style.height); el.style.transform = G2.css(G2.mul(l.m, G2.S(it.w / pw, it.h / ph))); }
  ovDrawUI();
}
function ovMenu(e) {
  e.preventDefault();
  const set = curSet(); if (!set) return;
  const el = e.target.closest('.ovlayer');
  if (el) { OV.sel = el.dataset.file; drawPanel(); ovDraw(); }
  const l = ovSel(set);
  if (!l) return;
  ctxMenu(e.clientX, e.clientY, [
    { label: 'Line up again', run: () => ovRealign(set, l) },
    { label: 'Line up by points…', run: () => ovPointPairs(set, l) },
    { label: l.visible === false ? 'Show' : 'Hide', run: () => { change(set.id, 'Show / hide layer', () => (l.visible = l.visible === false)); ovDraw(); drawPanel(); } },
    { label: l.locked ? 'Unlock' : 'Lock', run: () => { change(set.id, 'Lock layer', () => (l.locked = !l.locked)); ovDraw(); drawPanel(); } },
    '-',
    { label: 'Bring to top', run: () => { change(set.id, 'Layer order', () => { const ov = ovState(set); ov.layers = [...ov.layers.filter((x) => x !== l), l]; }); ovDraw(); drawPanel(); } },
    { label: 'Send to bottom', run: () => { change(set.id, 'Layer order', () => { const ov = ovState(set); ov.layers = [l, ...ov.layers.filter((x) => x !== l)]; }); ovDraw(); drawPanel(); } },
    ...((l.ops || []).length ? [{ label: 'Clear erasing', run: () => { change(set.id, 'Clear erasing', () => (l.ops = [])); ovDraw(); drawPanel(); } }] : []),
    { label: 'View this close-up full size', run: () => openViewer(set, set.items.find((i) => i.file === l.file).key) },
  ]);
}
function ovKey(e) {
  const set = curSet(); if (!set) return false;
  const k = e.key, lk = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (OV.pp) { if (k === 'Escape') { ovPPClose(); return true; } if (ctrl && lk === 'z') { ovPPUndo(); return true; } return true; }
  if (ctrl) return false;
  const t = { v: 'move', e: 'erase', r: 'restore', x: 'lasso' }[lk];
  if (t) { OV.tool = t; ovDraw(); return true; }
  if (lk === 'd') { OV.mode = OV.mode === 'diff' ? 'normal' : 'diff'; ovDraw(); return true; }
  if (lk === 'g') { OV.showMask = !OV.showMask; ovDraw(); return true; }
  if (lk === 'z') { OV.view.actual(); return true; }
  if (k === '+' || k === '=') { OV.view.zoomAt(1.25); return true; }
  if (k === '-') { OV.view.zoomAt(0.8); return true; }
  if (k === '0') { OV.view.fit(); return true; }
  if (k === '[' || k === ']') { BRUSH.size = clamp(Math.round(BRUSH.size * (k === ']' ? 1.2 : 1 / 1.2)), 4, 400); ovBar(set); return true; }
  const l = ovSel(set);
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
  if (arrows && l && l.m && !l.locked) { const d = (e.shiftKey ? 10 : 1) / Math.max(0.2, OV.view.z); change(set.id, 'Nudge close-up', () => { l.m = G2.mul(G2.Tr(arrows[0] * d, arrows[1] * d), l.m); l.status = 'manual'; }, 'ovnudge'); ovDraw(); return true; }
  if (k === 'Escape') { OV.tool = 'move'; ovDraw(); return true; }
  return false;
}

// ---------- line up by points ----------
function ovPointPairs(set, l) {
  if (!l) return;
  const ov = ovState(set), b = ovItem(set, ov.base), c = ovItem(set, l.file);
  OV.pp = { set, l, a: [], b: [], kind: eff(set).ovKind };
  const host = $('#ppview');
  host.classList.remove('hidden');
  host.innerHTML = `<div class="pphead"><div><b>Line up by points</b><div class="small muted">Click a spot on the close-up, then the same spot on the wide shot. Repeat at least 2 times (4 for “Allow perspective”), spread out as far as you can.</div></div>
      <div class="grow"></div><label class="small chk"><input type="checkbox" id="ppPersp" ${OV.pp.kind === 'perspective' ? 'checked' : ''}> Allow perspective</label>
      <button class="ghost sm" id="ppUndo">Undo point</button><button class="ghost sm" id="ppCancel">Cancel</button><button class="primary" id="ppApply" disabled>Apply</button></div>
    <div class="ppboth"><div class="pppane"><div class="pplabel">Close-up: ${esc(c.file)}</div><div class="pzwrap" id="ppA"><div class="world"><img draggable="false" style="width:${c.w}px;height:${c.h}px"><div class="marks"></div></div><div class="uilayer"></div></div></div>
      <div class="pppane"><div class="pplabel">Wide shot: ${esc(b.file)}</div><div class="pzwrap" id="ppB"><div class="world"><img draggable="false" style="width:${b.w}px;height:${b.h}px"><div class="marks"></div></div><div class="uilayer"></div></div></div></div>`;
  const va = new PanZoom($('#ppA')), vb = new PanZoom($('#ppB'));
  PanZoom.all.push(va, vb);
  OV.pp.va = va; OV.pp.vb = vb;
  va.setBounds({ x: 0, y: 0, W: c.w, H: c.h }); vb.setBounds({ x: 0, y: 0, W: b.w, H: b.h });
  ovPreview(set, c, 2048).then((r) => ($('#ppA img').src = r.url));
  ovPreview(set, b, 2048).then((r) => ($('#ppB img').src = r.url));
  const click = (side) => (e) => {
    if (e.button !== 0 || (side === 'a' ? va : vb).space) return;
    const sx = e.clientX, sy = e.clientY;
    (side === 'a' ? va : vb).pan(e); // dragging moves the view; a plain click adds a point
    const up = (ev) => {
      removeEventListener('pointerup', up);
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) return;
      const p = (side === 'a' ? va : vb).toWorld(ev.clientX, ev.clientY);
      const A = OV.pp.a, B = OV.pp.b;
      if (side === 'a' && A.length === B.length) A.push(p);
      else if (side === 'b' && B.length < A.length) B.push(p);
      else return toast(side === 'a' ? 'Now click the same spot on the wide shot' : 'Click a spot on the close-up first');
      ovPPMarks();
    };
    addEventListener('pointerup', up);
  };
  $('#ppA').addEventListener('pointerdown', click('a'));
  $('#ppB').addEventListener('pointerdown', click('b'));
  $('#ppPersp').onchange = (e) => { OV.pp.kind = e.target.checked ? 'perspective' : 'similarity'; ovPPMarks(); };
  $('#ppUndo').onclick = ovPPUndo;
  $('#ppCancel').onclick = ovPPClose;
  $('#ppApply').onclick = async () => {
    const pp = OV.pp, n = Math.min(pp.a.length, pp.b.length);
    const pairs = pp.a.slice(0, n).map((p, i) => [p, pp.b[i]]);
    const r = await api.engine('ovPoints', { pairs, kind: n >= 4 ? pp.kind : 'similarity' });
    if (!r.m || !r.m.every(isFinite)) return toast('Those points don’t give a usable result — try spreading them out more');
    change(set.id, 'Line up by points', () => Object.assign(pp.l, { m: r.m, status: 'manual' }));
    ovPPClose(); ovDraw(); drawPanel();
  };
  ovPPMarks();
}
function ovPPMarks() {
  const pp = OV.pp; if (!pp) return;
  const mk = (pts, host, v) => { host.innerHTML = pts.map((p, i) => `<div class="ppmark" style="left:${p[0]}px;top:${p[1]}px;transform:translate(-50%,-50%) scale(${1 / v.z})"><span>${i + 1}</span></div>`).join(''); };
  mk(pp.a, $('#ppA .marks'), pp.va); mk(pp.b, $('#ppB .marks'), pp.vb);
  pp.va.onChange = () => mk(pp.a, $('#ppA .marks'), pp.va); pp.vb.onChange = () => mk(pp.b, $('#ppB .marks'), pp.vb);
  const n = Math.min(pp.a.length, pp.b.length);
  $('#ppApply').disabled = n < 2;
  $('#ppApply').textContent = n < 2 ? `Apply (${n} of 2)` : pp.kind === 'perspective' && n < 4 ? `Apply (no perspective until 4)` : `Apply (${n} points)`;
}
function ovPPUndo() { const pp = OV.pp; if (!pp) return; if (pp.a.length > pp.b.length) pp.a.pop(); else pp.b.pop(); ovPPMarks(); }
function ovPPClose() { const h = $('#ppview'); h.classList.add('hidden'); h.innerHTML = ''; if (OV.pp) PanZoom.all = PanZoom.all.filter((v) => v !== OV.pp.va && v !== OV.pp.vb); OV.pp = null; }
