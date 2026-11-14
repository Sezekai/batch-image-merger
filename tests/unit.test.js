// Unit tests that need no sample pictures: theme files and contrast, output names (never overwrite).
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const T = require('../ui/js/theme.js');
const { resolveOut, outName } = require('../app/naming');
(async () => {
  // every background preset keeps text, secondary and faint text at 4.5:1 or more on the panels
  for (const [k, b] of Object.entries(T.BACKGROUNDS)) for (const f of ['text', 'sec', 'faint']) assert.ok(T.contrast(b[f], b.panel) >= 4.5, `${k}.${f} ${T.contrast(b[f], b.panel).toFixed(2)}`);
  // the default is Violet haze with Violet -> Blue
  const d = T.normalize({}); assert.equal(d.background.ground, '#0e0c18'); assert.deepEqual(d.accent.stops, ['#a497ff', '#74a0ff']);
  // bad values fall back; limits hold; extras survive
  const n = T.normalize({ font: { size: 99 }, corners: { control: -5 }, accent: { stops: ['nope', '#abc'] }, outline: { width: 9 }, extras: { glow: 'aurora', headingFont: 'Georgia' } });
  assert.equal(n.font.size, 16); assert.equal(n.corners.control, 0); assert.deepEqual(n.accent.stops, ['#aabbcc']); assert.equal(n.outline.width, 4); assert.equal(n.extras.glow, 'aurora');
  // old themes convert and stay readable
  const old = T.fromOld({ name: 'X', vars: { '--bg': '#0f1218', '--panel': '#171b24', '--panel2': '#202636', '--line': '#2a3142', '--text': '#e8ebf2', '--muted': '#8f98ad', '--accent': '#6ea8ff' } });
  assert.ok(T.contrast(old.background.sec, old.background.panel) >= 4.5);
  console.log('theme ok');

  // names: a taken name gets (2), a set's own earlier export is kept too, skip skips
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-names-'));
  const job = (extra = {}) => ({ dir, settings: { format: 'jpg', saveMode: 'inside', nameMode: 'folder', clash: 'number', ...extra }, firstName: 'a.jpg', count: 2, layoutLabel: 'grid' });
  const base = outName(job());
  let r = await resolveOut(job(), new Set()); assert.equal(path.basename(r.path), base + '.jpg');
  fs.writeFileSync(r.path, 'x');
  r = await resolveOut({ ...job(), prevOut: path.join(dir, base + '.jpg') }, new Set()); assert.equal(path.basename(r.path), base + ' (2).jpg');
  r = await resolveOut(job({ clash: 'overwrite' }), new Set()); assert.equal(path.basename(r.path), base + ' (2).jpg', 'an old "replace" setting still never replaces');
  r = await resolveOut(job({ clash: 'skip' }), new Set()); assert.ok(r.skip);
  r = await resolveOut(job(), new Set([path.join(dir, base + ' (2).jpg').toLowerCase()])); assert.equal(path.basename(r.path), base + ' (3).jpg');
  assert.equal(fs.readFileSync(path.join(dir, base + '.jpg'), 'utf8'), 'x');
  console.log('names ok');
})().catch((e) => { console.error(e); process.exit(1); });
