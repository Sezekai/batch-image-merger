module.exports = {
  now_merge: async (w) => {
    await w.keyboard.press('1'); await w.waitForTimeout(800);
    await w.click('#setlist .setrow:nth-child(2)'); await w.waitForTimeout(800);
    await w.click('[data-mode="defaults"]');
    await w.click('.field[data-k="layout"] [data-set="grid"]');
    await w.fill('.field[data-k="cols"] input', '4'); await w.press('.field[data-k="cols"] input', 'Enter');
    await w.click('.field[data-k="sepOn"] .switch'); await w.waitForTimeout(400);
    await w.click('[data-mode="set"]'); await w.waitForTimeout(1500);
  },
  now_export: async (w) => {
    await w.evaluate(() => { EXP = { total: 12, index: 4, ok: 4, fail: 0, name: 'Set B (grid)', tiles: 0.4 }; drawExportBar(); });
    await w.waitForTimeout(300);
  },
  now_freeform: async (w) => {
    await w.evaluate(() => { EXP = null; drawExportBar(); });
    await w.keyboard.press('2'); await w.waitForTimeout(3000);
    await w.click('#ffPlaceAll'); await w.waitForTimeout(1500);
    const it = await w.locator('.ffitem').nth(2).boundingBox(); await w.mouse.click(it.x + it.width / 2, it.y + it.height / 2); await w.waitForTimeout(500);
  },
  now_ffsource: async (w) => { await w.keyboard.press('Tab'); await w.waitForTimeout(1800); },
  now_overlay: async (w) => { await w.keyboard.press('Tab'); await w.keyboard.press('3'); await w.waitForTimeout(18000); },
  now_look: async (w) => { await w.click('#themeBtn'); await w.waitForTimeout(500); },
  now_keys: async (w) => { await w.keyboard.press('Escape'); await w.keyboard.press('k'); await w.waitForTimeout(400); },
};
