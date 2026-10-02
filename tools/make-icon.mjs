// 图标绘制：不依赖任何图形库，自己算像素（4 倍超采样抗锯齿）+ 自己写 PNG/ICO
// 用法：node tools/make-icon.mjs            → 生成 dist/icon.ico + dist/icon-preview.png
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/* ---------------- PNG 编码 ---------------- */
const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------------- 画布（浮点混色 + 超采样） ---------------- */
class Canvas {
  constructor(size, ss) { this.size = size; this.ss = ss; this.n = size * ss; this.buf = new Float32Array(this.n * this.n * 4); }
  put(x, y, r, g, b, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.n || y >= this.n) return;
    const i = ((y | 0) * this.n + (x | 0)) * 4;
    const oa = this.buf[i + 3], na = a;
    const outA = na + oa * (1 - na);
    if (outA <= 0) return;
    this.buf[i] = (r * na + this.buf[i] * oa * (1 - na)) / outA;
    this.buf[i + 1] = (g * na + this.buf[i + 1] * oa * (1 - na)) / outA;
    this.buf[i + 2] = (b * na + this.buf[i + 2] * oa * (1 - na)) / outA;
    this.buf[i + 3] = outA;
  }
  /* 在超采样网格上按"子像素"填色：p 是 0..1 的画布坐标 */
  rect(x0, y0, x1, y1, color, alpha = 1) {
    for (let y = Math.round(y0 * this.n); y < Math.round(y1 * this.n); y++)
      for (let x = Math.round(x0 * this.n); x < Math.round(x1 * this.n); x++)
        this.put(x, y, color[0], color[1], color[2], alpha);
  }
  /* 圆角矩形（可带旋转） */
  rrect(cx, cy, hw, hh, r, color, alpha = 1, ang = 0, applyRot = false) {
    const N = this.n, ca = Math.cos(ang), sa = Math.sin(ang);
    const px = cx * N, py = cy * N, PH = hw * N, PH2 = hh * N, R = r * N;
    const rad = Math.ceil(Math.hypot(PH, PH2) + R + 2);
    for (let y = Math.floor(py - rad); y <= py + rad; y++) for (let x = Math.floor(px - rad); x <= px + rad; x++) {
      let dx = x - px, dy = y - py;
      if (applyRot) { const t = dx * ca + dy * sa; dy = -dx * sa + dy * ca; dx = t; }
      const qx = Math.abs(dx) - (PH - R), qy = Math.abs(dy) - (PH2 - R);
      const d = (qx > 0 && qy > 0) ? Math.hypot(qx, qy) : Math.max(qx, qy);
      if (d > R) continue;
      this.put(x, y, color[0], color[1], color[2], alpha);
    }
  }
  /* 椭圆（可按 t 函数逐点改色，用来做渐变/高光） */
  ellipse(cx, cy, rx, ry, shader, ang = 0) {
    const N = this.n, ca = Math.cos(ang), sa = Math.sin(ang);
    const px = cx * N, py = cy * N, RX = rx * N, RY = ry * N;
    for (let y = Math.floor(py - RX - RY - 2); y <= py + RX + RY + 2; y++) for (let x = Math.floor(px - RX - RY - 2); x <= px + RX + RY + 2; x++) {
      let dx = x + 0.5 - px, dy = y + 0.5 - py;
      if (ang) { const t = dx * ca + dy * sa; dy = -dx * sa + dy * ca; dx = t; }
      const u = dx / RX, v = dy / RY, d = u * u + v * v;
      if (d > 1) continue;
      const c = shader(u, v, Math.sqrt(d));
      if (c) this.put(x, y, c[0], c[1], c[2], c[3] === undefined ? 1 : c[3]);
    }
  }
  /* 线段（圆头） */
  line(x0, y0, x1, y1, w, color, alpha = 1) {
    const N = this.n, ax = x0 * N, ay = y0 * N, bx = x1 * N, by = y1 * N, W = w * N / 2;
    const minX = Math.floor(Math.min(ax, bx) - W - 2), maxX = Math.ceil(Math.max(ax, bx) + W + 2);
    const minY = Math.floor(Math.min(ay, by) - W - 2), maxY = Math.ceil(Math.max(ay, by) + W + 2);
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
      const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
      if (d <= W) this.put(x, y, color[0], color[1], color[2], alpha);
    }
  }
  /* 圆角矩形背景（带竖向渐变 + 中心径向光晕） */
  roundedBackground(r, c1, c2, glow) {
    const N = this.n;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N, v = (y + 0.5) / N;
      // 圆角矩形判定
      const dx = Math.max(r - u, u - (1 - r), 0), dy = Math.max(r - v, v - (1 - r), 0);
      if (Math.hypot(dx, dy) > r) continue;
      let cr = c1[0] + (c2[0] - c1[0]) * v, cg = c1[1] + (c2[1] - c1[1]) * v, cb = c1[2] + (c2[2] - c1[2]) * v;
      if (glow) {
        const d = Math.hypot(u - glow[0], v - glow[1]) / glow[2];
        const k = Math.max(0, 1 - d) ** 2 * (glow[6] === undefined ? 1 : glow[6]);
        cr += (glow[3] - cr) * k; cg += (glow[4] - cg) * k; cb += (glow[5] - cb) * k;
      }
      this.put(x, y, cr, cg, cb, 1);
    }
  }
  downsample(target) {
    const { n, ss } = this, out = Buffer.alloc(target * target * 4);
    for (let y = 0; y < target; y++) for (let x = 0; x < target; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const i = ((y * ss + sy) * n + (x * ss + sx)) * 4, al = this.buf[i + 3];
        r += this.buf[i] * al; g += this.buf[i + 1] * al; b += this.buf[i + 2] * al; a += al;
      }
      const cnt = ss * ss, o = (y * target + x) * 4;
      if (a > 0.0001) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round((a / cnt) * 255); }
    }
    return out;
  }
}

/* ---------------- 图标美术 ---------------- */
export function drawIcon(size) {
  const SS = 4, c = new Canvas(size, SS);
  const P = (v) => v / 256;                       // 以 256 为设计基准
  const OUT = [42, 24, 10];                       // 描边色（深棕）

  // 1) 背景：深靛蓝渐变 + 中心偏上光晕 + 桌面投影
  c.roundedBackground(0.22, [64, 52, 116], [16, 12, 34], [0.42, 0.30, 0.72, 104, 84, 186, 0.62]);
  c.ellipse(P(128), P(226), P(96), P(16), () => [8, 5, 18, 0.35]);            // 地面投影
  // 2) 冲击波弧线（右上，呼应机制）
  for (const [rad, w, al] of [[0.40, 0.020, 0.34], [0.49, 0.014, 0.18]]) {
    const cx = P(126), cy = P(146), R = P(rad * 256);
    for (let a = -78; a <= 78; a += 1.2) {
      const th = (a * Math.PI) / 180;
      c.line(cx + Math.cos(th) * R, cy + Math.sin(th) * R, cx + Math.cos(th) * R, cy + Math.sin(th) * R, w, [200, 184, 255], al);
    }
  }

  // 3) 萌兽（画在中间偏下，够大）
  const hx = P(128), hy = P(150), hrx = P(82), hry = P(74);
  const fur = (u, v) => {
    const l = Math.max(0, 1 - Math.hypot(u + 0.40, v + 0.48) / 1.30);
    return [255 * (0.74 + 0.26 * l), 152 + 104 * l, 44 + 96 * l, 1];
  };
  // 耳朵（先描边再填充）
  for (const [ex, ey] of [[P(74), P(92)], [P(182), P(92)]]) {
    c.ellipse(ex, ey, P(31), P(35), () => [OUT[0], OUT[1], OUT[2], 1], -0.22);
    c.ellipse(ex, ey, P(28), P(32), fur, -0.22);
    c.ellipse(ex, ey, P(13), P(16), () => [255, 150, 172, 0.95], -0.22);
  }
  // 脸：描边 + 主体 + 高光
  c.ellipse(hx, hy, hrx + P(5), hry + P(5), () => [OUT[0], OUT[1], OUT[2], 1]);
  c.ellipse(hx, hy, hrx, hry, fur);
  c.ellipse(hx - P(20), hy - P(34), P(44), P(26), () => [255, 255, 255, 0.22], -0.5);
  // 眼睛（带描边和双高光，小尺寸也能看清）
  for (const ex of [hx - P(30), hx + P(30)]) {
    c.ellipse(ex, hy - P(4), P(14), P(17), () => [OUT[0], OUT[1], OUT[2], 1]);
    c.ellipse(ex, hy - P(4), P(12), P(15), () => [34, 22, 16, 1]);
    c.ellipse(ex - P(4), hy - P(10), P(4.6), P(5.4), () => [255, 255, 255, 0.95]);
    c.ellipse(ex + P(4), hy + P(4), P(2.4), P(2.8), () => [255, 255, 255, 0.55]);
  }
  // 鼻子 + 嘴 + 腮红
  c.ellipse(hx, hy + P(20), P(8.5), P(6.5), () => [112, 56, 22, 1]);
  c.line(hx - P(11), hy + P(29), hx, hy + P(34), P(3.4), [110, 56, 22], 0.9);
  c.line(hx + P(11), hy + P(29), hx, hy + P(34), P(3.4), [110, 56, 22], 0.9);
  c.ellipse(hx - P(52), hy + P(18), P(14), P(9), () => [255, 136, 156, 0.42]);
  c.ellipse(hx + P(52), hy + P(18), P(14), P(9), () => [255, 136, 156, 0.42]);

  // 4) 敲击火花（画在锤子之前 → 看起来是从敲击点溅出来、被锤子挡住一部分）
  const ix = P(128), iy = P(78);
  for (const [a, len, w] of [[-2.72, 0.085, 6.5], [-2.30, 0.062, 5.5], [-1.92, 0.078, 6], [-1.52, 0.055, 5], [-0.45, 0.060, 5.5], [0.35, 0.048, 5]]) {
    const r0 = P(26), r1 = P(26 + len * 256);
    const x0 = ix + Math.cos(a) * r0, y0 = iy + Math.sin(a) * r0;
    const x1 = ix + Math.cos(a) * r1, y1 = iy + Math.sin(a) * r1;
    c.line(x0, y0, x1, y1, P(w), [255, 208, 112], 0.9);
    c.line(x0, y0, x1, y1, P(w * 0.45), [255, 255, 240], 1);
  }
  // 接触点的白色闪光
  c.ellipse(ix, iy, P(20), P(11), () => [255, 250, 220, 0.55], -0.3);

  // 5) 木锤：右上斜劈下来，锤头停在敲击点上方（比第一版小一半）
  const ang = -0.62;                              // 手柄方向
  const hcx = P(150), hcy = P(52);                // 锤头中心
  const headAng = ang + Math.PI / 2;              // 锤头长轴垂直于手柄
  // 先描边（各方向偏移一点，得到外描边效果）
  for (let k = 0; k < 12; k++) {
    const th = (k / 12) * Math.PI * 2, ox = Math.cos(th) * P(4.5), oy = Math.sin(th) * P(4.5);
    c.rrect(hcx + ox, hcy + oy, P(40), P(17), P(12), OUT, 1, headAng, true);
  }
  c.rrect(hcx, hcy, P(40), P(17), P(12), [166, 104, 46], 1, headAng, true);         // 锤头主体
  c.rrect(hcx - P(3), hcy - P(5), P(34), P(9), P(9), [216, 160, 96], 1, headAng, true); // 上表面高光
  c.rrect(hcx - P(14), hcy - P(9), P(18), P(4), P(4), [255, 232, 190], 0.6, headAng, true);
  // 手柄（从锤头往右上角延伸）
  const hx0 = hcx + Math.cos(ang) * P(34), hy0 = hcy + Math.sin(ang) * P(34);
  const hx1 = hcx + Math.cos(ang) * P(112), hy1 = hcy + Math.sin(ang) * P(112);
  for (let k = 0; k < 10; k++) {
    const th = (k / 10) * Math.PI * 2, ox = Math.cos(th) * P(3.6), oy = Math.sin(th) * P(3.6);
    c.line(hx0 + ox, hy0 + oy, hx1 + ox, hy1 + oy, P(15), OUT, 1);
  }
  c.line(hx0, hy0, hx1, hy1, P(15), [150, 96, 46], 1);
  c.line(hx0 + P(1), hy0 - P(3), hx1 + P(1), hy1 - P(3), P(5), [196, 138, 74], 0.9);

  // 6) 点缀亮星
  for (const [sx, sy, r] of [[P(206), P(150), P(8)], [P(42), P(196), P(6)], [P(214), P(66), P(5.5)]]) {
    c.line(sx - r, sy, sx + r, sy, P(2.6), [255, 242, 196], 0.92);
    c.line(sx, sy - r, sx, sy + r, P(2.6), [255, 242, 196], 0.92);
  }
  return c.downsample(size);
}

/* ---------------- ICO 封装（小尺寸用 BMP，大尺寸用 PNG） ---------------- */
function bmpEntry(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); header.writeUInt32LE(size * size * 4, 20);
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const s = ((size - 1 - y) * size + x) * 4, d = (y * size + x) * 4;
    xor[d] = rgba[s + 2]; xor[d + 1] = rgba[s + 1]; xor[d + 2] = rgba[s]; xor[d + 3] = rgba[s + 3];
  }
  const maskRow = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(maskRow * size);
  return Buffer.concat([header, xor, and]);
}
export function makeIco(sizes = [16, 32, 48, 64, 128, 256]) {
  const entries = sizes.map((s) => {
    const rgba = drawIcon(s);
    const data = s >= 128 ? encodePNG(s, s, rgba) : bmpEntry(rgba, s);
    return { size: s, data };
  });
  const hdr = Buffer.alloc(6); hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dir = [], blobs = [];
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d[0] = e.size >= 256 ? 0 : e.size; d[1] = e.size >= 256 ? 0 : e.size; d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(e.data.length, 8); d.writeUInt32LE(offset, 12);
    offset += e.data.length;
    dir.push(d); blobs.push(e.data);
  }
  return Buffer.concat([hdr, ...dir, ...blobs]);
}

/* ---------------- 预览图：把各尺寸并排画出来，方便肉眼看 ---------------- */
function buildPreview() {
  const W = 560, H = 200, buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, ck = ((x >> 3) + (y >> 3)) % 2 ? 40 : 52;
    buf[i] = ck; buf[i + 1] = ck; buf[i + 2] = ck + 6; buf[i + 3] = 255;
  }
  const big = drawIcon(256);
  const put = (rgba, s, ox, oy) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const si = (y * s + x) * 4, a = rgba[si + 3] / 255;
      for (let k = 0; k < 2; k++) for (let m = 0; m < 2; m++) {
        const dx = ox + x * 2 + k, dy = oy + y * 2 + m;
        if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
        const di = (dy * W + dx) * 4;
        buf[di] = Math.round(rgba[si] * a + buf[di] * (1 - a));
        buf[di + 1] = Math.round(rgba[si + 1] * a + buf[di + 1] * (1 - a));
        buf[di + 2] = Math.round(rgba[si + 2] * a + buf[di + 2] * (1 - a));
      }
    }
  };
  // 左：256 原图（缩到 128 显示 ×2）；右：64/48/32/16 实际大小放大 2 倍
  const small = drawIcon(128); put(small, 128, 8, 8);
  let x = 280, y = 8;
  for (const s of [64, 48, 32, 16]) { put(drawIcon(s), s, x, y + (64 - s)); x += s * 2 + 16; }
  return { w: W, h: H, rgba: buf, big };
}

if (process.argv[1] && process.argv[1].endsWith('make-icon.mjs')) {
  const dist = path.join(import.meta.dirname, '..', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'icon.ico'), makeIco());
  const pv = buildPreview();
  fs.writeFileSync(path.join(dist, 'icon-preview.png'), encodePNG(pv.w, pv.h, pv.rgba));
  fs.writeFileSync(path.join(dist, 'icon-256.png'), encodePNG(256, 256, pv.big));
  console.log('已生成 dist/icon.ico（', fs.statSync(path.join(dist, 'icon.ico')).size, '字节）、dist/icon-preview.png、dist/icon-256.png');
}
