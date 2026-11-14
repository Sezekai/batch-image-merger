const { Worker } = require('worker_threads'); const path = require('path'); const fs = require('fs');
const OUT = '/home/claude/test-out/ff'; fs.mkdirSync(OUT, { recursive: true });
const w = new Worker(path.join(__dirname, '../engine/worker.js'), { workerData: { cacheDir: '/home/claude/test-out/cache2' } });
let n = 0; const pend = new Map();
w.on('message', (m) => { if (m.progress) return; const p = pend.get(m.id); pend.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); });
const call = (op, args) => new Promise((res, rej) => { const id = ++n; pend.set(id, { res, rej }); w.postMessage({ id, op, args }); });
const { DEFAULTS } = require('../engine/layout'); const G = require('../engine/geom');
(async () => {
  const P = Object.assign({}, DEFAULTS);
  const D = '/home/claude/samples-ff/People A';
  const files = (await call('scan', { dir: D })).files;
  let t = Date.now();
  const f = files[0], a = { file: path.join(D, f.file), size: f.size, mtime: f.mtime, w: f.w, h: f.h, P };
  const det = await call('ffDetect', a); console.log('detect', Date.now() - t, 'ms', det.bg, det.comps.map((c) => c.bbox.join(',') + ' a' + c.area));
  const subs = [];
  for (const c of det.comps) { t = Date.now(); const r = await call('ffCutout', { ...a, def: { parts: [{ comps: [c] }], ops: [] } }); subs.push({ c, r }); console.log('cutout', Date.now() - t, 'ms', r.box, r.pw + 'x' + r.ph); }
  // split person 1 with a lasso (left half) and erase a brush stroke on person 2
  const b = subs[0].c.bbox;
  const poly = [[b[0] - 5, b[1] - 5], [b[0] + b[2] / 2, b[1] - 5], [b[0] + b[2] / 2, b[1] + b[3] + 5], [b[0] - 5, b[1] + b[3] + 5]];
  const L = await call('ffCutout', { ...a, def: { parts: [{ comps: [subs[0].c] }], ops: [{ t: 'poly', m: 'keep', pts: poly }] } });
  const R = await call('ffCutout', { ...a, def: { parts: [{ comps: [subs[0].c] }], ops: [{ t: 'poly', m: 'cut', pts: poly }] } });
  const b2 = subs[1].c.bbox;
  const E = await call('ffCutout', { ...a, def: { parts: [{ comps: [subs[1].c] }], ops: [{ t: 'brush', m: 'erase', r: 30, h: 0.5, pts: [[b2[0], b2[1] + 100], [b2[0] + b2[2], b2[1] + 140]] }] } });
  console.log('split L', L.box, 'R', R.box, 'erase', E.box);
  // compose: people re-ordered, one scaled, one rotated + flipped
  const items = subs.map((s, i) => ({ file: a.file, w: f.w, h: f.h, size: f.size, mtime: f.mtime, def: { parts: [{ comps: [s.c] }], ops: [] }, box: s.r.box, cx: 300 + (subs.length - 1 - i) * 380, cy: 400, s: i === 1 ? 1.4 : 1, r: i === 2 ? 15 : 0, flip: i === 2 }));
  const canvas = G.ffCanvas(items, (p) => p.box, { ffCanvas: 'auto', ffPad: 40 });
  t = Date.now();
  let r = await call('renderFreeform', { P, canvas, bg: '#f4e8d0', items, out: { path: OUT + '/ff.jpg', format: 'jpg', quality: 92 } });
  console.log('render', Date.now() - t, 'ms', r.W, r.H, canvas);
  r = await call('renderFreeform', { P, canvas, bg: '#000000', transparent: true, items, out: { path: OUT + '/ff.png', format: 'png' } });
  r = await call('renderFreeform', { P, canvas, bg: '#f4e8d0', items, scale: 0.3, out: { path: OUT + '/ff-small.jpg', format: 'jpg' } });
  for (const [k, v] of Object.entries({ L, R, E })) fs.copyFileSync(v.path, OUT + '/' + k + '.png');
  w.terminate();
})().catch((e) => { console.error(e); process.exit(1); });
