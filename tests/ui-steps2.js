module.exports = {
  k_reload: async (w) => { await w.keyboard.press('1'); await w.waitForTimeout(800); await w.click('#setlist .setrow:nth-child(2)'); await w.waitForTimeout(800); },
  l_undo: async (w) => {
    const before = await w.$$eval('.tile .num', (e) => e.length);
    const a = await w.locator('.tile').nth(0).boundingBox(); const b = await w.locator('.tile').nth(3).boundingBox();
    await w.mouse.move(a.x + 20, a.y + 20); await w.mouse.down(); await w.mouse.move(a.x + 40, a.y + 40, { steps: 3 });
    await w.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await w.mouse.up(); await w.waitForTimeout(400);
    const o1 = await w.evaluate(() => included(curSet()).map((i) => i.file).join(','));
    await w.keyboard.press('Control+z'); await w.waitForTimeout(300);
    const o2 = await w.evaluate(() => included(curSet()).map((i) => i.file).join(','));
    await w.keyboard.press('Control+y'); await w.waitForTimeout(300);
    const o3 = await w.evaluate(() => included(curSet()).map((i) => i.file).join(','));
    console.log('after drag:', o1, '\nafter undo:', o2, '\nafter redo:', o3);
    console.log('statuses', await w.evaluate(() => P.sets.map((s) => s.name + ':' + setStatus(s)).join(' ')));
    console.log('items in Set A', await w.evaluate(() => P.sets[0].items.map((i) => i.file).join(',')));
  },
  m_light: async (w) => { await w.evaluate(() => { UIP.theme = 'daylight'; applyTheme(); }); await w.click('.field[data-k="layout"] [data-set="vertical"]'); await w.waitForTimeout(800); },
};
