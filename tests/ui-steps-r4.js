module.exports = {
  n_merge: async (w) => { await w.keyboard.press('1'); await w.waitForTimeout(2000); },
  n_free: async (w) => { await w.keyboard.press('2'); await w.waitForTimeout(3000); },
  n_over: async (w) => { await w.keyboard.press('3'); await w.waitForTimeout(3000); },
  n_settings: async (w) => { await w.keyboard.press('s'); await w.waitForTimeout(1000); },
  n_look: async (w) => { await w.click('#lookBtn'); await w.waitForTimeout(800); },
  n_keys: async (w) => { await w.keyboard.press('Escape'); await w.keyboard.press('k'); await w.waitForTimeout(400); },
};
