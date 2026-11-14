const { Worker } = require('worker_threads'); const path = require('path'); const fs = require('fs'); const sharp = require('sharp');
const assert = require('assert');
const { computeLayout } = require('../engine/layout');
const os = require('os'); const S = process.env.BIM_SAMPLES || '/home/claude/samples', OUT = process.env.BIM_TESTOUT || path.join(os.tmpdir(), 'bim-test-out'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const w = new Worker(path.join(__dirname, '../engine/worker.js'), { workerData: { cacheDir: path.join(OUT, 'cache') } });
let n = 0; const pend = new Map();
w.on('message', (m) => { if (m.progress) return; const p = pend.get(m.id); pend.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); });
const call = (op, args) => new Promise((res, rej) => { const id = ++n; pend.set(id, { res, rej }); w.postMessage({ id, op, args }); });
(async () => {
  // layout unit checks
  const items = [{ key: 'a', w: 800, h: 1200 }, { key: 'b', w: 1000, h: 1400 }, { key: 'c', w: 600, h: 900 }];
  let L = computeLayout(items, { layout: 'vertical' }); assert.equal(L.W, 600); assert.equal(L.H, 900 + 840 + 900);
  L = computeLayout(items, { layout: 'vertical', sepOn: true, sepSize: 10, borderOn: true, borderSize: 20 }); assert.equal(L.W, 640); assert.equal(L.H, 2640 + 20 + 40);
  L = computeLayout(items, { layout: 'horizontal' }); assert.equal(L.H, 900);
  const ten = Array.from({ length: 10 }, (_, i) => ({ key: 'k' + i, w: 700, h: 1000 }));
  L = computeLayout(ten, { layout: 'grid', cols: 4, rows: 3 }); assert.deepEqual(L.grid, { cols: 4, rows: 3 });
  const last = L.tiles.slice(8); assert.equal(last[0].x, 700); assert.equal(last[1].x, 1400); // centred: 2 in middle of 4
  L = computeLayout(ten, { layout: 'grid', cols: 5, gridMode: 'row', sepOn: true, sepSize: 6 }); assert.equal(L.W, 5 * 700 + 4 * 6);
  L = computeLayout(ten.slice(0, 7), { layout: 'grid', cols: 3, gridMode: 'row', lastRow: 'stretch' }); assert.equal(L.tiles[6].w, L.W);
  console.log('layout ok');

  const scan = await call('scan', { dir: path.join(S, 'Set C') }); console.log(scan.files.map((f) => `${f.file} ${f.w}x${f.h} ${f.err || ''}`));
  const dirs = await call('listDirs', { roots: [S] }); console.log(dirs);
  const t = await call('thumb', { file: path.join(S, 'Set A', 'img 1.jpg'), size: 1, mtime: 1 }); console.log('thumb', fs.statSync(t.path).size);
  const est = await call('bgest', { file: path.join(S, 'Set A', 'img 2.jpg'), size: 1, mtime: 1 }); console.log('bgest', est);
  const job = (dir, files, settings, out, m) => ({ items: files.map((f) => ({ key: f.file, path: path.join(dir, f.file), w: f.w, h: f.h, m })), settings, bg: '#ffffff', out });
  const A = (await call('scan', { dir: path.join(S, 'Set A') })).files;
  let r = await call('render', job(path.join(S, 'Set A'), A, { layout: 'vertical', sepOn: true, sepSize: 12, sepColor: '#ff0000', borderOn: true, borderSize: 30, borderSame: false, borderColor: '#0000ff' }, { path: path.join(OUT, 'A-vertical.jpg'), format: 'jpg', quality: 90, full444: true }));
  console.log('A vertical', r);
  r = await call('render', job(path.join(S, 'Set A'), A, { layout: 'horizontal', sepOn: true, sepSize: 8 }, { path: path.join(OUT, 'A-horizontal-matched.png'), format: 'png' }, { target: '#a0a0a0', tol: 24, soft: 16, mode: 'flat' }));
  console.log('A horiz matched', r);
  const B = (await call('scan', { dir: path.join(S, 'Set B (grid)') })).files;
  for (const mode of ['fit', 'crop', 'row']) {
    r = await call('render', job(path.join(S, 'Set B (grid)'), B, { layout: 'grid', cols: 4, rows: 3, gridMode: mode, sepOn: true, sepSize: 10, sepColor: '#333333', bgColor: '#ffffff', lastRow: 'center' }, { path: path.join(OUT, `B-grid-${mode}.jpg`), format: 'jpg', quality: 88 }));
    console.log('B', mode, r);
  }
  const C = (await call('scan', { dir: path.join(S, 'Set C') })).files;
  r = await call('render', job(path.join(S, 'Set C'), C, { layout: 'grid', cols: 2, gridMode: 'fit', sepOn: true, sepSize: 6, bgColor: '#ffe0e0' }, { path: path.join(OUT, 'C-grid.png'), format: 'png' }));
  r = await call('render', Object.assign(job(path.join(S, 'Set C'), C, { layout: 'grid', cols: 2, gridMode: 'fit' }, { path: path.join(OUT, 'C-small.jpg'), format: 'jpg' }), { scale: 0.25 }));
  console.log('C small', r);
  w.terminate();
})().catch((e) => { console.error(e); process.exit(1); });
