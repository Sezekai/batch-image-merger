// ---------- pan / zoom view used by the Freeform and Overlay tabs ----------
// wrap: the visible area. world: a child div holding content in world pixels.
// ui: a child div (not scaled) for handles and guides.
class PanZoom {
  constructor(wrap, onChange) {
    this.wrap = wrap; this.onChange = onChange || (() => {});
    this.world = wrap.querySelector('.world'); this.ui = wrap.querySelector('.uilayer');
    this.z = 1; this.x = 0; this.y = 0; this.fitted = true; this.bounds = { x: 0, y: 0, W: 100, H: 100 };
    this.space = false;
    // Ctrl + wheel zooms (around the middle of the window); wheel scrolls up/down; Shift + wheel scrolls sideways
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { this.zoomAt(Math.pow(1.0018, -e.deltaY)); return; }
      const d = e.deltaMode === 1 ? 40 : 1;
      if (e.shiftKey) this.x -= (e.deltaY || e.deltaX) * d;
      else { this.y -= e.deltaY * d; this.x -= e.deltaX * d; }
      this.fitted = false; this.apply();
    }, { passive: false });
    // middle button or Space + drag pans anywhere
    wrap.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && this.space)) { e.preventDefault(); e.stopPropagation(); this.pan(e); }
    }, true);
    new ResizeObserver(() => { if (this.fitted) this.fit(); else this.apply(); }).observe(wrap);
  }
  // drag to move the view (used for clicks outside the picture too)
  pan(e) {
    const sx = e.clientX - this.x, sy = e.clientY - this.y;
    this.wrap.classList.add('panning');
    const mv = (ev) => { this.x = ev.clientX - sx; this.y = ev.clientY - sy; this.fitted = false; this.apply(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); this.wrap.classList.remove('panning'); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  // is a screen point outside the content rectangle?
  outside(cx, cy, b = this.bounds) { const [x, y] = this.toWorld(cx, cy); return x < b.x || y < b.y || x > b.x + b.W || y > b.y + b.H; }
  setBounds(b) { this.bounds = b; if (this.fitted) this.fit(); }
  fit() {
    const b = this.bounds, pad = 30, W = this.wrap.clientWidth, H = this.wrap.clientHeight;
    if (!W || !H) return;
    this.z = Math.min((W - pad * 2) / Math.max(1, b.W), (H - pad * 2) / Math.max(1, b.H));
    if (!isFinite(this.z) || this.z <= 0) this.z = 1;
    this.x = (W - b.W * this.z) / 2 - b.x * this.z;
    this.y = (H - b.H * this.z) / 2 - b.y * this.z;
    this.fitted = true;
    this.apply();
  }
  zoomAt(f, cx, cy) {
    const r = this.wrap.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
    const z1 = clamp(this.z * f, 0.005, 40);
    this.x = px - ((px - this.x) * z1) / this.z; this.y = py - ((py - this.y) * z1) / this.z;
    this.z = z1; this.fitted = false; this.apply();
  }
  // actual size (100%), keeping the middle of the view still
  actual() { this.zoomAt(1 / this.z); }
  apply() {
    this.world.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.z})`;
    this.onChange(this);
  }
  toWorld(cx, cy) { const r = this.wrap.getBoundingClientRect(); return [(cx - r.left - this.x) / this.z, (cy - r.top - this.y) / this.z]; }
  toScreen(x, y) { return [x * this.z + this.x, y * this.z + this.y]; }
}
// keep track of the space bar for panning
addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e) && !modalOpen()) { for (const v of PanZoom.all || []) v.space = true; document.body.classList.add('spacepan'); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') { for (const v of PanZoom.all || []) v.space = false; document.body.classList.remove('spacepan'); } });
PanZoom.all = [];

// draw a brush/lasso path as SVG inside a world-coordinate svg element
function svgPath(pts) { return pts.length ? 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') : ''; }
function simplify(pts, minD) { const out = []; for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) >= minD) out.push(p); } const last = pts[pts.length - 1]; if (last && out[out.length - 1] !== last) out.push(last); return out; }
function pointInPoly(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }

// brush settings shared by both tabs (screen px)
const BRUSH = { size: 40, hard: 0.7 };
function brushCursor(wrap, on, x, y) {
  let c = wrap.querySelector('.brushcur');
  if (!c) { c = document.createElement('div'); c.className = 'brushcur'; wrap.appendChild(c); }
  c.style.display = on ? 'block' : 'none';
  if (!on) return;
  const r = wrap.getBoundingClientRect();
  Object.assign(c.style, { left: x - r.left + 'px', top: y - r.top + 'px', width: BRUSH.size + 'px', height: BRUSH.size + 'px' });
}
