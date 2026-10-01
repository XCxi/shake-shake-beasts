// 特殊锤验证（终版）
// A) 受控单元测试：两颗同款 + 一颗异款摆在落点右侧，看受力方向对不对
//    —— 普通/重锤应该把它们往外推(vx>0)，磁锤应该把它们往落点吸(vx<0)
// B) 价值测试：每种锤 1.5 秒内引发的合成次数（3 个种子平均）
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
function freshS(level) {
  seedRnd(9000 + level);
  const plan = planFor(level);
  return {
    level: level, mode: 'campaign', balls: [], ev: { merges: [] }, fx: [], waves: [], score: 0, target: plan.target,
    taps: plan.taps, tapsUsed: 0, chain: 0, chainT: 0, shake: 0, frozen: false, over: false, endT: 0, t: 0,
    plan: plan, merges: 0, heavy: 1, magnet: 1, armed: null, stars: 0, mergeBoost: 0
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

/* ---------- A) 受控方向测试 ---------- */
function unitDir(kind) {
  S = freshS(3);
  S.balls = [makeBall(0, 130, 300, 0, 0), makeBall(0, 175, 300, 0, 0), makeBall(1, 225, 300, 0, 0)];
  const p = { x: 90, y: 300 };
  knock(p.x, p.y, kind);
  step(0.13);
  return S.balls.map(b => ({ lv: b.lv, vx: +b.vx.toFixed(0), toTap: +(((b.vx * (p.x - b.x)) + (b.vy * (p.y - b.y))) / Math.max(1, Math.hypot(p.x - b.x, p.y - b.y))).toFixed(0) }));
}
console.log('=== A) 受控方向测试（落点在左边 x=90；vx<0=被吸、vx>0=被推）===');
let dirOK = true;
for (const k of ['normal', 'heavy', 'magnet']) {
  const r = unitDir(k);
  const allPush = r.every(x => x.vx > 0), allPull = r.every(x => x.vx < 0);
  const ok = (k === 'magnet') ? allPull : allPush;
  if (!ok) dirOK = false;
  console.log(k.padEnd(7) + ' ' + r.map(x => 'lv' + x.lv + ' vx=' + String(x.vx).padStart(5) + ' 朝向落点=' + String(x.toTap).padStart(5)).join('   |   ') + (ok ? '   ✅' : '   ❌'));
}
console.log(dirOK ? 'A) 方向 PASS：磁锤朝落点吸，普通/重锤向外推' : 'A) 方向 FAIL');

/* ---------- B) 价值测试 ---------- */
function densePoint() {
  let best = { x: FIELD.W / 2, y: FIELD.H * 0.72 }, bv = -1;
  for (let i = 0; i < S.balls.length; i++) {
    let v = 0;
    for (let j = 0; j < S.balls.length; j++) { if (i === j || S.balls[j].lv !== S.balls[i].lv) continue; v += Math.max(0, 1 - Math.hypot(S.balls[i].x - S.balls[j].x, S.balls[i].y - S.balls[j].y) / 190); }
    if (v > bv) { bv = v; best = { x: S.balls[i].x, y: S.balls[i].y }; }
  }
  return best;
}
function mergeValue(kind, level, seed) {
  seedRnd(seed);
  const plan = planFor(level);
  S = freshS(level);
  S.balls = buildPile(plan);
  const p = densePoint();
  const b0 = S.merges;
  knock(p.x, p.y, kind);
  step(1.5);
  return S.merges - b0;
}
console.log('\n=== B) 一次锤在 1.5 秒内引发多少次合成（3 种子平均）===');
const seeds = [11, 222, 3333], sum = { normal: 0, heavy: 0, magnet: 0 };
let cnt = 0;
for (const lv of [3, 6, 9, 12, 15]) {
  const v = {};
  for (const k of ['normal', 'heavy', 'magnet']) {
    let s = 0; for (const sd of seeds) s += mergeValue(k, lv, sd + lv * 100);
    v[k] = +(s / seeds.length).toFixed(2); sum[k] += v[k];
  }
  cnt++;
  console.log('L' + String(lv).padStart(2) + '  普通 ' + String(v.normal).padStart(5) + '   重锤 ' + String(v.heavy).padStart(5) + '   磁锤 ' + String(v.magnet).padStart(5));
}
console.log('平均   普通 ' + (sum.normal / cnt).toFixed(2) + '   重锤 ' + (sum.heavy / cnt).toFixed(2) + '   磁锤 ' + (sum.magnet / cnt).toFixed(2));
const best = Math.max(sum.heavy, sum.magnet);
console.log(sum.magnet > sum.normal && sum.heavy > sum.normal ? 'B) 价值 PASS：两种特殊锤都明显强于普通敲' : 'B) 价值 FAIL：有特殊锤不比普通敲强（' + best.toFixed(2) + '）');
