// 无尽模式验收：
// 1) 曲线体检：目标分是否单调上涨、敲击次数是否递减、种类是否封顶
// 2) 机器人跑到底：用道具 vs 不用道具，各能撑到第几波（证明"会结束"且"道具真有用"）
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const phys = html.split('/*==PHYS==*/')[1].split('/*==/PHYS==*/')[0];
const g1 = html.split('/*==GAME==*/')[1].split('/*==/GAME==*/')[0];
const g2 = html.split('/*==GAME2==*/')[1].split('/*==/GAME2==*/')[0];

var rnd = Math.random;
function seedRnd(seed) { var a = seed >>> 0; rnd = function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var lastTapT = 0, seen = [], stars = {};
var sfx = { tap: function () { }, merge: function () { } };
function updateHud() { } function toast() { } function saveSeen() { } function saveStars() { } function beep() { }
eval(phys); eval(g1); eval(g2);

const DT = 1 / 120;
function newRun() {
  return {
    level: 1, mode: 'endless', balls: [], ev: { merges: [] }, fx: [], waves: [], score: 0, target: 0,
    taps: 0, tapsUsed: 0, chain: 0, chainT: 0, shake: 0, frozen: false, over: false, endT: 0, t: 0,
    plan: null, merges: 0, heavy: 1, magnet: 1, armed: null, stars: 0, mergeBoost: 0, runScore: 0
  };
}
function step(sec) {
  for (let i = 0; i < Math.round(sec * 120); i++) {
    stepWaves(DT);
    FIELD.MERGE_V_NOW = (S.mergeBoost > 0 ? FIELD.MERGE_V * 0.32 : FIELD.MERGE_V);
    physicsStep(S.balls, DT, S.ev, true); handleMerges();
    S.t += DT;
    if (S.mergeBoost > 0) S.mergeBoost -= DT;
    if (S.chainT > 0) { S.chainT -= DT; if (S.chainT <= 0) S.chain = 0; }
  }
}
function densePoint() {
  let best = { x: FIELD.W / 2, y: FIELD.H * 0.72 }, bv = -1;
  for (let i = 0; i < S.balls.length; i++) {
    let v = 0;
    for (let j = 0; j < S.balls.length; j++) { if (i === j || S.balls[j].lv !== S.balls[i].lv) continue; v += Math.max(0, 1 - Math.hypot(S.balls[i].x - S.balls[j].x, S.balls[i].y - S.balls[j].y) / 190); }
    if (v > bv) { bv = v; best = { x: S.balls[i].x, y: S.balls[i].y }; }
  }
  return best;
}
/* 一个波：可用道具就先用（磁锤最强→重锤），然后贪心敲，直到达标或敲完 */
function playWave(wave, useTools, seed) {
  seedRnd(seed);
  const plan = planForEndless(wave);
  S = newRun();
  S.level = wave; S.plan = plan; S.target = plan.target; S.taps = plan.taps;
  S.balls = buildPile(plan);
  if (useTools) {
    knock(densePoint().x, densePoint().y, 'magnet'); step(0.9);
    if (S.score < S.target) { knock(densePoint().x, densePoint().y, 'heavy'); step(0.9); }
  }
  let guard = 0;
  while (S.taps > 0 && S.score < S.target && guard++ < 30) {
    const p = densePoint();
    knock(p.x, p.y);
    step(0.55);
  }
  step(0.8);
  /* 注意：真实游戏里"省下敲击的奖励分"是在达标判定之后才加的，所以达标只看 play 分 */
  return { wave: wave, target: plan.target, taps: plan.taps, score: S.score + S.taps * 15, play: S.score, pass: S.score >= plan.target, merges: S.merges };
}
function fullRun(useTools, seed, maxWave) {
  let wave = 1, total = 0, log = [];
  while (wave <= maxWave) {
    const r = playWave(wave, useTools, seed + wave * 1000);
    total += r.score;
    log.push(r);
    if (!r.pass) break;
    wave++;
  }
  return { reached: wave - 1, diedAt: wave, total: total, log: log };
}

console.log('=== 1) 曲线体检 ===');
let mono = true, prev = 0, tapsDesc = true, prevTaps = 99;
const sample = [1, 5, 10, 15, 16, 18, 20, 25, 30, 40];
for (const w of sample) {
  const p = planForEndless(w);
  if (p.target <= prev) mono = false;
  if (p.taps > prevTaps) tapsDesc = false;
  prev = p.target; prevTaps = p.taps;
  console.log('第 ' + String(w).padStart(2) + ' 波  目标 ' + String(p.target).padStart(5) + '   敲击 ' + p.taps + '   种类 ' + p.types + '   球数 ' + p.count);
}
console.log('目标单调上涨: ' + mono + ' / 敲击单调递减: ' + tapsDesc);

console.log('\n=== 2) 机器人跑到底（最快节奏，最多 60 波）===');
for (const [label, tools] of [['用道具', true], ['只敲不用道具', false]]) {
  for (const seed of [7, 99]) {
    const r = fullRun(tools, seed, 60);
    console.log(label.padEnd(8) + ' 种子' + String(seed).padStart(3) + ' → 撑过 ' + String(r.reached).padStart(2) + ' 波，死在第 ' + r.diedAt + ' 波，总分 ' + r.total);
    const tail = r.log.slice(-4);
    console.log('           最后几波（本波得分/目标）: ' + tail.map(x => x.play + '/' + x.target).join('  '));
  }
}
const withT = [7, 99].map(s => fullRun(true, s, 60).reached);
const noT = [7, 99].map(s => fullRun(false, s, 60).reached);
const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log('\n平均：用道具 ' + avg(withT) + ' 波　只敲 ' + avg(noT) + ' 波');
console.log('会结束（60 波内必死）: ' + (Math.max.apply(null, withT.concat(noT)) < 60));
console.log('道具确实延长了局数: ' + (Number(avg(withT)) > Number(avg(noT))));
console.log('局数落在合理区间(8~35 波): ' + (Number(avg(withT)) >= 8 && Number(avg(withT)) <= 35));
