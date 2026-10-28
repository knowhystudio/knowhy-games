const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.seedRandom = seed => { Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; };
      window.seedRandom(20261028);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    // Independent line enumeration: does not call the game's matches/findMove.
    await page.evaluate(() => {
      window.triples = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        if (r + 2 * dr < 8 && c + 2 * dc >= 0 && c + 2 * dc < 8) triples.push([r * 8 + c, (r + dr) * 8 + c + dc, (r + 2 * dr) * 8 + c + 2 * dc]);
      }
      window.hasTriple = b => triples.some(line => b[line[0]] !== null && line.every(i => b[i] === b[line[0]]));
      window.readBoard = () => [...board];
      window.fixture = entries => {
        start(); board.fill(null); levels.fill(0); firstClear = true;
        for (const [i, type] of entries) board[i] = type;
        render();
      };
      window.bestMove = () => {
        const b = readBoard();
        let best = null;
        // Plan the fewest relocations needed to complete any three-cell line.
        for (const line of triples) for (let type = 0; type < 6; type++) {
          if (line.some(i => b[i] !== null && b[i] !== type)) continue;
          const gaps = line.filter(i => b[i] === null);
          const sources = b.flatMap((v, i) => v === type && !line.includes(i) ? [i] : []);
          if (gaps.length && sources.length >= gaps.length && (!best || gaps.length < best.cost)) best = { from: sources[0], to: gaps[0], cost: gaps.length };
        }
        return best || { from: b.findIndex(v => v !== null), to: b.findIndex(v => v === null), cost: 4 };
      };
    });
    const results = {};
    results.openings = await page.evaluate(() => {
      let minPlants = 64, maxPlants = 0;
      for (let n = 0; n < 1000; n++) {
        start(); const b = readBoard();
        if (hasTriple(b)) throw Error('Opening already contains a triple: ' + n);
        const from = +document.querySelector('.hint-from').dataset.index, to = +document.querySelector('.hint-to').dataset.index;
        if (b[from] === null || b[to] !== null) throw Error('Invalid highlighted opening: ' + n);
        b[to] = b[from]; b[from] = null;
        if (!hasTriple(b)) throw Error('Highlighted opening does not solve: ' + n);
        const count = board.filter(v => v !== null).length; minPlants = Math.min(minPlants, count); maxPlants = Math.max(maxPlants, count);
      }
      return { checked: 1000, solvableAndHighlighted: 1000, initialTriples: 0, minPlants, maxPlants };
    });
    assert.equal(results.openings.minPlants, 12); assert.equal(results.openings.maxPlants, 12);
    const openingMove = await page.evaluate(() => ({ from: +document.querySelector('.hint-from').dataset.index, to: +document.querySelector('.hint-to').dataset.index }));
    await page.locator(`[data-index="${openingMove.from}"]`).tap();
    assert.equal(await page.locator('.hint-from').count(), 1);
    await page.locator(`[data-index="${openingMove.to}"]`).tap();
    await page.waitForFunction(() => !busy);
    results.clear = await page.evaluate(() => ({ score, growth, plants: board.filter(v => v !== null).length, tutorial: document.getElementById('tutorial').textContent }));
    assert.equal(results.clear.score, 30); assert.equal(results.clear.growth, 1); assert.equal(results.clear.plants, 9); assert.equal(results.clear.tutorial, '');
    await page.locator('#restart').tap();
    assert.ok(await page.locator('#confirm').evaluate(el => el.open));
    await page.locator('#cancel-restart').tap();
    assert.equal(await page.evaluate(() => score), 30);
    results.restartCancelRetainsScore = 30;
    results.diagonals = [];
    for (const line of [[0, 9, 18], [2, 9, 16]]) {
      results.diagonals.push(await page.evaluate(async line => {
        fixture([[line[0], 0], [line[1], 0], [63, 0]]);
        levels[line[0]] = 5; levels[line[1]] = 3; levels[63] = 2;
        await move(63, line[2]);
        return { line, score, growth, plants: board.filter(v => v !== null).length };
      }, line));
    }
    assert.ok(results.diagonals.every(x => x.score === 30 && x.growth === 1 && x.plants === 0));

    results.spawn = await page.evaluate(async () => {
      fixture([[0, 0]]); next = [1, 2, 3]; const before = board.filter(v => v !== null).length;
      await move(0, 1);
      return { before, after: board.filter(v => v !== null).length, score, growth };
    });
    assert.equal(results.spawn.after - results.spawn.before, 3); assert.equal(results.spawn.score, 0);
    await page.evaluate(() => fixture([[0, 0], [1, 1], [8, 2], [9, 3], [10, 4]]));
    results.tools = {};
    for (const [key, target] of [['shovel', 10], ['sun', 0], ['water', 9]]) {
      const before = await page.evaluate(key => inventory[key], key);
      await page.locator('#' + key).tap();
      if (key !== 'shovel') {
        assert.ok(await page.locator('.tool-preview').count() > 0);
        assert.ok(await page.locator('.preview-level').count() > 0);
      }
      await page.locator(`[data-index="${target}"]`).tap();
      const after = await page.evaluate(key => inventory[key], key);
      results.tools[key] = { before, after }; assert.equal(before, 1); assert.equal(after, 0);
      assert.match(await page.locator('#' + key).innerText(), /剩余 0 \/ 上限 2/);
    }
    results.growth = await page.evaluate(() => {
      const sizes = [], colors = [];
      for (let level = 0; level < 4; level++) {
        levels[0] = level; render();
        sizes.push(parseFloat(getComputedStyle(cells[0].querySelector('.plant')).fontSize)); colors.push(getComputedStyle(cells[0]).backgroundColor);
      }
      const affected = [1, 8, 9].map(i => levels[i]);
      return { sizes, colors, badgePx: getComputedStyle(cells[0].querySelector('.level')).fontSize, score, affected, removed: board[10] === null };
    });
    assert.deepEqual(results.growth.affected, [1, 1, 1]); assert.equal(results.growth.score, 0); assert.equal(results.growth.removed, true);
    assert.equal(new Set(results.growth.colors).size, 4); assert.ok(results.growth.sizes.every((v, i, a) => i === 0 || v > a[i - 1]));
    results.caps = await page.evaluate(() => { for (const k of ['shovel', 'sun', 'water']) for (let i = 0; i < 4; i++) addTool(k); render(); return { ...inventory }; });
    assert.deepEqual(results.caps, { shovel: 2, sun: 2, water: 2 });

    results.warning = [];
    for (const spaces of [11, 10, 9, 0]) {
      results.warning.push(await page.evaluate(spaces => {
        board = Array.from({ length: 64 }, (_, i) => i < spaces ? null : i % 6); render();
        const w = document.getElementById('space-warning');
        return { spaces, visible: !w.hidden, color: getComputedStyle(w).color, text: w.textContent };
      }, spaces));
    }
    assert.deepEqual(results.warning.map(x => x.visible), [false, true, true, true]);
    assert.equal(results.warning[1].color, 'rgb(180, 35, 24)');
    await page.evaluate(() => { start(); firstClear = true; render(); });
    results.hints = [];
    for (let i = 0; i < 3; i++) {
      await page.locator('#hint').tap();
      results.hints.push(await page.evaluate(() => ({ remaining: hintsLeft, from: document.querySelectorAll('.hint-from').length, to: document.querySelectorAll('.hint-to').length, line: document.querySelectorAll('.hint-line').length })));
    }
    assert.deepEqual(results.hints.map(x => x.remaining), [2, 1, 0]);
    assert.ok(results.hints.every(x => x.from === 1 && x.to === 1 && x.line >= 3));
    assert.ok(await page.locator('#hint').isDisabled()); assert.match(await page.locator('#hint-help').innerText(), /3 次.*用完/);
    await page.evaluate(() => document.getElementById('hint').click()); assert.equal(await page.evaluate(() => hintsLeft), 0);
    results.noMoveHint = await page.evaluate(() => {
      fixture([[0, 0]]); document.getElementById('hint').click();
      return { remaining: hintsLeft, message: document.getElementById('message').textContent };
    });
    assert.equal(results.noMoveHint.remaining, 2); assert.match(results.noMoveHint.message, /暂时没有/);

    results.shortGame = await page.evaluate(async () => {
      seedRandom(20261028); start(); let moves = 0, spawnMoves = 0;
      while (!ended && moves < 80) {
        const plan = bestMove(), before = growth; await move(plan.from, plan.to); moves++;
        if (before === growth) spawnMoves++;
      }
      return { score, clears: growth, moves, spawnMoves, won: ended && score >= 200, title: document.getElementById('over-title').textContent, progress: document.getElementById('goal-progress').value };
    });
    assert.ok(results.shortGame.won, JSON.stringify(results.shortGame)); assert.equal(results.shortGame.progress, 200);
    await page.locator('#again').tap(); assert.ok(await page.locator('#confirm').evaluate(el => el.open));
    const wonScore = await page.evaluate(() => score);
    await page.locator('#cancel-restart').tap(); assert.ok(await page.locator('#over').evaluate(el => el.open)); assert.equal(await page.evaluate(() => score), wonScore);
    await page.locator('#again').tap(); await page.locator('#confirm-restart').tap();
    assert.equal(await page.evaluate(() => score), 0); assert.equal(await page.evaluate(() => hintsLeft), 3);
    results.fullBoard = await page.evaluate(async () => {
      // Fill the final vacancy by a real no-clear move. A six-type pattern has no triples.
      board = Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) + 2 * (i % 8)) % 6); board[0] = null;
      firstClear = true; next = [4, 5, 0]; render(); await move(1, 0);
      return { spaces: board.filter(v => v === null).length, ended, score, title: document.getElementById('over-title').textContent };
    });
    assert.equal(results.fullBoard.spaces, 0); assert.equal(results.fullBoard.ended, true); assert.equal(results.fullBoard.title, '花园已经开满啦');
    await page.locator('#again').tap(); await page.locator('#confirm-restart').tap();
    await page.locator('#restart').tap(); await page.locator('#cancel-restart').tap(); assert.equal(await page.evaluate(() => score), 0);
    results.layout = [];
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      results.layout.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, boardWidth: boardEl.getBoundingClientRect().width })));
    }
    assert.ok(results.layout.every(x => x.scrollWidth === x.width));
    assert.match(await page.title(), /花园三连/); assert.equal(errors.length, 0, errors.join('\n'));
    results.browserErrors = errors.length;
    if (process.env.GARDEN_SCREENSHOT) { await page.setViewportSize({ width: 375, height: 1000 }); await page.screenshot({ path: process.env.GARDEN_SCREENSHOT, fullPage: true }); }
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
