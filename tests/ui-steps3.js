const box = (w, s, i = 0) => w.locator(s).nth(i).boundingBox();
async function drag(w, a, b, steps = 10) { await w.mouse.move(a[0], a[1]); await w.mouse.down(); await w.mouse.move(a[0] + 6, a[1] + 6, { steps: 2 }); await w.mouse.move(b[0], b[1], { steps }); await w.waitForTimeout(150); await w.mouse.up(); }
module.exports = {
  f1_open: async (w) => { await w.keyboard.press('2'); await w.waitForTimeout(3500); },
  f2_placeall: async (w) => { await w.click('#ffPlaceAll'); await w.waitForTimeout(1500); },
  f3_move_rotate: async (w) => {
    await w.click('#ffwrap', { position: { x: 30, y: 30 } });
    const it = await box(w, '.ffitem', 1);
    await drag(w, [it.x + it.width / 2, it.y + it.height / 2], [it.x + it.width / 2 + 60, it.y + it.height / 2 - 40]);
    await w.waitForTimeout(300);
    const r = await w.locator('.hrot').boundingBox();
    await drag(w, [r.x + 6, r.y + 6], [r.x + 80, r.y + 30]);
    const sc = await w.locator('.hsc').nth(2).boundingBox();
    await drag(w, [sc.x + 5, sc.y + 5], [sc.x + 60, sc.y + 60]);
    await w.waitForTimeout(800);
    console.log('placed', await w.evaluate(() => JSON.stringify(curSet().ff.placed.map((p) => [Math.round(p.cx), Math.round(p.cy), +p.s.toFixed(2), Math.round(p.r)]))));
  },
  f4_marquee_align: async (w) => {
    const r = await w.locator('#ffwrap').boundingBox();
    await drag(w, [r.x + 10, r.y + 10], [r.x + r.width - 10, r.y + r.height - 10]);
    console.log('selected', await w.evaluate(() => FF.sel.size));
    await w.click('#ffArrange'); await w.waitForTimeout(800);
  },
  f5_source: async (w) => {
    await w.keyboard.press('Tab'); await w.waitForTimeout(1500);
    // select first subject then split its left half with a lasso
    const s = await box(w, '.srcsub', 0);
    await w.mouse.click(s.x + s.width / 2, s.y + s.height / 2); await w.waitForTimeout(200);
    await w.keyboard.press('l');
    const pts = [[s.x - 10, s.y - 10], [s.x + s.width * 0.5, s.y - 10], [s.x + s.width * 0.5, s.y + s.height + 10], [s.x - 10, s.y + s.height + 10], [s.x - 10, s.y - 8]];
    await w.mouse.move(...pts[0]); await w.mouse.down(); for (const p of pts.slice(1)) await w.mouse.move(p[0], p[1], { steps: 6 }); await w.mouse.up();
    await w.waitForTimeout(1200);
    // erase across the second subject
    await w.keyboard.press('v');
    const s2 = await box(w, '.srcsub', 2);
    await w.mouse.click(s2.x + s2.width / 2, s2.y + s2.height / 2); await w.keyboard.press('e');
    await drag(w, [s2.x - 10, s2.y + s2.height * 0.3], [s2.x + s2.width + 10, s2.y + s2.height * 0.35], 12);
    await w.waitForTimeout(1500);
    console.log('subjects', await w.evaluate(() => Object.values(curSet().ff.subjects).map((a) => a.length).join(',')));
  },
  f6_canvas_after: async (w) => { await w.keyboard.press('Tab'); await w.waitForTimeout(1200); },
  f7_exact: async (w) => { await w.click('#exactBtn2'); await w.waitForTimeout(5000); },
  o1_open: async (w) => { await w.keyboard.press('Escape'); await w.keyboard.press('3'); await w.waitForTimeout(20000); },
  o2_diff: async (w) => { await w.click('[data-vm="diff"]'); await w.waitForTimeout(800); },
  o3_move_and_erase: async (w) => {
    await w.click('[data-vm="normal"]');
    const l = await w.locator('.ovlayer.sel').boundingBox();
    await drag(w, [l.x + l.width / 2, l.y + l.height / 2], [l.x + l.width / 2 + 40, l.y + l.height / 2 + 25]);
    await w.keyboard.press('e');
    await drag(w, [l.x + 20, l.y + 20], [l.x + l.width - 20, l.y + l.height - 20], 14);
    await w.waitForTimeout(800);
    await w.keyboard.press('s'); await w.waitForTimeout(800);
  },
  o4_undo_move: async (w) => { await w.keyboard.press('s'); await w.keyboard.press('Control+z'); await w.keyboard.press('Control+z'); await w.waitForTimeout(800); console.log('layers', await w.evaluate(() => JSON.stringify(curSet().ov.layers.map((l) => [l.file, l.status, (l.ops || []).length, l.conf && +l.conf.toFixed(2)])))); },
  o5_points: async (w) => {
    await w.click('#ovPts'); await w.waitForTimeout(1500);
    const a = await w.locator('#ppA').boundingBox(), b = await w.locator('#ppB').boundingBox();
    await w.mouse.click(a.x + a.width * 0.3, a.y + a.height * 0.4); await w.mouse.click(b.x + b.width * 0.4, b.y + b.height * 0.4);
    await w.mouse.click(a.x + a.width * 0.7, a.y + a.height * 0.6); await w.waitForTimeout(500);
  },
  o6_exact: async (w) => { await w.click('#ppCancel'); await w.click('#exactBtn3'); await w.waitForTimeout(8000); },
  o7_export: async (w) => {
    await w.keyboard.press('Escape'); await w.waitForTimeout(300);
    await w.click('#expThis'); await w.waitForTimeout(12000);
    await w.keyboard.press('2'); await w.waitForTimeout(800); await w.click('#expThis'); await w.waitForTimeout(6000);
    console.log('exported', await w.evaluate(() => JSON.stringify(P.sets.filter((s) => s.exported).map((s) => [s.name, s.exported.W, s.exported.H]))));
  },
  o8_keys: async (w) => { await w.keyboard.press('Escape'); await w.keyboard.press('3'); await w.keyboard.press('k'); await w.waitForTimeout(400); await w.mouse.wheel(0, 900); },
};
