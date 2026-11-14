// Close-up alignment (Overlay tab). Uses OpenCV (WebAssembly) AKAZE features.
// A transform maps close-up FULL-RES pixels to base FULL-RES pixels as a 3x3 matrix (row major).
const sharp = require('sharp');

// The OpenCV module is a "thenable": never return it straight from an async function or
// await it, or the promise keeps unwrapping it forever. It is kept inside a box instead.
let cvBox = null;
function loadCvBox() {
  if (!cvBox) cvBox = new Promise((resolve, reject) => {
    const cv = require('@techstark/opencv-js');
    if (cv.Mat) return resolve({ cv });
    const t0 = Date.now();
    const poll = () => { if (cv.Mat) resolve({ cv }); else if (Date.now() - t0 > 60000) reject(new Error('Image matching library failed to load')); else setTimeout(poll, 20); };
    poll();
  });
  return cvBox;
}

// grey pixels of an image at most `maxSide` on the long edge
async function greyAt(open, file, maxSide) {
  const p = await open(file);
  const { data, info } = await p.flatten({ background: '#ffffff' }).resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// AKAZE keypoints + descriptors; keeps the strongest `keep`
async function features(g, keep = 4000) {
  const { cv } = await loadCvBox();
  const mat = new cv.Mat(g.h, g.w, cv.CV_8UC1);
  mat.data.set(g.data);
  const det = new cv.AKAZE();
  det.setThreshold(0.0008);
  const kp = new cv.KeyPointVector(), desc = new cv.Mat(), none = new cv.Mat();
  det.detectAndCompute(mat, none, kp, desc);
  const n = kp.size();
  let idx = [...Array(n).keys()];
  const pts = idx.map((i) => { const k = kp.get(i); return { x: k.pt.x, y: k.pt.y, r: k.response }; });
  if (n > keep) idx = idx.sort((a, b) => pts[b].r - pts[a].r).slice(0, keep);
  const cols = desc.cols;
  const d = new Uint8Array(idx.length * cols);
  idx.forEach((i, j) => d.set(desc.data.subarray(i * cols, i * cols + cols), j * cols));
  const out = { pts: idx.map((i) => [pts[i].x, pts[i].y]), desc: d, cols, w: g.w, h: g.h };
  mat.delete(); det.delete(); kp.delete(); desc.delete(); none.delete();
  return out;
}

async function matchFeatures(A, B, ratio = 0.8) {
  const { cv } = await loadCvBox();
  if (!A.pts.length || !B.pts.length) return [];
  const ma = cv.matFromArray(A.pts.length, A.cols, cv.CV_8UC1, A.desc);
  const mb = cv.matFromArray(B.pts.length, B.cols, cv.CV_8UC1, B.desc);
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const mm = new cv.DMatchVectorVector();
  bf.knnMatch(ma, mb, mm, 2);
  const out = [];
  for (let i = 0; i < mm.size(); i++) {
    const v = mm.get(i);
    if (v.size() >= 2) { const a = v.get(0), b = v.get(1); if (a.distance < ratio * b.distance) out.push([A.pts[a.queryIdx], B.pts[a.trainIdx]]); }
    else if (v.size() === 1) { const a = v.get(0); if (a.distance < 40) out.push([A.pts[a.queryIdx], B.pts[a.trainIdx]]); }
  }
  ma.delete(); mb.delete(); bf.delete(); mm.delete();
  return out;
}

// ---- small linear algebra ----
const mul3 = (A, B) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; };
const scaleM = (sx, sy = sx) => [sx, 0, 0, 0, sy, 0, 0, 0, 1];
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
const apply = (m, x, y) => { const w = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; };

// least-squares similarity (scale+rotation+translation) from point pairs [[ax,ay],[bx,by]]
function fitSimilarity(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  let mx = 0, my = 0, nx = 0, ny = 0;
  for (const [[x, y], [u, v]] of pairs) { mx += x; my += y; nx += u; ny += v; }
  mx /= n; my /= n; nx /= n; ny /= n;
  let sxx = 0, a = 0, b = 0;
  for (const [[x, y], [u, v]] of pairs) { const X = x - mx, Y = y - my, U = u - nx, V = v - ny; sxx += X * X + Y * Y; a += X * U + Y * V; b += X * V - Y * U; }
  if (sxx < 1e-9) return null;
  a /= sxx; b /= sxx;
  return [a, -b, nx - a * mx + b * my, b, a, ny - b * mx - a * my, 0, 0, 1];
}
// RANSAC for a similarity
function ransacSimilarity(pairs, thr, iters = 2000) {
  const n = pairs.length;
  if (n < 3) return null;
  let best = null, bestIn = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const thr2 = thr * thr;
  for (let it = 0; it < iters; it++) {
    const i = Math.floor(rnd() * n), j = Math.floor(rnd() * n);
    if (i === j) continue;
    const m = fitSimilarity([pairs[i], pairs[j]]);
    if (!m) continue;
    const s = Math.hypot(m[0], m[3]);
    if (!(s > 0.02 && s < 50)) continue;
    const inl = [];
    for (let k = 0; k < n; k++) { const [[x, y], [u, v]] = pairs[k]; const [px, py] = apply(m, x, y); if ((px - u) ** 2 + (py - v) ** 2 < thr2) inl.push(k); }
    if (inl.length > bestIn.length) { bestIn = inl; best = m; }
  }
  if (!best || bestIn.length < 6) return null;
  // refine twice
  for (let r = 0; r < 2; r++) {
    const m = fitSimilarity(bestIn.map((k) => pairs[k]));
    if (!m) break;
    const inl = [];
    for (let k = 0; k < n; k++) { const [[x, y], [u, v]] = pairs[k]; const [px, py] = apply(m, x, y); if ((px - u) ** 2 + (py - v) ** 2 < thr2) inl.push(k); }
    best = m; bestIn = inl;
  }
  return { m: best, inliers: bestIn.length };
}
async function homography(pairs, thr) {
  const { cv } = await loadCvBox();
  if (pairs.length < 4) return null;
  const src = cv.matFromArray(pairs.length, 1, cv.CV_32FC2, pairs.flatMap((p) => p[0]));
  const dst = cv.matFromArray(pairs.length, 1, cv.CV_32FC2, pairs.flatMap((p) => p[1]));
  const mask = new cv.Mat();
  const H = cv.findHomography(src, dst, cv.RANSAC, thr, mask);
  let res = null;
  if (!H.empty()) {
    const m = Array.from(H.data64F);
    let inl = 0; for (let i = 0; i < mask.rows; i++) if (mask.data[i]) inl++;
    res = { m: m.map((v) => v / m[8]), inliers: inl };
  }
  src.delete(); dst.delete(); mask.delete(); H.delete();
  return res;
}

// is a homography sane (not folded, not wildly distorted)?
function sane(m, w, h) {
  const c = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => apply(m, x, y));
  if (c.some(([x, y]) => !isFinite(x) || !isFinite(y))) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % 4], [cx, cy] = c[(i + 2) % 4];
    const cr = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (!sign) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) return false;
  }
  const s = Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3]));
  return s > 0.01 && s < 60;
}

// Align a close-up to the base. Tries a few resolutions for the close-up.
// featCache: Map for base features. Returns { m (3x3 full-res close→base), inliers, conf, scale }
async function align(open, base, close, kind = 'similarity', featCache) {
  const BASE_SIDE = 2400;
  let bf = featCache && featCache.get(base.file + '|' + BASE_SIDE);
  if (!bf) { const g = await greyAt(open, base.file, BASE_SIDE); bf = await features(g, 6000); if (featCache) featCache.set(base.file + '|' + BASE_SIDE, bf); }
  const bs = bf.w / base.w; // base full → analysis
  let best = null;
  for (const side of [1600, 800, 2400, 400]) {
    const g = await greyAt(open, close.file, side);
    const cf = await features(g, 4000);
    const cs = cf.w / close.w;
    const pairs = await matchFeatures(cf, bf);
    if (pairs.length < 6) continue;
    const thr = Math.max(2, 3 * (bf.w / 2400));
    const r = kind === 'perspective' ? await homography(pairs, thr) : ransacSimilarity(pairs, thr);
    if (!r || (kind === 'perspective' && !sane(r.m, cf.w, cf.h))) continue;
    const ratio = r.inliers / Math.max(20, Math.min(cf.pts.length, 400));
    const score = r.inliers;
    if (!best || score > best.score) {
      // full-res: base_full = S_b^-1 * m * S_c
      const m = mul3(mul3(scaleM(1 / bs), r.m), scaleM(cs));
      best = { m: m.map((v) => v / m[8]), inliers: r.inliers, score, ratio };
    }
    if (best && best.inliers >= 60) break;
  }
  if (!best) return { ok: false, reason: 'No matching details were found' };
  const scale = Math.sqrt(Math.abs(best.m[0] * best.m[4] - best.m[1] * best.m[3]));
  const conf = Math.max(0, Math.min(1, (best.inliers - 8) / 52));
  return { ok: true, m: best.m, inliers: best.inliers, conf, scale };
}

// homography/similarity from user point pairs (full-res coords)
async function fromPoints(pairs, kind) {
  if (kind === 'perspective' && pairs.length >= 4) {
    const { cv } = await loadCvBox();
    const src = cv.matFromArray(pairs.length, 1, cv.CV_32FC2, pairs.flatMap((p) => p[0]));
    const dst = cv.matFromArray(pairs.length, 1, cv.CV_32FC2, pairs.flatMap((p) => p[1]));
    const H = cv.findHomography(src, dst, 0);
    const m = H.empty() ? null : Array.from(H.data64F);
    src.delete(); dst.delete(); H.delete();
    return m ? m.map((v) => v / m[8]) : null;
  }
  return fitSimilarity(pairs);
}

module.exports = { loadCvBox, align, fromPoints, fitSimilarity, ransacSimilarity, inv3, mul3, apply, scaleM, sane, greyAt, features, matchFeatures };
