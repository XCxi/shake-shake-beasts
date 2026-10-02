// 限时模式验收：60 秒 + 每 8 秒空投，机器人疯狂敲，检查
// 1) 时间到会不会正确结束  2) 空投有没有真的补进来  3) 分数落在合理区间  4) 物理不变量
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const phys = html.split('/*==PHYS==*/')[1].split('/*==/PHYS==*/')[0];
const g1 = html.split('/*==GAME==*/')[1].split('/*==/GAME==*/')[0];
const g2 = html.split('/*==GAME2==*/')[1].split('/*==/GAME2==*/')[0];

var rnd = Math.random;
function seedRnd(seed) { var a = seed >>> 0; rnd = function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var lastTapT = 0, seen = [], stars = [];
var sfx = { tap: function () { }, merge: function () { }, clear: function () { }, fail: function () { } };
function updateHud() { } function toast() { } function saveSeen() { } function saveStars() { } function beep() { }
var store = {};
var LS = { get: function (k, d) { return (k in store) ? store[k] : d; }, set: function (k, v) { store[k] = v; } };
function showCard(o) { global.__card = o; }
function hideCard() { }
function startTimed() { }
function home() { }
function share() { }
eval(phys); eval(g1); eval(g2);

const DT = 1 / 120;
function densePoint() {
  let best = { x: FIELD.W / 2, y: FIELD.H * 0.72 }, bv = -1;
  for (let i = 0; i < S.balls.length; i++) {
    let v = 0;
    for (let j = 0; j < S.balls.length; j++) { if (i === j || S.balls[j].lv !== S.balls[i].lv) continue; v += Math.max(0, 1 - Math.hypot(S.balls[i].x - S.balls[j].x, S.balls[i].y - S.balls[j].y) / 190); }
    if (v > bv) { bv = v; best = { x: S.balls[i].x, y: S.balls[i].y }; }
  }
  return best;
}
function maxPen() {
  let m = 0;
  for (let i = 0; i < S.balls.length; i++) for (let j = i + 1; j < S.balls.length; j++) {
    const a = S.balls[i], b = S.balls[j], pen = (a.r + b.r) - Math.hypot(b.x - a.x, b.y - a.y);
    if (pen > m) m = pen;
  }
  return m;
}
function run(seed, tapEvery) {
  seedRnd(seed);
  S = {
    level: 1, mode: 'timed', balls: [], ev: { merges: [] }, fx: [], waves: [], score: 0, target: 0, taps: 999,
    tapsUsed: 0, chain: 0, chainT: 0, shake: 0, frozen: false, over: false, endT: 0, t: 0, plan: planForTimed(),
    merges: 0, heavy: 1, magnet: 1, armed: null, stars: 0, mergeBoost: 0, settled: false, runScore: 0,
    timeLeft: TIMED_SECONDS, nextBatch: TIMED_BATCH_EVERY, secShown: -1
  };
  S.balls = buildPile(S.plan);
  const startBalls = S.balls.length;
  let batches = 0, tapT = 0, maxBalls = S.balls.length, maxPenSeen = 0, bad = null, merged0 = 0;
  while (!S.settled && S.t < TIMED_SECONDS + 3) {
    // 物理（按帧推进）
    stepWaves(DT);
    FIELD.MERGE_V_NOW = (S.mergeBoost > 0 ? FIELD.MERGE_V * 0.32 : FIELD.MERGE_V);
    physicsStep(S.balls, DT, S.ev, true); handleMerges();
    S.t += DT;
    if (S.mergeBoost > 0) S.mergeBoost -= DT;
    deOverlap(S.balls, 2);
    if (S.chainT > 0) { S.chainT -= DT; if (S.chainT <= 0) S.chain = 0; }
    // 限时逻辑（对应 frame() 里的 timed 分支）
    S.timeLeft -= DT;
    S.nextBatch -= DT;
    if (S.nextBatch <= 0) { S.nextBatch = TIMED_BATCH_EVERY; if (S.balls.length < 60) { spawnBatch(); batches++; } }
    if (S.timeLeft <= 0) endTimed();
    // 机器人疯狂敲
    tapT -= DT;
    if (tapT <= 0 && !S.settled) { tapT = tapEvery; const p = densePoint(); knock(p.x, p.y); }
    maxBalls = Math.max(maxBalls, S.balls.length);
    if (S.t % 1 < DT) { const p = maxPen(); if (p > maxPenSeen) maxPenSeen = p; }
    for (const b of S.balls) if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.vx) || !isFinite(b.vy)) { bad = 'NaN'; break; }
    if (bad) break;
    if (S.balls.length > 120) { bad = '球数爆炸 ' + S.balls.length; break; }
  }
  return { score: S.score, merges: S.merges, batches: batches, startBalls: startBalls, maxBalls: maxBalls, maxPen: +maxPenSeen.toFixed(2), bad: bad, settled: S.settled, t: +S.t.toFixed(1), card: global.__card && global.__card.title };
}

console.log('=== 限时模式 × 3 个种子（机器人每 0.3 秒敲一下，持续 60 秒）===');
const out = [];
for (const sd of [5, 66, 777]) {
  const r = run(sd, 0.3);
  out.push(r);
  console.log('种子' + String(sd).padStart(4) + ' → ' + r.score + ' 分，合成 ' + r.merges + ' 次，空投 ' + r.batches + ' 批，球数 ' + r.startBalls + '→最多' + r.maxBalls +
    '，' + (r.settled ? '准时结束 ✅' : '没结束 ❌') + '，结算卡「' + r.card + '」，互穿 ' + r.maxPen + (r.bad ? ('  ❌ ' + r.bad) : ''));
}
const avg = Math.round(out.reduce((a, b) => a + b.score, 0) / out.length);
console.log('\n平均 ' + avg + ' 分');
console.log('全部准时结束: ' + out.every(r => r.settled));
console.log('空投都生效   : ' + out.every(r => r.batches >= 6));
console.log('无物理异常   : ' + out.every(r => !r.bad && r.maxPen < 12));
console.log('分数区间合理 (800~40000): ' + (avg >= 800 && avg <= 40000 ? '是' : '否'));
