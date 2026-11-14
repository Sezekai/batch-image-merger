// ---------- Look: themes, colours, accent gradient, fonts, shape, outline, extras ----------
// The shared Appearance screen (DESIGN.md, "Appearance"), built on js/theme.js. What you see now, the
// active theme and your saved themes are kept in appearance.json in the data folder.
const TH = window.Theme;
const DEFAULT_ID = 'default';
const LOOK = { current: TH.normalize(TH.DEFAULT_THEME), activeId: DEFAULT_ID, saved: [] };
let CUSTOM_FONTS = [];
const LOADED_FONTS = new Set();

// The themes that came with versions 1.0–1.2, kept as built-in themes in the new format.
const OLD_THEMES = [
  ['midnight', 'Midnight', ['#0f1218', '#171b24', '#202636', '#2a3142', '#e8ebf2', '#8f98ad', '#6ea8ff', '#3b6fd4']],
  ['aurora', 'Aurora', ['#06100f', '#0d1e21', '#14292d', '#1f4a47', '#e6f6f2', '#82aaa3', '#4ff0c0', '#19a381', '#02130e', 20, 'Space Grotesk', 'Space Grotesk', 'radial-gradient(900px 620px at 8% -8%,rgba(64,255,190,.18),transparent 62%),radial-gradient(820px 720px at 98% 8%,rgba(125,90,255,.2),transparent 62%)']],
  ['noir', 'Noir', ['#121110', '#1a1917', '#25221e', '#38342d', '#efe9dd', '#9b9384', '#ff5a36', '#e5481f', '#fff', 3]],
  ['terminal', 'Terminal', ['#020503', '#040b06', '#08150b', '#12381c', '#9dffae', '#43a15a', '#39ff6a', '#1c8a3a', '#00130a', 2, 'Consolas']],
  ['sakura', 'Sakura', ['#160f14', '#21161d', '#2d1d27', '#4a2c3d', '#fbe9f1', '#b08a9c', '#ff8fbd', '#d9548f', '#fff', 18, null, null, 'radial-gradient(800px 500px at 100% 0,rgba(255,143,189,.14),transparent 60%)']],
  ['ocean', 'Ocean', ['#08121c', '#0e1d2c', '#15293d', '#21405c', '#e4f1fb', '#7fa3bf', '#4cc3ff', '#1d85c9', '#fff', 12]],
  ['ember', 'Ember', ['#150d0a', '#221612', '#2f1e18', '#4a2f25', '#fbeee6', '#b58f7e', '#ff9a3c', '#d9681c', '#fff', 10]],
  ['violet', 'Violet', ['#0f0b1a', '#181228', '#221a38', '#3a2d5c', '#efe9fb', '#9c8fba', '#b18cff', '#7a52d9', '#fff', 16, null, null, 'radial-gradient(900px 600px at 0 0,rgba(140,100,255,.18),transparent 60%)']],
  ['forest', 'Forest', ['#0c130e', '#131e16', '#1b2b20', '#2b4733', '#e6f3e9', '#86a68e', '#7be08f', '#2f8f48', '#fff', 12]],
  ['slate', 'Slate', ['#14171a', '#1d2125', '#272c32', '#363c44', '#e6e8eb', '#8e959e', '#9fb4c8', '#51606f', '#fff', 8]],
  ['mono', 'Mono', ['#0b0b0b', '#151515', '#1e1e1e', '#2e2e2e', '#eaeaea', '#8a8a8a', '#ffffff', '#3a3a3a', '#fff', 0]],
  ['daylight', 'Daylight', ['#f3f5f9', '#ffffff', '#eceff5', '#d6dbe6', '#1c2230', '#657089', '#2d6cdf', '#2d6cdf', '#fff', 14, null, null, 'none', true]],
];
function oldVars(v) {
  const [bg, panel, panel2, line, text, muted, accent, btn, btntx = '#fff', rad = 14, font, fonth, bgimg = 'none', light = false] = v;
  const f = (x) => (x ? `"${x}","Segoe UI",system-ui,sans-serif` : '"Segoe UI",system-ui,sans-serif');
  return { light, vars: { '--bg': bg, '--panel': panel, '--panel2': panel2, '--line': line, '--text': text, '--muted': muted, '--accent': accent, '--btn': btn, '--btntx': btntx, '--rad': rad + 'px', '--font': f(font), '--fonth': f(fonth || font), '--bgimg': bgimg } };
}
const BUILTINS = [{ id: DEFAULT_ID, name: 'Default', theme: TH.normalize(TH.DEFAULT_THEME), builtIn: true },
  ...OLD_THEMES.map(([id, name, v]) => ({ id: 'old-' + id, name, theme: TH.fromOld({ name, ...oldVars(v) }), builtIn: true, old: true }))];

function applyTheme() {
  const v = TH.cssVars(LOOK.current);
  const r = document.documentElement;
  for (const [k, val] of Object.entries(v)) { if (k === 'scheme') r.style.colorScheme = val; else r.style.setProperty('--' + k, val); }
  document.body.classList.toggle('light', v.scheme === 'light');
  const bg = LOOK.current.background;
  api.setTitleBar({ color: bg.ground, symbolColor: bg.sec }).catch(() => {});
}
const persistLook = debounce(() => api.save('appearance', { version: 1, current: LOOK.current, activeId: LOOK.activeId, saved: LOOK.saved }), 300);
async function loadLook(saved, uip) {
  if (saved && saved.current) {
    LOOK.current = TH.normalize(saved.current);
    LOOK.activeId = saved.activeId || null;
    LOOK.saved = Array.isArray(saved.saved) ? saved.saved.filter((s) => s && s.id && s.theme).map((s) => ({ id: s.id, name: String(s.name || 'Theme'), theme: TH.normalize(s.theme) })) : [];
  } else {
    // first start after the redesign: your own themes come across; the new default look is used
    LOOK.saved = (uip.myThemes || []).map((t) => ({ id: t.id, name: t.name, theme: TH.fromOld(t) }));
    if (LOOK.saved.length) log(`Brought across ${LOOK.saved.length} of your own theme${LOOK.saved.length === 1 ? '' : 's'} into Look.`);
    persistLook();
  }
  await loadCustomFonts();
  applyTheme();
}
async function loadCustomFonts() {
  try { CUSTOM_FONTS = await api.fonts.list(); } catch { CUSTOM_FONTS = []; }
  for (const f of CUSTOM_FONTS) for (const file of f.files || []) {
    const key = f.id + '/' + file.name;
    if (LOADED_FONTS.has(key)) continue;
    try {
      const buf = await api.fonts.read(f.id, file.name);
      const face = new FontFace(f.family, buf, { weight: String(file.weight), style: file.style || 'normal' });
      await face.load(); document.fonts.add(face); LOADED_FONTS.add(key);
    } catch (e) { log(`Could not load the font ${file.name}: ${e.message}`, 'w'); }
  }
}
const FONT_SEEN = new Map();
function systemFontInstalled(family) {
  if (FONT_SEEN.has(family)) return FONT_SEEN.get(family);
  const c = document.createElement('canvas').getContext('2d');
  const text = 'mmmmmmmmmmlli1WQ merger 0123 AaBbGg';
  const ok = ['monospace', 'serif'].some((fb) => { c.font = `20px ${fb}`; const w0 = c.measureText(text).width; c.font = `20px '${family}', ${fb}`; return c.measureText(text).width !== w0; });
  FONT_SEEN.set(family, ok);
  return ok;
}
const themeEntry = (id) => BUILTINS.find((b) => b.id === id) || LOOK.saved.find((s) => s.id === id) || null;
const themeKey = (t) => JSON.stringify({ ...TH.normalize(t), name: '' });
function setLook(next, { rerender = true } = {}) {
  LOOK.current = TH.normalize({ ...next, name: LOOK.current.name });
  applyTheme(); persistLook();
  if (UI.screen !== 'look') return;
  if (rerender) drawLook(); else { drawThemeList(); const d = $('#a-desc'); if (d) d.textContent = TH.describe(LOOK.current).text; }
}

// ---------- the screen ----------
function swatch(t) { const b = t.background; return `<div class="sw"><i style="background:${b.ground}"></i><i style="background:${b.panel}"></i><i style="background:${b.raised}"></i><i class="g" style="background:${TH.gradient(t.accent.stops, 90)}"></i></div>`; }
function initLook() {
  const host = $('#lookScreen');
  host.innerHTML = `<div class="panel lthemes"><div class="top"><b>Themes</b><span class="small faint" id="a-desc"></span></div><div class="list" id="a-themes"></div>
      <div class="bot"><button class="primary sm" id="a-save"><span data-ic="plus"></span>Save as theme…</button><button class="sm" id="a-import">Import…</button><button class="sm" id="a-export">Export…</button><button class="sm danger-ghost" id="a-reset">Reset to default</button></div></div>
    <div class="lcol lform"><div class="hd"><h1>Look</h1><p>Colours, accent, font, corners and spacing. Everything changes as you go; save it as a theme to keep it.</p><span class="grow"></span><button class="sm" id="a-back" title="Back to the work (Esc)"><span data-ic="x"></span>Close</button></div>
      <div class="scroll"><div class="sgrid" id="a-form"></div></div></div>`;
  paintIcons(host);
  $('#a-back').onclick = () => showScreen('work');
  $('#a-themes').addEventListener('click', themeListClick);
  $('#a-save').onclick = async () => {
    const name = await ask('Save as theme', { text: 'Saves everything you see now: colours, gradient, font, corners, density, outline and extras.', value: `My theme ${LOOK.saved.length + 1}`, ok: 'Save theme' });
    if (!name || !name.trim()) return;
    const s = { id: 't' + uid(), name: name.trim().slice(0, 60), theme: TH.normalize({ ...LOOK.current, name: name.trim() }) };
    LOOK.saved.push(s); LOOK.activeId = s.id; persistLook(); drawThemeList(); toast(`Saved ${s.name}`, 'ok');
  };
  $('#a-export').onclick = () => { const s = LOOK.activeId ? themeEntry(LOOK.activeId) : null; exportTheme({ ...LOOK.current, name: s ? s.name : 'Custom theme' }); };
  $('#a-import').onclick = async () => {
    try {
      const list = await api.importThemes();
      if (!list || !list.length) return;
      for (const t of list) {
        const n = TH.normalize(t); let name = n.name;
        while (LOOK.saved.some((s) => s.name === name)) name += ' (imported)';
        LOOK.saved.push({ id: 't' + uid(), name, theme: { ...n, name } });
      }
      persistLook(); drawThemeList();
      toast(`Imported ${list.length} theme${list.length === 1 ? '' : 's'}. Click one to use it.`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#a-reset').onclick = async () => {
    if (!(await confirmBox('Go back to the default look?', 'Violet haze, Violet → Blue, Inter, standard corners, compact, flat buttons, the accent for the outline and highlight, no extras. Your saved themes stay.', 'Use the default'))) return;
    LOOK.activeId = DEFAULT_ID; LOOK.current = TH.normalize(TH.DEFAULT_THEME); applyTheme(); persistLook(); drawLook();
  };
  const form = $('#a-form');
  form.addEventListener('click', formClick);
  form.addEventListener('input', formInput);
  form.addEventListener('change', (e) => { if (e.target.matches('input[type=color], input[type=range], .hex, select')) drawLook(); });
}
async function exportTheme(t) { try { const p = await api.exportTheme(TH.normalize(t)); if (p) toast(`Theme saved to ${p}`, 'ok'); } catch (e) { toast(e.message, 'err'); } }
function drawThemeList() {
  const curKey = themeKey(LOOK.current);
  const list = [BUILTINS[0], ...LOOK.saved, ...BUILTINS.slice(1)];
  $('#a-themes').innerHTML = list.map((s, i) => {
    const active = LOOK.activeId === s.id;
    const edited = active && themeKey(s.theme) !== curKey;
    const head = i === 1 + LOOK.saved.length && BUILTINS.length > 1 ? '<div class="subhead" style="margin:6px 2px 0">From before the redesign</div>' : i === 1 && LOOK.saved.length ? '<div class="subhead" style="margin:6px 2px 0">Yours</div>' : '';
    return `${head}<div class="tcard${active ? ' on' : ''}" data-id="${s.id}" tabindex="0" role="button" aria-pressed="${active}">
      ${swatch(s.theme)}<div class="nm"><b>${esc(s.name)}</b><span>${esc(s.theme.font.family)}</span></div>
      ${edited ? '<span class="chip acc" style="align-self:flex-start">Edited · not saved</span>' : ''}
      <div class="acts">${edited && !s.builtIn ? '<button data-a="update">Update</button>' : ''}${s.builtIn ? '' : '<button data-a="rename">Rename</button>'}<button data-a="dup">Duplicate</button><button data-a="export">Export</button>${s.builtIn ? '' : '<button data-a="del" class="del">Delete</button>'}</div></div>`;
  }).join('');
  $('#a-desc').textContent = TH.describe(LOOK.current).text;
}
async function themeListClick(e) {
  const card = e.target.closest('.tcard'); if (!card) return;
  const s = themeEntry(card.dataset.id); if (!s) return;
  const act = e.target.closest('[data-a]') && e.target.closest('[data-a]').dataset.a;
  if (!act) { LOOK.activeId = s.id; LOOK.current = TH.normalize(s.theme); applyTheme(); persistLook(); drawLook(); return; }
  if (act === 'update') { s.theme = TH.normalize({ ...LOOK.current, name: s.name }); persistLook(); drawThemeList(); toast(`Saved changes to ${s.name}`, 'ok'); }
  if (act === 'rename') { const n = await ask('Rename theme', { value: s.name, ok: 'Rename' }); if (n && n.trim()) { s.name = n.trim().slice(0, 60); s.theme.name = s.name; persistLook(); drawThemeList(); } }
  if (act === 'dup') { LOOK.saved.push({ id: 't' + uid(), name: `${s.name} copy`, theme: TH.normalize({ ...s.theme, name: `${s.name} copy` }) }); persistLook(); drawThemeList(); }
  if (act === 'export') exportTheme({ ...s.theme, name: s.name });
  if (act === 'del') {
    if (!(await confirmBox(`Delete the theme “${s.name}”?`, 'It is removed from this app. What you see now stays until you pick another theme. Exported theme files are not touched.', 'Delete theme', true))) return;
    LOOK.saved = LOOK.saved.filter((x) => x.id !== s.id);
    if (LOOK.activeId === s.id) LOOK.activeId = null;
    persistLook(); drawThemeList();
  }
}
function fontChoices() {
  const bundled = (window.BUNDLED_FONTS || []).filter((f) => !f.mono).map((f) => ({ family: f.family, kind: 'bundled', ok: true }));
  const system = TH.SYSTEM_FONTS.map((f) => ({ family: f, kind: 'system', ok: systemFontInstalled(f) }));
  const custom = CUSTOM_FONTS.map((f) => ({ family: f.family, kind: 'custom', ok: true, id: f.id }));
  return { bundled, system, custom };
}
const colorRow = (group, key, label, value) => `<div class="crow"><input type="color" value="${value}" data-cg="${group}" data-ck="${key}" aria-label="${esc(label)}"><span>${esc(label)}</span><input class="hex" value="${value}" data-hg="${group}" data-hk="${key}" spellcheck="false" aria-label="${esc(label)} hex"></div>`;
function drawLook() {
  if (!$('#a-form')) initLook();
  drawThemeList();
  const t = LOOK.current, d = TH.describe(t), fc = fontChoices();
  const fontChip = (f, key = 'font') => `<button class="lchip${(key === 'font' ? t.font.family : t.extras.headingFont) === f.family ? ' on' : ''}${f.ok ? '' : ' off'}" data-${key}="${esc(f.family)}" style="font-family:${esc(TH.fontStack(f.family))}"${f.ok ? '' : ' disabled title="Not installed on this computer"'}>${esc(f.family === 'Segoe UI Variable Text' ? 'Segoe UI Variable' : f.family)}${f.kind === 'system' ? ` <span class="note">${f.ok ? 'installed' : 'not installed'}</span>` : ''}${f.kind === 'custom' && key === 'font' ? `<span class="x" data-rmfont="${esc(f.id)}" title="Remove this font">${ic('x')}</span>` : ''}</button>`;
  const onc = TH.onAccent(t), worst = Math.min(...t.accent.stops.map((s) => TH.contrast(onc, s)));
  const panelC = (k) => TH.contrast(t.background[k], t.background.panel);
  const weak = ['text', 'sec', 'faint'].filter((k) => panelC(k) < 4.5);
  const segBtns = (id, items, cur, attr) => `<div class="seg" id="${id}">${items.map(([k, l]) => `<button data-${attr}="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  $('#a-form').innerHTML = `
    <div class="panel asec"><div class="sh"><h3>Preview</h3><span>Everything in the app changes as you change things below.</span></div>
      <div class="preview">
        <div class="pbox"><div class="row"><button class="primary">${ic('save')}Export this set</button><button>Add folders</button></div>
          <div class="row"><select style="width:auto"><option>Grid</option></select><label class="chk"><input type="checkbox" checked>Show lines</label><label class="switch"><input type="checkbox" checked><span></span></label></div></div>
        <div class="pbox"><div class="row" style="justify-content:space-between"><b>Exporting 5 of 12</b><span style="color:var(--acc);font-weight:600">38%</span></div><div class="bar"><i style="width:38%"></i></div>
          <span class="muted small">0:41 elapsed · about 1:07 left</span></div>
        <div class="pbox"><div class="row"><span class="chip ok">${ic('check')}Exported</span><span class="chip warn">Changed</span><span class="chip acc">Queued</span></div>
          <div class="row"><span class="setrow cur" style="flex:1;min-height:0;padding:4px 8px"><span class="sinfo"><span class="sname">Selected set</span></span></span><span class="faint small">Faint text</span></div></div>
      </div></div>

    <div class="panel asec"><div class="sh"><h3>Background</h3><span>${d.background ? esc(TH.BACKGROUNDS[d.background].name) : 'Custom'} · pick a preset, then change any colour</span></div>
      <div class="chips">${Object.entries(TH.BACKGROUNDS).map(([k, b]) => `<button class="lchip${d.background === k ? ' on' : ''}" data-bg="${k}"><span class="sw" style="background:linear-gradient(135deg, ${b.ground} 0 45%, ${b.raised} 45% 75%, ${b.text} 75%)"></span>${esc(b.name)}</button>`).join('')}</div>
      <div class="colors">${TH.BG_LABELS.map(([k, l]) => colorRow('background', k, l, t.background[k])).join('')}</div>
      ${weak.length ? `<span class="warnline small">${weak.map((k) => TH.BG_LABELS.find((x) => x[0] === k)[1]).join(', ')} ${weak.length === 1 ? 'is' : 'are'} below 4.5:1 on the panels, so ${weak.length === 1 ? 'it' : 'they'} may be hard to read.</span>` : ''}
      <div class="subhead">State colours</div>
      <div class="colors">${TH.STATE_LABELS.map(([k, l]) => colorRow('states', k, l, t.states[k])).join('')}</div></div>

    <div class="panel asec"><div class="sh"><h3>Accent</h3><span>${d.accent ? esc(TH.ACCENTS[d.accent].name) : 'Custom'} · the main button, progress, selection and badges</span></div>
      <div class="chips">${Object.entries(TH.ACCENTS).map(([k, a]) => `<button class="lchip${d.accent === k ? ' on' : ''}" data-acc="${k}"><span class="gp" style="background:${TH.gradient(a.stops, 90)}"></span>${esc(a.name)}</button>`).join('')}</div>
      <div class="subhead">Gradient colours</div>
      <div class="stops">${t.accent.stops.map((s, i) => `<span class="stop"><input type="color" value="${s}" data-stop="${i}" aria-label="Colour ${i + 1}"><input class="hex" value="${s}" data-stophex="${i}" spellcheck="false">${t.accent.stops.length > 1 ? `<button class="quiet icon sm" data-rmstop="${i}" title="Remove this colour">${ic('x')}</button>` : ''}</span>`).join('')}
        ${t.accent.stops.length < 4 ? `<button class="sm" id="a-addstop">${ic('plus')}Add colour</button>` : ''}<span class="gprev" style="background:${TH.gradient(t.accent.stops, t.accent.angle)}"></span></div>
      <div class="trow2"><span class="inl">Direction</span><span class="slider"><input type="range" min="0" max="360" step="5" value="${t.accent.angle}" id="a-angle"${t.accent.stops.length === 1 ? ' disabled' : ''}><span class="v" id="a-angle-v">${t.accent.angle}°</span></span>
        <span class="divider"></span><span class="inl">Text on the accent</span>${segBtns('a-on', [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']], t.accent.onAccent, 'on')}
        <span class="${worst < 4.5 ? 'warnline' : 'faint small'}">Contrast ${worst.toFixed(1)}:1${worst < 4.5 ? ' · hard to read, try the other text colour' : ''}</span></div></div>

    <div class="panel asec"><div class="sh"><h3>Font</h3><span>${esc(t.font.family)} · bundled fonts always work; add any font you have as a file</span></div>
      <div class="subhead">Bundled</div><div class="chips">${fc.bundled.map((f) => fontChip(f)).join('')}</div>
      <div class="subhead">On this computer</div><div class="chips">${fc.system.map((f) => fontChip(f)).join('')}</div>
      <div class="subhead">Added by you</div><div class="chips">${fc.custom.map((f) => fontChip(f)).join('')}<button class="sm" id="a-addfont">${ic('plus')}Add font…</button></div>
      <div class="trow2"><span class="inl">Text size</span>${segBtns('a-size', TH.TEXT_SIZES.map((s) => [s, s + ' px']), t.font.size, 'size')}</div></div>

    <div class="panel asec"><div class="sh"><h3>Shape and spacing</h3><span>${d.corners ? esc(TH.CORNERS[d.corners].name) : 'Custom'} corners · ${d.density ? esc(TH.DENSITY[d.density].name).toLowerCase() : 'custom'} density</span></div>
      <div class="trow2"><span class="inl" style="width:88px">Corners</span>${segBtns('a-corners', Object.entries(TH.CORNERS).map(([k, c]) => [k, c.name]), d.corners, 'c')}
        <span class="slider"><span class="inl">Controls</span><input type="range" min="0" max="16" value="${t.corners.control}" data-num="corners.control"><span class="v">${t.corners.control} px</span></span>
        <span class="slider"><span class="inl">Panels</span><input type="range" min="0" max="24" value="${t.corners.panel}" data-num="corners.panel"><span class="v">${t.corners.panel} px</span></span></div>
      <div class="trow2"><span class="inl" style="width:88px">Density</span>${segBtns('a-density', Object.entries(TH.DENSITY).map(([k, c]) => [k, c.name]), d.density, 'dn')}
        <span class="slider"><span class="inl">Controls</span><input type="range" min="24" max="44" value="${t.density.control}" data-num="density.control"><span class="v">${t.density.control} px</span></span>
        <span class="slider"><span class="inl">Rows</span><input type="range" min="20" max="40" value="${t.density.row}" data-num="density.row"><span class="v">${t.density.row} px</span></span></div>
      <div class="trow2"><span class="inl" style="width:88px">Buttons</span>${segBtns('a-btn', [['flat', 'Flat'], ['glow', 'Glow']], t.buttons.style, 'bs')}<span class="faint small">Glow adds a soft accent glow under the main button.</span></div></div>

    <div class="panel asec"><div class="sh"><h3>Outline and highlight</h3><span>The line around what’s selected or focused, and the tint behind selected and ticked things</span></div>
      <div class="trow2"><span class="inl" style="width:88px">Outline</span>${segBtns('a-oc', [['', 'Accent'], ['own', 'Own colour']], t.outline.colour ? 'own' : '', 'oc')}
        ${t.outline.colour ? `<input type="color" value="${t.outline.colour}" data-cg="outline" data-ck="colour"><input class="hex" value="${t.outline.colour}" data-hg="outline" data-hk="colour" spellcheck="false">` : ''}
        <span class="slider"><span class="inl">Width</span><input type="range" min="1" max="4" value="${t.outline.width}" data-num="outline.width"><span class="v">${t.outline.width} px</span></span></div>
      <div class="trow2"><span class="inl" style="width:88px">Highlight</span>${segBtns('a-hc', [['', 'Accent'], ['own', 'Own colour']], t.highlight.colour ? 'own' : '', 'hc')}
        ${t.highlight.colour ? `<input type="color" value="${t.highlight.colour}" data-cg="highlight" data-ck="colour"><input class="hex" value="${t.highlight.colour}" data-hg="highlight" data-hk="colour" spellcheck="false">` : ''}</div></div>

    <div class="panel asec"><div class="sh"><h3>Extras</h3><span>Kept from the old theme editor. Both are off by default.</span></div>
      <div class="trow2"><span class="inl" style="width:88px">Glow</span>${segBtns('a-glow', Object.entries(TH.GLOWS).map(([k, g]) => [k, g.name]), t.extras.glow, 'glow')}<span class="faint small">A soft coloured glow behind the window.</span></div>
      <div class="subhead">Heading font</div>
      <div class="chips"><button class="lchip${t.extras.headingFont ? '' : ' on'}" data-hfont="">Same as the text</button>${[...fc.bundled, ...fc.system.filter((f) => f.ok), ...fc.custom].map((f) => fontChip(f, 'hfont')).join('')}</div></div>`;
}
async function formClick(e) {
  const t = LOOK.current, q = (sel) => e.target.closest(sel);
  let b;
  if ((b = q('[data-bg]'))) return setLook(TH.withBackground(t, b.dataset.bg));
  if ((b = q('[data-acc]'))) return setLook({ ...t, accent: { ...t.accent, stops: [...TH.ACCENTS[b.dataset.acc].stops] } });
  if ((b = q('[data-rmfont]'))) {
    e.stopPropagation();
    const f = CUSTOM_FONTS.find((x) => x.id === b.dataset.rmfont);
    if (!(await confirmBox(`Remove ${f ? f.family : 'this font'}?`, 'Its copies in the app’s data folder go to the Recycle Bin. Themes using it fall back to Inter.', 'Remove font', true))) return;
    try { CUSTOM_FONTS = await api.fonts.remove(b.dataset.rmfont); } catch (err) { return toast(`Couldn’t remove the font: ${err.message}`); }
    if (f && t.font.family === f.family) return setLook({ ...t, font: { ...t.font, family: 'Inter' } });
    return drawLook();
  }
  if ((b = q('[data-font]')) && !b.disabled) return setLook({ ...t, font: { ...t.font, family: b.dataset.font } });
  if ((b = q('[data-hfont]')) && !b.disabled) return setLook({ ...t, extras: { ...t.extras, headingFont: b.dataset.hfont } });
  if ((b = q('[data-size]'))) return setLook({ ...t, font: { ...t.font, size: +b.dataset.size } });
  if ((b = q('[data-on]'))) return setLook({ ...t, accent: { ...t.accent, onAccent: b.dataset.on } });
  if ((b = q('[data-c]'))) { const c = TH.CORNERS[b.dataset.c]; return setLook({ ...t, corners: { control: c.control, panel: c.panel } }); }
  if ((b = q('[data-dn]'))) { const c = TH.DENSITY[b.dataset.dn]; return setLook({ ...t, density: { control: c.control, row: c.row } }); }
  if ((b = q('[data-bs]'))) return setLook({ ...t, buttons: { style: b.dataset.bs } });
  if ((b = q('[data-oc]'))) return setLook({ ...t, outline: { ...t.outline, colour: b.dataset.oc ? t.accent.stops[0] : '' } });
  if ((b = q('[data-hc]'))) return setLook({ ...t, highlight: { colour: b.dataset.hc ? t.accent.stops[0] : '' } });
  if ((b = q('[data-glow]'))) return setLook({ ...t, extras: { ...t.extras, glow: b.dataset.glow } });
  if ((b = q('[data-rmstop]'))) return setLook({ ...t, accent: { ...t.accent, stops: t.accent.stops.filter((_, i) => i !== +b.dataset.rmstop) } });
  if (q('#a-addstop')) return setLook({ ...t, accent: { ...t.accent, stops: [...t.accent.stops, t.accent.stops[t.accent.stops.length - 1]] } });
  if (q('#a-addfont')) return addFont();
}
function formInput(e) {
  const el = e.target, t = JSON.parse(JSON.stringify(LOOK.current));
  const isHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  if (el.dataset.cg) {
    t[el.dataset.cg][el.dataset.ck] = el.value;
    const hx = $(`.hex[data-hg="${el.dataset.cg}"][data-hk="${el.dataset.ck}"]`); if (hx) { hx.value = el.value; hx.classList.remove('bad'); }
  } else if (el.dataset.hg) {
    if (!isHex(el.value)) { el.classList.add('bad'); return; }
    el.classList.remove('bad');
    t[el.dataset.hg][el.dataset.hk] = el.value.trim();
    const cp = $(`input[type=color][data-cg="${el.dataset.hg}"][data-ck="${el.dataset.hk}"]`); if (cp) cp.value = TH.normalize(t)[el.dataset.hg][el.dataset.hk];
  } else if (el.dataset.stop !== undefined) {
    t.accent.stops[+el.dataset.stop] = el.value;
    const hx = $(`[data-stophex="${el.dataset.stop}"]`); if (hx) hx.value = el.value;
  } else if (el.dataset.stophex !== undefined) {
    if (!isHex(el.value)) { el.classList.add('bad'); return; }
    el.classList.remove('bad'); t.accent.stops[+el.dataset.stophex] = el.value.trim();
  } else if (el.id === 'a-angle') { t.accent.angle = +el.value; $('#a-angle-v').textContent = el.value + '°'; }
  else if (el.dataset.num) { const [g, k] = el.dataset.num.split('.'); t[g][k] = +el.value; el.nextElementSibling.textContent = el.value + ' px'; }
  else return;
  setLook(t, { rerender: false });
  const gp = $('.gprev'); if (gp) gp.style.background = TH.gradient(LOOK.current.accent.stops, LOOK.current.accent.angle);
}
async function addFont() {
  let files;
  try { files = await api.fonts.pick(); } catch (e) { return toast(e.message, 'err'); }
  if (!files || !files.length) return;
  const list = files.map((f) => `${esc(f.name)} · weight ${esc(f.weight)}${f.style === 'italic' ? ' italic' : ''}`).join('<br>');
  const name = await dialog({ title: 'Add font', text: 'Name the font as you want it to appear. Pick every weight of one font at once (Regular, Bold and so on).', ok: 'Add font', extra: `<div class="flist">${list}</div>`, input: { value: files[0].family } });
  if (!name || !name.trim()) return;
  try {
    CUSTOM_FONTS = await api.fonts.install(name.trim(), files);
    await loadCustomFonts();
    setLook({ ...LOOK.current, font: { ...LOOK.current.font, family: name.trim() } });
    toast(`Added ${name.trim()}`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
