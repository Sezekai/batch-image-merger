module.exports = {
  r_merge: async (w) => { await w.keyboard.press('1'); await w.waitForTimeout(2500); },
  r_merge_sel: async (w) => { await w.click('#setlist .setrow:nth-child(2)'); await w.waitForTimeout(1500); },
  r_keys: async (w) => { await w.keyboard.press('k'); await w.waitForTimeout(400); },
  r_freeform: async (w) => { await w.keyboard.press('Escape'); await w.keyboard.press('2'); await w.waitForTimeout(4000); },
  r_overlay: async (w) => { await w.keyboard.press('3'); await w.waitForTimeout(15000); },
  r_settings: async (w) => { await w.keyboard.press('s'); await w.waitForTimeout(1500); },
  r_look: async (w) => { await w.click('#lookBtn'); await w.waitForTimeout(800); },
  r_log: async (w) => { await w.keyboard.press('Escape'); await w.keyboard.press('1'); await w.keyboard.press('l'); await w.waitForTimeout(500); },
};
