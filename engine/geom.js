// Geometry shared by the window (preview) and the engine (export) for the Freeform and Overlay tabs.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.BIMGeom = m;
})(typeof self !== 'undefined' ? self : this, function () {
  // ---- Freeform ----
  // A placement: { cx, cy (centre, canvas px), s (scale), r (degrees), flip }
  // Its subject has box [x, y, w, h] in source pixels.
  function placedSize(p, box) {
    const w = box[2] * p.s, h = box[3] * p.s;
    const a = (p.r * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    return { w, h, bw: w * c + h * s, bh: w * s + h * c };
  }
  function placedBounds(p, box) {
    const z = placedSize(p, box);
    return { x0: p.cx - z.bw / 2, y0: p.cy - z.bh / 2, x1: p.cx + z.bw / 2, y1: p.cy + z.bh / 2 };
  }
  // The canvas rectangle in world coordinates
  function ffCanvas(placed, boxOf, st) {
    if (st.ffCanvas === 'fixed') return { x: 0, y: 0, W: Math.max(1, Math.round(+st.ffW || 1000)), H: Math.max(1, Math.round(+st.ffH || 1000)) };
    if (!placed.length) return { x: 0, y: 0, W: 1000, H: 700, empty: true };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of placed) { const b = boxOf(p); if (!b) continue; const r = placedBounds(p, b); x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1); }
    if (!isFinite(x0)) return { x: 0, y: 0, W: 1000, H: 700, empty: true };
    const pad = Math.max(0, Math.round(+st.ffPad || 0));
    const x = Math.floor(x0 - pad), y = Math.floor(y0 - pad);
    return { x, y, W: Math.max(1, Math.ceil(x1 + pad) - x), H: Math.max(1, Math.ceil(y1 + pad) - y) };
  }

  // ---- Overlay ----
  const apply = (m, x, y) => { const w = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; };
  const mul = (A, B) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; };
  function inv(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-14) return null;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  const S = (sx, sy = sx) => [sx, 0, 0, 0, sy, 0, 0, 0, 1];
  const Tr = (x, y) => [1, 0, x, 0, 1, y, 0, 0, 1];
  // how many close-up pixels make one base pixel at a point (roughly): linear scale of the transform
  const linScale = (m) => Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3]));
  // similarity from parts: centre (base px), scale, rotation (deg) of a close-up w x h
  function simFromParts(cx, cy, s, rdeg, w, h) {
    const a = (rdeg * Math.PI) / 180, c = Math.cos(a) * s, sn = Math.sin(a) * s;
    return [c, -sn, cx - (c * w / 2 - sn * h / 2), sn, c, cy - (sn * w / 2 + c * h / 2), 0, 0, 1];
  }
  function partsOf(m, w, h) {
    const [cx, cy] = apply(m, w / 2, h / 2);
    return { cx, cy, s: linScale(m), r: (Math.atan2(m[3], m[0]) * 180) / Math.PI, persp: Math.abs(m[6]) > 1e-9 || Math.abs(m[7]) > 1e-9 };
  }
  // output scale for an overlay (multiplies the base size)
  function ovOutScale(st, base, layers) {
    const mx = 60000 / Math.max(base.w, base.h);
    let k = 1;
    if (st.ovScale === '2') k = 2; else if (st.ovScale === '3') k = 3; else if (st.ovScale === '4') k = 4;
    else if (st.ovScale === 'custom') k = Math.max(16, +st.ovCustomW || base.w) / base.w;
    else if (st.ovScale === 'match') { k = 1; for (const l of layers) if (l.m && l.visible !== false) k = Math.max(k, 1 / Math.max(1e-6, linScale(l.m))); k = Math.min(k, 8); }
    return Math.min(k, mx);
  }
  // CSS matrix3d for a 3x3 projective matrix
  const css = (m) => `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,${m[8]})`;

  return { placedSize, placedBounds, ffCanvas, apply, mul, inv, S, Tr, linScale, simFromParts, partsOf, ovOutScale, css };
});
