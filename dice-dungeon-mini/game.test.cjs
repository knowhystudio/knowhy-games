// Run with Playwright installed; use CHROMIUM_PATH for a system Chromium binary.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {readFileSync, mkdirSync, writeFileSync} = require('node:fs');
const {join} = require('node:path');
const {chromium} = require('playwright');

let browser, server, base;
before(async () => {
  const html = readFileSync(join(__dirname, 'index.html'));
  server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
});
after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

const die = n => (n - 0.5) / 6;
async function open(t, random, ads) {
  const page = await browser.newPage({viewport:{width:375, height:812}});
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => {if (!req.url().startsWith(base)) external.push(req.url())});
  await page.addInitScript(({random, ads}) => {
    if (Array.isArray(random)) {
      const values = [...random];
      Math.random = () => {
        if (!values.length) throw Error('Deterministic random sequence exhausted');
        return values.shift();
      };
    } else if (typeof random === 'number') Math.random = () => random;
    window.adCalls = {rewarded:0, interstitial:0};
    if (ads) window.DiceDungeonAds = {
      async showRewarded() {window.adCalls.rewarded++; return true},
      async showInterstitial() {window.adCalls.interstitial++; throw Error('Unavailable')}
    };
  }, {random, ads});
  t.after(async () => {
    assert.deepEqual(errors, [], 'No page script errors');
    assert.deepEqual(external, [], 'No external requests');
    await page.close();
  });
  await page.goto(base);
  return page;
}
const text = (page, id) => page.locator(`#${id}`).innerText();
async function contains(page, id, value) {assert.ok((await text(page, id)).includes(value), `${id} should contain ${value}`)}
async function rollAttack(page) {
  await page.click('#action');
  await page.click('#action');
}
async function dialogClick(page, selector, accept, expected) {
  const waiting = page.waitForEvent('dialog');
  const clicking = page.click(selector);
  const dialog = await waiting;
  assert.match(dialog.message(), expected);
  if (accept) await dialog.accept(); else await dialog.dismiss();
  await clicking;
}
async function capture(page, filename) {
  if (!process.env.DD_SCREENSHOTS) return;
  mkdirSync(process.env.DD_SCREENSHOTS, {recursive:true});
  await page.screenshot({path:join(process.env.DD_SCREENSHOTS, filename), fullPage:true});
}

test('three rooms: selected rerolls, retained shield, potion, complete victory summary', async t => {
  const page = await open(t, [die(2),die(3),die(3),die(3),0,
    die(2),die(5),die(1),die(3),die(5),0.99,
    die(1),die(1),die(2),die(2),die(1),die(1),0.5]);
  const trace = [];
  async function record(step) {trace.push({step,hp:await text(page,'hp'),log:await text(page,'log')})}
  await contains(page, 'enemyAttack', '反击伤害：2 点');
  await contains(page, 'potionEffect', '将浪费 4 点');
  assert.equal(await page.isDisabled('#potion'), true);
  await page.click('#help summary');
  await contains(page, 'help', '击杀一击不承受反击伤害');
  await page.click('#help summary');
  await dialogClick(page, '#restartRun', false, /确定重开本局/);
  await contains(page, 'hp', '20/20');
  await page.click('#action');
  assert.equal(await page.isDisabled('#reroll'), true);
  await page.click('[data-die="0"]');
  await contains(page, 'rerollTarget', '第 1 颗骰子（当前 2 点）');
  await page.click('#reroll');
  await contains(page, 'rerollResult', '原值 2 → 新值 3');
  assert.equal(await page.isDisabled('#action'), true);
  await page.click('#acceptRoll');
  await contains(page, 'hint', '攻击伤害：3 点');
  await page.click('#action');
  await record('slime attack 1: accepted selected die 2→3');
  await rollAttack(page);
  await contains(page, 'hp', '16/20');
  await page.click('#action');
  await page.click('#shield');
  await contains(page, 'shieldStatus', '护盾已激活');
  assert.equal(await page.isDisabled('#shield'), true);
  await page.click('#action');
  await contains(page, 'shieldStatus', '护盾已激活');
  await record('slime killed on turn 3: shield retained');
  await contains(page, 'upgrade', '平均伤害 3.5 → 7.5 点');
  await page.click('[data-upgrade="dice"]');
  await contains(page, 'enemyAttack', '反击伤害：3 点');
  await contains(page, 'shieldStatus', '护盾已激活');
  await page.click('#action');
  await page.click('[data-die="1"]');
  await contains(page, 'rerollTarget', '第 2 颗骰子（当前 5 点）');
  await capture(page, 'gameplay.png');
  await page.click('#reroll');
  await contains(page, 'rerollResult', '原值 5 → 新值 1');
  await contains(page, 'rerollResult', '攻击伤害 7 → 3 点');
  await page.click('#keepRoll');
  assert.equal(await page.getAttribute('[data-die="0"]','aria-label'), '第 1 颗骰子，2 点');
  assert.equal(await page.getAttribute('[data-die="1"]','aria-label'), '第 2 颗骰子，5 点');
  await page.click('#action');
  await contains(page, 'hp', '16/20');
  await contains(page, 'shieldStatus', '护盾未激活');
  await contains(page, 'log', '挡住了 3 点反击并已消耗');
  await record('skeleton attack 1: worse second die rejected; shield blocked 3');
  await page.click('#potion');
  await contains(page, 'hp', '20/20');
  await contains(page, 'log', '恢复 4 点生命');
  await record('potion +4');
  await rollAttack(page);
  await page.click('[data-upgrade="power"]');
  await contains(page, 'enemyName', '宝箱守卫');
  await contains(page, 'enemyAttack', '反击伤害：3 点');
  await page.click('#action');
  await contains(page, 'hint', '攻击伤害：7 点');
  await page.click('#action');
  await record('guard attack 1: damage 7');
  await rollAttack(page);
  await record('guard attack 2: damage 9');
  await rollAttack(page);
  await contains(page, 'endTitle', '冒险胜利');
  await contains(page, 'endText', '回合数：8');
  await contains(page, 'endText', '总伤害：47 点');
  await contains(page, 'endText', '剩余生命值：14 / 20');
  await contains(page, 'endText', '重掷 0/2、药水 1/2、护盾 1/2');
  await record('victory: 8 turns, 47 damage, reroll 0, potion 1, shield 1');
  await capture(page, 'victory.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1280);
  if (process.env.DD_SCREENSHOTS) writeFileSync(join(process.env.DD_SCREENSHOTS,'trace.json'), JSON.stringify(trace,null,2)+'\n');
});

test('partial healing announces waste; cancel keeps item; confirm applies only actual healing', async t => {
  const page = await open(t, die(1));
  await rollAttack(page);
  await contains(page, 'hp', '18/20');
  await contains(page, 'potionEffect', '将浪费 2 点');
  await dialogClick(page, '#potion', false, /将浪费 2 点/);
  await contains(page, 'hp', '18/20');
  await contains(page, 'potion', '1/2');
  await dialogClick(page, '#potion', true, /将浪费 2 点/);
  await contains(page, 'hp', '20/20');
  await contains(page, 'potion', '0/2');
  await contains(page, 'log', '已确认浪费 2 点');
});

test('confirmed mid-run restart resets an unresolved reroll without invoking ads', async t => {
  const page = await open(t, die(2), true);
  await rollAttack(page);
  await page.click('#action');
  await page.click('[data-die="0"]');
  await page.click('#reroll');
  await dialogClick(page, '#restartRun', false, /进行了 1 回合/);
  assert.equal(await page.isVisible('#rerollPreview'), true);
  await contains(page, 'hp', '18/20');
  await dialogClick(page, '#restartRun', true, /本局进度和道具将重置/);
  await contains(page, 'hp', '20/20');
  await contains(page, 'roomLabel', '房间 1 / 3');
  for(const item of ['reroll','potion','shield']) await contains(page, item, '1/2');
  assert.equal(await page.isVisible('#rerollPreview'), false);
  assert.equal(await page.locator('[data-die]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.adCalls), {rewarded:0,interstitial:0});
});

for (const choice of ['power','heal','dice']) {
  test(`both ${choice} upgrades give their advertised values and caps`, async t => {
    const page = await open(t, 0.99);
    if (choice==='heal') await page.click('#shield');
    while(await page.isVisible('#battle')) await rollAttack(page);
    if (choice==='heal') await contains(page, 'hp', '20/20');
    await page.click(`[data-upgrade="${choice}"]`);
    if(choice==='heal') await contains(page, 'hp', '24/24');
    if(choice==='power') {await contains(page, 'power', '每骰 +1'); await contains(page, 'power', '固定 +3')}
    if(choice==='dice') await contains(page, 'diceCount', '2/3');
    while(await page.isVisible('#battle')) await rollAttack(page);
    await page.click(`[data-upgrade="${choice}"]`);
    if(choice==='heal') await contains(page, 'hp', '22/28');
    if(choice==='power') {await contains(page, 'power', '每骰 +2'); await contains(page, 'power', '固定 +6')}
    if(choice==='dice') await contains(page, 'diceCount', '3/3');
    await page.click('#action');
    await contains(page, 'hint', `攻击伤害：${choice==='power'?14:choice==='dice'?18:6} 点`);
    await page.click('#action');
    while(await page.isVisible('#battle')) await rollAttack(page);
    await contains(page, 'endTitle', '冒险胜利');
  });
}

test('upgrade restart, capped treasure/rewards and end restart keep the optional ad contract', async t => {
  const page = await open(t, 0.99, true);
  await rollAttack(page); await rollAttack(page);
  await dialogClick(page, '#restartRun', false, /已通过 1\/3/);
  await contains(page, 'treasure', '护盾 ×1（现有 2/2）');
  await page.click('#bonus'); await page.click('#bonus');
  await contains(page, 'bonus', '道具均已达 2/2');
  assert.equal(await page.isDisabled('#bonus'), true);
  await page.click('[data-upgrade="power"]');
  await rollAttack(page); await rollAttack(page);
  await contains(page, 'treasure', '本次宝藏无法领取');
  await page.click('[data-upgrade="power"]');
  await rollAttack(page); await rollAttack(page);
  await contains(page, 'endText', '重掷 2/2、药水 2/2、护盾 2/2');
  await page.click('#restart');
  await contains(page, 'hp', '20/20');
  assert.deepEqual(await page.evaluate(() => window.adCalls), {rewarded:2,interstitial:1});
});

test('defeat also reports turns, damage and zero remaining health', async t => {
  const page = await open(t, die(1));
  while(await page.isVisible('#battle')) await rollAttack(page);
  await page.click('[data-upgrade="power"]');
  while(await page.isVisible('#battle')) await rollAttack(page);
  await contains(page, 'endTitle', '冒险结束');
  await contains(page, 'endText', '回合数：11');
  await contains(page, 'endText', '总伤害：19 点');
  await contains(page, 'endText', '剩余生命值：0 / 20');
});
