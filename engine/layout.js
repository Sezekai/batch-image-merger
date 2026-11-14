// Layout engine shared by the preview (renderer) and the exporter (worker).
// Everything is computed in full-resolution pixels. A layout is a canvas size, a list of
// coloured rectangles (separator lines, border) and a list of tiles. Each tile has a cell
// (where it sits) and an image rectangle (where the scaled image goes; for crop it is
// bigger than the cell and is clipped to it).
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.BIMLayout = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULTS = {
    layout: 'vertical',
    vSize: 'min', vCustom: 1500,
    hSize: 'min', hCustom: 1500,
    gridMode: 'fit',
    cols: 0, rows: 0,
    cellShape: 'auto', cellRatioW: 3, cellRatioH: 4,
    cellSize: 'min', cellCustom: 1000,
    rowWidth: 'min', rowCustom: 3000,
    lastRow: 'center',
    sepOn: false, sepSize: 8, sepSplit: false, sepH: 8, sepV: 8, sepColor: '#ffffff',
    borderOn: false, borderSize: 16, borderSplit: false, bT: 16, bR: 16, bB: 16, bL: 16, borderColor: '#ffffff', borderSame: true,
    bgColor: '#ffffff',
    match: false, matchTarget: 'auto', matchColor: '#808080', tol: 24, soft: 16, matchMode: 'flat', everywhere: false, padUsesMatch: true,
    format: 'jpg', quality: 92, full444: true, pngLevel: 6,
    saveMode: 'inside', customDir: '',
    nameMode: 'folder', pattern: '{folder}_{layout}', clash: 'number',
    // Freeform
    ffTol: 28, ffSoft: 20, ffHoles: 'edges', ffGap: 10, ffMinSize: 24, ffFeather: 1, ffBgPick: '',
    ffCanvas: 'auto', ffPad: 60, ffW: 3000, ffH: 2000, ffBgMode: 'auto', ffBgColor: '#ffffff', ffTransparent: false,
    // Overlay
    ovKind: 'similarity', ovScale: 'base', ovCustomW: 4000, ovFeather: 24, ovColor: false,
  };

  const isImg = (it) => it && !it.blank && it.w > 0 && it.h > 0;
  const median = (arr) => { if (!arr.length) return 1; const a = [...arr].sort((x, y) => x - y); return a[Math.floor((a.length - 1) / 2)]; };
  const minOf = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);
  const maxOf = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
  function pick(mode, arr, custom) {
    if (mode === 'custom') return Math.max(1, +custom || 1);
    if (!arr.length) return 500;
    return mode === 'max' ? maxOf(arr) : minOf(arr);
  }

  function computeLayout(items, s0) {
    const s = Object.assign({}, DEFAULTS, s0 || {});
    const warnings = [];
    const list = s.layout === 'grid' ? items.filter((it) => it.blank || isImg(it)) : items.filter(isImg);
    const imgs = list.filter(isImg);
    if (!imgs.length) return { W: 0, H: 0, tiles: [], fills: [], warnings, upscaled: 0, empty: true };
    const n = list.length;
    const sh = s.sepOn ? Math.max(0, Math.round(s.sepSplit ? s.sepH : s.sepSize)) : 0; // horizontal lines (between rows)
    const sv = s.sepOn ? Math.max(0, Math.round(s.sepSplit ? s.sepV : s.sepSize)) : 0; // vertical lines (between columns)
    const tiles = [];
    const lines = [];
    let innerW = 0, innerH = 0, grid = null;

    const fitCell = (it, x, y, w, h) => {
      if (!isImg(it)) return { key: it.key, blank: true, x, y, w, h };
      const sc = Math.min(w / it.w, h / it.h);
      const dw = Math.max(1, Math.round(it.w * sc)), dh = Math.max(1, Math.round(it.h * sc));
      return { key: it.key, x, y, w, h, img: { x: x + Math.round((w - dw) / 2), y: y + Math.round((h - dh) / 2), w: dw, h: dh }, scale: sc, up: sc > 1.0005 };
    };
    const coverCell = (it, x, y, w, h) => {
      if (!isImg(it)) return { key: it.key, blank: true, x, y, w, h };
      const sc = Math.max(w / it.w, h / it.h);
      const dw = Math.max(w, Math.round(it.w * sc)), dh = Math.max(h, Math.round(it.h * sc));
      const fx = it.fx == null ? 0.5 : Math.min(1, Math.max(0, it.fx));
      const fy = it.fy == null ? 0.5 : Math.min(1, Math.max(0, it.fy));
      return { key: it.key, x, y, w, h, img: { x: x - Math.round((dw - w) * fx), y: y - Math.round((dh - h) * fy), w: dw, h: dh }, scale: sc, up: sc > 1.0005, crop: dw > w || dh > h };
    };

    if (s.layout === 'vertical') {
      const TW = Math.max(1, Math.round(pick(s.vSize, imgs.map((i) => i.w), s.vCustom)));
      let y = 0;
      list.forEach((it, k) => {
        const h = Math.max(1, Math.round((it.h * TW) / it.w));
        tiles.push(fitCell(it, 0, y, TW, h));
        y += h;
        if (k < n - 1) { if (sh) lines.push({ x: 0, y, w: TW, h: sh }); y += sh; }
      });
      innerW = TW; innerH = y;
    } else if (s.layout === 'horizontal') {
      const TH = Math.max(1, Math.round(pick(s.hSize, imgs.map((i) => i.h), s.hCustom)));
      let x = 0;
      list.forEach((it, k) => {
        const w = Math.max(1, Math.round((it.w * TH) / it.h));
        tiles.push(fitCell(it, x, 0, w, TH));
        x += w;
        if (k < n - 1) { if (sv) lines.push({ x, y: 0, w: sv, h: TH }); x += sv; }
      });
      innerW = x; innerH = TH;
    } else {
      const C0 = Math.max(0, Math.floor(+s.cols || 0)), R0 = Math.max(0, Math.floor(+s.rows || 0));
      const C = C0 || (R0 ? Math.ceil(n / R0) : Math.ceil(Math.sqrt(n)));
      const R = Math.ceil(n / C);
      if (C0 && R0 && R0 < R) warnings.push(`${C} × ${R0} only holds ${C * R0} images, so ${R} rows are used.`);
      grid = { cols: C, rows: R };
      const rows = [];
      for (let r = 0; r < R; r++) rows.push(list.slice(r * C, r * C + C));
      const medA = median(imgs.map((i) => i.w / i.h));
      const lastMode = s.lastRow;

      // positions for an uneven last row, given cell widths
      const placeUneven = (widths, total) => {
        const k = widths.length, rw = widths.reduce((a, b) => a + b, 0) + (k - 1) * sv;
        if (lastMode === 'spread') {
          const g = (total - widths.reduce((a, b) => a + b, 0)) / (k + 1);
          let acc = 0;
          return { xs: widths.map((w, j) => { const x = Math.round(g * (j + 1) + acc); acc += w; return x; }), contiguous: false };
        }
        const st = lastMode === 'left' ? 0 : lastMode === 'right' ? total - rw : Math.round((total - rw) / 2);
        let x = st;
        return { xs: widths.map((w) => { const v = x; x += w + sv; return v; }), contiguous: true };
      };

      if (s.gridMode !== 'row') {
        const crop = s.gridMode === 'crop';
        const A = s.cellShape === 'square' ? 1 : s.cellShape === 'custom' ? Math.max(1, +s.cellRatioW || 1) / Math.max(1, +s.cellRatioH || 1) : medA;
        const cand = imgs.map((i) => { const a = i.w / i.h; return crop ? (a >= A ? i.h * A : i.w) : (a >= A ? i.w : i.h * A); });
        const cw = Math.max(1, Math.round(pick(s.cellSize, cand, s.cellCustom)));
        const ch = Math.max(1, Math.round(cw / A));
        innerW = C * cw + (C - 1) * sv;
        innerH = R * ch + (R - 1) * sh;
        const place = crop ? coverCell : fitCell;
        rows.forEach((row, r) => {
          const y = r * (ch + sh), k = row.length;
          let xs, ws, contiguous = true;
          if (k === C || R === 1 && !C0) { xs = row.map((_, j) => j * (cw + sv)); ws = row.map(() => cw); }
          else if (lastMode === 'stretch') {
            const w = Math.floor((innerW - (k - 1) * sv) / k);
            xs = row.map((_, j) => j * (w + sv)); ws = row.map((_, j) => (j === k - 1 ? innerW - xs[j] : w));
          } else { ws = row.map(() => cw); ({ xs, contiguous } = placeUneven(ws, innerW)); }
          row.forEach((it, j) => {
            tiles.push(place(it, xs[j], y, ws[j], ch));
            if (contiguous && j < k - 1 && sv) lines.push({ x: xs[j] + ws[j], y, w: sv, h: ch });
          });
          if (r < R - 1 && sh) lines.push({ x: 0, y: y + ch, w: innerW, h: sh });
        });
        if (R === 1 && !C0) innerW = rows[0].length * cw + (rows[0].length - 1) * sv;
      } else {
        const asp = (it) => (isImg(it) ? it.w / it.h : medA);
        const info = rows.map((row) => {
          const sa = row.reduce((t, it) => t + asp(it), 0);
          const hs = row.filter(isImg).map((i) => i.h);
          const hmin = hs.length ? minOf(hs) : 500;
          return { row, sa, nat: hmin * sa + (row.length - 1) * sv };
        });
        const lastUneven = rows.length > 1 && rows[rows.length - 1].length < C && lastMode !== 'stretch';
        const basis = lastUneven ? info.slice(0, -1) : info;
        const T = Math.max(1, Math.round(pick(s.rowWidth, basis.map((x) => x.nat), s.rowCustom)));
        let y = 0;
        const heights = [];
        info.forEach((ri, r) => {
          const k = ri.row.length, avail = T - (k - 1) * sv;
          const isLast = lastUneven && r === info.length - 1;
          let H = avail / ri.sa;
          if (isLast) {
            const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
            if (avg * ri.sa + (k - 1) * sv <= T) H = avg;
          }
          H = Math.max(1, Math.round(H));
          const ws = ri.row.map((it) => Math.max(1, Math.round(H * asp(it))));
          let xs, contiguous = true;
          if (!isLast) {
            ws[k - 1] = Math.max(1, ws[k - 1] + (avail - ws.reduce((a, b) => a + b, 0)));
            let x = 0; xs = ws.map((w) => { const v = x; x += w + sv; return v; });
            heights.push(H);
          } else ({ xs, contiguous } = placeUneven(ws, T));
          ri.row.forEach((it, j) => {
            tiles.push(coverCell(it, xs[j], y, ws[j], H));
            if (contiguous && j < k - 1 && sv) lines.push({ x: xs[j] + ws[j], y, w: sv, h: H });
          });
          y += H;
          if (r < info.length - 1) { if (sh) lines.push({ x: 0, y, w: T, h: sh }); y += sh; }
        });
        innerW = T; innerH = y;
      }
    }

    // border
    const bv = (v) => (s.borderOn ? Math.max(0, Math.round(+v || 0)) : 0);
    const bt = bv(s.borderSplit ? s.bT : s.borderSize), br = bv(s.borderSplit ? s.bR : s.borderSize);
    const bb = bv(s.borderSplit ? s.bB : s.borderSize), bl = bv(s.borderSplit ? s.bL : s.borderSize);
    const W = innerW + bl + br, H = innerH + bt + bb;
    const sepColor = s.sepColor, borderColor = s.borderSame ? s.sepColor : s.borderColor;
    const fills = [];
    for (const l of lines) if (l.w > 0 && l.h > 0) fills.push({ x: l.x + bl, y: l.y + bt, w: l.w, h: l.h, c: sepColor, kind: 'sep' });
    if (bt) fills.push({ x: 0, y: 0, w: W, h: bt, c: borderColor, kind: 'border' });
    if (bb) fills.push({ x: 0, y: H - bb, w: W, h: bb, c: borderColor, kind: 'border' });
    if (bl) fills.push({ x: 0, y: bt, w: bl, h: innerH, c: borderColor, kind: 'border' });
    if (br) fills.push({ x: W - br, y: bt, w: br, h: innerH, c: borderColor, kind: 'border' });
    for (const t of tiles) { t.x += bl; t.y += bt; if (t.img) { t.img.x += bl; t.img.y += bt; } }
    return { W, H, tiles, fills, warnings, upscaled: tiles.filter((t) => t.up).length, grid };
  }

  // Scale a layout for a smaller preview render, rounding edges so nothing gaps or overlaps.
  function scaleLayout(L, sc) {
    if (sc === 1) return L;
    const S = (v) => Math.round(v * sc);
    const R = (r) => ({ x: S(r.x), y: S(r.y), w: Math.max(1, S(r.x + r.w) - S(r.x)), h: Math.max(1, S(r.y + r.h) - S(r.y)) });
    return Object.assign({}, L, {
      W: Math.max(1, S(L.W)), H: Math.max(1, S(L.H)),
      fills: L.fills.map((f) => Object.assign(R(f), { c: f.c, kind: f.kind })),
      tiles: L.tiles.map((t) => Object.assign({}, t, R(t), t.img ? { img: R(t.img) } : {})),
    });
  }

  function layoutLabel(s, L) {
    if (s.layout === 'vertical') return 'vertical';
    if (s.layout === 'horizontal') return 'horizontal';
    return L && L.grid ? `grid-${L.grid.cols}x${L.grid.rows}` : 'grid';
  }

  return { DEFAULTS, computeLayout, scaleLayout, layoutLabel };
});
