const { Worker } = require('worker_threads'); const path = require('path'); const fs = require('fs');
const OUT = '/home/claude/test-out/ov'; fs.mkdirSync(OUT, { recursive: true });
const w = new Worker(path.join(__dirname, '../engine/worker.js'), { workerData: { cacheDir: '/home/claude/test-out/cache3' } });
let n = 0; const pend = new Map();
w.on('message', (m) => { if (m.progress) return; const p = pend.get(m.id); pend.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); });
const call = (op, args) => new Promise((res, rej) => { const id = ++n; pend.set(id, { res, rej }); w.postMessage({ id, op, args }); });
const G = require('../engine/geom');
(async () => {
  const D = '/home/claude/samples-ov/Overlay A';
  const files = (await call('scan', { dir: D })).files.map((f) => ({ ...f, file: path.join(D, f.file) }));
  let t = Date.now();
  const g = await call('ovGuessBase', { items: [files[2], files[0], files[3], files[1]] });
  console.log('guess base', path.basename(g.base), g.votes, Date.now() - t, 'ms');
  const base = files[0];
  const layers = [];
  for (const c of files.slice(1)) {
    t = Date.now();
    const r = await call('ovAlign', { base, close: c, kind: 'similarity' });
    console.log(path.basename(c.file), r.ok, r.inliers, Date.now() - t, 'ms');
    const gains = (await call('ovGains', { base, close: c, m: r.m })).gains;
    console.log(' gains', gains && gains.g.map((v) => v.toFixed(2)), gains && gains.o.map((v) => v.toFixed(1)));
    layers.push({ file: c.file, w: c.w, h: c.h, mtime: c.mtime, m: r.m, opacity: 1, feather: 24, ops: [], gains });
  }
  // erase part of layer 2 with a brush, and a polygon cut on layer 1
  layers[1].ops.push({ t: 'brush', m: 'erase', r: 120, h: 0.6, pts: [[100, 100], [700, 500]] });
  layers[0].ops.push({ t: 'poly', m: 'cut', pts: [[0, 0], [600, 0], [0, 600]] });
  for (const [label, st] of [['base', { ovScale: 'base' }]]) {
    const k = G.ovOutScale(st, base, layers);
    t = Date.now();
    const r = await call('renderOverlay', { base, layers, k, out: { path: `${OUT}/ov-${label}.jpg`, format: 'jpg', quality: 92 } });
    console.log(label, 'k', k.toFixed(2), r.W + 'x' + r.H, Date.now() - t, 'ms');
  }
  const r = await call('renderOverlay', { base, layers: [], k: 4, out: { path: `${OUT}/ov-none-x4.jpg`, format: 'jpg', quality: 92 } });
  w.terminate();
})().catch((e) => { console.error(e); process.exit(1); });
