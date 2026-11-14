module.exports = {
  q_running: async (w) => { await w.keyboard.press('1'); await w.waitForTimeout(1500);
    await w.evaluate(() => { const orig = prepareSet; window.prepareSet = async (s) => { await new Promise((r) => setTimeout(r, 1800)); return orig(s); }; });
    await w.click('#expAll'); await w.waitForTimeout(900); },
  q_details: async (w) => { await w.click('#s-det'); await w.waitForTimeout(300); },
  q_pausing: async (w) => { await w.keyboard.press('Escape'); await w.click('#s-pause'); await w.waitForTimeout(3500); },
  q_resumed: async (w) => { await w.click('#s-resume'); await w.waitForTimeout(800); },
  q_stopped: async (w) => { await w.click('#s-stop'); await w.waitForTimeout(1500); },
  q_viewer: async (w) => { const t = await w.locator('#paper .tile').first().boundingBox(); await w.mouse.dblclick(t.x + 20, t.y + 20); await w.waitForTimeout(1200); },
  q_dialog: async (w) => { await w.keyboard.press('Escape'); await w.waitForTimeout(300); await w.click('#setlist .setrow >> nth=1', { button: 'right' }); await w.waitForTimeout(300); await w.click('#ctx button:last-child'); await w.waitForTimeout(400); },
  q_enter: async (w) => { await w.keyboard.press('Enter'); await w.waitForTimeout(400); },
  q_undo: async (w) => { await w.keyboard.press('Control+z'); await w.waitForTimeout(400); },
};
