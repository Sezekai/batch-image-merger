// Launch the app with a seeded project and take screenshots. usage: node tests/ui.js <step>
const { _electron } = require('playwright'); const fs = require('fs'); const path = require('path');
const DATA = '/home/claude/ui-data'; const SHOTS = '/home/claude/shots';
(async () => {
  const fresh = process.argv.includes('--fresh');
  const appDir = path.join(DATA, 'Batch Image Merger');
  if (fresh) { fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(appDir, { recursive: true });
    const sets = ['Set A', 'Set B (grid)', 'Set C'].map((n, i) => ({ id: 's' + i, path: '/home/claude/samples/' + n, name: n, items: [], overrides: {}, manualName: '', exported: null, missing: false, scanned: false }));
    sets.push({ id: 'f1', kind: 'freeform', path: '/home/claude/samples-ff/People A', name: 'People A', items: [], overrides: {}, manualName: '', exported: null, missing: false, scanned: false });
    sets.push({ id: 'o1', kind: 'overlay', path: '/home/claude/samples-ov/Overlay A', name: 'Overlay A', items: [], overrides: {}, manualName: '', exported: null, missing: false, scanned: false });
    fs.writeFileSync(path.join(appDir, 'project.json'), JSON.stringify({ ver: 1, defaults: {}, sets, cur: 's0' }));
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', '.'], cwd: __dirname + '/..', env: { ...process.env, LOCALAPPDATA: DATA } });
  const win = await app.firstWindow();
  win.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
  win.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await win.setViewportSize({ width: +(process.env.VW || 1500), height: +(process.env.VH || 900) }).catch(() => {});
  await win.waitForTimeout(2500);
  const steps = require(process.env.STEPS || './ui-steps.js');
  for (const [name, fn] of Object.entries(steps)) {
    if (process.argv[2] && process.argv[2] !== 'all' && !process.argv[2].split(',').includes(name)) continue;
    try { await fn(win); } catch (e) { console.log('STEP FAIL', name, e.message); }
    await win.waitForTimeout(900);
    await win.screenshot({ path: `${SHOTS}/${name}.png` });
    console.log('shot', name);
  }
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
