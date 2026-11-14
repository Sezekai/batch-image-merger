const sharp = require('sharp'); const path = require('path');
const A = require('../engine/align');
const open = async (f) => sharp(f).rotate();
const D = '/home/claude/samples-ov/Overlay A';
const th = 2.5 * Math.PI / 180, c = [3000, 2000];
const gt = (x, y) => { const X = x - c[0], Y = y - c[1]; return [(c[0] + X * Math.cos(th) + Y * Math.sin(th)) * 0.25, (c[1] - X * Math.sin(th) + Y * Math.cos(th)) * 0.25]; };
const crops = [[800, 600, 1600, 1200], [3200, 1500, 1400, 1050], [2000, 2600, 1000, 750]];
(async () => {
  const base = { file: path.join(D, '01 wide.jpg'), w: 1500, h: 1000 };
  const cache = new Map();
  for (const kind of ['similarity', 'perspective']) {
    for (let i = 0; i < 3; i++) {
      const [x0, y0, w, h] = crops[i];
      const t = Date.now();
      const r = await A.align(open, base, { file: path.join(D, `0${i + 2} close ${i + 1}.jpg`), w, h }, kind, cache);
      if (!r.ok) { console.log(kind, i, 'FAILED', r.reason); continue; }
      let err = 0;
      for (const [u, v] of [[0, 0], [w, 0], [w, h], [0, h], [w / 2, h / 2]]) { const [px, py] = A.apply(r.m, u, v); const [gx, gy] = gt(x0 + u, y0 + v); err = Math.max(err, Math.hypot(px - gx, py - gy)); }
      console.log(kind, 'close', i + 1, 'inliers', r.inliers, 'conf', r.conf.toFixed(2), 'scale', r.scale.toFixed(4), '(true 0.25)', 'max error', err.toFixed(2), 'base px', Date.now() - t, 'ms');
    }
  }
  const m = await A.fromPoints([[[0, 0], [10, 20]], [[100, 0], [60, 20]]], 'similarity'); console.log('points', m.map((v) => +v.toFixed(3)));
  process.exit(0);
})();
