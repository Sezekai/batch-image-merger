// ---------- Settings: app options, Storage, Reset (STANDARDS.md, "Settings") ----------
// Changes apply straight away; there's no Save button.
const saveSettings = () => api.save('settings', SETTINGS);
const PLACE_SIZE = new Map();

function drawSettings() {
  const host = $('#settingsScreen');
  const cpus = navigator.hardwareConcurrency || 4;
  const tog = (k, label, help) => `<div class="srow"><span class="lab">${label}</span><div class="ctl"><label class="switch"><input type="checkbox" data-set="${k}" ${SETTINGS[k] ? 'checked' : ''}><span></span></label><span class="faint small">${help}</span></div></div>`;
  host.innerHTML = `<div class="hd"><h1>Settings</h1><p>How the app starts and runs, where it keeps things, and putting parts of it back to how they started.</p><span class="grow"></span><button class="sm" id="setBack" title="Back to the work (Esc)">${ic('x')}Close</button></div>
    <div class="scroll"><div class="sgrid">
      <div class="panel ssec"><div class="sh"><h3>The app</h3><span>Merge, Freeform and Overlay settings are in the panel on the right of each tab.</span></div>
        ${tog('checkOnStart', 'Check folders when the app opens', 'Looks for pictures added to or removed from every set’s folder. The refresh button beside Add folders does the same any time.')}
        <div class="srow"><span class="lab">Background workers</span><div class="ctl"><select data-set="workers" style="width:auto">${[[0, `Automatic (${Math.max(1, Math.min(3, cpus - 1))})`], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [6, '6']].map(([v, l]) => `<option value="${v}" ${+SETTINGS.workers === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <span class="faint small">How many pictures are read and previewed at once. More is faster but uses more memory. Used after a restart.</span></div></div>
        ${tog('hwAccel', 'Use the graphics card to draw the window', 'Turn off if the window flickers or goes blank. Used after a restart.')}
        ${INFO.safeMode ? `<div class="banner warn">${ic('shield')}<div class="t"><b>Running in safe mode.</b> <span>The last two runs didn’t close properly, so drawing with the graphics card is off for now.</span></div><button class="sm" id="leaveSafe">Turn it back on and restart</button></div>` : ''}
      </div>

      <div class="panel ssec"><div class="sh"><h3>Storage</h3><span>Every place the app keeps anything. Your pictures and exported files are never stored here.</span></div>
        <table class="stable"><colgroup><col style="width:30%"><col><col style="width:170px"><col style="width:290px"></colgroup>
          <thead><tr><th>What it holds</th><th>Where</th><th>Size</th><th></th></tr></thead><tbody id="storeRows"><tr><td colspan="4" class="faint">Working out…</td></tr></tbody></table>
        <div class="faint small">Moving copies everything to the new place, checks the copy, switches over, and only then removes the old copy. Moving isn’t possible while a job is running.</div>
      </div>

      <div class="panel ssec"><div class="sh"><h3>Reset</h3><span>Each one asks first and says exactly what is cleared. Your pictures and exported files are never touched.</span></div>
        <div class="rgrid">
          ${resetCard('settings', 'Settings', 'Default settings for every tab, panel sizes, filters, and the options on this screen.')}
          ${resetCard('sets', 'Set lists', 'Forget every set in all three tabs, with their own settings, order and cutouts. The folders stay on disk.')}
          ${resetCard('done', 'What was exported', 'Forget which sets were exported, so they all count as “not exported”. The exported files stay.')}
          ${resetCard('presets', 'Presets', `Remove your ${PRESETS.length} saved preset${PRESETS.length === 1 ? '' : 's'}.`)}
          ${resetCard('cache', 'Cache', 'Clear thumbnails, cutouts and previews. They are made again when needed.')}
          ${resetCard('look', 'Look', 'Go back to the default look. Saved themes stay.')}
        </div></div>

      <div class="panel ssec"><div class="sh"><h3>About</h3></div>
        <div class="srow"><span class="lab">Version</span><div class="ctl">Batch Image Merger ${esc(INFO.version)}</div></div>
        <div class="srow"><span class="lab">Logs</span><div class="ctl"><span class="mono faint">${esc(INFO.logDir)}</span><button class="sm" id="openLogs">${ic('folder')}Open logs folder</button><button class="sm" id="showLog">${ic('log')}Show the log</button></div></div>
      </div>
    </div></div>`;
  $('#setBack').onclick = () => showScreen('work');
  $$('[data-set]', host).forEach((el) => (el.onchange = () => {
    const k = el.dataset.set;
    SETTINGS[k] = el.type === 'checkbox' ? el.checked : +el.value;
    saveSettings();
    if (k === 'workers' || k === 'hwAccel') restartOffer();
  }));
  const ls = $('#leaveSafe'); if (ls) ls.onclick = () => api.relaunch({ leaveSafeMode: true });
  $('#openLogs').onclick = () => api.openLogs();
  $('#showLog').onclick = () => setLog(true);
  $$('[data-reset]', host).forEach((b) => (b.onclick = () => doReset(b.dataset.reset)));
  drawStorage();
}
async function restartOffer() {
  if (await confirmBox('Restart to use this?', 'The change is saved and is used the next time the app starts.', 'Restart now')) {
    if (EXQ.job || busyJobs().length) return toast('Wait for the running job to finish, then restart.');
    api.relaunch();
  }
}
const resetCard = (k, title, text) => `<div class="rcard"><div class="t"><b>${title}</b><span>${text}</span></div><button class="sm danger-ghost" data-reset="${k}">Reset…</button></div>`;

async function drawStorage() {
  const tb = $('#storeRows'); if (!tb) return;
  const list = await api.storage.list();
  tb.innerHTML = list.map((p) => `<tr data-place="${p.id}"><td><b style="font-weight:600">${esc(p.label)}</b>${p.note ? `<div class="faint small">${esc(p.note)}</div>` : ''}</td>
    <td><div class="p" title="${esc(p.path)}">${esc(p.path)}</div>${p.missing ? `<div class="warntx small">${ic('warn')} The drive ${esc(p.path.slice(0, 3))} isn’t connected. Using a temporary cache until it is.</div>` : ''}</td>
    <td class="sz">${p.missing ? '–' : PLACE_SIZE.has(p.id) ? fmtSize(PLACE_SIZE.get(p.id).bytes) : '<span class="faint">Working out…</span>'}</td>
    <td class="acts">${p.missing ? `<button class="sm" data-act="retry">${ic('refresh')}Retry</button><button class="sm" data-act="move">Choose a new place…</button>`
      : `<button class="sm" data-act="open">${ic('folder')}Open</button>${p.move ? '<button class="sm" data-act="move">Move…</button>' : ''}${p.clear ? '<button class="sm danger-ghost" data-act="clear">Clear…</button>' : ''}`}</td></tr>`).join('');
  $$('[data-act]', tb).forEach((b) => (b.onclick = () => storageAct(b.closest('tr').dataset.place, b.dataset.act)));
  for (const p of list) {
    if (p.missing || PLACE_SIZE.has(p.id)) continue;
    api.storage.size(p.id).then((r) => { PLACE_SIZE.set(p.id, r); const c = $(`#storeRows tr[data-place="${p.id}"] .sz`); if (c) c.textContent = `${fmtSize(r.bytes)} · ${r.files.toLocaleString()} files`; });
  }
}
async function storageAct(id, act) {
  if (act === 'open') return api.storage.open(id);
  if (act === 'retry') {
    const r = await api.storage.retry();
    INFO.cacheDir = r.cacheDir; INFO.cacheMissing = r.cacheMissing;
    drawBanners(); drawStorage();
    return toast(r.cacheMissing ? `${r.cacheMissing.drive} still isn’t connected` : 'Found the cache folder again', r.cacheMissing ? 'err' : 'ok');
  }
  if (act === 'clear') {
    const sz = PLACE_SIZE.get('cache');
    if (!(await confirmBox('Clear the cache?', `Thumbnails, cutouts and previews are removed${sz ? `, giving back ${fmtSize(sz.bytes)}` : ''}. They are made again as you look at sets, which is slower the first time. Your pictures, sets and settings aren’t touched.`, 'Clear cache', true))) return;
    const r = await api.storage.clear();
    THUMBS.clear();
    PLACE_SIZE.delete('cache'); drawStorage();
    return toast(`Cleared the cache: ${fmtSize(r.freed)} given back`, 'ok');
  }
  if (act === 'move') {
    const busy = !!EXQ.job || busyJobs().length > 0;
    if (busy) return toast('Moving isn’t possible while a job is running. Wait for it to finish or stop it first.', 'err');
    if (id === 'data' && !(await confirmBox('Move your sets and settings?', 'Everything in the data folder is copied to the folder you choose and checked. Then the app restarts to use it, and the old copy is removed. A small file in %LOCALAPPDATA% remembers where it went.', 'Choose a folder…'))) return;
    let job;
    try {
      await Promise.all([saveProject.flush(), saveUIP.flush(), persistLook.flush()]);
      const r = await api.storage.move(id, false);
      job = JOBS.find((x) => x.id === 'move');
      if (!r) { if (job) job.finish({ state: 'stopped', message: 'Nothing moved' }); return; }
      if (job) job.finish({ message: id === 'cache' ? `Cache now in ${r.cacheDir}` : 'Restarting…' });
      if (r.cacheDir) { INFO.cacheDir = r.cacheDir; INFO.cacheMissing = r.cacheMissing; THUMBS.clear(); PLACE_SIZE.delete('cache'); drawBanners(); drawStorage(); toast(`Moved the cache to ${r.cacheDir}`, 'ok'); }
    } catch (e) {
      job = JOBS.find((x) => x.id === 'move');
      if (job) job.finish({ state: 'error', message: e.message });
      toast(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'err');
    }
  }
}
async function doReset(k) {
  const Q = {
    settings: ['Reset settings?', 'The default settings in all three tabs, panel sizes, filters and the options on this screen go back to how they started. Sets keep their own settings.', async () => {
      P.defaults = { ...DEF }; UIP = { setsW: 270, panelW: 320 }; SETTINGS = { ...INFO.settingsDef };
      saveProject(); saveUIP(); saveSettings(); applySizes(); applyHide(); dirtyStatus(); drawAll(); drawSettings();
    }],
    sets: ['Forget every set?', `All ${P.sets.length} sets in Merge, Freeform and Overlay are taken off the lists, with their own settings, order, cutouts and line-ups. Nothing on disk is touched; you can add the folders again.`, async () => {
      P.sets = []; P.cur = null; P.exportQueue = []; UI.sel = new Set(); HIST.length = 0; FUT.length = 0; saveProject(); drawAll();
    }],
    done: ['Forget what was exported?', 'Every set counts as “not exported” again. The exported files stay where they are.', async () => {
      P.sets.forEach((s) => { s.exported = null; s.outputs = []; }); dirtyStatus(); saveProject(); drawAll();
    }],
    presets: ['Remove every preset?', `Your ${PRESETS.length} saved preset${PRESETS.length === 1 ? '' : 's'} are removed. Settings already applied to sets stay.`, async () => { PRESETS = []; savePresets(); drawSettings(); }],
    cache: null,
    look: ['Go back to the default look?', 'Violet haze, Violet → Blue, Inter, standard corners, compact, flat buttons. Saved themes stay.', async () => { LOOK.activeId = DEFAULT_ID; LOOK.current = TH.normalize(TH.DEFAULT_THEME); applyTheme(); persistLook(); }],
  };
  if (k === 'cache') return storageAct('cache', 'clear');
  const [t, text, run] = Q[k];
  if (!(await confirmBox(t, text, 'Reset', true))) return;
  await run();
  log(`Reset: ${t.replace(/\?$/, '')}`);
  toast('Done', 'ok');
}

// ---------- banners: things that need attention ----------
function drawBanners() {
  const host = $('#banners');
  const out = [];
  if (INFO.safeMode) out.push(`<div class="banner warn">${ic('shield')}<div class="t"><b>Safe mode.</b> <span>The last two runs didn’t close properly, so drawing with the graphics card is off for now.</span></div><button class="sm" data-b="safe">Turn it back on and restart</button><button class="quiet icon sm" data-b="hide-safe" title="Hide">${ic('x')}</button></div>`);
  if (INFO.cacheMissing) out.push(`<div class="banner warn">${ic('drive')}<div class="t"><b>The cache folder’s drive isn’t connected.</b> <span>${esc(INFO.cacheMissing.path)} is on ${esc(INFO.cacheMissing.drive)}. A temporary cache is used until it’s back.</span></div><button class="sm" data-b="retry">Retry</button><button class="sm" data-b="newplace">Choose a new place…</button></div>`);
  if (P.exportQueue && P.exportQueue.length && !EXQ.job) out.push(`<div class="banner">${ic('pause')}<div class="t"><b>An export didn’t finish.</b> <span>${P.exportQueue.length} set${P.exportQueue.length === 1 ? '' : 's'} still to do.</span></div><button class="sm primary" data-b="resume">Carry on</button><button class="sm" data-b="forget">Forget it</button></div>`);
  host.innerHTML = out.join('');
  $$('[data-b]', host).forEach((b) => (b.onclick = async () => {
    const a = b.dataset.b;
    if (a === 'safe') api.relaunch({ leaveSafeMode: true });
    if (a === 'hide-safe') { INFO.safeMode = false; drawBanners(); }
    if (a === 'retry') storageAct('cache', 'retry');
    if (a === 'newplace') storageAct('cache', 'move');
    if (a === 'resume') { const ids = P.exportQueue.filter(getSet); P.exportQueue = []; drawBanners(); queueExport(ids); }
    if (a === 'forget') { P.exportQueue = []; saveProject(); drawBanners(); }
  }));
}
