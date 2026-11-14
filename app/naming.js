// Output names. Nothing is ever replaced: a taken name gets " (2)", " (3)"… (or the set is skipped).
const path = require('path');
const fsp = require('fs').promises;
const ILLEGAL = /[<>:"/\\|?*\x00-\x1f]/g;
const clean = (s) => String(s || '').replace(ILLEGAL, '_').replace(/[. ]+$/, '').trim() || 'merged';
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function outName(job) {
  const s = job.settings, folder = path.basename(job.dir), first = job.firstName ? job.firstName.replace(/\.[^.]+$/, '') : folder;
  let name;
  if (job.manualName) name = job.manualName;
  else if (s.nameMode === 'first') name = `${first}_merged`;
  else if (s.nameMode === 'pattern') name = String(s.pattern || '{folder}').replace(/\{(folder|first|count|date|layout)\}/g, (_, k) => ({ folder, first, count: String(job.count), date: today(), layout: job.layoutLabel }[k]));
  else name = folder;
  return clean(name.replace(/\.(jpe?g|png)$/i, ''));
}
function outDir(job) {
  const s = job.settings;
  if (s.saveMode === 'beside') return path.dirname(job.dir);
  if (s.saveMode === 'custom') { if (!s.customDir) throw new Error('Choose a folder to save into (Export settings → Save to)'); return s.customDir; }
  return job.dir;
}
// A name that is taken gets " (2)", " (3)"… (or the set is skipped, if chosen). This includes the
// set's own earlier export: re-exporting keeps both files.
async function resolveOut(job, reserved) {
  const ext = job.settings.format === 'png' ? '.png' : '.jpg';
  const dir = outDir(job), name = outName(job);
  let p = path.join(dir, name + ext);
  const taken = async (q) => reserved.has(q.toLowerCase()) || (await fsp.access(q).then(() => true, () => false)) || (await fsp.access(q + '.part').then(() => true, () => false));
  if (await taken(p)) {
    const ownEarlier = job.prevOut && path.resolve(job.prevOut).toLowerCase() === path.resolve(p).toLowerCase();
    if (job.settings.clash === 'skip' && !ownEarlier) return { skip: true, path: p };
    for (let i = 2; i < 100000; i++) { const q = path.join(dir, `${name} (${i})${ext}`); if (!(await taken(q))) { p = q; break; } }
  }
  return { path: p };
}

module.exports = { resolveOut, outName, outDir, clean };
