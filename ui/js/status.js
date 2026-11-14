// ---------- jobs: the status bar and the title-bar pills ----------
// Every job of any length shows a bar, a %, time elapsed and time left (STANDARDS.md, "Progress you
// can trust"). A job without a known size gets a sliding bar and "size not known yet". After 20 s with
// no new progress the time turns to the warning colour. The % is capped at 99 until the job ends.
// A finished job's message stays (with its next step) until another job starts.
const JOBS = [];
let LASTJOB = null;
const fmtTime = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtSize = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(0, Math.round(b / 1e3)) + ' KB');

class Job {
  constructor(o) {
    Object.assign(this, { id: o.id || uid(), label: o.label, name: o.name || '', done: o.done || 0, total: o.total ?? null, unit: o.unit || 'items', state: 'running',
      stop: o.stop || null, pause: o.pause || null, resume: o.resume || null, details: o.details || null, extra: o.extra || '', short: o.short || o.label, prio: o.prio || 0 });
    this.start = Date.now(); this.firstDone = this.done; this.lastChange = this.start; this.pausedAt = 0; this.pausedMs = 0; this.paused = false;
    log(`${this.label}${this.name ? ': ' + this.name : ''}`);
  }
  update(o) {
    if (this.state !== 'running') return this;
    if (o.done != null && o.done !== this.done) this.lastChange = Date.now();
    if (o.name != null && o.name !== this.name) this.lastChange = Date.now();
    Object.assign(this, o);
    drawStatus();
    return this;
  }
  setPaused(p) {
    if (p === this.paused) return;
    this.paused = p;
    if (p) this.pausedAt = Date.now(); else { this.pausedMs += Date.now() - this.pausedAt; this.lastChange = Date.now(); }
    drawStatus();
  }
  finish(o = {}) {
    if (this.state !== 'running') return;
    this.state = o.state || 'done'; this.message = o.message || ''; this.next = o.next || null; this.endAt = Date.now();
    if (this.paused) this.setPaused(false);
    const i = JOBS.indexOf(this); if (i >= 0) JOBS.splice(i, 1);
    LASTJOB = this;
    log(`${this.state === 'done' ? 'Finished' : this.state === 'stopped' ? 'Stopped' : 'Failed'}: ${this.label}${this.message ? ' · ' + this.message : ''} · took ${fmtTime(this.elapsed())}`, this.state === 'error' ? 'e' : this.state === 'done' ? 'ok' : '');
    drawStatus();
  }
  elapsed() { return ((this.endAt || (this.paused ? this.pausedAt : Date.now())) - this.start - this.pausedMs) / 1000; }
  numbers() {
    const el = this.elapsed();
    const pct = this.total ? Math.min(this.state === 'running' ? 99 : 100, (this.done / this.total) * 100) : null;
    const rate = el > 0.8 ? (this.done - this.firstDone) / el : 0;
    const left = this.total && rate > 0 ? Math.max(0, (this.total - this.done) / rate) : null;
    const idle = this.paused ? 0 : (Date.now() - this.lastChange) / 1000;
    return { el, pct, rate, left, idle };
  }
}
function jobStart(o) {
  const j = new Job(o);
  JOBS.push(j);
  drawStatus();
  return j;
}
const busyJobs = () => JOBS.filter((j) => j.state === 'running');
function focusJob() { return JOBS.slice().sort((a, b) => b.prio - a.prio || b.start - a.start)[0] || null; }

// the buttons are only rebuilt when they change, so a click is never lost to a redraw
function setActs(el, html, wire, owner) {
  if (el._html === html && el._owner === owner) return;
  el._html = html; el._owner = owner;
  el.innerHTML = html; wire();
}
function drawStatus() {
  const j = focusJob();
  const jobEl = $('#s-job'), nameEl = $('#s-name'), track = $('#s-track'), bar = $('#s-bar'), pct = $('#s-pct'), time = $('#s-time');
  const acts = $('#s-acts');
  nameEl.classList.remove('warn'); time.classList.remove('warn');
  try { api.doing(j ? `${j.label} ${j.name}` : 'nothing'); } catch {}
  if (!j) {
    const L = LASTJOB;
    jobEl.textContent = 'Ready';
    if (L) {
      nameEl.textContent = `${L.state === 'done' ? 'Finished' : L.state === 'stopped' ? 'Stopped' : 'Failed'}: ${L.label}${L.message ? ' · ' + L.message : ''} · took ${fmtTime(L.elapsed())}`;
      if (L.state === 'error') nameEl.classList.add('warn');
    } else nameEl.textContent = 'Nothing running';
    track.classList.add('off');
    setActs(acts, L && L.next ? `<button class="sm" id="s-next">${esc(L.next.label)}</button>` : '', () => { const nb = $('#s-next'); if (nb) nb.onclick = () => L.next.run(); }, L);
  } else {
    const n = j.numbers();
    track.classList.remove('off');
    jobEl.textContent = j.paused ? `${j.label} · paused` : j.label;
    let name = j.name;
    if (j.unit === 'bytes' && j.total) name = `${name ? name + ' · ' : ''}${fmtSize(j.done)} of ${fmtSize(j.total)}${n.rate ? ` · ${fmtSize(n.rate)}/s` : ''}`;
    else if (j.total && j.unit !== 'none') name = `${name ? name + ' · ' : ''}${Math.min(Math.floor(j.done) + (j.done < j.total ? 1 : 0), j.total)} of ${j.total}${j.extra ? ' · ' + j.extra : ''}`;
    nameEl.textContent = name;
    $('.track', track).classList.toggle('indet', n.pct === null && !j.paused);
    bar.style.width = n.pct === null ? '' : n.pct + '%';
    pct.textContent = n.pct === null ? '' : Math.floor(n.pct) + '%';
    if (j.paused) time.innerHTML = `<span class="el">${fmtTime(n.el)} elapsed · </span>paused`;
    else if (n.idle > 20) { time.textContent = `No new progress for ${fmtTime(n.idle)} · the log shows what's running`; time.classList.add('warn'); }
    else time.innerHTML = `<span class="el">${fmtTime(n.el)} elapsed · </span>${n.left != null ? 'about ' + fmtTime(n.left) + ' left' : j.total ? 'working out time left…' : 'size not known yet'}`;
    setActs(acts, `${j.details ? `<button class="sm" id="s-det"><span data-ic="list"></span>Details</button>` : ''}
      ${j.pause && !j.paused ? `<button class="sm" id="s-pause"><span data-ic="pause"></span>Pause</button>` : ''}
      ${j.paused && j.resume ? `<button class="sm primary" id="s-resume"><span data-ic="play"></span>Resume</button>` : ''}
      ${j.stop ? `<button class="sm" id="s-stop"><span data-ic="stop"></span>Stop</button>` : ''}`, () => {
      paintIcons(acts);
      const on = (id, fn) => { const b = $('#' + id); if (b) b.onclick = fn; };
      on('s-det', (e) => j.details(e.currentTarget)); on('s-pause', () => j.pause()); on('s-resume', () => j.resume()); on('s-stop', () => j.stop());
    }, j);
  }
  // pills on the title strip: every job that is running or paused
  const pills = JOBS.map((x) => {
    const n = x.numbers();
    return `<span class="pill ${x.paused ? 'paused' : n.idle > 20 ? 'stall' : ''}" data-job="${x.id}" title="${esc(x.label)} – click for the log"><span class="led"></span>${esc(x.short)}${x.total && x.unit !== 'bytes' ? ` ${Math.min(Math.floor(x.done) + 1, x.total)}/${x.total}` : ''}<span class="mini ${n.pct === null ? 'indet' : ''}"><i style="width:${n.pct || 0}%"></i></span>${n.pct === null ? '' : Math.floor(n.pct) + '%'}</span>`;
  }).join('');
  const pe = $('#pills');
  if (pe._html !== pills) { pe._html = pills; pe.innerHTML = pills; $$('.pill', pe).forEach((p) => (p.onclick = () => setLog(true))); }
}
setInterval(() => { if (JOBS.length) drawStatus(); }, 1000);
api.onJob((d) => {
  // jobs run by the main process (moving folders) report here
  let j = JOBS.find((x) => x.id === d.id);
  if (!j) { j = jobStart({ id: d.id, label: d.label, short: d.label.replace(/^Moving /, 'Moving '), total: d.total, unit: d.unit, prio: 5 }); j.start = d.start || j.start; }
  j.update({ done: d.done, total: d.total, name: d.name });
});
