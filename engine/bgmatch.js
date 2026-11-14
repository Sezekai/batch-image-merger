// Background matching on raw RGB buffers (3 channels).
// estimateBg: finds the most common colour around the image's edges.
// matchBg: flood-fills the background from the edges (or everywhere) and recolours it.

function estimateBg(data, w, h) {
  const ring = Math.max(1, Math.min(6, Math.round(Math.min(w, h) * 0.006)));
  const counts = new Uint32Array(32768);
  const sums = new Float64Array(32768 * 3);
  let total = 0;
  const add = (x, y) => {
    const i = (y * w + x) * 3;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts[k]++; sums[k * 3] += r; sums[k * 3 + 1] += g; sums[k * 3 + 2] += b; total++;
  };
  const stepX = Math.max(1, Math.floor(w / 1500)), stepY = Math.max(1, Math.floor(h / 1500));
  for (let d = 0; d < ring; d++) {
    for (let x = 0; x < w; x += stepX) { add(x, d); add(x, h - 1 - d); }
    for (let y = ring; y < h - ring; y += stepY) { add(d, y); add(w - 1 - d, y); }
  }
  // best bucket including its immediate neighbours (colours often straddle a bucket edge)
  let best = -1, bestScore = -1;
  for (let k = 0; k < 32768; k++) {
    if (!counts[k]) continue;
    const r = k >> 10, g = (k >> 5) & 31, b = k & 31;
    let sc = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
      const rr = r + dr, gg = g + dg, bb = b + db;
      if (rr < 0 || gg < 0 || bb < 0 || rr > 31 || gg > 31 || bb > 31) continue;
      sc += counts[(rr << 10) | (gg << 5) | bb];
    }
    if (sc > bestScore) { bestScore = sc; best = k; }
  }
  const r0 = best >> 10, g0 = (best >> 5) & 31, b0 = best & 31;
  let n = 0, sr = 0, sg = 0, sb = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
    const rr = r0 + dr, gg = g0 + dg, bb = b0 + db;
    if (rr < 0 || gg < 0 || bb < 0 || rr > 31 || gg > 31 || bb > 31) continue;
    const k = (rr << 10) | (gg << 5) | bb;
    n += counts[k]; sr += sums[k * 3]; sg += sums[k * 3 + 1]; sb += sums[k * 3 + 2];
  }
  return { rgb: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)], share: total ? n / total : 0 };
}

// How much each pixel belongs to the background (0..255): close colours flood-filled from the edges,
// or matched everywhere. `ch` = channels per pixel in data.
function bgWeights(data, w, h, ch, bgc, tol0, soft0, everywhere) {
  const [br, bg, bb] = bgc;
  const tol = Math.max(0, +tol0 || 0), soft = Math.max(0, +soft0 || 0);
  const tol2 = tol * tol, lim = tol + soft, lim2 = lim * lim;
  const N = w * h;
  const wt = new Uint8Array(N);
  const dist2 = (p) => { const i = p * ch; const a = data[i] - br, b = data[i + 1] - bg, c = data[i + 2] - bb; return a * a + b * b + c * c; };
  const softW = (d2) => (soft > 0 ? Math.max(1, Math.round(255 * (1 - (Math.sqrt(d2) - tol) / soft))) : 0);
  if (everywhere) {
    for (let p = 0; p < N; p++) { const d2 = dist2(p); if (d2 <= tol2) wt[p] = 255; else if (d2 <= lim2) wt[p] = softW(d2); }
  } else {
    const seen = new Uint8Array(N);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    const visit = (p) => {
      if (seen[p]) return; seen[p] = 1;
      const d2 = dist2(p);
      if (d2 <= tol2) { wt[p] = 255; q[qt++] = p; } else if (d2 <= lim2) wt[p] = softW(d2);
    };
    for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
    while (qh < qt) {
      const p = q[qh++], x = p % w;
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (p >= w) visit(p - w);
      if (p < N - w) visit(p + w);
    }
  }
  return wt;
}

// opts: { bg:[r,g,b] (this image's background), target:[r,g,b], tol, soft, mode:'flat'|'shift', everywhere }
function matchBg(data, w, h, opts) {
  const [br, bg, bb] = opts.bg, [tr, tg, tb] = opts.target;
  const wt = bgWeights(data, w, h, 3, opts.bg, opts.tol, opts.soft, opts.everywhere);
  const N = w * h;
  const dr = tr - br, dg = tg - bg, db = tb - bb;
  const flat = opts.mode !== 'shift';
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  let changed = 0;
  for (let p = 0; p < N; p++) {
    const a = wt[p];
    if (!a) continue;
    const i = p * 3;
    changed++;
    if (a === 255 && flat) { data[i] = tr; data[i + 1] = tg; data[i + 2] = tb; continue; }
    const f = a / 255;
    data[i] = cl(Math.round(data[i] + dr * f)); data[i + 1] = cl(Math.round(data[i + 1] + dg * f)); data[i + 2] = cl(Math.round(data[i + 2] + db * f));
  }
  return { changed, share: changed / N };
}

const hexToRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); const v = m ? parseInt(m[1], 16) : 0x808080; return [v >> 16, (v >> 8) & 255, v & 255]; };
const rgbToHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

module.exports = { estimateBg, matchBg, bgWeights, hexToRgb, rgbToHex };
