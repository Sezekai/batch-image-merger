const click = (w, sel) => w.click(sel);
module.exports = {
  a_start: async (w) => {},
  b_grid: async (w) => {
    await w.click('#setlist .setrow:nth-child(2)');
    await w.waitForTimeout(600);
    await w.click('[data-mode="defaults"]');
    await w.click('.field[data-k="layout"] [data-set="grid"]');
    await w.fill('.field[data-k="cols"] input', '4'); await w.press('.field[data-k="cols"] input', 'Enter');
    await w.waitForTimeout(200);
    await w.click('.field[data-k="sepOn"] .switch');
    await w.waitForTimeout(300);
  },
  c_match: async (w) => {
    await w.click('[data-mode="set"]');
    await w.locator('.field[data-k="match"] .switch').scrollIntoViewIfNeeded(); await w.click('.field[data-k="match"] .switch');
    await w.waitForTimeout(2500);
  },
  d_before: async (w) => { await w.keyboard.press('Tab'); await w.waitForTimeout(1200); },
  e_crop: async (w) => {
    await w.keyboard.press('Tab');
    await w.click('.field[data-k="gridMode"] [data-set="crop"]');
    await w.waitForTimeout(800);
    // drag tile 1 onto tile 3
    const a = await w.locator('.tile').nth(0).boundingBox(); const b = await w.locator('.tile').nth(2).boundingBox();
    await w.mouse.move(a.x + 20, a.y + 20); await w.mouse.down(); await w.mouse.move(a.x + 40, a.y + 40, { steps: 3 });
    await w.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await w.waitForTimeout(300); await w.mouse.up();
    // drag tile 5 to the tray
    const c = await w.locator('.tile').nth(4).boundingBox(); const t = await w.locator('#tray').boundingBox();
    await w.mouse.move(c.x + 20, c.y + 20); await w.mouse.down(); await w.mouse.move(c.x + 50, c.y + 50, { steps: 3 });
    await w.mouse.move(t.x + 200, t.y + t.height / 2, { steps: 8 }); await w.waitForTimeout(200); await w.mouse.up();
  },
  f_row: async (w) => { await w.click('.field[data-k="gridMode"] [data-set="row"]'); await w.waitForTimeout(800); },
  g_ctx: async (w) => { const a = await w.locator('.tile').nth(1).boundingBox(); await w.mouse.click(a.x + 30, a.y + 30, { button: 'right' }); },
  h_export: async (w) => {
    await w.keyboard.press('Escape');
    await w.click('#expAll'); await w.waitForTimeout(6000);
  },
  i_keys: async (w) => { await w.keyboard.press('Escape'); await w.keyboard.press('k'); },
  j_exact: async (w) => { await w.keyboard.press('Escape'); await w.click('#exactBtn'); await w.waitForTimeout(4000); },
};
