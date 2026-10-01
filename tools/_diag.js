// 诊断：初始堆本身是否就已经互相穿透
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const phys = html.split('/*==PHYS==*/')[1].split('/*==/PHYS==*/')[0];
const g1 = html.split('/*==GAME==*/')[1].split('/*==/GAME==*/')[0];
const g2 = html.split('/*==GAME2==*/')[1].split('/*==/GAME2==*/')[0];
var rnd = Math.random;
function seedRnd(s) { var a = s >>> 0; rnd = function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var lastTapT = 0, sfx = { tap: function () { }, merge: function () { } };
function updateHud() { } function toast() { }
eval(phys); eval(g1); eval(g2);

function maxPen(balls) {
  let m = 0, n = 0, worst = null;
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], b = balls[j], pen = (a.r + b.r) - Math.hypot(b.x - a.x, b.y - a.y);
    if (pen > 3) n++;
    if (pen > m) { m = pen; worst = [a.lv, a.r, b.lv, b.r]; }
  }
  return { max: +m.toFixed(2), pairs: n, worst: worst };
}
const DT = 1 / 120;
for (const lv of [1, 6, 12, 15]) {
  seedRnd(1000 + lv * 77);
  const plan = planFor(lv);
  const balls = buildPile(plan);
  const a = maxPen(balls);
  let ev = {};
  for (let k = 0; k < 120 * 4; k++) physicsStep(balls, DT, ev, false);   // 静置 4 秒（不合成）
  const b = maxPen(balls);
  console.log('L' + lv + ' 球数' + balls.length + ' | 堆好后互穿 ' + a.max + 'px(' + a.pairs + '对) | 静置4s后 ' + b.max + 'px(' + b.pairs + '对) worst=' + JSON.stringify(b.worst));
}
