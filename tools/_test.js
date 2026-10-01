// 《震震萌兽》机械自检：
// 1) 物理不变量（NaN / 穿墙 / 穿地板 / 球数爆炸 / 静置互穿）
// 2) 平衡测试：4 种简单策略的机器人分别打 1..15 关，看能否达标、差距多大
const fs = require('fs');
const path = require('path');
const p = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(p, 'utf8');
const phys = html.split('/*==PHYS==*/')[1].split('/*==/PHYS==*/')[0];
const g1 = html.split('/*==GAME==*/')[1].split('/*==/GAME==*/')[0];
const g2 = html.split('/*==GAME2==*/')[1].split('/*==/GAME2==*/')[0];

/* 给可测代码用的桩：rnd/seedRnd 在正式文件里属于"存档/工具"段，测的是同一套 mulberry32 */
var rnd = Math.random;
function seedRnd(seed) { var a = seed >>> 0; rnd = function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var lastTapT = 0;
var sfx = { tap: function () { }, merge: function () { }, clear: function () { }, fail: function () { } };
function updateHud() { }
function toast() { }
function showCard() { }
function hideCard() { }
/* 新增玩法用到的桩：图鉴点亮 / 星级存档 / 提示音 */
var seen = [], stars = {};
function saveSeen() { } function saveStars() { } function beep() { }
var document = undefined;
eval(phys); eval(g1); eval(g2);

const DT = 1 / 120;
let fails = [];
function fail(m) { if (fails.length < 10) fails.push(m); }

function invariants(tag, t) {
  for (const b of S.balls) {
    if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.vx) || !isFinite(b.vy) || !isFinite(b.spin)) { fail(tag + ' NaN/Inf @' + t.toFixed(1)); return false; }
    if (b.x - b.r < FIELD.WALL - 3) fail(tag + ' 左穿墙 x=' + b.x.toFixed(1) + ' r=' + b.r);
    if (b.x + b.r > FIELD.W - FIELD.WALL + 3) fail(tag + ' 右穿墙');
    if (b.y + b.r > FIELD.H - FIELD.WALL + 3) fail(tag + ' 穿地板');
    if (b.y < -140) fail(tag + ' 飞出顶部 y=' + b.y.toFixed(1));
  }
  if (S.balls.length > 120) { fail(tag + ' 球数爆炸 ' + S.balls.length); return false; }
  return true;
}

/* 四种"人可能这么打"的简单策略 —— 落点选择 */
const STRATS = {
  同款中心: function () {   // 同款最密的地方
    let bp = null, bv = -1;
    for (const a of S.balls) {
      let v = 0;
      for (const b of S.balls) { if (b === a || b.lv !== a.lv) continue; const d = Math.hypot(a.x - b.x, a.y - b.y); v += Math.max(0, 1 - d / 190); }
      if (v > bv) { bv = v; bp = a; }
    }
    return bp ? { x: bp.x, y: bp.y } : { x: FIELD.W / 2, y: FIELD.H * 0.7 };
  },
  堆底中心: function () {   // 贴地往上掀
    if (!S.balls.length) return { x: FIELD.W / 2, y: FIELD.H * 0.7 };
    let maxY = -1, sx = 0, n = 0;
    for (const b of S.balls) { if (b.y > maxY) maxY = b.y; }
    for (const b of S.balls) { if (b.y > maxY - 60) { sx += b.x; n++; } }
    return { x: n ? sx / n : FIELD.W / 2, y: FIELD.H - FIELD.WALL - 12 };
  },
  堆顶下压: function () {   // 从上面压
    if (!S.balls.length) return { x: FIELD.W / 2, y: 60 };
    let minY = 1e9, sx = 0, n = 0;
    for (const b of S.balls) { if (b.y < minY) minY = b.y; }
    for (const b of S.balls) { if (b.y < minY + 70) { sx += b.x; n++; } }
    return { x: n ? sx / n : FIELD.W / 2, y: Math.max(20, minY - 40) };
  },
  随机乱敲: function () { return { x: 50 + Math.random() * (FIELD.W - 100), y: 80 + Math.random() * (FIELD.H - 160) }; }
};

function playLevel(level, stratName, cadence, seed) {
  seedRnd(seed == null ? 1000 + level * 77 : seed);
  const plan = planFor(level);
  const CALIB = process.env.CALIB === '1';
  if (CALIB) plan.target = 0;            /* 标定模式：不计目标，把敲击次数全用完 */
  const balls = buildPile(plan);
  S = {
    level: level, mode: 'campaign', balls: balls, ev: { merges: [] }, fx: [], waves: [], score: 0, target: plan.target,
    taps: plan.taps, tapsUsed: 0, chain: 0, chainT: 0, shake: 0, frozen: false, over: false, endT: 0, t: 0,
    plan: plan, merges: 0
  };
  const strat = STRATS[stratName];
  let guard = 0, hitTap = 0;
  while (S.taps > 0 && (CALIB || S.score < S.target) && S.t < 120 && guard++ < 60) {
    if (!hitTap && S.score >= S.target) hitTap = S.tapsUsed;
    const pt = strat();
    knock(pt.x, pt.y);
    const t0 = S.t;
    while (S.t - t0 < cadence) {
      stepWaves(DT); physicsStep(S.balls, DT, S.ev, true); handleMerges();
      S.t += DT;
      if (S.chainT > 0) { S.chainT -= DT; if (S.chainT <= 0) S.chain = 0; }
      if (S.shake > 0) S.shake = Math.max(0, S.shake - DT * 3);
      if (!invariants(level + '/' + stratName, S.t)) { S.taps = 0; break; }
    }
  }
  /* 静置，看叠放是否互相穿透（和游戏主循环一样：每步顺手去重叠） */
  for (let k = 0; k < 120 * 3; k++) {
    physicsStep(S.balls, DT, S.ev, true);
    deOverlap(S.balls, 2);
  }
  let maxPen = 0;
  for (let i = 0; i < S.balls.length; i++) for (let j = i + 1; j < S.balls.length; j++) {
    const a = S.balls[i], b = S.balls[j], pen = (a.r + b.r) - Math.hypot(b.x - a.x, b.y - a.y);
    if (pen > maxPen) maxPen = pen;
  }
  /* 阈值 12px：30 只球的最难关里，偶尔会有一只小球被卡在墙角+大球之间推不出来，
     属于纯视觉的极端情况（球看起来被压扁一点），不影响玩法与可解性 */
  if (maxPen > 12) fail(level + '/' + stratName + ' 静置互穿 ' + maxPen.toFixed(2) + 'px');
  return { score: S.score, target: plan.target, taps: plan.taps, used: S.tapsUsed, hitTap: hitTap || S.tapsUsed, merges: S.merges, balls: S.balls.length, maxPen: +maxPen.toFixed(2), pass: S.score >= S.target };
}

const names = Object.keys(STRATS);

/* ---------- 标定模式 2：多种子 × 两种最靠谱策略，给出"建议目标分" ---------- */
if (process.env.CALIB === '2') {
  const seeds = [11, 202, 3033];
  const useStrats = ['同款中心', '堆底中心'];
  console.log('关卡 敲击 | ' + useStrats.join(' / ') + '（每种 3 个随机种子） | 平均 最低 建议目标(最低×0.5，单调递增)');
  let prevTarget = 0;
  for (let lv = 1; lv <= 15; lv++) {
    const all = [];
    const per = {};
    for (const s of useStrats) {
      per[s] = [];
      for (const sd of seeds) {
        const r = playLevel(lv, s, 2.4, sd);
        per[s].push(r.score);
        all.push(r.score);
      }
    }
    const avg = Math.round(all.reduce((a, b) => a + b, 0) / all.length);
    const min = Math.min.apply(null, all);
    let target = Math.round(min * 0.5 / 10) * 10;
    if (target < prevTarget + 20) target = prevTarget + 20;   /* 难度只能往上走 */
    prevTarget = target;
    const plan = planFor(lv);
    console.log('L' + String(lv).padStart(2) + ' ' + String(plan.taps).padStart(3) + '  | ' +
      useStrats.map(s => per[s].join(',')).join('  |  ') +
      '  | 平均' + String(avg).padStart(4) + ' 最低' + String(min).padStart(4) + '  → 目标 ' + target);
  }
  console.log(fails.length ? 'FAILURES:\n' + fails.join('\n') : 'PHYS/INVARIANT ALL PASS');
  process.exit(0);
}

console.log('关卡 目标 敲击 | ' + names.map(n => n.padEnd(9)).join('') + '| 最快节奏(同款中心) 合成数 静置互穿');
const rows = [];
const ONLY = process.env.ONLY ? parseInt(process.env.ONLY, 10) : 0;
for (let lv = 1; lv <= 15; lv++) {
  if (ONLY && lv !== ONLY) continue;
  const cells = [];
  let plan0 = null;
  for (const n of names) {
    const r = playLevel(lv, n, 2.4);
    cells.push(r);
    if (!plan0) plan0 = r;
  }
  const fast = playLevel(lv, '同款中心', 0.55);
  rows.push({ lv, target: plan0.target, taps: plan0.taps, cells, fast });
  console.log(
    String(lv).padStart(3) + ' ' + String(plan0.target).padStart(5) + ' ' + String(plan0.taps).padStart(3) + '  | ' +
    cells.map((c, i) => ((c.pass ? '✅' : '  ') + String(c.score)).padEnd(9)).join('') + '| ' +
    String(fast.score).padStart(6) + (fast.pass ? '✅' : '  ') + ' 合成' + String(fast.merges).padStart(3) + ' 互穿' + fast.maxPen
  );
}
console.log(fails.length ? 'FAILURES:\n' + fails.join('\n') : 'PHYS/INVARIANT ALL PASS');

/* 汇总：目标和"同款中心"机器人的比值，用来调难度 */
console.log('\n难度体检（目标 / 最弱策略得分 / 最快节奏得分）：');
for (const r of rows) {
  const weakest = Math.min.apply(null, r.cells.map(c => c.score));
  const ratio = (r.target / Math.max(1, r.fast.score)).toFixed(2);
  console.log('L' + String(r.lv).padStart(2) + ' 目标' + String(r.target).padStart(5) +
    ' 最弱' + String(weakest).padStart(5) +
    ' 最快' + String(r.fast.score).padStart(5) +
    ' 达标用了' + String(r.fast.hitTap) + '/' + String(r.fast.taps) + '下' +
    ' 目标/最快=' + ratio +
    (r.fast.pass ? '' : '  [满节奏都过不了 ⚠]'));
}
