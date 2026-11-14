const box = (w, s, i = 0) => w.locator(s).nth(i).boundingBox();
async function drag(w, a, b, steps = 10, mod) { if (mod) await w.keyboard.down(mod); await w.mouse.move(a[0], a[1]); await w.mouse.down(); await w.mouse.move(a[0] + 6, a[1] + 6, { steps: 2 }); await w.mouse.move(b[0], b[1], { steps }); await w.waitForTimeout(150); await w.mouse.up(); if (mod) await w.keyboard.up(mod); }
const ev = (w, f) => w.evaluate(f);
module.exports = {
  a_nav: async (w) => {
    await w.keyboard.press('2'); await w.waitForTimeout(3000);
    await w.click('#ffPlaceAll'); await w.waitForTimeout(1500);
    const r = await box(w, '#ffwrap');
    const v0 = await ev(w, () => [FF.view.x, FF.view.y, FF.view.z]);
    await w.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await w.mouse.wheel(0, 200); await w.waitForTimeout(100);
    const v1 = await ev(w, () => [FF.view.x, FF.view.y, FF.view.z]);
    await w.keyboard.down('Shift'); await w.mouse.wheel(0, 200); await w.keyboard.up('Shift'); await w.waitForTimeout(100);
    const v2 = await ev(w, () => [FF.view.x, FF.view.y, FF.view.z]);
    await w.keyboard.down('Control'); await w.mouse.wheel(0, -300); await w.keyboard.up('Control'); await w.waitForTimeout(100);
    const v3 = await ev(w, () => [FF.view.x, FF.view.y, FF.view.z]);
    await drag(w, [r.x + 8, r.y + 8], [r.x + 100, r.y + 60]);
    const v4 = await ev(w, () => [FF.view.x, FF.view.y, FF.view.z]);
    console.log('nav start', v0.map(Math.round), 'wheel', v1.map(Math.round), 'shift', v2.map(Math.round), 'ctrl', v3.map((x) => +x.toFixed(3)), 'drag outside', v4.map(Math.round));
    await w.keyboard.press('0');
  },
  b_trim: async (w) => {
    await w.keyboard.press('c'); await w.waitForTimeout(400);
    const h = await box(w, '[data-ch="se"]'); await drag(w, [h.x + 6, h.y + 6], [h.x - 200, h.y - 40]);
    const n = await box(w, '[data-ch="nw"]'); await drag(w, [n.x + 6, n.y + 6], [n.x + 60, n.y + 20]);
    await w.waitForTimeout(300);
  },
  c_trim_applied: async (w) => {
    await w.keyboard.press('Enter'); await w.waitForTimeout(800);
    console.log('canvas after trim', await ev(w, () => JSON.stringify([eff(curSet()).ffCanvas, eff(curSet()).ffW, eff(curSet()).ffH])));
  },
  d_group_then_click_split: async (w) => {
    await w.locator('.field[data-k="ffGap"] input').scrollIntoViewIfNeeded();
    await w.fill('.field[data-k="ffGap"] input', '60'); await w.press('.field[data-k="ffGap"] input', 'Enter'); await w.waitForTimeout(2500);
    await w.keyboard.press('Tab'); await w.waitForTimeout(1500);
    console.log('subjects with big gap', await ev(w, () => (curSet().ff.subjects[curSet().ff.src] || []).length));
    await w.keyboard.press('l'); await w.waitForTimeout(200);
    const s = await box(w, '.srcsub', 0);
    await w.mouse.click(s.x + s.width / 2, s.y + s.height * 0.55); await w.waitForTimeout(1500);
  },
  e_cut_done: async (w) => { await w.keyboard.press('Enter'); await w.waitForTimeout(1500); console.log('after click split', await ev(w, () => (curSet().ff.subjects[curSet().ff.src] || []).length)); },
  f_rect_move: async (w) => {
    await w.click('[data-shape="rect"]');
    const s = await box(w, '.srcsub', 2);
    await drag(w, [s.x - 5, s.y - 5], [s.x + s.width * 0.6, s.y + s.height * 0.4]);
    await w.waitForTimeout(800);
    // move the selection down
    await drag(w, [s.x + s.width * 0.3, s.y + s.height * 0.2], [s.x + s.width * 0.3, s.y + s.height * 0.6]);
    await w.waitForTimeout(1500);
  },
  g_copy: async (w) => { console.log('pending', await ev(w, () => JSON.stringify(FF.pend && { sid: FF.pend.sid, res: FF.pend.res && !FF.pend.res.empty }))); await w.keyboard.press('c'); await w.waitForTimeout(1500); console.log('after copy', await ev(w, () => (curSet().ff.subjects[curSet().ff.src] || []).length)); },
  h_view_hl: async (w) => { await w.click('[data-sv="hl"]'); await w.waitForTimeout(1500); },
  i_view_orig: async (w) => { await w.click('[data-sv="orig"]'); await w.waitForTimeout(800); },
  j_switch_src: async (w) => {
    for (let i = 0; i < 4; i++) { await w.locator('.sitem').nth(i % 2 ? 0 : 1).click(); await w.waitForTimeout(250); }
    await w.keyboard.press('ArrowRight'); await w.waitForTimeout(1200);
    console.log('source now', await ev(w, () => curSet().ff.src));
  },
  k_undo_then_switch: async (w) => {
    await w.keyboard.press('Control+z'); await w.waitForTimeout(500);
    await w.locator('.sitem').nth(0).click(); await w.waitForTimeout(1000);
    console.log('source after undo+click', await ev(w, () => curSet().ff.src));
  },
  l_filter: async (w) => { await w.keyboard.press('1'); await w.waitForTimeout(800); await w.click('[data-sf="done"]'); await w.waitForTimeout(300); console.log('rows exported filter', await w.locator('.setrow').count()); await w.click('[data-sf="all"]'); },
  m_theme: async (w) => {
    await w.click('#themeBtn'); await w.waitForTimeout(300);
    await w.selectOption('[data-from="--accent"]', 'ember'); await w.waitForTimeout(200);
    await w.selectOption('[data-from="--bg"]', 'violet'); await w.waitForTimeout(200);
    await w.selectOption('select[data-k="--font"]', 'Georgia'); await w.waitForTimeout(300);
  },
  n_theme_saved: async (w) => {
    await w.click('#tNew'); await w.waitForTimeout(200); await w.fill('#askIn', 'Test theme'); await w.click('#askOk'); await w.waitForTimeout(400);
    console.log('themes', await ev(w, () => JSON.stringify((UIP.myThemes || []).map((t) => t.name)) + ' current ' + UIP.theme));
  },
};
