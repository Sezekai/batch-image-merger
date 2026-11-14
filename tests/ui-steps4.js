module.exports = {
  p1: async (w) => { await w.keyboard.press('2'); await w.waitForTimeout(3500); await w.click('#ffPlaceAll'); await w.waitForTimeout(1500);
    await w.click('.field[data-k="format"] [data-set="png"]'); await w.waitForTimeout(300);
    await w.click('.field[data-k="ffTransparent"] .switch'); await w.waitForTimeout(500);
    await w.click('#expThis'); await w.waitForTimeout(8000);
    console.log('exported', await w.evaluate(() => JSON.stringify(P.sets.filter((s) => s.exported).map((s) => [s.name, s.exported.path, s.exported.W, s.exported.H]))));
  },
  p2_tolchange: async (w) => {
    await w.keyboard.press('Escape');
    await w.fill('.field[data-k="ffTol"] .rnum', '45'); await w.press('.field[data-k="ffTol"] .rnum', 'Enter'); await w.waitForTimeout(3000);
    console.log('placed after redetect', await w.evaluate(() => curSet().ff.placed.length), 'status', await w.evaluate(() => setStatus(curSet())));
  },
  p3_merge: async (w) => { await w.keyboard.press('1'); await w.waitForTimeout(1500); await w.click('#setlist .setrow:nth-child(2)'); await w.waitForTimeout(1000); },
};
