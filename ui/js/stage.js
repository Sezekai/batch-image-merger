// ---------- the preview in the middle: tiles you can drag around ----------
const DRAG = { on: false };

function orderedIncluded(set) {
  if (DRAG.on && DRAG.setId === set.id && DRAG.order) { const m = new Map(set.items.map((i) => [i.key, i])); return DRAG.order.map((k) => m.get(k)).filter(Boolean); }
  return included(set);
}
let lastLayout = null, lastZ = 1;

function drawStage() {
  for (const t of ['merge', 'freeform', 'overlay']) $('#' + { merge: 'mergeStage', freeform: 'ffStage', overlay: 'ovStage' }[t]).classList.toggle('hidden', UI.tab !== t);
  if (UI.tab === 'freeform') return ffDraw();
  if (UI.tab === 'overlay') return ovDraw();
  drawMergeStage();
}
function drawMergeStage() {
  const set = curSet();
  const paper = $('#paper'), wrap = $('#canvasWrap');
  drawStageBar(set);
  drawTray(set);
  if (!set || !set.scanned || set.missing || !included(set).some((i) => !i.blank && i.w)) {
    paper.style.display = 'none';
    const em = $('#empty');
    em.classList.remove('hidden');
    em.innerHTML = !tabSets().length ? `${ic('folders')}<p>Each folder becomes a set, and each set becomes one picture. Drag folders onto the window, or</p><button class="primary" onclick="pickAndAdd()">${ic('plus')}Add folders</button>`
      : !set ? `${ic('image')}<p>Pick a set on the left.</p>`
      : set.missing ? `${ic('drive')}<p><b>Folder not found</b></p><p class="mono">${esc(set.path)}</p><p>It may have been moved or renamed, or be on a drive that isn’t connected.</p><button onclick="scanSet(curSet(), false)">${ic('refresh')}Check again</button>`
      : !set.scanned ? `${ic('image')}<p>Reading the folder…</p>`
      : `${ic('image')}<p>Every picture in this set is left out. Put some back from the strip below.</p>`;
    lastLayout = null;
    return;
  }
  $('#empty').classList.add('hidden');
  paper.style.display = '';
  const e = eff(set);
  if (e.match && e.matchTarget === 'auto' && included(set).some((i) => !i.blank && i.w && !i.bg)) ensureBgEstimates(set).then((ch) => { if (ch && set.id === P.cur) drawAll(); });
  const c = colours(set, e);
  const items = orderedIncluded(set);
  const L = BIMLayout.computeLayout(items.map((it) => ({ key: it.key, w: it.w, h: it.h, blank: !!it.blank, fx: it.fx, fy: it.fy })), e);
  lastLayout = L;
  const pad = 28, aw = Math.max(50, wrap.clientWidth - pad * 2), ah = Math.max(50, wrap.clientHeight - pad * 2);
  const fit = Math.min(aw / L.W, ah / L.H, 2);
  const z = UI.zoom || fit;
  lastZ = z;
  paper.style.width = L.W * z + 'px';
  paper.style.height = L.H * z + 'px';
  paper.style.background = c.bg;
  paper.classList.toggle('dragging', DRAG.on && DRAG.moved);
  // fills (lines, border)
  let fl = $('.fills', paper);
  if (!fl) { fl = document.createElement('div'); fl.className = 'fills'; paper.appendChild(fl); }
  fl.innerHTML = L.fills.map((f) => `<i style="left:${f.x * z}px;top:${f.y * z}px;width:${Math.max(1, f.w * z)}px;height:${Math.max(1, f.h * z)}px;background:${f.c}"></i>`).join('');
  // tiles, re-using elements so moves animate
  const old = new Map($$('.tile', paper).map((el) => [el.dataset.key, el]));
  const byKey = new Map(items.map((it) => [it.key, it]));
  const index = new Map(items.map((it, i) => [it.key, i]));
  for (const t of L.tiles) {
    const it = byKey.get(t.key);
    let el = old.get(t.key);
    if (el) old.delete(t.key);
    else {
      el = document.createElement('div');
      el.className = 'tile';
      el.dataset.key = t.key;
      el.innerHTML = '<img draggable="false" alt="" decoding="async"><span class="num"></span><span class="badges"></span>';
      paper.appendChild(el);
      el.addEventListener('pointerdown', (ev) => tileDown(ev, el.dataset.key));
      el.addEventListener('dblclick', () => openViewer(curSet(), el.dataset.key));
      el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); tileMenu(ev, el.dataset.key); });
    }
    Object.assign(el.style, { left: t.x * z + 'px', top: t.y * z + 'px', width: t.w * z + 'px', height: t.h * z + 'px' });
    el.classList.toggle('blank', !!t.blank);
    el.classList.toggle('sel', UI.tile === t.key);
    el.classList.toggle('ghosted', DRAG.on && DRAG.moved && DRAG.key === t.key);
    el.classList.toggle('croppable', !!t.crop);
    $('.num', el).textContent = index.get(t.key) + 1;
    const badges = [];
    if (t.up) badges.push(`<b class="up" title="Enlarged to ${Math.round(t.scale * 100)}% of its real size, so it will look softer">↑ ${Math.round(t.scale * 100)}%</b>`);
    if (it && it.noMatch && e.match) badges.push('<b title="Background matching is off for this image">no match</b>');
    if (it && it.tol != null && e.match) badges.push(`<b title="Own tolerance">tol ${it.tol}</b>`);
    $('.badges', el).innerHTML = badges.join('');
    const img = $('img', el);
    if (t.blank || !t.img) { img.style.display = 'none'; continue; }
    img.style.display = '';
    Object.assign(img.style, { left: (t.img.x - t.x) * z + 'px', top: (t.img.y - t.y) * z + 'px', width: t.img.w * z + 'px', height: t.img.h * z + 'px' });
    const m = UI.before ? null : matchParams(set, it, e, c);
    const want = JSON.stringify([set.id, it.key, it.mtime, m, c.bg]);
    if (img.dataset.want !== want) {
      img.dataset.want = want;
      // keep showing the old picture until the new one is ready
      thumbUrl(set, it, m, c.bg).then((u) => { if (img.dataset.want === want && u) img.src = u; });
    }
  }
  for (const el of old.values()) el.remove();
}

function drawStageBar(set) {
  const bar = $('#stagebar');
  if (!set) { bar.innerHTML = ''; return; }
  const e = eff(set), L = lastLayout || (set.scanned ? setLayout(set) : null);
  const ov = (k) => (k in set.overrides ? ' own' : '');
  const lay = (v, label) => `<button class="${e.layout === v ? 'on' : ''}${e.layout === v ? ov('layout') : ''}" data-lay="${v}" title="${label}">${ic(v)}<span>${label}</span></button>`;
  const info = L && !L.empty ? `${fmtPx(L.W, L.H)}${L.grid ? ` · ${L.grid.cols} × ${L.grid.rows}` : ''}` : '';
  bar.innerHTML = `<div class="stitle"><b title="${esc(set.path)}">${esc(set.name)}</b><span class="muted small">${esc(info)}</span>
      ${L && L.upscaled ? `<span class="chip warn" title="Some images are enlarged past their real size">${L.upscaled} enlarged</span>` : ''}
      ${L && L.warnings.length ? `<span class="chip warn" title="${esc(L.warnings.join('\n'))}">${ic('warn')} ${esc(L.warnings[0])}</span>` : ''}
      ${set.items.some((i) => i.err) ? `<span class="chip bad" title="${esc(set.items.filter((i) => i.err).map((i) => i.file + ': ' + i.err).join('\n'))}">${set.items.filter((i) => i.err).length} unreadable</span>` : ''}</div>
    <div class="seg lay">${lay('vertical', 'Vertical')}${lay('horizontal', 'Horizontal')}${lay('grid', 'Grid')}</div>
    <div class="grow"></div>
    ${e.match ? `<button class="ghost sm ${UI.before ? 'on' : ''}" id="beforeBtn" title="Compare with the original backgrounds (Tab)">${UI.before ? 'Showing original' : 'Before / after'}</button>` : ''}
    <button class="sm" id="exactBtn" title="Render the real result at screen size, exactly as it will be saved">${ic('eye')}Exact preview</button>
    <div class="zoom"><button class="quiet icon sm" id="zoomOut" title="Zoom out (−)">${ic('minus')}</button><span id="zoomPct">${Math.round(lastZ * 100)}%</span><button class="quiet icon sm" id="zoomIn" title="Zoom in (+)">${ic('plus')}</button><button class="quiet icon sm" id="fitBtn" title="Fit to the window (0)">${ic('fit')}</button><button class="quiet sm" id="z100" title="Actual size (Z)">100%</button></div>`;
  $$('[data-lay]', bar).forEach((b) => (b.onclick = () => setField('layout', b.dataset.lay)));
  const bb = $('#beforeBtn', bar); if (bb) bb.onclick = toggleBefore;
  $('#exactBtn', bar).onclick = exactPreview;
  $('#fitBtn', bar).onclick = () => mergeZoomTo(0);
  $('#z100', bar).onclick = () => mergeZoomTo(1);
  $('#zoomIn', bar).onclick = () => mergeZoomTo(lastZ * 1.25);
  $('#zoomOut', bar).onclick = () => mergeZoomTo(lastZ / 1.25);
}
function toggleBefore() { UI.before = !UI.before; drawStage(); }

function drawTray(set) {
  const tray = $('#tray');
  if (!set || !set.scanned) { tray.innerHTML = ''; tray.classList.add('empty'); return; }
  const e = eff(set);
  const ex = set.items.filter((i) => i.ex && !i.blank);
  tray.classList.toggle('empty', false);
  tray.innerHTML = `<div class="traylabel">${ex.length ? `Left out (${ex.length}) <span class="muted">— click or drag back in</span>` : '<span class="muted">Drag an image here to leave it out</span>'}</div>
    <div class="trayitems">${ex.map((it) => `<div class="titem" data-key="${esc(it.key)}" title="${esc(it.file)}"><img draggable="false" alt=""></div>`).join('')}</div>
    <div class="trayact">${e.layout === 'grid' ? `<button class="ghost sm" id="addBlank" title="Add an empty cell (drag it where you want a gap)">${ic('blank')} Empty cell</button>` : ''}
    ${e.layout === 'grid' && e.gridMode === 'crop' ? `<span class="small muted">Shift + drag inside a picture to choose what's kept</span>` : ''}
    ${set.items.some((i) => i.fx != null || i.fy != null) ? `<button class="ghost sm" id="resetCrops">Reset crop positions</button>` : ''}
    <button class="ghost sm" id="resetOrder" title="Back to file-name order with nothing left out">Reset order</button></div>`;
  $$('.titem', tray).forEach((el) => {
    const it = set.items.find((i) => i.key === el.dataset.key);
    thumbUrl(set, it).then((u) => { if (u) $('img', el).src = u; });
    el.addEventListener('pointerdown', (ev) => tileDown(ev, it.key, true));
  });
  const ab = $('#addBlank', tray); if (ab) ab.onclick = () => change(set.id, 'Add empty cell', () => set.items.push({ key: 'blank-' + uid(), blank: true, ex: false })) || drawAll();
  const rc = $('#resetCrops', tray); if (rc) rc.onclick = () => change(set.id, 'Reset crop positions', () => set.items.forEach((i) => { delete i.fx; delete i.fy; })) || drawAll();
  $('#resetOrder', tray).onclick = () => change(set.id, 'Reset order', () => {
    set.items = set.items.filter((i) => !i.blank).sort((a, b) => coll.compare(a.file, b.file));
    set.items.forEach((i) => (i.ex = false));
  }) || drawAll();
}

// ---------- dragging ----------
function tileDown(ev, key, fromTray = false) {
  if (ev.button !== 0) return;
  const set = curSet();
  if (!set) return;
  ev.preventDefault();
  const t = lastLayout && lastLayout.tiles.find((x) => x.key === key);
  const startX = ev.clientX, startY = ev.clientY;
  const before = snap(set.id);
  // Shift + drag: move the crop window
  if (ev.shiftKey && !fromTray && t && t.crop) {
    const it = set.items.find((i) => i.key === key);
    const fx0 = it.fx ?? 0.5, fy0 = it.fy ?? 0.5;
    const ox = (t.img.w - t.w) * lastZ, oy = (t.img.h - t.h) * lastZ;
    const mv = (e) => {
      if (ox > 0.5) it.fx = clamp(fx0 - (e.clientX - startX) / ox, 0, 1);
      if (oy > 0.5) it.fy = clamp(fy0 - (e.clientY - startY) / oy, 0, 1);
      drawStage();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); commitFrom(set.id, 'Move crop', before); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  Object.assign(DRAG, { on: true, moved: false, key, setId: set.id, fromTray, order: included(set).map((i) => i.key), overTray: false });
  const startOrder = DRAG.order.join('|');
  let ghost = null;
  const mv = (e) => {
    if (!DRAG.moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
    if (!DRAG.moved) {
      DRAG.moved = true;
      ghost = document.createElement('div');
      ghost.className = 'dragghost';
      const src = (fromTray ? $(`.titem[data-key="${CSS.escape(key)}"] img`) : $(`.tile[data-key="${CSS.escape(key)}"] img`));
      ghost.innerHTML = src && src.src ? `<img src="${src.src}">` : '<div class="gblank"></div>';
      document.body.appendChild(ghost);
      document.body.classList.add('dragging');
    }
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    const tr = $('#tray').getBoundingClientRect();
    DRAG.overTray = e.clientY >= tr.top && e.clientY <= tr.bottom && e.clientX >= tr.left && e.clientX <= tr.right;
    $('#tray').classList.toggle('drop', DRAG.overTray && !fromTray);
    const pr = $('#paper').getBoundingClientRect();
    if (DRAG.overTray || !lastLayout) {
      if (fromTray) DRAG.order = DRAG.order.filter((k) => k !== key);
      drawStage(); return;
    }
    // which tile is under the pointer?
    const x = (e.clientX - pr.left) / lastZ, y = (e.clientY - pr.top) / lastZ;
    let best = null, bd = Infinity;
    for (const tt of lastLayout.tiles) {
      const cx = clamp(x, tt.x, tt.x + tt.w), cy = clamp(y, tt.y, tt.y + tt.h);
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd) { bd = d; best = tt; }
    }
    const inside = x > -40 / lastZ && y > -40 / lastZ && x < lastLayout.W + 40 / lastZ && y < lastLayout.H + 40 / lastZ;
    if (!best || !inside) { if (fromTray && DRAG.order.includes(key)) { DRAG.order = DRAG.order.filter((k) => k !== key); drawStage(); } return; }
    if (best.key === key) return;
    const ord = DRAG.order.filter((k) => k !== key);
    let j = ord.indexOf(best.key);
    // drop after the target when the pointer is on its right/lower half and we're coming from before it
    const fromIdx = DRAG.order.indexOf(key), toIdx = DRAG.order.indexOf(best.key);
    if (fromIdx >= 0 && fromIdx < toIdx) j += 1;
    if (fromIdx < 0) { const after = eff(set).layout === 'vertical' ? y > best.y + best.h / 2 : x > best.x + best.w / 2; if (after) j += 1; }
    ord.splice(j, 0, key);
    if (ord.join('|') !== DRAG.order.join('|')) { DRAG.order = ord; drawStage(); }
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (ghost) ghost.remove();
    document.body.classList.remove('dragging');
    $('#tray').classList.remove('drop');
    const moved = DRAG.moved, order = DRAG.order, overTray = DRAG.overTray;
    Object.assign(DRAG, { on: false, moved: false, order: null });
    if (!moved) {
      if (fromTray) change(set.id, 'Put image back', () => { set.items.find((i) => i.key === key).ex = false; });
      else UI.tile = key;
      drawAll(); return;
    }
    if (overTray && !fromTray) {
      change(set.id, 'Leave out image', () => { const it = set.items.find((i) => i.key === key); if (it.blank) set.items = set.items.filter((i) => i !== it); else it.ex = true; });
    } else if (order.join('|') !== startOrder || fromTray) {
      change(set.id, fromTray ? 'Put image back' : 'Reorder', () => applyOrder(set, order));
    }
    drawAll();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function applyOrder(set, order) {
  const m = new Map(set.items.map((i) => [i.key, i]));
  const inc = order.map((k) => m.get(k)).filter(Boolean);
  inc.forEach((i) => (i.ex = false));
  const rest = set.items.filter((i) => !order.includes(i.key));
  set.items = [...inc, ...rest];
}
function commitFrom(scope, label, before) {
  const after = snap(scope);
  if (after === before) return;
  HIST.push({ scope, label, before, after, t: Date.now() }); FUT.length = 0;
  saveProject(); refreshUndo(); drawAll();
}

// move the selected tile one place earlier/later, or select the neighbour
function stepTile(d, move) {
  const set = curSet(); if (!set) return;
  const keys = included(set).map((i) => i.key);
  if (!keys.length) return;
  let i = keys.indexOf(UI.tile);
  if (!move) { UI.tile = keys[clamp(i < 0 ? 0 : i + d, 0, keys.length - 1)]; drawStage(); return; }
  if (i < 0) return;
  const j = clamp(i + d, 0, keys.length - 1);
  if (i === j) return;
  keys.splice(j, 0, keys.splice(i, 1)[0]);
  change(set.id, 'Reorder', () => applyOrder(set, keys));
  drawAll();
}
function excludeTile(key = UI.tile) {
  const set = curSet(); if (!set || !key) return;
  const keys = included(set).map((i) => i.key), i = keys.indexOf(key);
  change(set.id, 'Leave out image', () => { const it = set.items.find((x) => x.key === key); if (it.blank) set.items = set.items.filter((x) => x !== it); else it.ex = true; });
  UI.tile = keys[i + 1] || keys[i - 1] || null;
  drawAll();
}

function tileMenu(ev, key) {
  const set = curSet(), it = set.items.find((i) => i.key === key), e = eff(set);
  UI.tile = key; drawStage();
  const keys = included(set).map((i) => i.key), idx = keys.indexOf(key);
  const move = (to) => { const k = keys.filter((x) => x !== key); k.splice(to, 0, key); change(set.id, 'Reorder', () => applyOrder(set, k)); drawAll(); };
  const blank = (after) => change(set.id, 'Add empty cell', () => { const b = { key: 'blank-' + uid(), blank: true, ex: false }; const k = [...keys]; k.splice(idx + (after ? 1 : 0), 0, b.key); set.items.push(b); applyOrder(set, k); }) || drawAll();
  ctxMenu(ev.clientX, ev.clientY, [
    ...(it.blank ? [] : [{ label: 'View full size', key: 'T', run: () => openViewer(set, key) }]),
    { label: it.blank ? 'Remove empty cell' : 'Leave out', key: 'Del', run: () => excludeTile(key) },
    '-',
    { label: 'Move to start', disabled: idx === 0, run: () => move(0) },
    { label: 'Move to end', disabled: idx === keys.length - 1, run: () => move(keys.length - 1) },
    ...(e.layout === 'grid' ? [{ label: 'Insert empty cell before', run: () => blank(false) }, { label: 'Insert empty cell after', run: () => blank(true) }] : []),
    ...(it.fx != null || it.fy != null ? [{ label: 'Reset crop position', run: () => change(set.id, 'Reset crop', () => { delete it.fx; delete it.fy; }) || drawAll() }] : []),
    ...(it.blank ? [] : ['-',
      { label: 'Match background for this image', check: !it.noMatch, disabled: !e.match, run: () => change(set.id, 'Match background', () => { it.noMatch = !it.noMatch; }) || drawAll() },
      { label: it.tol != null ? `Own tolerance: ${it.tol}…` : 'Own tolerance for this image…', disabled: !e.match, run: async () => {
        const v = await ask('Tolerance for this image', { value: it.tol ?? e.tol, text: `Leave empty to use the set’s tolerance (${e.tol}). Higher replaces more shades of the background.` });
        if (v === null) return;
        change(set.id, 'Image tolerance', () => { if (v.trim() === '') delete it.tol; else it.tol = clamp(Math.round(+v || 0), 0, 160); }); drawAll();
      } },
      '-',
      { label: 'Show in folder', run: () => api.showItem(joinPath(set.path, it.file)) }]),
  ]);
}

// ---------- exact preview ----------
async function exactPreview() {
  const set = curSet(); if (!set) return;
  const btn = $('#exactBtn'); if (btn) btn.disabled = true;
  const job = jobStart({ label: 'Rendering the exact preview', short: 'Preview', name: set.name, unit: 'none' });
  try {
    await prepareSet(set);
    const ej = exportJob(set);
    if (ej.empty) throw new Error(kindOf(set) === 'freeform' ? 'Put some cutouts on the canvas first' : 'Nothing to show yet');
    const r = await api.previewRender(ej, Math.round(Math.max(screen.width, screen.height) * devicePixelRatio));
    job.finish({ message: set.name });
    openViewerSingle(api.fileUrl(r.path) + '?t=' + Date.now(), `Exact preview of ${set.name}`, 'Rendered exactly as it will be saved, at screen size.', [['Shown at', fmtPx(r.W, r.H)], ['Saved size', fmtPx(r.fullW, r.fullH)], ['Format', ej.settings.format.toUpperCase()]]);
  } catch (e) { job.finish({ state: 'error', message: e.message }); toast('Preview failed: ' + e.message); }
  if (btn) btn.disabled = false;
}

// zoom with Ctrl + wheel
// zoom the Merge preview, keeping the middle of the view still (0 = fit)
function mergeZoomTo(z) {
  const wrap = $('#canvasWrap');
  const fx = (wrap.scrollLeft + wrap.clientWidth / 2) / Math.max(1, wrap.scrollWidth), fy = (wrap.scrollTop + wrap.clientHeight / 2) / Math.max(1, wrap.scrollHeight);
  UI.zoom = z ? clamp(z, 0.02, 8) : 0;
  drawStage();
  if (z) { wrap.scrollLeft = fx * wrap.scrollWidth - wrap.clientWidth / 2; wrap.scrollTop = fy * wrap.scrollHeight - wrap.clientHeight / 2; }
}
function initStage() {
  const wrap = $('#canvasWrap');
  // Ctrl + wheel zooms around the middle of the window; plain wheel / Shift + wheel scroll
  wrap.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const fx = (wrap.scrollLeft + wrap.clientWidth / 2) / Math.max(1, wrap.scrollWidth), fy = (wrap.scrollTop + wrap.clientHeight / 2) / Math.max(1, wrap.scrollHeight);
    UI.zoom = clamp(lastZ * Math.pow(1.0018, -e.deltaY), 0.02, 8);
    drawStage();
    wrap.scrollLeft = fx * wrap.scrollWidth - wrap.clientWidth / 2; wrap.scrollTop = fy * wrap.scrollHeight - wrap.clientHeight / 2;
  }, { passive: false });
  // dragging the empty area around the picture moves the view
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const empty = e.target === wrap || e.target.id === 'paper' || e.target.classList.contains('fills');
    if (!empty && e.button !== 1) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, l0 = wrap.scrollLeft, t0 = wrap.scrollTop;
    let moved = false;
    const mv = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 3) moved = true; wrap.scrollLeft = l0 - (ev.clientX - sx); wrap.scrollTop = t0 - (ev.clientY - sy); wrap.classList.toggle('panning', moved); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); wrap.classList.remove('panning'); if (!moved && empty) { UI.tile = null; drawStage(); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  new ResizeObserver(debounce(() => { if (!UI.zoom && UI.tab === 'merge') drawStage(); }, 60)).observe(wrap);
}
