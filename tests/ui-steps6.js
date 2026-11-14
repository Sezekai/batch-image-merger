module.exports = {
  perf: async (w) => {
    await w.keyboard.press('1'); await w.waitForTimeout(800);
    const r = await w.evaluate(async () => {
      const base = P.sets.find((s) => s.name === 'Set B (grid)');
      for (let i = 0; i < 300; i++) P.sets.push(Object.assign(JSON.parse(JSON.stringify(base)), { id: 'x' + i, name: 'Copy ' + i, exported: { path: '/x', hash: 'zz' + i, time: 1 } }));
      drawAll();
      const t = []; let a = performance.now();
      for (let i = 0; i < 10; i++) { selectSet('x' + (i * 7)); }
      t.push((performance.now() - a) / 10);
      a = performance.now(); for (let i = 0; i < 10; i++) drawPanel(); t.push((performance.now() - a) / 10);
      a = performance.now(); for (let i = 0; i < 10; i++) drawSets(); t.push((performance.now() - a) / 10);
      return t.map((x) => x.toFixed(1) + ' ms');
    });
    console.log('select set / panel / set list (300 sets):', r);
  },
};
