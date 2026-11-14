// Freeform tab engine: finds subjects on a solid background and builds cutouts.
//
// A subject is a recursive definition:  { parts: [ part, ... ], ops: [ op, ... ] }
//   part = { comps: [ {id, bbox:[x,y,w,h]} ] }   (detected pieces)  or another subject (after a merge)
//   op   = { t:'poly',  m:'add'|'cut'|'keep', pts:[[x,y],...] }          (source pixels)
//        | { t:'brush', m:'erase'|'restore', r, h (hardness 0..1), pts }
// The mask = union of the parts' masks, then each op in order.
const sharp = require('sharp');
const { estimateBg, bgWeights } = require('./bgmatch');

const ANALYSIS = 1600; // long side used for finding subjects and for previews

// ---------------- low level ----------------
function dilate(bin, w, h, r) {
  if (r <= 0) return bin;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  const pre = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    pre[0] = 0; for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + bin[o + x];
    for (let x = 0; x < w; x++) { const a = Math.max(0, x - r), b = Math.min(w, x + r + 1); if (pre[b] - pre[a] > 0) tmp[o + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    pre[0] = 0; for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) { const a = Math.max(0, y - r), b = Math.min(h, y + r + 1); if (pre[b] - pre[a] > 0) out[y * w + x] = 1; }
  }
  return out;
}
function label(bin, w, h) {
  const lab = new Int32Array(w * h), q = new Int32Array(w * h);
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!bin[s] || lab[s]) continue;
    n++; lab[s] = n; let qh = 0, qt = 0; q[qt++] = s;
    while (qh < qt) {
      const p = q[qh++], x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * h - w ? p + w : -1];
      for (const v of nb) if (v >= 0 && bin[v] && !lab[v]) { lab[v] = n; q[qt++] = v; }
    }
  }
  return { lab, n };
}

// pixels (RGB or RGBA) of an image at a long side, plus its real size
async function pixels(open, file, maxSide) {
  const p = await open(file);
  const r = maxSide ? p.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }) : p;
  const { data, info } = await r.toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: 4 };
}

// how solid the image's own transparency is (PNG cutouts can be used directly)
function alphaShare(px) {
  let t = 0; const n = px.w * px.h;
  for (let i = 3; i < px.data.length; i += 4 * 7) if (px.data[i] < 16) t++;
  return t / (n / 7);
}

// subject (foreground) alpha for every pixel
function fgAlpha(px, P, bg) {
  const n = px.w * px.h, a = new Uint8Array(n);
  if (P.useAlpha) { for (let p = 0; p < n; p++) a[p] = px.data[p * 4 + 3]; return a; }
  const wt = bgWeights(px.data, px.w, px.h, 4, bg, P.ffTol, P.ffSoft, P.ffHoles === 'all');
  for (let p = 0; p < n; p++) a[p] = 255 - wt[p];
  return a;
}

// ---------------- detection ----------------
// returns { W, H, scale, bg, useAlpha, comps:[{id,bbox,area}], lab (dilated label map, analysis size), aw, ah, px, alpha }
async function analyse(open, file, P, fullW, fullH) {
  const px = await pixels(open, file, ANALYSIS);
  const scale = px.w / fullW;
  const useAlpha = alphaShare(px) > 0.01;
  const flat = new Uint8Array(px.w * px.h * 3);
  for (let p = 0, q = 0; p < px.w * px.h; p++) { flat[q++] = px.data[p * 4]; flat[q++] = px.data[p * 4 + 1]; flat[q++] = px.data[p * 4 + 2]; }
  const bg = P.ffBgPick && /^#[0-9a-f]{6}$/i.test(P.ffBgPick) ? [1, 3, 5].map((i) => parseInt(P.ffBgPick.slice(i, i + 2), 16)) : estimateBg(flat, px.w, px.h).rgb;
  const PP = Object.assign({}, P, { useAlpha });
  const alpha = fgAlpha(px, PP, bg);
  const bin = new Uint8Array(px.w * px.h);
  for (let p = 0; p < bin.length; p++) bin[p] = alpha[p] > 127 ? 1 : 0;
  const gap = Math.max(2, Math.round((+P.ffGap || 0) * scale / 2));
  const dil = dilate(bin, px.w, px.h, gap);
  const { lab, n } = label(dil, px.w, px.h);
  const st = Array.from({ length: n + 1 }, () => ({ area: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1 }));
  for (let p = 0; p < bin.length; p++) {
    if (!bin[p]) continue;
    const s = st[lab[p]], x = p % px.w, y = (p / px.w) | 0;
    s.area++; if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x; if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
  }
  const minA = Math.pow(Math.max(0, +P.ffMinSize || 0) * scale, 2);
  const comps = [];
  for (let i = 1; i <= n; i++) {
    const s = st[i];
    if (!s.area || s.area < minA) continue;
    comps.push({ id: i, area: Math.round(s.area / scale / scale), bbox: [Math.floor(s.x0 / scale), Math.floor(s.y0 / scale), Math.ceil((s.x1 - s.x0 + 1) / scale), Math.ceil((s.y1 - s.y0 + 1) / scale)] });
  }
  comps.sort((a, b) => a.bbox[0] - b.bbox[0] || a.bbox[1] - b.bbox[1]);
  return { W: fullW, H: fullH, scale, bg, useAlpha, comps, lab, aw: px.w, ah: px.h, px, alpha };
}

// ---------------- masks ----------------
function svgFor(group, rx, ry, sc, w, h) {
  const pt = ([x, y]) => `${((x - rx) * sc).toFixed(2)},${((y - ry) * sc).toFixed(2)}`;
  let defs = '', body = '';
  group.forEach((op, i) => {
    if (op.t === 'poly') body += `<polygon points="${op.pts.map(pt).join(' ')}" fill="#fff"/>`;
    else {
      const r = Math.max(0.5, op.r * sc), hard = op.h == null ? 0.7 : op.h;
      const blur = r * (1 - hard) * 0.5;
      const pts = op.pts.length === 1 ? [op.pts[0], [op.pts[0][0] + 0.01, op.pts[0][1]]] : op.pts;
      const d = 'M' + pts.map(pt).join('L');
      const rr = blur > 0.3 ? r - blur : r;
      if (blur > 0.3) defs += `<filter id="b${i}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur.toFixed(2)}"/></filter>`;
      body += `<path d="${d}" fill="none" stroke="#fff" stroke-width="${(2 * rr).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${blur > 0.3 ? ` filter="url(#b${i})"` : ''}/>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`;
}
async function raster(group, rx, ry, sc, w, h) {
  const svg = svgFor(group, rx, ry, sc, w, h);
  const { data } = await sharp(Buffer.from(svg), { limitInputPixels: false }).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  return data;
}
// apply ops to a mask (Uint8Array w*h) whose top-left is source (rx, ry), at scale sc
async function applyOps(mask, ops, rx, ry, sc, w, h) {
  if (!ops || !ops.length) return mask;
  // consecutive ops with the same effect are drawn together
  const groups = [];
  for (const op of ops) {
    const key = op.t + ':' + op.m;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.ops.push(op); else groups.push({ key, ops: [op] });
  }
  for (const g of groups) {
    if (g.ops[0].t === 'island') { for (const op of g.ops) islandOp(mask, op, rx, ry, sc, w, h); continue; }
    const r = await raster(g.ops, rx, ry, sc, w, h);
    const m = g.ops[0].m;
    for (let i = 0; i < mask.length; i++) {
      const v = r[i];
      if (m === 'keep') mask[i] = (mask[i] * v + 127) / 255;
      else if (!v) continue;
      else if (m === 'add') mask[i] = Math.max(mask[i], v);
      else if (m === 'cut' || m === 'erase') mask[i] = (mask[i] * (255 - v) + 127) / 255;
      else if (m === 'restore') mask[i] = mask[i] + (((255 - mask[i]) * v + 127) / 255);
    }
  }
  return mask;
}
// keep or cut the separate piece under a clicked point (pt in source px)
function islandOp(mask, op, rx, ry, sc, w, h) {
  const cx = Math.round((op.pt[0] - rx) * sc), cy = Math.round((op.pt[1] - ry) * sc);
  const on = (i) => mask[i] > 96;
  // nearest solid pixel to the click (pieces can be thin)
  let seed = -1;
  const R = Math.max(3, Math.round((op.r || 6) * sc));
  for (let d = 0; d <= R && seed < 0; d++) {
    for (let y = cy - d; y <= cy + d && seed < 0; y++) for (let x = cx - d; x <= cx + d; x++) {
      if ((Math.abs(y - cy) !== d && Math.abs(x - cx) !== d) || x < 0 || y < 0 || x >= w || y >= h) continue;
      if (on(y * w + x)) { seed = y * w + x; break; }
    }
  }
  if (seed < 0) return; // nothing there: leave the cutout as it is
  const reg = new Uint8Array(w * h), q = new Int32Array(w * h);
  let qh = 0, qt = 0; reg[seed] = 1; q[qt++] = seed;
  while (qh < qt) {
    const p = q[qh++], x = p % w;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * h - w ? p + w : -1];
    for (const v of nb) if (v >= 0 && !reg[v] && on(v)) { reg[v] = 1; q[qt++] = v; }
  }
  // take the soft edge pixels next to the piece along with it
  const grow = Math.max(1, Math.round(2 * Math.max(1, sc)));
  for (let k = 0; k < grow; k++) {
    const add = [];
    for (let p = 0; p < w * h; p++) {
      if (reg[p] || !mask[p]) continue;
      const x = p % w;
      if ((x > 0 && reg[p - 1] === 1) || (x < w - 1 && reg[p + 1] === 1) || (p >= w && reg[p - w] === 1) || (p < w * h - w && reg[p + w] === 1)) add.push(p);
    }
    for (const p of add) reg[p] = 2;
    for (const p of add) reg[p] = 1;
  }
  for (let p = 0; p < w * h; p++) if (op.m === 'keep' ? !reg[p] : reg[p]) mask[p] = 0;
}

// extent of a subject definition (source px) — detected boxes plus anything ops add
function defExtent(def) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const addR = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
  const walk = (d) => {
    for (const p of d.parts || []) { if (p.comps) p.comps.forEach((c) => addR(...c.bbox)); else walk(p); }
    for (const op of d.ops || []) if (op.m === 'add' || op.m === 'restore') { const r = op.r || 0; for (const [x, y] of op.pts) addR(x - r, y - r, 2 * r, 2 * r); }
  };
  walk(def);
  return isFinite(x0) ? [x0, y0, x1 - x0, y1 - y0] : null;
}

// mask of a subject over region (rx, ry, w, h) in working pixels (sc = working / source)
// ctx: { alpha (working, whole image), lab (analysis), aw, ah, scaleA (analysis / source), ww (working width) , sc }
async function defMask(def, ctx, rx, ry, w, h) {
  let mask = new Uint8Array(w * h);
  for (const part of def.parts || []) {
    if (part.comps) {
      const ids = new Set(part.comps.map((c) => c.id));
      const k = ctx.scaleA / ctx.sc; // working px → analysis px
      for (let y = 0; y < h; y++) {
        const wy = ry + y, ay = Math.min(ctx.ah - 1, Math.floor(wy * k));
        for (let x = 0; x < w; x++) {
          const wx = rx + x, ax = Math.min(ctx.aw - 1, Math.floor(wx * k));
          if (!ids.has(ctx.lab[ay * ctx.aw + ax])) continue;
          const v = ctx.alpha[wy * ctx.ww + wx];
          if (v > mask[y * w + x]) mask[y * w + x] = v;
        }
      }
    } else {
      const sub = await defMask(part, ctx, rx, ry, w, h);
      for (let i = 0; i < mask.length; i++) if (sub[i] > mask[i]) mask[i] = sub[i];
    }
  }
  await applyOps(mask, def.ops, rx / ctx.sc, ry / ctx.sc, ctx.sc, w, h);
  return mask;
}

function blurMask(mask, w, h, sigma) {
  if (!(sigma > 0.25)) return Promise.resolve(mask);
  return sharp(Buffer.from(mask), { raw: { width: w, height: h, channels: 1 } }).blur(Math.max(0.3, sigma)).extractChannel(0).raw().toBuffer().then((b) => new Uint8Array(b.buffer, b.byteOffset, b.length));
}

// Build the RGBA cutout of a subject.
// work: { px (RGBA working pixels), alpha, sc (working / source), lab, aw, ah, scaleA, bg, useAlpha }
// box: optional fixed region in source px (used for export so it matches the preview exactly)
async function cutout(def, work, P, box) {
  const ext = box || defExtent(def);
  if (!ext) return null;
  const margin = Math.ceil(2 / work.sc + (+P.ffFeather || 0) * 2);
  let [bx, by, bw, bh] = box ? box : [ext[0] - margin, ext[1] - margin, ext[2] + margin * 2, ext[3] + margin * 2];
  // working region
  const W = work.px.w, H = work.px.h;
  let rx = Math.max(0, Math.floor(bx * work.sc)), ry = Math.max(0, Math.floor(by * work.sc));
  let rx1 = Math.min(W, Math.ceil((bx + bw) * work.sc)), ry1 = Math.min(H, Math.ceil((by + bh) * work.sc));
  const w = Math.max(1, rx1 - rx), h = Math.max(1, ry1 - ry);
  const ctx = { alpha: work.alpha, lab: work.lab, aw: work.aw, ah: work.ah, scaleA: work.scaleA, sc: work.sc, ww: W };
  let mask = await defMask(def, ctx, rx, ry, w, h);
  mask = await blurMask(mask, w, h, (+P.ffFeather || 0) * work.sc * 0.6);
  const out = Buffer.alloc(w * h * 4);
  const [br, bgc, bb] = work.bg;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = mask[i];
    if (!a) continue;
    const s = ((ry + y) * W + rx + x) * 4, o = i * 4;
    let r = work.px.data[s], g = work.px.data[s + 1], b = work.px.data[s + 2];
    const srcA = work.px.data[s + 3];
    if (!work.useAlpha && a < 250) {
      // take the background colour back out of soft edge pixels so there's no halo on a new colour
      const f = a / 255;
      r = Math.min(255, Math.max(0, (r - (1 - f) * br) / f)); g = Math.min(255, Math.max(0, (g - (1 - f) * bgc) / f)); b = Math.min(255, Math.max(0, (b - (1 - f) * bb) / f));
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
    out[o + 3] = work.useAlpha ? Math.min(a, srcA) : a;
    if (out[o + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (box) return { data: out, w, h, box: [bx, by, bw, bh], region: [rx, ry, w, h] };
  if (x1 < 0) return { empty: true };
  // tight box (+ margin) in source px, and the pixels cut to it
  const m = Math.ceil(2 + (+P.ffFeather || 0) * work.sc);
  const tx0 = Math.max(0, x0 - m), ty0 = Math.max(0, y0 - m), tx1 = Math.min(w, x1 + 1 + m), ty1 = Math.min(h, y1 + 1 + m);
  const tw = tx1 - tx0, th = ty1 - ty0, t = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) out.copy(t, y * tw * 4, ((ty0 + y) * w + tx0) * 4, ((ty0 + y) * w + tx1) * 4);
  const sb = [(rx + tx0) / work.sc, (ry + ty0) / work.sc, tw / work.sc, th / work.sc].map((v, i) => (i < 2 ? Math.floor(v) : Math.ceil(v)));
  return { data: t, w: tw, h: th, box: sb };
}

// remap detected piece ids after detection settings change (by overlap)
function iou(a, b) {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / (a[2] * a[3] + b[2] * b[3] - i || 1);
}

module.exports = { ANALYSIS, analyse, cutout, defExtent, applyOps, pixels, fgAlpha, iou, alphaShare };
