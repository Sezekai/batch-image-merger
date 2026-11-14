// Worker operations for the Freeform and Overlay tabs.
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const sharp = require('sharp');
const FF = require('./freeform');
const G = require('./geom');
const AL = require('./align');
const { rgbToHex } = require('./bgmatch');

module.exports = function makeOps({ open, sha, CACHE }) {
  // ---------- caches ----------
  const lru = (max) => { const m = new Map(); return { get(k) { const v = m.get(k); if (v !== undefined) { m.delete(k); m.set(k, v); } return v; }, set(k, v) { m.set(k, v); while (m.size > max) m.delete(m.keys().next().value); } }; };
  const ANA = lru(6), FEAT = new Map();
  const detKey = (P) => JSON.stringify([P.ffTol, P.ffSoft, P.ffHoles, P.ffGap, P.ffMinSize, P.ffBgPick || '']);
  async function analysis(a) {
    const k = `${a.file}|${a.mtime}|${detKey(a.P)}`;
    let r = ANA.get(k);
    if (!r) { r = FF.analyse(open, a.file, a.P, a.w, a.h); ANA.set(k, r); r.catch(() => ANA.set(k, undefined)); }
    return r;
  }
  const workOf = (an) => ({ px: an.px, alpha: an.alpha, sc: an.scale, lab: an.lab, aw: an.aw, ah: an.ah, scaleA: an.scale, bg: an.bg, useAlpha: an.useAlpha });
  const cfile = (key, ext) => { const h = sha(key); return path.join(CACHE, 'ff', h.slice(0, 2), h + ext); };
  async function writeOnce(out, make) {
    if (fs.existsSync(out)) return;
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await make(out + '.tmp');
    await fsp.rename(out + '.tmp', out);
  }

  // generic larger preview (for the Overlay tab and the Freeform source view)
  async function preview({ file, size, mtime, max = 2048 }) {
    const out = cfile(`pv2|${file}|${size}|${mtime}|${max}`, '.webp');
    await writeOnce(out, async (tmp) => (await open(file)).resize(max, max, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 90 }).toFile(tmp));
    const m = await sharp(out).metadata();
    return { path: out, w: m.width, h: m.height };
  }

  // ---------- Freeform ----------
  async function ffDetect(a) {
    const metaFile = cfile(`det2|${a.file}|${a.size}|${a.mtime}|${detKey(a.P)}`, '.json');
    try { return JSON.parse(await fsp.readFile(metaFile, 'utf8')); } catch {}
    const an = await analysis(a);
    const res = { comps: an.comps.map((c) => ({ id: c.id, bbox: c.bbox, area: c.area })), bg: rgbToHex(an.bg), useAlpha: an.useAlpha };
    await fsp.mkdir(path.dirname(metaFile), { recursive: true });
    await fsp.writeFile(metaFile, JSON.stringify(res));
    return res;
  }
  async function ffCutout(a) {
    const key = `cut3|${a.file}|${a.size}|${a.mtime}|${detKey(a.P)}|${a.P.ffFeather}|${JSON.stringify(a.def)}`;
    const out = cfile(key, '.png'), meta = out + '.json';
    try { return JSON.parse(await fsp.readFile(meta, 'utf8')); } catch {}
    const an = await analysis(a);
    const c = await FF.cutout(a.def, workOf(an), a.P);
    let res;
    if (!c || c.empty) res = { empty: true };
    else {
      await writeOnce(out, (tmp) => sharp(c.data, { raw: { width: c.w, height: c.h, channels: 4 } }).png({ compressionLevel: 3 }).toFile(tmp));
      res = { path: out, box: c.box, pw: c.w, ph: c.h };
    }
    await fsp.mkdir(path.dirname(meta), { recursive: true });
    await fsp.writeFile(meta, JSON.stringify(res));
    return res;
  }

  // clip a raw RGBA piece to the canvas and return a composite entry
  async function clipped(buf, w, h, left, top, CW, CH) {
    const x0 = Math.max(0, left), y0 = Math.max(0, top), x1 = Math.min(CW, left + w), y1 = Math.min(CH, top + h);
    if (x1 <= x0 || y1 <= y0) return null;
    if (x0 === left && y0 === top && x1 === left + w && y1 === top + h) return { input: buf, raw: { width: w, height: h, channels: 4 }, left, top };
    const d = await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).raw().toBuffer();
    return { input: d, raw: { width: x1 - x0, height: y1 - y0, channels: 4 }, left: x0, top: y0 };
  }

  async function encode(img, o) {
    if (o.format === 'png') img = img.png({ compressionLevel: Math.max(0, Math.min(9, +o.pngLevel || 6)) });
    else img = img.jpeg({ quality: Math.max(1, Math.min(100, +o.quality || 92)), chromaSubsampling: o.full444 ? '4:4:4' : '4:2:0' });
    await fsp.mkdir(path.dirname(o.path), { recursive: true });
    const tmp = o.path + '.part';
    await img.toFile(tmp);
    await fsp.rename(tmp, o.path);
    const st = await fsp.stat(o.path);
    return { bytes: st.size, path: o.path };
  }
  const checkSize = (W, H, o) => {
    if (o.format === 'jpg' && (W > 65500 || H > 65500)) throw new Error(`The image would be ${W} × ${H} px, but JPG can't be bigger than 65,500 px on a side. Save as PNG or make it smaller.`);
    if (W * H > 1.2e9) throw new Error(`The image would be ${W} × ${H} px, which is too big to make.`);
  };

  // job: { P, canvas:{x,y,W,H}, bg, transparent, items:[{file,w,h,size,mtime,def,box,cx,cy,s,r,flip}], scale, out }
  async function renderFreeform(job, progress) {
    const k = job.scale || 1, P = job.P;
    const CW = Math.max(1, Math.round(job.canvas.W * k)), CH = Math.max(1, Math.round(job.canvas.H * k));
    checkSize(CW, CH, job.out);
    const transparent = job.transparent && job.out.format === 'png';
    const comps = [];
    const full = new Map();
    let done = 0;
    for (const it of job.items) {
      const fk = `${it.file}|${it.mtime}`;
      let work = full.get(fk);
      if (!work) {
        const an = await analysis({ file: it.file, size: it.size, mtime: it.mtime, w: it.w, h: it.h, P });
        // full-resolution pixels for the final image (preview-size ones when making a small preview)
        const px = k * it.s >= 0.9 || job.full ? await FF.pixels(open, it.file, 0) : an.px;
        const sc = px.w / it.w;
        const alpha = px === an.px ? an.alpha : FF.fgAlpha(px, Object.assign({}, P, { useAlpha: an.useAlpha }), an.bg);
        work = { px, alpha, sc, lab: an.lab, aw: an.aw, ah: an.ah, scaleA: an.scale, bg: an.bg, useAlpha: an.useAlpha };
        full.clear(); full.set(fk, work);
      }
      const c = await FF.cutout(it.def, work, P, it.box);
      if (!c) continue;
      // pad to the whole box so the centre is exactly where the preview put it
      const [bx, by, bw, bh] = c.box, sc = work.sc;
      const BW = Math.max(1, Math.round(bw * sc)), BH = Math.max(1, Math.round(bh * sc));
      const pad = Buffer.alloc(BW * BH * 4);
      const ox = c.region[0] - Math.round(bx * sc), oy = c.region[1] - Math.round(by * sc);
      for (let y = 0; y < c.h; y++) {
        const ty = y + oy; if (ty < 0 || ty >= BH) continue;
        const sx0 = Math.max(0, -ox), sx1 = Math.min(c.w, BW - ox);
        if (sx1 > sx0) c.data.copy(pad, (ty * BW + sx0 + ox) * 4, (y * c.w + sx0) * 4, (y * c.w + sx1) * 4);
      }
      const tw = Math.max(1, Math.round(bw * it.s * k)), th = Math.max(1, Math.round(bh * it.s * k));
      let p = sharp(pad, { raw: { width: BW, height: BH, channels: 4 } }).resize(tw, th, { fit: 'fill', kernel: 'lanczos3' });
      if (it.flip) p = sharp(await p.raw().toBuffer(), { raw: { width: tw, height: th, channels: 4 } }).flop();
      if (it.r) p = sharp(await p.raw().toBuffer(), { raw: { width: tw, height: th, channels: 4 } }).rotate(it.r, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      const { data, info } = await p.raw().toBuffer({ resolveWithObject: true });
      const cx = (it.cx - job.canvas.x) * k, cy = (it.cy - job.canvas.y) * k;
      const e = await clipped(data, info.width, info.height, Math.round(cx - info.width / 2), Math.round(cy - info.height / 2), CW, CH);
      if (e) comps.push(e);
      done++; if (progress) progress({ done, total: job.items.length });
    }
    const bg = transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : job.bg;
    // composite in batches to keep memory sane with many pieces
    let base = await sharp({ create: { width: CW, height: CH, channels: 4, background: bg }, limitInputPixels: false }).raw().toBuffer();
    for (let i = 0; i < comps.length; i += 12) {
      base = await sharp(base, { raw: { width: CW, height: CH, channels: 4 }, limitInputPixels: false }).composite(comps.slice(i, i + 12)).raw().toBuffer();
    }
    let img = sharp(base, { raw: { width: CW, height: CH, channels: 4 }, limitInputPixels: false });
    if (!transparent) img = img.flatten({ background: job.bg }).removeAlpha();
    const r = await encode(img, job.out);
    return { ...r, W: CW, H: CH };
  }

  // ---------- Overlay ----------
  async function ovAlign(a) {
    try { return await AL.align(open, a.base, a.close, a.kind, FEAT); }
    catch (e) { return { ok: false, reason: String(e.message || e) }; }
  }
  async function ovPoints(a) { return { m: await AL.fromPoints(a.pairs, a.kind) }; }
  async function ovGuessBase({ items }) {
    if (items.length < 2) return { base: items[0] && items[0].file };
    const list = items.slice(0, 8);
    const feats = [];
    for (const it of list) { const g = await AL.greyAt(open, it.file, 900); feats.push({ f: await AL.features(g, 1500), it, s: g.w / it.w }); }
    const votes = new Array(list.length).fill(0);
    for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const pairs = await AL.matchFeatures(feats[i].f, feats[j].f);
      if (pairs.length < 12) continue;
      const r = AL.ransacSimilarity(pairs, 3, 800);
      if (!r || r.inliers < 10) continue;
      const m = r.m;
      // real scale between full-res images: (pixels in j per pixel in i)
      const s = Math.hypot(m[0], m[3]) * feats[i].s / feats[j].s;
      if (s < 0.9) votes[j]++;
    }
    let best = 0; votes.forEach((v, i) => { if (v > votes[best]) best = i; });
    if (!votes[best]) { let a = 0; list.forEach((it, i) => { if (it.w * it.h < list[a].w * list[a].h) a = i; }); best = a; }
    return { base: list[best].file, votes };
  }

  // colour match gains: close-up colours → base colours over the area it covers
  async function colourGains(baseRGB, closeRGB, m) {
    const s = [[0, 0, 0], [0, 0, 0]], q = [[0, 0, 0], [0, 0, 0]];
    let n = 0;
    const step = Math.max(1, Math.floor(Math.sqrt((closeRGB.w * closeRGB.h) / 40000)));
    for (let v = 0; v < closeRGB.h; v += step) for (let u = 0; u < closeRGB.w; u += step) {
      const [X, Y] = G.apply(m, u / closeRGB.sc, v / closeRGB.sc);
      const bx = Math.round(X * baseRGB.sc), by = Math.round(Y * baseRGB.sc);
      if (bx < 0 || by < 0 || bx >= baseRGB.w || by >= baseRGB.h) continue;
      const ci = (v * closeRGB.w + u) * 3, bi = (by * baseRGB.w + bx) * 3;
      for (let c = 0; c < 3; c++) { const a = closeRGB.data[ci + c], b = baseRGB.data[bi + c]; s[0][c] += a; q[0][c] += a * a; s[1][c] += b; q[1][c] += b * b; }
      n++;
    }
    if (n < 50) return null;
    const g = [], o = [];
    for (let c = 0; c < 3; c++) {
      const ma = s[0][c] / n, mb = s[1][c] / n;
      const sa = Math.sqrt(Math.max(1, q[0][c] / n - ma * ma)), sb = Math.sqrt(Math.max(1, q[1][c] / n - mb * mb));
      const gain = Math.min(1.6, Math.max(0.6, sb / sa));
      g.push(gain); o.push(mb - ma * gain);
    }
    return { g, o };
  }
  async function rgbAt(file, w, max) {
    const p = await open(file);
    const { data, info } = await p.flatten({ background: '#ffffff' }).toColourspace('srgb').resize(max, max, { fit: 'inside', withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height, sc: info.width / w };
  }
  const GAINS = lru(40);
  async function ovGains(a) {
    const k = JSON.stringify([a.base.file, a.base.mtime, a.close.file, a.close.mtime, a.m.map((v) => +v.toFixed(5))]);
    let g = GAINS.get(k);
    if (!g) {
      g = (async () => {
        const b = await rgbAt(a.base.file, a.base.w, 1200);
        // compare at the same detail: shrink the close-up to the size it covers on the base
        const side = Math.max(16, Math.round(Math.max(a.close.w, a.close.h) * G.linScale(a.m) * b.sc));
        return colourGains(b, await rgbAt(a.close.file, a.close.w, side), a.m);
      })();
      GAINS.set(k, g);
    }
    return { gains: await g };
  }

  // mask for a close-up at (cw x ch), scale sc of its source size; edge feather in px at this size
  async function closeMask(layer, cw, ch, sc, feather) {
    const mask = new Uint8Array(cw * ch);
    const f = Math.max(0, feather);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const d = Math.min(x + 0.5, y + 0.5, cw - x - 0.5, ch - y - 0.5);
      mask[y * cw + x] = f > 0.5 ? Math.max(0, Math.min(255, Math.round((d / f) * 255))) : 255;
    }
    await FF.applyOps(mask, layer.ops, 0, 0, sc, cw, ch);
    return mask;
  }

  // job: { base:{file,w,h}, layers:[{file,w,h,mtime,m,opacity,gains,feather,ops}], k, out }
  async function renderOverlay(job, progress) {
    const { cv } = await AL.loadCvBox();
    const k = job.k * (job.scale || 1);
    const OW = Math.max(1, Math.round(job.base.w * k)), OH = Math.max(1, Math.round(job.base.h * k));
    checkSize(OW, OH, job.out);
    const canvas = await (await open(job.base.file)).flatten({ background: '#ffffff' }).toColourspace('srgb').resize(OW, OH, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
    let done = 0;
    for (const L of job.layers) {
      const M = G.mul(G.S(k), L.m); // close full → output
      let s = G.linScale(M);
      const pre = Math.min(1, s);
      const cw = Math.max(1, Math.round(L.w * pre)), ch = Math.max(1, Math.round(L.h * pre));
      const Mp = G.mul(M, G.S(L.w / cw, L.h / ch));
      // where it lands
      const cs = [[0, 0], [cw, 0], [cw, ch], [0, ch]].map(([x, y]) => G.apply(Mp, x, y));
      const x0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0])))), y0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1]))));
      const x1 = Math.min(OW, Math.ceil(Math.max(...cs.map((c) => c[0])))), y1 = Math.min(OH, Math.ceil(Math.max(...cs.map((c) => c[1]))));
      if (x1 <= x0 || y1 <= y0) { done++; continue; }
      const pw = x1 - x0, ph = y1 - y0;
      const src = await (await open(L.file)).flatten({ background: '#ffffff' }).toColourspace('srgb').resize(cw, ch, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
      const mask = await closeMask(L, cw, ch, cw / L.w, (L.feather || 0) * Math.min(1, cw / (L.w * s)) );
      const rgba = new Uint8Array(cw * ch * 4);
      const gg = L.gains;
      for (let p = 0; p < cw * ch; p++) {
        for (let c = 0; c < 3; c++) { let v = src[p * 3 + c]; if (gg) v = v * gg.g[c] + gg.o[c]; rgba[p * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v; }
        rgba[p * 4 + 3] = mask[p];
      }
      const T = G.mul(G.Tr(-x0, -y0), Mp);
      const sm = cv.matFromArray(ch, cw, cv.CV_8UC4, rgba);
      const dm = new cv.Mat();
      const persp = Math.abs(T[6]) > 1e-12 || Math.abs(T[7]) > 1e-12;
      if (persp) { const Hm = cv.matFromArray(3, 3, cv.CV_64F, T); cv.warpPerspective(sm, dm, Hm, new cv.Size(pw, ph), cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0)); Hm.delete(); }
      else { const Am = cv.matFromArray(2, 3, cv.CV_64F, T.slice(0, 6)); cv.warpAffine(sm, dm, Am, new cv.Size(pw, ph), cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0)); Am.delete(); }
      const d = dm.data, op = Math.max(0, Math.min(1, L.opacity == null ? 1 : L.opacity));
      for (let y = 0; y < ph; y++) {
        let ci = ((y0 + y) * OW + x0) * 3, di = y * pw * 4;
        for (let x = 0; x < pw; x++, ci += 3, di += 4) {
          const a = (d[di + 3] / 255) * op;
          if (a <= 0) continue;
          canvas[ci] = d[di] * a + canvas[ci] * (1 - a); canvas[ci + 1] = d[di + 1] * a + canvas[ci + 1] * (1 - a); canvas[ci + 2] = d[di + 2] * a + canvas[ci + 2] * (1 - a);
        }
      }
      sm.delete(); dm.delete();
      done++; if (progress) progress({ done, total: job.layers.length });
    }
    const r = await encode(sharp(canvas, { raw: { width: OW, height: OH, channels: 3 }, limitInputPixels: false }), job.out);
    return { ...r, W: OW, H: OH };
  }

  return { preview, ffDetect, ffCutout, renderFreeform, ovAlign, ovPoints, ovGuessBase, ovGains, renderOverlay };
};
