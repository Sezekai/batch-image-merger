// ---------- full-size viewer: the picture with nothing drawn over it; everything else in a side panel ----------
const V = { open: false, list: [], i: 0, z: 0, x: 0, y: 0, single: null };

function openViewer(set, key) {
  const list = included(set).filter((i) => !i.blank && i.w);
  if (!list.length) return;
  V.single = null; V.set = set; V.list = list; V.i = Math.max(0, list.findIndex((i) => i.key === key));
  showViewer();
}
function openViewerSingle(url, title, sub, info) { V.single = { url, title, sub, info }; V.list = []; V.i = 0; showViewer(); }
function showViewer() {
  V.open = true; V.z = 0;
  const el = $('#viewer'); el.classList.remove('hidden', 'bare');
  el.innerHTML = `<div class="vstage"><img id="vimg" draggable="false" alt=""></div><aside class="vside panel" id="vside"></aside>`;
  const st = $('.vstage', el), img = $('#vimg');
  st.addEventListener('wheel', (e) => { e.preventDefault(); vZoom(e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  st.addEventListener('dblclick', () => { V.z = V.z ? 0 : 1; V.x = V.y = 0; vLayout(); });
  st.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !V.z) return;
    const sx = e.clientX - V.x, sy = e.clientY - V.y;
    const mv = (ev) => { V.x = ev.clientX - sx; V.y = ev.clientY - sy; vLayout(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  img.onload = vLayout;
  vLoad();
}
function vSide() {
  const side = $('#vside'); if (!side) return;
  const img = $('#vimg');
  let title, rows;
  if (V.single) { title = V.single.title; rows = V.single.info || [['', V.single.sub]]; }
  else {
    const it = V.list[V.i];
    title = it.file;
    rows = [['Position', `${V.i + 1} of ${V.list.length}`], ['Size', fmtPx(it.w, it.h)], ['File', fmtBytes(it.size || 0)], ...(it.bg ? [['Background', it.bg]] : []), ['Set', V.set.name]];
  }
  const z = img && img.naturalWidth ? Math.round((V.z || vFit()) * 100) : 0;
  side.innerHTML = `<div class="vh"><b>${esc(title)}</b>${V.single && V.single.sub ? `<span class="small muted">${esc(V.single.sub)}</span>` : ''}</div>
    <div class="kv">${rows.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>
    <div class="vsec"><div class="subhead">Zoom · ${z}%</div>
      <div class="two"><button id="vzo" title="Zoom out (−, ↓)"><span data-ic="minus"></span></button><button id="vfit" title="Fit (0)">Fit</button><button id="v100" title="Actual size (1 or Z)">100%</button><button id="vzi" title="Zoom in (+, ↑)"><span data-ic="plus"></span></button></div>
      ${V.single ? '' : `<div class="two"><button id="vprev" title="Previous (←)"><span data-ic="chevl"></span>Previous</button><button id="vnext" title="Next (→)">Next<span data-ic="chevr"></span></button></div>`}
      <button id="vclose" title="Close (T or Esc)"><span data-ic="x"></span>Close</button></div>
    <div class="vkeys">${[['← →', 'Previous / next'], ['Home End', 'First / last'], ['↑ ↓  + −', 'Zoom'], ['0', 'Fit'], ['1  Z', 'Actual size'], ['H', 'Hide this panel'], ['F', 'Full screen'], ['T  Esc', 'Close']]
      .map(([k, d]) => `<span>${k.split(/\s+/).map((c) => `<span class="cap">${esc(c)}</span>`).join('')}</span><span>${esc(d)}</span>`).join('')}</div>`;
  paintIcons(side);
  const on = (id, fn) => { const b = $('#' + id, side); if (b) b.onclick = fn; };
  on('vzo', () => vZoom(1 / 1.2)); on('vzi', () => vZoom(1.2)); on('vfit', () => { V.z = 0; V.x = V.y = 0; vLayout(); }); on('v100', () => { V.z = 1; V.x = V.y = 0; vLayout(); });
  on('vprev', () => vStep(-1)); on('vnext', () => vStep(1)); on('vclose', closeViewer);
}
function vLoad() {
  const img = $('#vimg'); if (!img) return;
  V.z = 0; V.x = V.y = 0;
  if (V.single) img.src = V.single.url;
  else img.src = api.fileUrl(joinPath(V.set.path, V.list[V.i].file));
  vSide();
}
function vFit() { const img = $('#vimg'), st = $('.vstage'); return Math.min(st.clientWidth / img.naturalWidth, st.clientHeight / img.naturalHeight, 1); }
function vLayout() {
  const img = $('#vimg'), st = $('.vstage');
  if (!img || !img.naturalWidth) return;
  const z = V.z || vFit();
  const w = img.naturalWidth * z, h = img.naturalHeight * z;
  Object.assign(img.style, { width: w + 'px', height: h + 'px', left: (st.clientWidth - w) / 2 + V.x + 'px', top: (st.clientHeight - h) / 2 + V.y + 'px' });
  st.classList.toggle('zoomed', !!V.z);
  const sub = $('#vside .subhead'); if (sub) sub.textContent = `Zoom · ${Math.round(z * 100)}%`;
}
// zoom keeps the centre of the view still
function vZoom(f) {
  const img = $('#vimg'); if (!img || !img.naturalWidth) return;
  const fit = vFit(), z0 = V.z || fit, z1 = clamp(z0 * f, Math.min(fit, 0.05), 16);
  V.x = (V.x * z1) / z0; V.y = (V.y * z1) / z0;
  V.z = z1; vLayout();
}
function vStep(d) { if (V.single || !V.list.length) return; V.i = (V.i + d + V.list.length) % V.list.length; vLoad(); }
function closeViewer() { V.open = false; const el = $('#viewer'); el.classList.add('hidden'); el.innerHTML = ''; if (!V.single && V.list[V.i]) { UI.tile = V.list[V.i].key; drawStage(); } }
function viewerKey(e) {
  const k = e.key, lk = k.toLowerCase();
  if (modalOpen()) return false;
  if (k === 'Escape' || lk === 't') closeViewer();
  else if (k === 'ArrowLeft' || k === 'PageUp') vStep(-1);
  else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') vStep(1);
  else if (k === 'Home') { if (!V.single) { V.i = 0; vLoad(); } }
  else if (k === 'End') { if (!V.single) { V.i = V.list.length - 1; vLoad(); } }
  else if (k === '+' || k === '=' || k === 'ArrowUp') vZoom(1.2);
  else if (k === '-' || k === 'ArrowDown') vZoom(1 / 1.2);
  else if (k === '0') { V.z = 0; V.x = V.y = 0; vLayout(); }
  else if (k === '1' || lk === 'z') { V.z = 1; V.x = V.y = 0; vLayout(); }
  else if (lk === 'h') { $('#viewer').classList.toggle('bare'); requestAnimationFrame(vLayout); }
  else if (lk === 'f' || k === 'F11') api.fullscreen();
  else if (lk === 'k') return false;
  else if (lk === 'l') return false;
  else if (e.ctrlKey || e.metaKey) return false;
  else return true; // other keys do nothing while the viewer is open
  e.preventDefault();
  return true;
}
addEventListener('resize', () => { if (V.open) vLayout(); });
