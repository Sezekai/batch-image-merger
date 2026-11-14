(function (root) {
  'use strict';
  // The appearance system shared by the suite (DESIGN.md, "Appearance"), taken from Waifu2x Batch's
  // lib/theme.js. Added for this app: more background presets, the Indigo and Violet haze presets,
  // button style, outline and highlight, and the "extras" kept from the old theme editor (a background
  // glow and a heading font; see this app's DESIGN.md). A theme is plain JSON, so it moves between apps.

  const THEME_VERSION = 1;

  const BACKGROUNDS = {
    violethaze: { name: 'Violet haze', ground: '#0e0c18', rail: '#0a0811', panel: '#131020', raised: '#1b162d', raised2: '#241e3d', field: '#0a0811', line: '#1e1933', line2: '#2f274f', text: '#eeecf3', sec: '#a098bd', faint: '#877eae', stage: '#07060c' },
    obsidian: { name: 'Obsidian', ground: '#0a0a0b', rail: '#060607', panel: '#111113', raised: '#19191c', raised2: '#232327', field: '#070708', line: '#212125', line2: '#2e2e33', text: '#ececee', sec: '#a0a0a7', faint: '#7d7d84', stage: '#040405' },
    carbon: { name: 'Carbon', ground: '#0e0f10', rail: '#0a0b0c', panel: '#151618', raised: '#1d1f22', raised2: '#27292d', field: '#0a0b0c', line: '#25272b', line2: '#33363b', text: '#eaecee', sec: '#9fa4aa', faint: '#7d8188', stage: '#070808' },
    graphite: { name: 'Graphite', ground: '#111214', rail: '#0d0e10', panel: '#18191c', raised: '#202226', raised2: '#2a2c31', field: '#0d0e10', line: '#2a2c31', line2: '#383b42', text: '#e8eaed', sec: '#9aa0a8', faint: '#80858d', stage: '#0a0b0c' },
    midnight: { name: 'Midnight', ground: '#0c0e15', rail: '#090b11', panel: '#121521', raised: '#1a1e2d', raised2: '#252a3d', field: '#0a0c12', line: '#232839', line2: '#30364b', text: '#e8eaf2', sec: '#9ba1b6', faint: '#7b8095', stage: '#07080d' },
    midnightOld: { name: 'Midnight (before)', ground: '#0f1218', rail: '#0c0f14', panel: '#171b24', raised: '#202636', raised2: '#283048', field: '#0b0e13', line: '#2a3142', line2: '#36405a', text: '#e8ebf2', sec: '#8f98ad', faint: '#7c859b', stage: '#07090c' },
    ink: { name: 'Ink blue', ground: '#08101f', rail: '#060c18', panel: '#0e1829', raised: '#152237', raised2: '#1d2d47', field: '#060c17', line: '#1b2840', line2: '#273754', text: '#e6edf8', sec: '#94a3bd', faint: '#76849b', stage: '#040912' },
    nightsky: { name: 'Night sky', ground: '#0b0e19', rail: '#080a12', panel: '#0f1321', raised: '#151b2f', raised2: '#1c243f', field: '#080a12', line: '#171e34', line2: '#242f51', text: '#eceef3', sec: '#98a1bd', faint: '#7682a7', stage: '#06070c' },
    indigo: { name: 'Indigo', ground: '#0e0f17', rail: '#0a0b12', panel: '#161826', raised: '#1d2032', raised2: '#252942', field: '#0b0c13', line: '#2b3050', line2: '#3a4170', text: '#e8eaf6', sec: '#8d93b5', faint: '#7c82a8', stage: '#07080d' },
    slate: { name: 'Slate', ground: '#151a21', rail: '#10141a', panel: '#1b2129', raised: '#232b35', raised2: '#2d3641', field: '#11161c', line: '#2b333e', line2: '#38424e', text: '#e7ebf0', sec: '#9ba5b2', faint: '#818a95', stage: '#0d1116' },
    aubergine: { name: 'Aubergine', ground: '#110d16', rail: '#0c0910', panel: '#18121f', raised: '#21192b', raised2: '#2c2239', field: '#0c0910', line: '#2a2135', line2: '#3a2e48', text: '#efe9f5', sec: '#a99cb8', faint: '#887c95', stage: '#08060b' },
    auberginegreen: { name: 'Aubergine green', ground: '#0d1712', rail: '#09100d', panel: '#121f19', raised: '#192b23', raised2: '#213a2e', field: '#09100d', line: '#1c3026', line2: '#2b4a3c', text: '#edf2f0', sec: '#9db8ac', faint: '#7da190', stage: '#070b09' },
    garnet: { name: 'Garnet', ground: '#170c0e', rail: '#11090a', panel: '#1f1113', raised: '#2c181b', raised2: '#3b2024', field: '#11090a', line: '#311a1e', line2: '#4c292f', text: '#f2edee', sec: '#b99da1', faint: '#a27c82', stage: '#0c0607' },
    plum: { name: 'Plum', ground: '#170d16', rail: '#100910', panel: '#1f111e', raised: '#2b182a', raised2: '#3a2138', field: '#100910', line: '#301b2f', line2: '#4b2a48', text: '#f2edf2', sec: '#b99db7', faint: '#a27c9f', stage: '#0b060b' },
    rose: { name: 'Rose noir', ground: '#160d12', rail: '#10090d', panel: '#1f1218', raised: '#2b1922', raised2: '#39222d', field: '#10090d', line: '#301c26', line2: '#4a2b3b', text: '#f2edf0', sec: '#b89dab', faint: '#a17d8f', stage: '#0b0709' },
    wine: { name: 'Wine', ground: '#140b0e', rail: '#0f0709', panel: '#1c1014', raised: '#26161c', raised2: '#321e25', field: '#0f0709', line: '#2e1b21', line2: '#3f262e', text: '#f3e9eb', sec: '#b39aa1', faint: '#917c82', stage: '#0a0507' },
    forest: { name: 'Forest', ground: '#0b110d', rail: '#080c09', panel: '#111912', raised: '#18231a', raised2: '#212e23', field: '#080c09', line: '#1d2a20', line2: '#29392c', text: '#e8f1ea', sec: '#97ab9b', faint: '#758678', stage: '#050906' },
    teal: { name: 'Deep teal', ground: '#0a1214', rail: '#070e10', panel: '#101a1d', raised: '#172427', raised2: '#203033', field: '#070e10', line: '#1d2b2e', line2: '#29393d', text: '#e5f0ef', sec: '#93aaa8', faint: '#738887', stage: '#050b0c' },
    tealdepth: { name: 'Teal depth', ground: '#0c1816', rail: '#081110', panel: '#10201e', raised: '#162d2a', raised2: '#1e3d39', field: '#081110', line: '#19332f', line2: '#274f49', text: '#edf2f2', sec: '#9cbab6', faint: '#7ba39e', stage: '#060c0b' },
    petrol: { name: 'Petrol', ground: '#0b1518', rail: '#080f11', panel: '#101c21', raised: '#16282e', raised2: '#1d353e', field: '#080f11', line: '#182c33', line2: '#264550', text: '#edf1f2', sec: '#9cb2ba', faint: '#7b98a3', stage: '#060a0c' },
    olive: { name: 'Olive', ground: '#14160e', rail: '#0e100a', panel: '#1b1e13', raised: '#26291a', raised2: '#323723', field: '#0e100a', line: '#2a2e1d', line2: '#41482e', text: '#f1f2ee', sec: '#b1b79f', faint: '#979f7f', stage: '#0a0b07' },
    mocha: { name: 'Mocha', ground: '#13110f', rail: '#0e0c0b', panel: '#1a1715', raised: '#231f1c', raised2: '#2e2925', field: '#0e0c0b', line: '#2b2622', line2: '#3a332e', text: '#efebe6', sec: '#ada49b', faint: '#898078', stage: '#090807' },
    daylight: { name: 'Daylight', ground: '#eef0f3', rail: '#e4e7ec', panel: '#f8f9fb', raised: '#ffffff', raised2: '#e8ebf0', field: '#ffffff', line: '#d9dde4', line2: '#c7ccd5', text: '#1b1e24', sec: '#545b66', faint: '#6b727c', stage: '#dfe2e7' },
    linen: { name: 'Linen', ground: '#f2efe9', rail: '#e9e4db', panel: '#faf8f4', raised: '#ffffff', raised2: '#ece7de', field: '#ffffff', line: '#ddd6ca', line2: '#cbc2b3', text: '#25211b', sec: '#5f574c', faint: '#776f64', stage: '#e4ded3' },
  };

  const BG_LABELS = [
    ['ground', 'Ground'], ['rail', 'Title and tab bars'], ['panel', 'Panels'], ['raised', 'Buttons'], ['raised2', 'Hover and selected'],
    ['field', 'Fields and lists'], ['line', 'Lines'], ['line2', 'Strong lines'], ['text', 'Text'], ['sec', 'Secondary text'],
    ['faint', 'Faint text'], ['stage', 'Behind pictures'],
  ];
  const STATE_LABELS = [['ok', 'Success'], ['warn', 'Warning'], ['danger', 'Danger']];
  const DEFAULT_STATES = { ok: '#52d39a', warn: '#f2b64c', danger: '#f0616d' };

  const ACCENTS = {
    violetBlue: { name: 'Violet → Blue', stops: ['#a497ff', '#74a0ff'] },
    limeTeal: { name: 'Lime → Teal', stops: ['#b6f05a', '#2fd6b4'] },
    violetPink: { name: 'Violet → Pink', stops: ['#b08cff', '#ff7ab6'] },
    tealViolet: { name: 'Teal → Violet', stops: ['#2fe0c0', '#9b86ff'] },
    blueCyan: { name: 'Blue → Cyan', stops: ['#6b98ff', '#3fd3f0'] },
    aquaLime: { name: 'Aqua → Lime', stops: ['#3fe0e0', '#b6f05a'] },
    mintSky: { name: 'Mint → Sky', stops: ['#7ef0b6', '#7cc4ff'] },
    amberPink: { name: 'Amber → Pink', stops: ['#ffb547', '#ff6f91'] },
    coralOrange: { name: 'Coral → Orange', stops: ['#ff7a6b', '#ffb04d'] },
    sunset: { name: 'Sunset', stops: ['#ffb347', '#ff6a88', '#b47cff'] },
    rosePeach: { name: 'Rose → Peach', stops: ['#ff8fb1', '#ffc59b'] },
    goldLime: { name: 'Gold → Lime', stops: ['#ffd25e', '#b6f05a'] },
    aurora: { name: 'Aurora', stops: ['#5ef0c0', '#5aa8ff', '#c08cff'] },
    solidBlueOld: { name: 'Blue (before)', stops: ['#6ea8ff'] },
    solidLime: { name: 'Lime', stops: ['#b6f05a'] },
    solidTeal: { name: 'Teal', stops: ['#2fd6b4'] },
    solidBlue: { name: 'Blue', stops: ['#5aa6ff'] },
    solidViolet: { name: 'Violet', stops: ['#a497ff'] },
    solidGreen: { name: 'Green', stops: ['#4cc274'] },
    solidOrange: { name: 'Orange', stops: ['#ff9d4d'] },
    solidPink: { name: 'Pink', stops: ['#ff7ab6'] },
  };

  const CORNERS = {
    square: { name: 'Square', control: 2, panel: 3 },
    sharp: { name: 'Sharp', control: 4, panel: 6 },
    standard: { name: 'Standard', control: 6, panel: 10 },
    soft: { name: 'Soft', control: 8, panel: 14 },
    round: { name: 'Round', control: 12, panel: 18 },
  };
  const DENSITY = {
    compact: { name: 'Compact', control: 28, row: 24 },
    comfortable: { name: 'Comfortable', control: 32, row: 28 },
    roomy: { name: 'Roomy', control: 36, row: 32 },
  };
  const TEXT_SIZES = [12, 13, 14, 15];
  const SYSTEM_FONTS = ['Segoe UI', 'Segoe UI Variable Text', 'Satoshi', 'Bahnschrift', 'Aptos', 'Calibri'];

  // Extras kept from the old theme editor (off by default)
  const GLOWS = {
    none: { name: 'None', css: 'none' },
    aurora: { name: 'Aurora', css: 'radial-gradient(900px 620px at 8% -8%,rgba(64,255,190,.18),transparent 62%),radial-gradient(820px 720px at 98% 8%,rgba(125,90,255,.2),transparent 62%)' },
    sakura: { name: 'Sakura', css: 'radial-gradient(800px 500px at 100% 0,rgba(255,143,189,.14),transparent 60%)' },
    violet: { name: 'Violet', css: 'radial-gradient(900px 600px at 0 0,rgba(140,100,255,.18),transparent 60%)' },
    accent: { name: 'From the accent', css: 'accent' },
  };

  const DEFAULT_THEME = {
    version: THEME_VERSION,
    name: 'Default',
    background: { ...BACKGROUNDS.violethaze },
    states: { ...DEFAULT_STATES },
    accent: { stops: [...ACCENTS.violetBlue.stops], angle: 90, onAccent: 'auto' },
    font: { family: 'Inter', size: 13 },
    corners: { control: CORNERS.standard.control, panel: CORNERS.standard.panel },
    density: { control: DENSITY.compact.control, row: DENSITY.compact.row },
    buttons: { style: 'flat' },
    outline: { colour: '', width: 2 },
    highlight: { colour: '' },
    extras: { glow: 'none', headingFont: '' },
  };
  delete DEFAULT_THEME.background.name;

  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
  const expand = (h) => (h.length === 4 ? '#' + h.slice(1).split('').map((c) => c + c).join('') : h);
  const color = (v, d) => (typeof v === 'string' && HEX.test(v.trim()) ? expand(v.trim().toLowerCase()) : d);
  const str = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // Fills gaps from the default and drops anything invalid, so an imported or hand-edited theme can't break the app.
  function normalize(t) {
    const d = DEFAULT_THEME;
    t = t && typeof t === 'object' ? t : {};
    const bg = {};
    for (const [k] of BG_LABELS) bg[k] = color(t.background && t.background[k], d.background[k]);
    const st = {};
    for (const [k] of STATE_LABELS) st[k] = color(t.states && t.states[k], d.states[k]);
    let stops = Array.isArray(t.accent && t.accent.stops) ? t.accent.stops.map((s) => color(s, null)).filter(Boolean).slice(0, 4) : [];
    if (!stops.length) stops = [...d.accent.stops];
    const on = t.accent && t.accent.onAccent;
    const ex = t.extras || {};
    return {
      version: THEME_VERSION,
      name: str(t.name, 60) || d.name,
      background: bg,
      states: st,
      accent: { stops, angle: clamp(t.accent && t.accent.angle, 0, 360, 90), onAccent: on === 'dark' || on === 'light' ? on : 'auto' },
      font: { family: str(t.font && t.font.family) || d.font.family, size: clamp(t.font && t.font.size, 11, 16, d.font.size) },
      corners: { control: clamp(t.corners && t.corners.control, 0, 16, d.corners.control), panel: clamp(t.corners && t.corners.panel, 0, 24, d.corners.panel) },
      density: { control: clamp(t.density && t.density.control, 24, 44, d.density.control), row: clamp(t.density && t.density.row, 20, 40, d.density.row) },
      buttons: { style: t.buttons && t.buttons.style === 'glow' ? 'glow' : 'flat' },
      outline: { colour: color(t.outline && t.outline.colour, ''), width: clamp(t.outline && t.outline.width, 1, 4, 2) },
      highlight: { colour: color(t.highlight && t.highlight.colour, '') },
      extras: { glow: GLOWS[ex.glow] ? ex.glow : 'none', headingFont: str(ex.headingFont) },
    };
  }

  function luminance(hex) {
    const h = expand(hex);
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
  const DARK_ON = '#0b0c0f', LIGHT_ON = '#ffffff';
  function onAccent(theme) {
    if (theme.accent.onAccent === 'dark') return DARK_ON;
    if (theme.accent.onAccent === 'light') return LIGHT_ON;
    const worst = (c) => Math.min(...theme.accent.stops.map((s) => contrast(c, s)));
    return worst(DARK_ON) >= worst(LIGHT_ON) ? DARK_ON : LIGHT_ON;
  }
  const isLight = (theme) => luminance(theme.background.ground) > 0.4;
  const gradient = (stops, angle) => (stops.length === 1 ? stops[0] : `linear-gradient(${angle}deg, ${stops.join(', ')})`);
  const fontStack = (family) => `'${String(family).replace(/'/g, '')}', Inter, 'Segoe UI', system-ui, sans-serif`;

  // Everything the stylesheet reads, as CSS custom properties.
  function cssVars(theme) {
    const t = normalize(theme);
    const s = t.accent.stops;
    const glow = GLOWS[t.extras.glow].css === 'accent'
      ? `radial-gradient(900px 600px at 0 0, ${s[0]}24, transparent 60%), radial-gradient(800px 600px at 100% 0, ${s[s.length - 1]}1f, transparent 60%)`
      : GLOWS[t.extras.glow].css;
    return {
      ...t.background,
      ...t.states,
      acc: s[0],
      acc2: s[s.length - 1],
      grad: gradient(s, t.accent.angle),
      'grad-v': gradient(s, 180),
      'on-acc': onAccent(t),
      font: fontStack(t.font.family),
      fonth: t.extras.headingFont ? fontStack(t.extras.headingFont) : fontStack(t.font.family),
      fs: t.font.size + 'px',
      'fs-s': t.font.size - 1 + 'px',
      'fs-h': t.font.size + 2 + 'px',
      ch: t.density.control + 'px',
      rh: t.density.row + 'px',
      rc: t.corners.control + 'px',
      rp: t.corners.panel + 'px',
      outline: t.outline.colour || s[0],
      ow: t.outline.width + 'px',
      hl: t.highlight.colour || s[0],
      'btn-glow': t.buttons.style === 'glow' ? `0 6px 18px -6px ${s[s.length - 1]}` : 'none',
      bgimg: glow,
      scheme: isLight(t) ? 'light' : 'dark',
    };
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function describe(theme) {
    const t = normalize(theme);
    const bgKey = Object.keys(BACKGROUNDS).find((k) => BG_LABELS.every(([f]) => BACKGROUNDS[k][f] === t.background[f]));
    const accKey = Object.keys(ACCENTS).find((k) => same(ACCENTS[k].stops, t.accent.stops));
    const cKey = Object.keys(CORNERS).find((k) => CORNERS[k].control === t.corners.control && CORNERS[k].panel === t.corners.panel);
    const dKey = Object.keys(DENSITY).find((k) => DENSITY[k].control === t.density.control && DENSITY[k].row === t.density.row);
    return {
      background: bgKey || null, accent: accKey || null, corners: cKey || null, density: dKey || null,
      text: [bgKey ? BACKGROUNDS[bgKey].name : 'Custom background', accKey ? ACCENTS[accKey].name : 'Custom accent', t.font.family,
        cKey ? CORNERS[cKey].name : 'Custom corners', dKey ? DENSITY[dKey].name : 'Custom density'].join(' · '),
    };
  }
  function withBackground(theme, key) { const b = { ...BACKGROUNDS[key] }; delete b.name; return { ...normalize(theme), background: b }; }

  // ---- themes from before the redesign (Batch Image Merger 1.0–1.2) ----
  const mix = (a, b, f) => { const p = (h) => [1, 3, 5].map((i) => parseInt(expand(h).slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, '0')).join(''); };
  const fontOf = (css) => { const m = /^"([^"]+)"/.exec(css || ''); return m ? m[1] : 'Segoe UI'; };
  function fromOld(o) {
    const v = o.vars || {};
    const bg = color(v['--bg'], '#0f1218'), panel = color(v['--panel'], '#171b24'), p2 = color(v['--panel2'], '#202636'), line = color(v['--line'], '#2a3142');
    const text = color(v['--text'], '#e8ebf2'), muted = color(v['--muted'], '#8f98ad'), acc = color(v['--accent'], '#6ea8ff');
    const light = !!o.light;
    const black = light ? '#ffffff' : '#000000';
    let faint = mix(muted, bg, 0.12);
    while (contrast(faint, panel) < 4.5 && contrast(faint, panel) < contrast(text, panel)) faint = mix(faint, text, 0.1);
    let sec = muted; while (contrast(sec, panel) < 4.5) sec = mix(sec, text, 0.1);
    const glowCss = v['--bgimg'] || 'none';
    const glow = Object.keys(GLOWS).find((k) => GLOWS[k].css === glowCss) || 'none';
    const rad = parseInt(v['--rad']) || 10;
    const f = fontOf(v['--font']), fh = fontOf(v['--fonth']);
    return normalize({
      name: o.name,
      background: { ground: bg, rail: mix(bg, black, 0.25), panel, raised: p2, raised2: mix(p2, line, 0.5), field: mix(bg, black, 0.3), line, line2: mix(line, text, 0.12), text, sec, faint, stage: mix(bg, black, 0.5) },
      accent: { stops: [acc], angle: 90, onAccent: 'auto' },
      font: { family: f, size: 13 },
      corners: { control: Math.min(16, Math.round(rad * 0.5)), panel: Math.min(24, rad) },
      extras: { glow, headingFont: fh !== f ? fh : '' },
    });
  }

  const api = {
    THEME_VERSION, BACKGROUNDS, BG_LABELS, STATE_LABELS, ACCENTS, CORNERS, DENSITY, TEXT_SIZES, SYSTEM_FONTS, GLOWS,
    DEFAULT_THEME, normalize, cssVars, contrast, luminance, onAccent, isLight, describe, gradient, fontStack, withBackground, fromOld,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Theme = api;
})(typeof window !== 'undefined' ? window : globalThis);
