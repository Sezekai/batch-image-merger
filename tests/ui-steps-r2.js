module.exports = {
  e_running: async (w) => { await w.keyboard.press('1'); await w.waitForTimeout(1500); await w.click('#expAll'); await w.waitForTimeout(250); },
  e_paused: async (w) => { await w.click('#s-pause').catch(() => {}); await w.waitForTimeout(3000); },
  e_details: async (w) => { await w.click('#s-det').catch((e) => console.log('nodet', e.message)); await w.waitForTimeout(400); },
  e_done: async (w) => { await w.keyboard.press('Escape'); await w.click('#s-resume').catch(() => {}); await w.waitForTimeout(5000); },
  e_again: async (w) => { await w.click('#expThis'); await w.waitForTimeout(4000); },
  e_viewer: async (w) => { const t = await w.locator('#paper .tile').first().boundingBox(); await w.mouse.dblclick(t.x + 20, t.y + 20); await w.waitForTimeout(1200); },
  e_dialog: async (w) => { await w.keyboard.press('Escape'); await w.waitForTimeout(300); await w.click('#setlist .setrow:nth-child(2)', { button: 'right' }); await w.waitForTimeout(300); await w.click('#ctx button:last-child'); await w.waitForTimeout(400); },
  e_enter: async (w) => { await w.keyboard.press('Escape'); await w.waitForTimeout(200); },
};
