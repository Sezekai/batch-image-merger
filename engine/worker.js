// Image engine. Runs in a worker thread so the window never freezes.
const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const sharp = require('sharp');
const { computeLayout, scaleLayout } = require('./layout');
const { estimateBg, matchBg, hexToRgb, rgbToHex } = require('./bgmatch');
const { decodeBmp, bmpSize } = require('./bmp');

sharp.cache(false);
const CACHE = workerData.cacheDir;
const EXTS = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.webp', '.bmp', '.tif', '.tiff', '.avif', '.gif']);
const THUMB = 640;

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const isBmp = (p) => path.extname(p).toLowerCase() === '.bmp';
const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// open an image as a sharp pipeline with camera rotation applied
async function open(file) {
  if (isBmp(file)) {
    const { data, width, height } = decodeBmp(await fsp.readFile(file));
    return sharp(data, { raw: { width, height, channels: 4 } });
  }
  return sharp(file, { failOn: 'none', limitInputPixels: false, pages: 1 }).rotate();
}

async function dims(file) {
  if (isBmp(file)) { const s = bmpSize(file); return { w: s.width, h: s.height }; }
  const m = await sharp(file, { failOn: 'none', limitInputPixels: false }).metadata();
  const swap = m.orientation >= 5 && m.orientation <= 8;
  const w = m.autoOrient ? m.autoOrient.width : swap ? m.height : m.width;
  const h = m.autoOrient ? m.autoOrient.height : swap ? m.width : m.height;
  if (!w || !h) throw new Error('Could not read the image size');
  return { w, h };
}

async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}

// raw RGB (3 channel, 8 bit) of a pipeline, flattened onto a colour
async function rawRGB(pipe, bg) {
  const { data, info } = await pipe.flatten({ background: bg }).toColourspace('srgb').removeAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) {
    // greyscale that stayed 1 channel: expand
    const n = info.width * info.height, out = Buffer.alloc(n * 3), c = info.channels;
    for (let p = 0; p < n; p++) { const v = data[p * c]; out[p * 3] = out[p * 3 + 1] = out[p * 3 + 2] = v; }
    return { data: out, w: info.width, h: info.height };
  }
  return { data, w: info.width, h: info.height };
}

const ops = {
  async scan({ dir, known = {}, exclude = [] }) {
    let names;
    try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch { return { missing: true, files: [] }; }
    const ex = new Set(exclude.map((p) => path.resolve(p).toLowerCase()));
    const list = names.filter((d) => d.isFile() && EXTS.has(path.extname(d.name).toLowerCase()) && !ex.has(path.resolve(dir, d.name).toLowerCase())).map((d) => d.name).sort(coll.compare);
    const files = await pool(list, 8, async (file) => {
      const full = path.join(dir, file);
      try {
        const st = await fsp.stat(full);
        const k = known[file];
        if (k && k.size === st.size && k.mtime === st.mtimeMs && k.w) return { file, size: st.size, mtime: st.mtimeMs, w: k.w, h: k.h };
        const d = await dims(full);
        return { file, size: st.size, mtime: st.mtimeMs, w: d.w, h: d.h };
      } catch (e) { return { file, err: String(e.message || e) }; }
    });
    return { missing: false, files };
  },

  async listDirs({ roots }) {
    // every folder (up to 3 levels down) that directly holds images
    const found = [];
    const walk = async (d, depth) => {
      let ents;
      try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
      if (ents.some((e) => e.isFile() && EXTS.has(path.extname(e.name).toLowerCase()))) found.push(d);
      if (depth >= 3) return;
      const subs = ents.filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$')).map((e) => e.name).sort(coll.compare);
      for (const s of subs) await walk(path.join(d, s), depth + 1);
    };
    for (const r of roots) {
      let st; try { st = await fsp.stat(r); } catch { continue; }
      if (st.isFile()) { if (EXTS.has(path.extname(r).toLowerCase())) found.push(path.dirname(r)); continue; }
      await walk(r, 0);
    }
    return [...new Set(found)];
  },

  async thumb({ file, size, mtime }) {
    const key = sha(`t3|${file}|${size}|${mtime}`);
    const out = path.join(CACHE, 'thumbs', key.slice(0, 2), key + '.webp');
    if (fs.existsSync(out)) return { path: out };
    await fsp.mkdir(path.dirname(out), { recursive: true });
    const p = await open(file);
    await p.resize(THUMB, THUMB, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toFile(out + '.tmp');
    await fsp.rename(out + '.tmp', out);
    return { path: out };
  },

  async bgest({ file, size, mtime }) {
    const p = await open(file);
    const r = await rawRGB(p.resize(THUMB, THUMB, { fit: 'inside', withoutEnlargement: true }), '#ffffff');
    const e = estimateBg(r.data, r.w, r.h);
    return { bg: rgbToHex(e.rgb), share: e.share };
  },

  // thumbnail with the background recoloured
  async mthumb({ file, size, mtime, m }) {
    const key = sha(`m3|${file}|${size}|${mtime}|${JSON.stringify(m)}`);
    const out = path.join(CACHE, 'mthumbs', key.slice(0, 2), key + '.webp');
    if (fs.existsSync(out)) return { path: out };
    await fsp.mkdir(path.dirname(out), { recursive: true });
    const p = await open(file);
    const r = await rawRGB(p.resize(THUMB, THUMB, { fit: 'inside', withoutEnlargement: true }), m.flatten || '#ffffff');
    const bg = m.bg ? hexToRgb(m.bg) : estimateBg(r.data, r.w, r.h).rgb;
    // tolerances are tuned for full-size images; small previews are a little blurrier, which is fine
    matchBg(r.data, r.w, r.h, { bg, target: hexToRgb(m.target), tol: m.tol, soft: m.soft, mode: m.mode, everywhere: m.everywhere });
    await sharp(r.data, { raw: { width: r.w, height: r.h, channels: 3 } }).webp({ quality: 88 }).toFile(out + '.tmp');
    await fsp.rename(out + '.tmp', out);
    return { path: out };
  },

  // Full render of one set. job: { items:[{key,path,w,h,blank,fx,fy,m}], settings, bg, scale, out:{path,format,quality,full444,pngLevel} }
  async render(job, progress) {
    const s = job.settings;
    let L = computeLayout(job.items, s);
    if (L.empty) throw new Error('This set has no images to merge');
    const sc = job.scale || 1;
    if (sc !== 1) L = scaleLayout(L, sc);
    if (job.out.format === 'jpg' && (L.W > 65500 || L.H > 65500)) throw new Error(`The merged image would be ${L.W} × ${L.H} px, but JPG can't be bigger than 65,500 px on a side. Save as PNG or use a smaller size.`);
    const byKey = new Map(job.items.map((it) => [it.key, it]));
    const comps = [];
    for (const f of L.fills) comps.push({ input: { create: { width: f.w, height: f.h, channels: 3, background: f.c } }, left: f.x, top: f.y });
    const tiles = L.tiles.filter((t) => !t.blank && t.img);
    let done = 0;
    for (const t of tiles) {
      const it = byKey.get(t.key);
      const ix = Math.max(t.x, t.img.x), iy = Math.max(t.y, t.img.y);
      const ix2 = Math.min(t.x + t.w, t.img.x + t.img.w), iy2 = Math.min(t.y + t.h, t.img.y + t.img.h);
      if (ix2 <= ix || iy2 <= iy) continue;
      let p = await open(it.path);
      if (it.m) {
        const r = await rawRGB(p, job.bg);
        const bg = estimateBg(r.data, r.w, r.h).rgb;
        matchBg(r.data, r.w, r.h, { bg, target: hexToRgb(it.m.target), tol: it.m.tol, soft: it.m.soft, mode: it.m.mode, everywhere: it.m.everywhere });
        p = sharp(r.data, { raw: { width: r.w, height: r.h, channels: 3 } });
      }
      const piece = p.flatten({ background: job.bg }).toColourspace('srgb').removeAlpha()
        .resize(t.img.w, t.img.h, { fit: 'fill', kernel: 'lanczos3' })
        .extract({ left: ix - t.img.x, top: iy - t.img.y, width: ix2 - ix, height: iy2 - iy });
      const { data, info } = await piece.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
      comps.push({ input: data, raw: { width: info.width, height: info.height, channels: info.channels }, left: ix, top: iy });
      done++;
      if (progress) progress({ done, total: tiles.length });
    }
    let img = sharp({ create: { width: L.W, height: L.H, channels: 3, background: job.bg }, limitInputPixels: false }).composite(comps);
    const o = job.out;
    if (o.format === 'png') img = img.png({ compressionLevel: Math.max(0, Math.min(9, +o.pngLevel || 6)) });
    else img = img.jpeg({ quality: Math.max(1, Math.min(100, +o.quality || 92)), chromaSubsampling: o.full444 ? '4:4:4' : '4:2:0' });
    await fsp.mkdir(path.dirname(o.path), { recursive: true });
    const tmp = o.path + '.part';
    await img.toFile(tmp);
    await fsp.rename(tmp, o.path);
    const st = await fsp.stat(o.path);
    return { W: L.W, H: L.H, bytes: st.size, path: o.path };
  },
};

Object.assign(ops, require('./ops2')({ open, sha, CACHE }));

parentPort.on('message', async (msg) => {
  const { id, op, args } = msg;
  try {
    const result = await ops[op](args, (p) => parentPort.postMessage({ id, progress: p }));
    parentPort.postMessage({ id, ok: true, result });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: String((e && e.message) || e) });
  }
});
