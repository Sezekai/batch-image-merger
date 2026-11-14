// Batch Image Merger: main process.
//
// Where things live (STANDARDS.md, "The folder layout"):
//   E:\Pictures\Batch Image Merger\App\      the program (replaced by each update)
//   E:\Pictures\Batch Image Merger\Cache\    thumbnails, cutouts, previews (safe to delete)
//   %LOCALAPPDATA%\Batch Image Merger\       sets, settings, presets, look, logs
// The root is the folder above "App" (or the program's own folder). From source it is ./dev-root.
// BIM_ROOT and BIM_DATA replace the root and the data folder, so tests never touch real data.
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fsp = fs.promises;
const { Worker } = require('worker_threads');
const { pathToFileURL } = require('url');

const APP_NAME = 'Batch Image Merger';
app.setName(APP_NAME);

// ---------- one window only ----------
const SELFTEST = process.argv.includes('--selftest') || process.env.BIM_SELFTEST === '1';
if (!SELFTEST && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// ---------- folders ----------
const LOCAL = process.env.LOCALAPPDATA || app.getPath('appData');
const homeData = process.env.BIM_DATA || path.join(LOCAL, APP_NAME); // always holds the pointer file
fs.mkdirSync(homeData, { recursive: true });
const readJsonFile = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const pointerFile = path.join(homeData, 'location.json');
let dataDir = homeData;
{
  const p = readJsonFile(pointerFile, null);
  if (p && p.dataDir && p.dataDir !== homeData) {
    try { fs.mkdirSync(p.dataDir, { recursive: true }); fs.accessSync(p.dataDir, fs.constants.W_OK); dataDir = p.dataDir; } catch { dataDir = homeData; }
  }
}
app.setPath('userData', path.join(dataDir, 'shell'));

function findRoot() {
  if (process.env.BIM_ROOT) return process.env.BIM_ROOT;
  if (!app.isPackaged) return path.join(__dirname, '..', 'dev-root');
  const exeDir = path.dirname(process.execPath);
  return path.basename(exeDir).toLowerCase() === 'app' ? path.dirname(exeDir) : exeDir;
}
const ROOT = findRoot();
const APP_DIR = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
const storageFile = () => path.join(dataDir, 'storage.json');
let cacheDir, cacheMissing = null;
function pickCacheDir() {
  const st = readJsonFile(storageFile(), {});
  const want = st.cacheDir || path.join(ROOT, 'Cache');
  try {
    // never quietly create the folder on another drive: the drive itself must be there
    const drive = path.parse(want).root;
    if (drive && !fs.existsSync(drive)) throw new Error('drive missing');
    fs.mkdirSync(want, { recursive: true });
    fs.accessSync(want, fs.constants.W_OK);
    cacheDir = want; cacheMissing = null;
  } catch {
    cacheMissing = { path: want, drive: path.parse(want).root || want };
    cacheDir = path.join(os.tmpdir(), 'Batch Image Merger temporary cache');
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}
pickCacheDir();

// ---------- app settings (read early: some apply before the window opens) ----------
const SETTINGS_DEF = { hwAccel: true, workers: 0, checkOnStart: true };
const settingsFile = () => path.join(dataDir, 'settings.json');
let SETTINGS = { ...SETTINGS_DEF, ...readJsonFile(settingsFile(), {}) };

// ---------- crash safety: two unclean exits in a row start in safe mode ----------
const sessionFile = path.join(dataDir, 'session.json');
const lastSession = readJsonFile(sessionFile, {});
const unclean = lastSession.running ? (lastSession.unclean || 0) + 1 : 0;
const SAFE = unclean >= 2 && !SELFTEST;
fs.writeFileSync(sessionFile, JSON.stringify({ running: true, unclean, started: new Date().toISOString() }));
if (SAFE || !SETTINGS.hwAccel) app.disableHardwareAcceleration();

// ---------- log: in the app, and on disk (last few runs plus crash logs) ----------
const logDir = path.join(dataDir, 'logs');
fs.mkdirSync(logDir, { recursive: true });
const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const runLog = path.join(logDir, `run-${stamp()}.txt`);
try {
  const runs = fs.readdirSync(logDir).filter((f) => /^run-.*\.txt$/.test(f)).sort();
  for (const f of runs.slice(0, Math.max(0, runs.length - 7))) fs.unlinkSync(path.join(logDir, f));
  const crashes = fs.readdirSync(logDir).filter((f) => /^crash-.*\.txt$/.test(f)).sort();
  for (const f of crashes.slice(0, Math.max(0, crashes.length - 10))) fs.unlinkSync(path.join(logDir, f));
} catch {}
let win;
const early = [];
function logLine(text, kind = '') {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false });
  try { fs.appendFileSync(runLog, `[${t}]${kind === 'e' ? ' ERROR' : kind === 'w' ? ' WARNING' : ''} ${text}\n`); } catch {}
  if (win && !win.isDestroyed() && win.webContents) win.webContents.send('log', { time: t, text: String(text), kind });
  else early.push({ time: t, text: String(text), kind });
}
let doing = 'starting up';
function crashLog(what, err) {
  const body = `${new Date().toISOString()}\n${APP_NAME} ${app.getVersion()}\nWhat happened: ${what}\nWhat was running: ${doing}\n\n${err && err.stack ? err.stack : JSON.stringify(err, null, 2)}\n`;
  const f = path.join(logDir, `crash-${stamp()}.txt`);
  try { fs.writeFileSync(f, body); } catch {}
  logLine(`${what}: ${(err && err.message) || JSON.stringify(err)} (details in ${f})`, 'e');
}
process.on('uncaughtException', (e) => crashLog('Unhandled error in the main process', e));
process.on('unhandledRejection', (e) => crashLog('Unhandled promise rejection in the main process', e));
app.on('render-process-gone', (e, wc, d) => crashLog('The window crashed', d));
app.on('child-process-gone', (e, d) => { if (d.reason !== 'clean-exit' && d.reason !== 'killed') crashLog(`A helper process stopped (${d.type})`, d); });
logLine(`${APP_NAME} ${app.getVersion()} started${SAFE ? ' in safe mode (the last two runs did not close properly)' : ''}`);
logLine(`Data: ${dataDir} · Cache: ${cacheMissing ? `missing (${cacheMissing.path}), using a temporary cache` : cacheDir} · Program: ${APP_DIR}`);

protocol.registerSchemesAsPrivileged([{ scheme: 'bimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }]);
require('sharp'); // load the native module on the main thread first

// ---------- engine workers ----------
// Each worker runs a few jobs at a time. Waiting jobs are started by priority (0 = what you're
// looking at right now), and jobs about the same image go to the same worker so its caches are reused.
const DEF_PRIO = { preview: 0, ffDetect: 1, ffCutout: 1, mthumb: 1, render: 1, ovPoints: 0, thumb: 2, scan: 2, listDirs: 0, ovGains: 2, renderFreeform: 1, renderOverlay: 1, bgest: 3, ovAlign: 3, ovGuessBase: 3 };
class Worker1 {
  constructor(name, max) { this.name = name; this.max = max; this.n = 0; this.pend = new Map(); this.queue = []; this.running = 0; this.start(); }
  start() {
    this.w = new Worker(path.join(__dirname, '..', 'engine', 'worker.js'), { workerData: { cacheDir } });
    this.w.on('message', (m) => {
      const p = this.pend.get(m.id);
      if (!p) return;
      if (m.progress) { if (p.onProgress) p.onProgress(m.progress); return; }
      this.pend.delete(m.id); this.running--;
      m.ok ? p.res(m.result) : p.rej(new Error(m.error));
      this.pump();
    });
    const fail = (e) => { for (const p of this.pend.values()) p.rej(e); this.pend.clear(); this.running = 0; };
    this.w.on('error', (e) => { logLine(`Engine ${this.name}: ${e.message}`, 'e'); fail(e); });
    this.w.on('exit', () => { fail(new Error(this.stopping ? 'Stopped' : 'Engine stopped')); this.stopping = false; if (!this.dead) { this.start(); this.pump(); } });
  }
  load() { return this.running + this.queue.length; }
  call(op, args, onProgress, prio) {
    return new Promise((res, rej) => {
      this.queue.push({ op, args, onProgress, res, rej, prio: prio ?? DEF_PRIO[op] ?? 2, seq: ++this.n });
      this.pump();
    });
  }
  pump() {
    while (this.running < this.max && this.queue.length) {
      let bi = 0;
      for (let i = 1; i < this.queue.length; i++) { const a = this.queue[i], b = this.queue[bi]; if (a.prio < b.prio || (a.prio === b.prio && a.seq < b.seq)) bi = i; }
      const j = this.queue.splice(bi, 1)[0];
      const id = j.seq;
      this.pend.set(id, j); this.running++;
      this.w.postMessage({ id, op: j.op, args: j.args });
    }
  }
  stop() { this.stopping = true; for (const j of this.queue) j.rej(new Error('Stopped')); this.queue = []; this.w.terminate(); }
}
class Engine {
  constructor(name, size, perWorker) { this.ws = Array.from({ length: size }, (_, i) => new Worker1(name + i, perWorker)); }
  call(op, args, onProgress, prio) {
    let w;
    const key = args && (args.file || (args.close && args.close.file) || (args.base && args.base.file));
    if (key && this.ws.length > 1) { let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; w = this.ws[h % this.ws.length]; }
    else w = this.ws.reduce((a, b) => (b.load() < a.load() ? b : a));
    return w.call(op, args, onProgress, prio);
  }
  set dead(v) { this.ws.forEach((w) => { w.dead = v; }); }
  close() { this.dead = true; this.ws.forEach((w) => w.w.terminate()); }
  stop() { this.ws.forEach((w) => w.stop()); }
}
let uiEngine, exEngine;
function workerCount() { const cpus = os.cpus().length; return SETTINGS.workers > 0 ? SETTINGS.workers : Math.max(1, Math.min(3, cpus - 1)); }
function startEngines() {
  if (uiEngine) uiEngine.close();
  if (exEngine) exEngine.close();
  uiEngine = new Engine('ui', workerCount(), 3);
  exEngine = new Engine('export', 1, 1);
}

// ---------- data files (written safely: temp file, then rename) ----------
const DATA_KEYS = ['project', 'presets', 'uiprefs', 'appearance', 'settings'];
const dataFile = (k) => path.join(dataDir, `${k}.json`);
function readJson(k, fallback) {
  for (const f of [dataFile(k), dataFile(k) + '.bak']) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  }
  return fallback;
}
const writeQueue = new Map();
async function writeJson(k, data) {
  const f = dataFile(k), tmp = f + '.tmp';
  const prev = writeQueue.get(k) || Promise.resolve();
  const next = prev.then(async () => {
    await fsp.writeFile(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, k === 'project' ? 0 : 1));
    try { await fsp.copyFile(f, f + '.bak'); } catch {}
    await fsp.rename(tmp, f);
  }).catch((e) => logLine(`Could not save ${k}: ${e.message}`, 'e'));
  writeQueue.set(k, next);
  return next;
}

// ---------- window ----------
// The window has no menu bar and draws its own 32 px title strip in the theme's colours. Windows
// still draws minimise / maximise / close, coloured to match; the overlay is 1 px shorter than the
// strip so the line underneath runs under the buttons too.
const TB_H = 32;
function tbColours() {
  const a = readJson('appearance', null);
  const bg = (a && a.current && a.current.background) || {};
  return { color: bg.ground || '#0e0c18', symbolColor: bg.sec || '#a098bd', height: TB_H - 1 };
}
function createWindow() {
  const prefs = readJson('prefs', {});
  const b = prefs.bounds || { width: 1500, height: 920 };
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    ...b, minWidth: 1100, minHeight: 680, backgroundColor: tbColours().color, show: false,
    title: APP_NAME, icon: path.join(__dirname, '..', 'ui', 'icon.png'),
    titleBarStyle: 'hidden', titleBarOverlay: tbColours(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false },
  });
  if (prefs.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));
  win.webContents.once('did-finish-load', () => { for (const l of early.splice(0)) win.webContents.send('log', l); });
  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    const p = readJson('prefs', {});
    p.maximized = win.isMaximized();
    if (!p.maximized && !win.isFullScreen()) p.bounds = win.getBounds();
    writeJson('prefs', p);
  };
  win.on('close', saveBounds);
  const sendState = () => { if (win && !win.isDestroyed()) win.webContents.send('win-state', { fullScreen: win.isFullScreen(), maximized: win.isMaximized() }); };
  ['enter-full-screen', 'leave-full-screen', 'maximize', 'unmaximize'].forEach((ev) => win.on(ev, sendState));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
  logLine('The app was opened again, so this window was brought forward.');
});

app.whenReady().then(() => {
  protocol.handle('bimg', (req) => {
    const u = new URL(req.url);
    const p = decodeURIComponent(u.pathname.replace(/^\//, ''));
    // allow use as CSS masks (they are loaded with CORS)
    return net.fetch(pathToFileURL(p).toString()).then((r) => new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=31536000' } }));
  });
  startEngines();
  createWindow();
  if (SELFTEST) selfTest();
});
app.on('window-all-closed', () => { uiEngine.dead = exEngine.dead = true; app.quit(); });
app.on('will-quit', () => { try { fs.writeFileSync(sessionFile, JSON.stringify({ running: false, unclean: 0 })); } catch {} logLine('Closed'); });

// --selftest: open the real window, wait for it to finish starting, save a screenshot and the log, then quit.
function selfTest() {
  const out = process.env.BIM_SELFTEST_OUT || path.join(dataDir, 'selftest');
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  win.webContents.on('console-message', (e) => { const level = e.level ?? e; if (level === 'error' || level === 3) errors.push(e.message || String(e)); });
  ipcMain.once('selftest-ready', async (e, info) => {
    await new Promise((r) => setTimeout(r, 1500));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, 'window.png'), img.toPNG());
    const ok = !errors.length && info && info.ok;
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok, errors, info }, null, 2));
    try { fs.copyFileSync(runLog, path.join(out, 'run-log.txt')); } catch {}
    console.log(ok ? 'SELFTEST OK' : 'SELFTEST FAILED ' + JSON.stringify({ errors, info }));
    try { fs.writeFileSync(sessionFile, JSON.stringify({ running: false, unclean: 0 })); } catch {}
    app.exit(ok ? 0 : 1);
  });
  setTimeout(() => { console.log('SELFTEST FAILED: the window did not finish starting within 60 s'); app.exit(1); }, 60000);
}

const { resolveOut } = require('./naming');

// ---------- IPC ----------
const BUNDLE = { dataDir, root: ROOT, appDir: APP_DIR, logDir, runLog, homeData };
ipcMain.handle('init', () => ({
  ...BUNDLE, cacheDir, cacheMissing, version: app.getVersion(), platform: process.platform, safeMode: SAFE, unclean, selftest: SELFTEST,
  project: readJson('project', null), uiprefs: readJson('uiprefs', {}), presets: readJson('presets', []),
  appearance: readJson('appearance', null), settings: SETTINGS, settingsDef: SETTINGS_DEF,
  oldCache: oldCacheInfo(),
}));
ipcMain.handle('save', (e, k, data) => {
  if (!DATA_KEYS.includes(k)) return;
  if (k === 'settings') SETTINGS = { ...SETTINGS_DEF, ...data };
  return writeJson(k, data);
});
ipcMain.on('log', (e, text, kind) => {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false });
  try { fs.appendFileSync(runLog, `[${t}]${kind === 'e' ? ' ERROR' : kind === 'w' ? ' WARNING' : ''} ${text}\n`); } catch {}
});
ipcMain.on('doing', (e, what) => { doing = what || 'nothing'; });
ipcMain.on('selftest-ready-ping', () => {});
ipcMain.handle('setTitleBar', (e, c) => { try { win.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: TB_H - 1 }); win.setBackgroundColor(c.color); } catch {} });
ipcMain.handle('pickFolders', async (e, opts = {}) => {
  const r = await dialog.showOpenDialog(win, { title: opts.title || 'Choose folders', properties: ['openDirectory', ...(opts.single ? [] : ['multiSelections'])] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('engine', (e, op, args, prio) => uiEngine.call(op, args, null, prio));
ipcMain.handle('showItem', (e, p) => shell.showItemInFolder(p));
ipcMain.handle('openPath', (e, p) => shell.openPath(p));
ipcMain.handle('fullscreen', (e, on) => { win.setFullScreen(on == null ? !win.isFullScreen() : !!on); return win.isFullScreen(); });
ipcMain.handle('exists', (e, p) => fsp.access(p).then(() => true, () => false));
ipcMain.handle('relaunch', (e, opts = {}) => {
  if (opts.leaveSafeMode) fs.writeFileSync(sessionFile, JSON.stringify({ running: false, unclean: 0 }));
  app.relaunch(); app.exit(0);
});

// one set at a time; the page keeps the queue (so it can pause, resume and survive a restart)
let exporting = false, stopping = false, curPart = null;
ipcMain.handle('exportOne', async (e, job, reservedList) => {
  exporting = true; stopping = false; doing = `exporting ${path.basename(job.dir)}`;
  const reserved = new Set((reservedList || []).map((s) => s.toLowerCase()));
  try {
    const o = await resolveOut(job, reserved);
    if (o.skip) return { setId: job.setId, status: 'skipped', path: o.path, reason: 'A file with that name already exists' };
    curPart = o.path + '.part';
    const s = job.settings;
    const out = { path: o.path, format: s.format, quality: s.quality, full444: s.full444, pngLevel: s.pngLevel };
    const [op, args] = engineCall(job);
    const r = await exEngine.call(op, { ...args, out }, (p) => win.webContents.send('export-progress', { setId: job.setId, done: p.done, of: p.total }));
    logLine(`Exported ${path.basename(job.dir)} → ${r.path}`);
    return { setId: job.setId, status: 'ok', ...r };
  } catch (err) {
    if (stopping) { await fsp.unlink(curPart).catch(() => {}); return { setId: job.setId, status: 'cancelled' }; }
    logLine(`Export of ${path.basename(job.dir)} failed: ${err.message || err}`, 'e');
    return { setId: job.setId, status: 'failed', reason: String(err.message || err) };
  } finally { exporting = false; curPart = null; doing = 'nothing'; }
});
// Stop: the current set is stopped straight away (its half-written file is our own and is removed)
ipcMain.handle('cancelExport', () => { if (!exporting) return; stopping = true; exEngine.stop(); logLine('Export stopped'); });

// which engine operation renders a set of each kind
function engineCall(job) {
  if (job.kind === 'freeform') return ['renderFreeform', job.payload];
  if (job.kind === 'overlay') return ['renderOverlay', job.payload];
  return ['render', { items: job.items, settings: job.settings, bg: job.bg }];
}

// accurate small render of one set, used by "Exact preview"
ipcMain.handle('previewRender', async (e, job, maxSide) => {
  let W, H;
  if (job.kind === 'freeform' || job.kind === 'overlay') ({ W, H } = job.size);
  else {
    const { computeLayout } = require('../engine/layout');
    const L = computeLayout(job.items, job.settings);
    if (L.empty) throw new Error('Nothing to preview');
    W = L.W; H = L.H;
  }
  const scale = Math.min(1, (maxSide || 2400) / Math.max(W, H));
  const out = path.join(cacheDir, 'preview', `p${Date.now()}.${job.settings.format === 'png' && job.settings.ffTransparent && job.kind === 'freeform' ? 'png' : 'jpg'}`);
  try { for (const f of await fsp.readdir(path.dirname(out))) await fsp.unlink(path.join(path.dirname(out), f)).catch(() => {}); } catch {}
  const [op, args] = engineCall(job);
  const r = await uiEngine.call(op, { ...args, scale, out: { path: out, format: out.endsWith('.png') ? 'png' : 'jpg', quality: 92, full444: true, pngLevel: 1 } });
  return { ...r, fullW: W, fullH: H };
});

// ---------- Settings → Storage ----------
async function walk(dir) {
  const files = [];
  async function go(d) {
    let ents; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await go(p);
      else if (e.isFile()) { try { files.push({ p, size: (await fsp.stat(p)).size }); } catch {} }
    }
  }
  await go(dir);
  return files;
}
function places() {
  return [
    { id: 'data', label: 'Sets, settings, presets, look and logs', path: dataDir, move: true, note: dataDir === homeData ? '' : `Moved here; ${homeData} remembers where it went.` },
    { id: 'cache', label: 'Cache: thumbnails, cutouts and previews', path: cacheMissing ? cacheMissing.path : cacheDir, move: true, clear: true, missing: !!cacheMissing, temp: cacheMissing ? cacheDir : '' },
    { id: 'app', label: 'The program', path: APP_DIR, move: false, note: 'Replaced by each update.' },
  ];
}
ipcMain.handle('storage:list', () => places());
ipcMain.handle('storage:size', async (e, id) => {
  const pl = places().find((x) => x.id === id);
  if (!pl || (pl.missing && id === 'cache')) return { bytes: 0, files: 0, missing: true };
  const files = await walk(id === 'cache' ? cacheDir : pl.path);
  return { bytes: files.reduce((t, f) => t + f.size, 0), files: files.length };
});
ipcMain.handle('storage:open', (e, id) => { const pl = places().find((x) => x.id === id); if (pl) shell.openPath(id === 'cache' ? cacheDir : pl.path); });
ipcMain.handle('storage:clear', async () => {
  const files = await walk(cacheDir);
  let freed = 0;
  for (const f of files) { try { await fsp.unlink(f.p); freed += f.size; } catch {} }
  logLine(`Cache cleared: ${(freed / 1e6).toFixed(1)} MB`);
  return { freed };
});
ipcMain.handle('storage:retry', () => {
  pickCacheDir();
  if (!cacheMissing) { startEngines(); logLine(`Cache folder found again: ${cacheDir}`); }
  return { cacheDir, cacheMissing };
});
// copy, check, switch, then remove the old copy (this is the app's own data, so a normal delete is fine)
async function copyTree(from, to, label) {
  const files = await walk(from);
  const total = files.reduce((t, f) => t + f.size, 0);
  let done = 0;
  const start = Date.now();
  const send = (name) => win.webContents.send('job', { id: 'move', label, name, done, total, unit: 'bytes', start });
  send('');
  for (const f of files) {
    const dest = path.join(to, path.relative(from, f.p));
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(f.p, dest);
    done += f.size;
    send(path.relative(from, f.p));
  }
  const check = await walk(to);
  const byRel = new Map(check.map((c) => [path.relative(to, c.p).toLowerCase(), c.size]));
  for (const f of files) {
    const s = byRel.get(path.relative(from, f.p).toLowerCase());
    if (s !== f.size) throw new Error(`The copy of ${path.relative(from, f.p)} doesn't match, so nothing was switched.`);
  }
  return { files: files.length, bytes: total };
}
ipcMain.handle('storage:move', async (e, id, busy) => {
  if (busy || exporting) throw new Error('Moving is not possible while a job is running. Wait for it to finish or stop it first.');
  const r = await dialog.showOpenDialog(win, { title: id === 'cache' ? 'Choose a new place for the cache' : 'Choose a new place for your sets and settings', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths.length) return null;
  let target = r.filePaths[0];
  if (id === 'cache') {
    if (path.basename(target).toLowerCase() !== 'cache') target = path.join(target, 'Cache');
    if (!cacheMissing && path.resolve(target).toLowerCase() === path.resolve(cacheDir).toLowerCase()) return null;
    await fsp.mkdir(target, { recursive: true });
    const old = cacheMissing ? null : cacheDir;
    if (old) await copyTree(old, target, 'Moving the cache');
    const st = readJsonFile(storageFile(), {}); st.cacheDir = target; fs.writeFileSync(storageFile(), JSON.stringify(st, null, 1));
    pickCacheDir(); startEngines();
    if (old) { await fsp.rm(old, { recursive: true, force: true }).catch(() => {}); }
    logLine(`Cache moved to ${target}`);
    return { cacheDir, cacheMissing };
  }
  if (id === 'data') {
    if (path.basename(target) !== APP_NAME) target = path.join(target, APP_NAME);
    if (path.resolve(target).toLowerCase() === path.resolve(dataDir).toLowerCase()) return null;
    await fsp.mkdir(target, { recursive: true });
    if ((await fsp.readdir(target)).length) throw new Error(`${target} already has files in it. Choose an empty folder.`);
    await Promise.all([...writeQueue.values()]);
    const from = dataDir;
    // Electron's own working files are rebuilt, so they are not copied
    const tmpTarget = target;
    const files = (await walk(from)).filter((f) => !path.relative(from, f.p).startsWith('shell'));
    const total = files.reduce((t, f) => t + f.size, 0);
    let done = 0; const start = Date.now();
    for (const f of files) {
      const dest = path.join(tmpTarget, path.relative(from, f.p));
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(f.p, dest); done += f.size;
      win.webContents.send('job', { id: 'move', label: 'Moving your sets and settings', name: path.relative(from, f.p), done, total, unit: 'bytes', start });
    }
    for (const f of files) { const st = await fsp.stat(path.join(tmpTarget, path.relative(from, f.p))).catch(() => null); if (!st || st.size !== f.size) throw new Error('The copy does not match, so nothing was switched.'); }
    const isHome = path.resolve(target).toLowerCase() === path.resolve(homeData).toLowerCase();
    fs.writeFileSync(pointerFile, JSON.stringify(isHome ? {} : { dataDir: target, cleanup: from === homeData ? '' : from }, null, 1));
    logLine(`Sets and settings copied to ${target}. Restarting to use them.`);
    // the old copy is removed after the restart, once the new place is in use
    fs.writeFileSync(path.join(target, 'cleanup.json'), JSON.stringify({ old: from, keepPointer: from === homeData }));
    setTimeout(() => { app.relaunch(); app.exit(0); }, 600);
    return { restarting: true };
  }
});
// after a data move: remove the old copy (keeping the pointer file in the home folder)
(function cleanupAfterMove() {
  const f = path.join(dataDir, 'cleanup.json');
  const c = readJsonFile(f, null);
  if (!c || !c.old || path.resolve(c.old) === path.resolve(dataDir)) return;
  setTimeout(async () => {
    try {
      for (const name of await fsp.readdir(c.old)) {
        if (c.keepPointer && name === 'location.json') continue;
        await fsp.rm(path.join(c.old, name), { recursive: true, force: true });
      }
      if (!c.keepPointer) await fsp.rmdir(c.old).catch(() => {});
      logLine(`Removed the old copy of your sets and settings from ${c.old}`);
    } catch (e) { logLine(`Could not remove the old copy at ${c.old}: ${e.message}`, 'w'); }
    fs.unlinkSync(f);
  }, 4000);
})();

// The cache used to live in %LOCALAPPDATA%. It moves to the Cache folder beside the program once.
function oldCacheInfo() {
  const old = path.join(homeData, 'cache');
  if (cacheMissing || !fs.existsSync(old) || path.resolve(old) === path.resolve(cacheDir)) return null;
  return { path: old };
}
ipcMain.handle('migrateCache', async () => {
  const info = oldCacheInfo();
  if (!info) return null;
  const r = await copyTree(info.path, cacheDir, 'Moving the cache off C:');
  await fsp.rm(info.path, { recursive: true, force: true }).catch(() => {});
  logLine(`Moved the old cache (${(r.bytes / 1e6).toFixed(1)} MB) from ${info.path} to ${cacheDir}`);
  return r;
});

ipcMain.handle('logs:open', () => shell.openPath(logDir));

// ---------- Look: appearance, fonts the owner adds, theme files ----------
const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2'];
const { describeFontFile } = require('./fontfile');
const fontsDir = () => path.join(dataDir, 'fonts');
const fontIndexFile = () => path.join(fontsDir(), 'index.json');
const readFontIndex = () => { const d = readJsonFile(fontIndexFile(), []); return Array.isArray(d) ? d : []; };
function writeFontIndex(list) { fs.mkdirSync(fontsDir(), { recursive: true }); fs.writeFileSync(fontIndexFile(), JSON.stringify(list, null, 2)); }
ipcMain.handle('fonts:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose font files (all the weights of one font)', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Fonts', extensions: FONT_EXT.map((e) => e.slice(1)) }] });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths.map(describeFontFile);
});
ipcMain.handle('fonts:install', (e, family, files) => {
  family = String(family || '').trim();
  if (!family) throw new Error('Give the font a name.');
  const id = family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font';
  const dir = path.join(fontsDir(), id);
  fs.mkdirSync(dir, { recursive: true });
  const entries = [];
  for (const f of files || []) {
    if (!FONT_EXT.includes(path.extname(f.file).toLowerCase())) continue;
    let name = path.basename(f.file);
    // never replace a file that is already there
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = path.basename(f.file).replace(/(\.[^.]+)$/, ` (${i})$1`);
    fs.copyFileSync(f.file, path.join(dir, name));
    entries.push({ name, weight: f.weight, style: f.style });
  }
  if (!entries.length) throw new Error('None of those files is a font (.ttf, .otf, .woff or .woff2).');
  const list = readFontIndex();
  const had = list.find((x) => x.id === id);
  if (had) had.files.push(...entries); else list.push({ id, family, files: entries, addedAt: new Date().toISOString() });
  writeFontIndex(list);
  logLine(`Added the font ${family} (${entries.length} file${entries.length === 1 ? '' : 's'})`);
  return list;
});
ipcMain.handle('fonts:list', () => readFontIndex());
ipcMain.handle('fonts:read', (e, id, name) => {
  const p = path.join(fontsDir(), path.basename(id), path.basename(name));
  return fs.readFileSync(p);
});
ipcMain.handle('fonts:remove', async (e, id) => {
  const dir = path.join(fontsDir(), path.basename(id));
  // the owner added these files; they go to the Recycle Bin, never deleted outright
  if (fs.existsSync(dir)) await shell.trashItem(dir);
  const list = readFontIndex().filter((x) => x.id !== id);
  writeFontIndex(list);
  logLine(`Removed the font ${id} (its files went to the Recycle Bin)`);
  return list;
});
ipcMain.handle('theme:export', async (e, theme) => {
  const safe = String(theme.name || 'theme').replace(/[\\/:*?"<>|]+/g, '_');
  const r = await dialog.showSaveDialog(win, { title: 'Save theme file', defaultPath: `${safe}.theme.json`, filters: [{ name: 'Theme', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  let p = r.filePath;
  // the save dialog already asked before replacing; the file is still never silently replaced
  fs.writeFileSync(p, JSON.stringify(theme, null, 2));
  return p;
});
ipcMain.handle('theme:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open theme files', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Theme', extensions: ['json'] }] });
  if (r.canceled) return null;
  const out = [];
  for (const f of r.filePaths) {
    try { out.push(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { throw new Error(`${path.basename(f)} isn't a theme file.`); }
  }
  return out;
});
