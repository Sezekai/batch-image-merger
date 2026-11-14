// Minimal BMP reader (libvips in sharp has no BMP loader). Handles uncompressed 1/4/8-bit palette,
// 16/24/32-bit, and BI_BITFIELDS. Returns RGBA pixels.
const fs = require('fs');

function readHeader(buf) {
  if (buf.length < 26 || buf.toString('latin1', 0, 2) !== 'BM') throw new Error('Not a BMP file');
  const dibSize = buf.readUInt32LE(14);
  if (dibSize === 12) return { off: buf.readUInt32LE(10), dib: 12, w: buf.readUInt16LE(18), h: buf.readInt16LE(20), bpp: buf.readUInt16LE(24), comp: 0 };
  return { off: buf.readUInt32LE(10), dib: dibSize, w: buf.readInt32LE(18), h: buf.readInt32LE(22), bpp: buf.readUInt16LE(28), comp: buf.readUInt32LE(30), colors: buf.readUInt32LE(46) };
}

function bmpSize(file) {
  const fd = fs.openSync(file, 'r');
  try { const b = Buffer.alloc(64); fs.readSync(fd, b, 0, 64, 0); const h = readHeader(b); return { width: Math.abs(h.w), height: Math.abs(h.h) }; } finally { fs.closeSync(fd); }
}

function decodeBmp(buf) {
  const H = readHeader(buf);
  const w = Math.abs(H.w), h = Math.abs(H.h), topDown = H.h < 0;
  if (H.comp !== 0 && H.comp !== 3 && H.comp !== 6) throw new Error('Compressed BMP files are not supported');
  const out = Buffer.alloc(w * h * 4);
  const stride = Math.floor((H.bpp * w + 31) / 32) * 4;
  let pal = null;
  if (H.bpp <= 8) {
    const n = H.colors || 1 << H.bpp, ps = H.dib === 12 ? 3 : 4, po = 14 + H.dib;
    pal = [];
    for (let i = 0; i < n; i++) { const o = po + i * ps; pal.push([buf[o + 2], buf[o + 1], buf[o]]); }
  }
  let masks = null;
  if (H.comp === 3 || H.comp === 6 || H.bpp === 16 || H.bpp === 32) {
    if (H.comp === 3 || H.comp === 6) {
      const mo = H.dib >= 52 ? 14 + 40 : 14 + H.dib;
      masks = [buf.readUInt32LE(mo), buf.readUInt32LE(mo + 4), buf.readUInt32LE(mo + 8), H.dib >= 56 || H.comp === 6 ? buf.readUInt32LE(mo + 12) : 0];
    } else if (H.bpp === 16) masks = [0x7c00, 0x03e0, 0x001f, 0];
    else masks = [0x00ff0000, 0x0000ff00, 0x000000ff, 0];
  }
  const chan = (v, m) => { if (!m) return 255; let s = 0; while (!((m >>> s) & 1)) s++; const max = m >>> s; return Math.round((((v & m) >>> s) * 255) / max); };
  let anyAlpha = false;
  for (let y = 0; y < h; y++) {
    const row = H.off + (topDown ? y : h - 1 - y) * stride;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let r, g, b, a = 255;
      if (H.bpp === 24) { const p = row + x * 3; b = buf[p]; g = buf[p + 1]; r = buf[p + 2]; }
      else if (H.bpp === 32 || H.bpp === 16) {
        const v = H.bpp === 32 ? buf.readUInt32LE(row + x * 4) : buf.readUInt16LE(row + x * 2);
        r = chan(v, masks[0]); g = chan(v, masks[1]); b = chan(v, masks[2]);
        if (masks[3]) { a = chan(v, masks[3]); if (a !== 255) anyAlpha = true; }
      } else {
        const bits = H.bpp, per = 8 / bits, byte = buf[row + Math.floor(x / per)];
        const idx = (byte >> (8 - bits * ((x % per) + 1))) & ((1 << bits) - 1);
        [r, g, b] = pal[idx] || [0, 0, 0];
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  if (!anyAlpha) for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { data: out, width: w, height: h };
}

module.exports = { decodeBmp, bmpSize };
