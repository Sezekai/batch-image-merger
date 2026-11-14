// ---------- settings panel on the right ----------
const grid = (s) => s.layout === 'grid';
const MERGE_FIELDS = [
  { sec: 'layout', title: 'Layout' },
  { k: 'layout', label: 'Join', type: 'seg', opts: [['vertical', 'Vertical'], ['horizontal', 'Horizontal'], ['grid', 'Grid']] },
  { k: 'vSize', label: 'Width', type: 'select', show: (s) => s.layout === 'vertical', opts: [['min', 'Match the narrowest image'], ['max', 'Match the widest image'], ['custom', 'Set a width']], help: 'Every image is resized to this width so the edges line up.' },
  { k: 'vCustom', label: 'Width', unit: 'px', type: 'num', min: 16, max: 65000, show: (s) => s.layout === 'vertical' && s.vSize === 'custom' },
  { k: 'hSize', label: 'Height', type: 'select', show: (s) => s.layout === 'horizontal', opts: [['min', 'Match the shortest image'], ['max', 'Match the tallest image'], ['custom', 'Set a height']], help: 'Every image is resized to this height so the edges line up.' },
  { k: 'hCustom', label: 'Height', unit: 'px', type: 'num', min: 16, max: 65000, show: (s) => s.layout === 'horizontal' && s.hSize === 'custom' },
  { k: 'gridMode', label: 'Grid type', type: 'seg', show: grid, opts: [['fit', 'Fit'], ['crop', 'Crop'], ['row', 'Row-based']],
    help: (s) => ({ fit: 'Equal cells. Each image fits inside its cell; spare space is filled with the empty space colour.', crop: 'Equal cells. Each image fills its cell and the edges are trimmed. Shift + drag a picture to choose what’s kept.', row: 'Images in a row share one height, then rows are made the same width. Nothing is cut off and there is no padding.' }[s.gridMode]) },
  { k: 'cols', label: 'Columns', type: 'num', auto: true, min: 0, max: 200, show: grid, half: true },
  { k: 'rows', label: 'Rows', type: 'num', auto: true, min: 0, max: 200, show: grid, half: true },
  { k: 'cellShape', label: 'Cell shape', type: 'select', show: (s) => grid(s) && s.gridMode !== 'row', opts: [['auto', 'Most common image shape'], ['square', 'Square'], ['custom', 'Custom ratio']] },
  { k: 'cellRatioW', label: 'Ratio width', type: 'num', min: 1, max: 100, half: true, show: (s) => grid(s) && s.gridMode !== 'row' && s.cellShape === 'custom' },
  { k: 'cellRatioH', label: 'Ratio height', type: 'num', min: 1, max: 100, half: true, show: (s) => grid(s) && s.gridMode !== 'row' && s.cellShape === 'custom' },
  { k: 'cellSize', label: 'Cell size', type: 'select', show: (s) => grid(s) && s.gridMode !== 'row', opts: [['min', 'Match the smallest (no enlarging)'], ['max', 'Match the largest'], ['custom', 'Set a cell width']] },
  { k: 'cellCustom', label: 'Cell width', unit: 'px', type: 'num', min: 16, max: 30000, show: (s) => grid(s) && s.gridMode !== 'row' && s.cellSize === 'custom' },
  { k: 'rowWidth', label: 'Row width', type: 'select', show: (s) => grid(s) && s.gridMode === 'row', opts: [['min', 'Match the narrowest row'], ['max', 'Match the widest row'], ['custom', 'Set a width']] },
  { k: 'rowCustom', label: 'Width', unit: 'px', type: 'num', min: 16, max: 65000, show: (s) => grid(s) && s.gridMode === 'row' && s.rowWidth === 'custom' },
  { k: 'lastRow', label: 'Uneven last row', type: 'select', show: grid, opts: [['center', 'Centre'], ['left', 'Left'], ['right', 'Right'], ['spread', 'Spread out evenly'], ['stretch', 'Stretch to fill the row']] },

  { sec: 'lines', title: 'Lines between images' },
  { k: 'sepOn', label: 'Show lines', type: 'toggle' },
  { k: 'sepSize', label: 'Thickness', unit: 'px', type: 'num', min: 0, max: 2000, show: (s) => s.sepOn && !s.sepSplit },
  { k: 'sepH', label: 'Between rows', unit: 'px', type: 'num', min: 0, max: 2000, half: true, show: (s) => s.sepOn && s.sepSplit },
  { k: 'sepV', label: 'Between columns', unit: 'px', type: 'num', min: 0, max: 2000, half: true, show: (s) => s.sepOn && s.sepSplit },
  { k: 'sepSplit', label: 'Different thickness across and down', type: 'toggle', show: (s) => s.sepOn && s.layout === 'grid' },
  { k: 'sepColor', label: 'Colour', type: 'color', show: (s) => s.sepOn },

  { sec: 'border', title: 'Border' },
  { k: 'borderOn', label: 'Border around the image', type: 'toggle' },
  { k: 'borderSize', label: 'Thickness', unit: 'px', type: 'num', min: 0, max: 5000, show: (s) => s.borderOn && !s.borderSplit },
  { k: 'bT', label: 'Top', unit: 'px', type: 'num', min: 0, max: 5000, half: true, show: (s) => s.borderOn && s.borderSplit },
  { k: 'bB', label: 'Bottom', unit: 'px', type: 'num', min: 0, max: 5000, half: true, show: (s) => s.borderOn && s.borderSplit },
  { k: 'bL', label: 'Left', unit: 'px', type: 'num', min: 0, max: 5000, half: true, show: (s) => s.borderOn && s.borderSplit },
  { k: 'bR', label: 'Right', unit: 'px', type: 'num', min: 0, max: 5000, half: true, show: (s) => s.borderOn && s.borderSplit },
  { k: 'borderSplit', label: 'Different thickness per side', type: 'toggle', show: (s) => s.borderOn },
  { k: 'borderSame', label: 'Same colour as the lines', type: 'toggle', show: (s) => s.borderOn },
  { k: 'borderColor', label: 'Colour', type: 'color', show: (s) => s.borderOn && !s.borderSame },

  { sec: 'bg', title: 'Background' },
  { k: 'bgColor', label: 'Empty space colour', type: 'color', show: (s) => !(s.match && s.padUsesMatch), help: 'Used for padding in Fit grids, empty cells, gaps in an uneven last row, and behind transparent images.' },
  { k: 'match', label: 'Match background colours', type: 'toggle', help: 'Recolours each image’s background (found from its edges) to one shade, so they all look the same.' },
  { k: 'matchTarget', label: 'Colour to use', type: 'seg', show: (s) => s.match, opts: [['auto', 'Most common'], ['custom', 'Pick a colour']] },
  { k: 'matchColor', label: 'Colour', type: 'color', show: (s) => s.match && s.matchTarget === 'custom' },
  { k: 'tol', label: 'Tolerance', type: 'range', min: 0, max: 120, show: (s) => s.match, help: 'How far a shade can be from the background and still be replaced. Raise it for noisy or uneven backgrounds.' },
  { k: 'soft', label: 'Edge softness', type: 'range', min: 0, max: 80, show: (s) => s.match, help: 'Blends the edge of the subject so there’s no halo.' },
  { k: 'matchMode', label: 'Style', type: 'seg', show: (s) => s.match, opts: [['flat', 'Exact colour'], ['shift', 'Keep shading']], help: (s) => (s.matchMode === 'flat' ? 'The background becomes exactly one flat colour.' : 'The background moves to the new colour but keeps any shading, grain or gradient.') },
  { k: 'everywhere', label: 'Also replace background enclosed by the subject', type: 'toggle', show: (s) => s.match, help: 'For gaps such as between an arm and a body. Can also catch matching colours inside the subject.' },
  { k: 'padUsesMatch', label: 'Use the same colour for empty space', type: 'toggle', show: (s) => s.match },

];
const SAVE_FIELDS = [
  { sec: 'save', title: 'Saving' },
  { k: 'format', label: 'Format', type: 'seg', opts: [['jpg', 'JPG'], ['png', 'PNG']] },
  { k: 'quality', label: 'JPG quality', type: 'range', min: 1, max: 100, show: (s) => s.format === 'jpg' },
  { k: 'full444', label: 'Full colour detail (bigger file, sharper colour edges)', type: 'toggle', show: (s) => s.format === 'jpg' },
  { k: 'pngLevel', label: 'PNG compression', type: 'range', min: 0, max: 9, show: (s) => s.format === 'png', help: 'Only changes file size and save speed, never quality.' },
  { k: 'saveMode', label: 'Save to', type: 'select', opts: [['inside', 'Inside the set’s folder'], ['beside', 'Next to the set’s folder'], ['custom', 'A folder I choose']] },
  { k: 'customDir', label: 'Folder', type: 'dir', show: (s) => s.saveMode === 'custom' },
  { k: 'nameMode', label: 'File name', type: 'select', opts: [['folder', 'Folder name'], ['first', 'First image’s name + _merged'], ['pattern', 'Pattern']] },
  { k: 'pattern', label: 'Pattern', type: 'text', show: (s) => s.nameMode === 'pattern', help: 'Use {folder} {first} {count} {date} {layout}' },
  { k: '_manualName', label: 'Name for this set', type: 'name', setOnly: true, help: 'Typed name for just this set. Leave empty to use the rule above.' },
  { k: 'clash', label: 'If the file already exists', type: 'select', opts: [['number', 'Add a number: “name (2)”'], ['skip', 'Skip this set']], help: 'Nothing is ever replaced. Exporting a set again keeps the earlier file too.' },
];
const FF_FIELDS = [
  { sec: 'ffdet', title: 'Finding subjects' },
  { k: 'ffTol', label: 'Tolerance', type: 'range', min: 0, max: 150, help: 'How different from the background a colour must be to count as part of a subject. Raise it if bits of background stay; lower it if parts of subjects disappear.' },
  { k: 'ffSoft', label: 'Edge softness', type: 'range', min: 0, max: 100, help: 'Blends the outline so it isn’t jagged.' },
  { k: 'ffHoles', label: 'Remove background', type: 'seg', opts: [['edges', 'Around the outside'], ['all', 'Everywhere']], help: (s) => (s.ffHoles === 'all' ? 'Background-coloured gaps inside a subject (between an arm and the body) are removed too — so is anything inside that matches it.' : 'Only background reached from the picture’s edges is removed; enclosed gaps are kept.') },
  { k: 'ffGap', label: 'Keep pieces together closer than', unit: 'px', type: 'num', min: 0, max: 500, help: 'A hand or hair strand this close to a body stays part of it.' },
  { k: 'ffMinSize', label: 'Ignore specks smaller than', unit: 'px', type: 'num', min: 0, max: 2000 },
  { k: 'ffFeather', label: 'Edge feather', unit: 'px', type: 'range', min: 0, max: 20 },
  { sec: 'ffcanvas', title: 'Canvas' },
  { k: 'ffCanvas', label: 'Size', type: 'seg', opts: [['auto', 'Fit what’s placed'], ['fixed', 'Fixed size']] },
  { k: 'ffPad', label: 'Space around the edge', unit: 'px', type: 'num', min: 0, max: 5000, show: (s) => s.ffCanvas === 'auto' },
  { k: 'ffW', label: 'Width', unit: 'px', type: 'num', min: 16, max: 60000, half: true, show: (s) => s.ffCanvas === 'fixed' },
  { k: 'ffH', label: 'Height', unit: 'px', type: 'num', min: 16, max: 60000, half: true, show: (s) => s.ffCanvas === 'fixed' },
  { k: 'ffBgMode', label: 'Background', type: 'seg', opts: [['auto', 'Same as the images'], ['custom', 'Pick a colour']], show: (s) => !(s.ffTransparent && s.format === 'png') },
  { k: 'ffBgColor', label: 'Colour', type: 'color', show: (s) => s.ffBgMode === 'custom' && !(s.ffTransparent && s.format === 'png') },
  { k: 'ffTransparent', label: 'Transparent background', type: 'toggle', show: (s) => s.format === 'png', help: 'Only possible when saving as PNG.' },
];
const OV_FIELDS = [
  { sec: 'ovalign', title: 'Lining up' },
  { k: 'ovKind', label: 'Automatic line-up may', type: 'seg', opts: [['similarity', 'Move, size, rotate'], ['perspective', 'Also tilt (perspective)']], help: 'Use “tilt” for close-ups taken from a slightly different angle. Applies the next time something is lined up.' },
  { sec: 'ovout', title: 'Result' },
  { k: 'ovScale', label: 'Size', type: 'select', opts: [['base', 'Same as the wide shot'], ['2', '2 × the wide shot'], ['3', '3 × the wide shot'], ['4', '4 × the wide shot'], ['match', 'Big enough to keep all close-up detail'], ['custom', 'Set a width']] },
  { k: 'ovCustomW', label: 'Width', unit: 'px', type: 'num', min: 16, max: 60000, show: (s) => s.ovScale === 'custom' },
  { k: 'ovFeather', label: 'Edge softness of close-ups', unit: 'px', type: 'num', min: 0, max: 2000, help: 'How gradually each close-up fades in at its edges, in pixels of the saved image. Each layer can have its own.' },
  { k: 'ovColor', label: 'Match close-up colours to the wide shot', type: 'toggle', help: 'Evens out brightness and colour differences. Each layer can override it.' },
];
const fieldsFor = (tab) => [...{ merge: MERGE_FIELDS, freeform: FF_FIELDS, overlay: OV_FIELDS }[tab], ...SAVE_FIELDS];
const ALL_FIELDS = [...MERGE_FIELDS, ...FF_FIELDS, ...OV_FIELDS, ...SAVE_FIELDS];
const LABELS = Object.fromEntries(ALL_FIELDS.filter((f) => f.k).map((f) => [f.k, f.label]));

function panelScope() {
  const set = curSet();
  if (UI.mode === 'defaults' || !set) return { kind: 'defaults', ids: [] };
  const ids = UI.sel.size > 1 && UI.sel.has(set.id) ? [...UI.sel].filter(getSet) : [set.id];
  return { kind: 'set', ids };
}
const scopeKey = (sc) => (sc.kind === 'defaults' ? 'defaults' : sc.ids.length === 1 ? sc.ids[0] : 'sets:' + sc.ids.join(','));

// change a setting in whatever the panel is pointing at
function setField(k, v, opts = {}) {
  const sc = panelScope();
  const label = `${LABELS[k] || k}${sc.kind === 'defaults' ? ' (defaults)' : sc.ids.length > 1 ? ` (${sc.ids.length} sets)` : ''}`;
  change(scopeKey(sc), label, () => {
    if (sc.kind === 'defaults') P.defaults[k] = v;
    else for (const id of sc.ids) {
      const s = getSet(id);
      const base = Object.assign({}, DEF, P.defaults)[k];
      if (JSON.stringify(base) === JSON.stringify(v)) delete s.overrides[k]; else s.overrides[k] = v;
    }
  }, opts.ck ? 'f:' + k : null);
  if (opts.live) { drawStage(); drawSetRowsFor(sc); } else drawAll();
}
function resetField(k) {
  const sc = panelScope();
  change(scopeKey(sc), `Reset ${LABELS[k] || k}`, () => { for (const id of sc.ids) delete getSet(id).overrides[k]; });
  drawAll();
}
function drawSetRowsFor(sc) { (sc.kind === 'defaults' ? P.sets : sc.ids.map(getSet)).forEach((s) => s && drawSetRow(s)); }

function drawPanel() {
  const host = $('#panel');
  const set = curSet();
  const sc = panelScope();
  if (sc.kind === 'set' && UI.mode === 'defaults') UI.mode = 'set';
  const vals = sc.kind === 'defaults' ? Object.assign({}, DEF, P.defaults) : eff(set);
  const ovr = sc.kind === 'set' ? set.overrides : {};
  const differ = (k) => tabSets().filter((s) => k in s.overrides).length;
  const collapsed = UIP.collapsed || {};
  let html = `<div class="phead">
    <div class="seg full"><button data-mode="defaults" class="${sc.kind === 'defaults' ? 'on' : ''}" title="Settings every set uses unless it has its own">Defaults</button><button data-mode="set" class="${sc.kind === 'set' ? 'on' : ''}" ${set ? '' : 'disabled'} title="Settings for just the current set (or every selected set)">${sc.ids.length > 1 ? `${sc.ids.length} selected sets` : 'This set'}</button></div>
    <div class="row" style="margin-top:8px"><span class="small muted grow">${sc.kind === 'defaults' ? 'Changes here apply to every set that hasn’t got its own value.' : `Changes here apply only to ${sc.ids.length > 1 ? 'the selected sets' : esc(set.name)}. <i class="odot"></i> = own setting.`}</span>
    <button class="ghost sm" id="presetsBtn">Presets</button></div></div><div class="pbody">`;
  if (UI.tab === 'overlay' && set && sc.kind === 'set') html += ovPanelTop(set);
  let first = true;
  for (const f of fieldsFor(UI.tab)) {
    if (f.sec) { html += `${first ? '' : '</div>'}<div class="psec ${collapsed[f.sec] ? 'shut' : ''}" data-sec="${f.sec}"><h3 data-tog="${f.sec}">${esc(f.title)}<span class="chev">${ic('chev')}</span></h3>`; first = false; continue; }
    if (f.show && !f.show(vals)) continue;
    if (f.setOnly && sc.kind !== 'set') continue;
    if (f.setOnly && sc.ids.length > 1) continue;
    const own = sc.kind === 'set' && f.k in ovr;
    const v = f.type === 'name' ? set.manualName || '' : vals[f.k];
    const help = typeof f.help === 'function' ? f.help(vals) : f.help;
    const dif = sc.kind === 'defaults' && f.k ? differ(f.k) : 0;
    html += `<div class="field ${f.half ? 'half' : ''} f-${f.type}" data-k="${f.k}">
      <div class="flabel">${own ? '<i class="odot" title="This set has its own value"></i>' : ''}<span>${esc(f.label)}</span>${f.type === 'range' ? `<input class="rnum" type="number" data-rnum="${f.k}" value="${v}" min="${f.min}" max="${f.max}">` : ''}
        ${own ? `<button class="reset" data-reset="${f.k}" title="Use the default (${esc(fmtVal(f, Object.assign({}, DEF, P.defaults)[f.k]))})">${ic('reset')}</button>` : ''}
        ${dif ? `<span class="difc" title="${dif} set${dif === 1 ? '' : 's'} have their own value and won't change">${dif} differ</span>` : ''}</div>
      ${control(f, v, vals, set)}
      ${help ? `<div class="help">${esc(help)}</div>` : ''}</div>`;
  }
  html += '</div></div>';
  const keepScroll = $('.pbody', host) ? $('.pbody', host).scrollTop : 0;
  host.innerHTML = html;
  $('.pbody', host).scrollTop = keepScroll;
  wirePanel(host);
  if (UI.tab === 'overlay' && set && sc.kind === 'set') ovPanelWire(set, host);
}
function fmtVal(f, v) { if (f.opts) { const o = f.opts.find((x) => x[0] === v); return o ? o[1] : v; } if (f.type === 'toggle') return v ? 'on' : 'off'; if (f.auto && !v) return 'Auto'; return v + (f.unit ? ' ' + f.unit : ''); }
function control(f, v, vals, set) {
  switch (f.type) {
    case 'seg': return `<div class="seg full">${f.opts.map(([o, l]) => `<button data-set="${o}" class="${v === o ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
    case 'select': return `<select data-in>${f.opts.map(([o, l]) => `<option value="${o}" ${v === o ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    case 'toggle': return `<label class="switch"><input type="checkbox" data-in ${v ? 'checked' : ''}><span></span></label>`;
    case 'num': return `<div class="numwrap"><input type="number" data-in value="${f.auto && !v ? '' : v}" min="${f.min}" max="${f.max}" ${f.auto ? 'placeholder="Auto"' : ''}>${f.unit ? `<span class="unit">${f.unit}</span>` : ''}</div>`;
    case 'range': return `<input type="range" data-in min="${f.min}" max="${f.max}" value="${v}">`;
    case 'color': return `<div class="colorrow"><input type="color" data-in value="${esc(v)}"><input type="text" data-hex value="${esc(v)}" maxlength="7"><button class="ghost icon sm" data-drop title="Pick a colour from anywhere on screen">${ic('dropper')}</button>
      ${f.k === 'matchColor' || f.k === 'bgColor' ? autoSwatches(set) : ''}</div>`;
    case 'text': return `<input type="text" data-in value="${esc(v)}">`;
    case 'name': return `<input type="text" data-in value="${esc(v)}" placeholder="${esc(set ? previewName(set) : '')}">`;
    case 'dir': return `<div class="pathrow"><input type="text" data-in value="${esc(v)}" placeholder="No folder chosen"><button class="ghost sm" data-pick>Choose…</button></div>`;
  }
  return '';
}
// the background shades found in this set, as one-click swatches
function autoSwatches(set) {
  if (!set) return '';
  const seen = [...new Set(included(set).filter((i) => i.bg).map((i) => i.bg))].slice(0, 10);
  const auto = autoTarget(set);
  if (!seen.length) return '';
  return `<div class="swatches" title="Background colours found in this set">${seen.map((c) => `<i data-sw="${c}" style="background:${c}" title="${c}${c === auto ? ' (most common)' : ''}" class="${c === auto ? 'auto' : ''}"></i>`).join('')}</div>`;
}
function previewName(set) {
  const e = eff(set), j = exportJob(set);
  const first = j.firstName ? baseName(j.firstName).replace(/\.[^.]+$/, '') : set.name;
  const L = kindOf(set) === 'merge' ? setLayout(set) : null;
  if (e.nameMode === 'first') return first + '_merged';
  if (e.nameMode === 'pattern') return String(e.pattern || '').replace(/\{(folder|first|count|date|layout)\}/g, (_, k) => ({ folder: set.name, first, count: j.count, date: new Date().toISOString().slice(0, 10), layout: L ? BIMLayout.layoutLabel(e, L) : kindOf(set) }[k]));
  return set.name;
}

function wirePanel(host) {
  $$('[data-mode]', host).forEach((b) => (b.onclick = () => { UI.mode = b.dataset.mode; drawPanel(); }));
  $$('[data-tog]', host).forEach((h) => (h.onclick = () => { UIP.collapsed = UIP.collapsed || {}; UIP.collapsed[h.dataset.tog] = !UIP.collapsed[h.dataset.tog]; saveUIP(); h.parentElement.classList.toggle('shut'); }));
  $$('[data-reset]', host).forEach((b) => (b.onclick = () => resetField(b.dataset.reset)));
  $('#presetsBtn', host).onclick = presetsDialog;
  for (const el of $$('.field', host)) {
    const k = el.dataset.k, f = ALL_FIELDS.find((x) => x.k === k);
    $$('[data-set]', el).forEach((b) => (b.onclick = () => setField(k, b.dataset.set)));
    const inp = $('[data-in]', el);
    if (!inp) continue;
    if (f.type === 'toggle') inp.onchange = () => setField(k, inp.checked);
    else if (f.type === 'select') inp.onchange = () => setField(k, inp.value);
    else if (f.type === 'num') {
      const commit = () => { let v = inp.value === '' && f.auto ? 0 : Math.round(+inp.value); if (!isFinite(v)) return drawPanel(); v = clamp(v, f.min ?? 0, f.max ?? 1e6); setField(k, v); };
      inp.onchange = commit;
      inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
    } else if (f.type === 'range') {
      const rn = $(`[data-rnum="${k}"]`, el);
      inp.oninput = () => { rn.value = inp.value; setField(k, +inp.value, { live: true, ck: true }); };
      inp.onchange = () => drawPanel();
      rn.onchange = () => setField(k, clamp(Math.round(+rn.value || 0), f.min, f.max));
    } else if (f.type === 'color') {
      const hex = $('[data-hex]', el);
      inp.oninput = () => { hex.value = inp.value; setField(k, inp.value, { live: true, ck: true }); };
      inp.onchange = () => drawPanel();
      hex.onchange = () => { const v = hex.value.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{6}$/i.test(v)) setField(k, v.toLowerCase()); else hex.value = inp.value; };
      $('[data-drop]', el).onclick = async () => {
        if (!window.EyeDropper) return toast('Colour picking isn’t available here');
        try { const r = await new EyeDropper().open(); setField(k, r.sRGBHex.toLowerCase()); } catch {}
      };
      $$('[data-sw]', el).forEach((sw) => (sw.onclick = () => setField(k, sw.dataset.sw)));
    } else if (f.type === 'text' || f.type === 'dir') {
      inp.onchange = () => setField(k, inp.value.trim());
      const pk = $('[data-pick]', el);
      if (pk) pk.onclick = async () => { const r = await api.pickFolders({ single: true, title: 'Save merged images into…' }); if (r[0]) setField(k, r[0]); };
    } else if (f.type === 'name') {
      inp.onchange = () => { const s = curSet(); change(s.id, 'Name for this set', () => { s.manualName = inp.value.trim(); }); drawAll(); };
    }
  }
}

// ---------- presets ----------
function presetsDialog() {
  const sc = panelScope();
  const set = curSet();
  const m = modal(`<h1>Presets</h1><p class="sub">Save a group of settings with a name and apply it later, to the defaults or to the selected sets.</p>
    <div class="plist">${PRESETS.length ? PRESETS.map((p, i) => `<div class="prow"><b class="grow">${esc(p.name)}</b>
      <button class="ghost sm" data-ap="${i}" data-to="defaults">Apply to defaults</button>
      <button class="ghost sm" data-ap="${i}" data-to="sets" ${set ? '' : 'disabled'}>Apply to ${UI.sel.size > 1 ? `${UI.sel.size} selected sets` : 'this set'}</button>
      <button class="ghost icon sm" data-del="${i}" title="Delete preset">${ic('trash')}</button></div>`).join('') : '<p class="muted">No presets yet.</p>'}</div>
    <div class="row end" style="margin-top:16px"><button class="ghost" id="pClose">Close</button><button class="primary" id="pSave">Save ${sc.kind === 'defaults' ? 'the defaults' : 'this set’s settings'} as a preset…</button></div>`, { wide: true });
  $('#pClose', m).onclick = closeModal;
  $('#pSave', m).onclick = async () => {
    const name = await ask('Preset name', { placeholder: 'e.g. 3 × 3 thin white lines' });
    if (!name || !name.trim()) return presetsDialog();
    const vals = sc.kind === 'defaults' ? Object.assign({}, DEF, P.defaults) : eff(set);
    const keep = {}; for (const k of Object.keys(DEF)) if (k !== 'customDir' || vals.saveMode === 'custom') keep[k] = vals[k];
    const i = PRESETS.findIndex((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (i >= 0) PRESETS[i].values = keep; else PRESETS.push({ name: name.trim(), values: keep });
    savePresets(); toast('Preset saved'); presetsDialog();
  };
  $$('[data-ap]', m).forEach((b) => (b.onclick = () => {
    const p = PRESETS[+b.dataset.ap];
    if (b.dataset.to === 'defaults') change('defaults', `Preset “${p.name}” (defaults)`, () => { P.defaults = Object.assign({}, P.defaults, p.values); });
    else {
      const ids = UI.sel.size > 1 && UI.sel.has(set.id) ? [...UI.sel] : [set.id];
      change(ids.length === 1 ? ids[0] : 'sets:' + ids.join(','), `Preset “${p.name}”`, () => ids.forEach((id) => {
        const s = getSet(id), base = Object.assign({}, DEF, P.defaults);
        for (const [k, v] of Object.entries(p.values)) { if (JSON.stringify(base[k]) === JSON.stringify(v)) delete s.overrides[k]; else s.overrides[k] = v; }
      }));
    }
    closeModal(); drawAll(); toast(`Applied “${p.name}”`);
  }));
  $$('[data-del]', m).forEach((b) => (b.onclick = () => { PRESETS.splice(+b.dataset.del, 1); savePresets(); presetsDialog(); }));
}
