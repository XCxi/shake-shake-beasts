// 生成 Windows 桌面版：图标 + 便携版 zip + 自解压安装包 exe
// 只依赖系统自带工具（makecab / IExpress / tar），不联网、不装 Electron
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync, execFileSync } from 'node:child_process';

const VERSION = '1.2.1';
const REPO = import.meta.dirname ? path.join(import.meta.dirname, '..') : process.cwd();
const DIST = path.join(REPO, 'dist');
const WORK = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'zzms-build');   // 必须是纯 ASCII 路径（IExpress 不认 UTF-8）
const PORTABLE = path.join(WORK, 'portable');

const log = (...a) => console.log(...a);
const sh = (cmd, opts) => execSync(cmd, Object.assign({ stdio: 'inherit', cwd: WORK }, opts || {}));

/* ---------------- 1) 画图标（自带 PNG 编码器，4 倍超采样） ---------------- */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function drawIcon(size) {
  const S = 4, N = size * S;                       // 4 倍超采样
  const buf = Buffer.alloc(N * N * 4);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= N || y >= N || a <= 0) return;
    const i = (y * N + x) * 4;
    const na = a, oa = buf[i + 3] / 255;
    const outA = na + oa * (1 - na);
    if (outA <= 0) return;
    buf[i] = Math.round((r * na + buf[i] * oa * (1 - na)) / outA);
    buf[i + 1] = Math.round((g * na + buf[i + 1] * oa * (1 - na)) / outA);
    buf[i + 2] = Math.round((b * na + buf[i + 2] * oa * (1 - na)) / outA);
    buf[i + 3] = Math.round(outA * 255);
  };
  // 圆角矩形背景（深蓝紫渐变）
  const R = N * 0.22;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = Math.max(R - x, x - (N - 1 - R), 0), dy = Math.max(R - y, y - (N - 1 - R), 0);
    if (Math.hypot(dx, dy) > R) continue;
    const t = y / N;
    put(x, y, Math.round(43 + (20 - 43) * t), Math.round(33 + (16 - 33) * t), Math.round(80 + (38 - 80) * t), 1);
  }
  // 金色萌兽球
  const bx = N * 0.5, by = N * 0.68, br = N * 0.27;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - bx, y - by); if (d > br) continue;
    const e = Math.max(0, 1 - d / br), hi = Math.max(0, 1 - Math.hypot(x - (bx - br * .35), y - (by - br * .4)) / (br * .9));
    put(x, y, Math.min(255, 232 + hi * 23), Math.min(255, 168 + hi * 70 + e * 20), Math.min(255, 96 + hi * 90 + e * 30), 1);
  }
  // 球上的高光边框
  for (let a = 0; a < 6283; a++) { const th = a / 1000, x = Math.round(bx + Math.cos(th) * br), y = Math.round(by + Math.sin(th) * br); for (let k = 0; k < 3 * S; k++) put(x, y + k, 255, 255, 255, .35); }
  // 锤子：手柄 + 锤头（左上斜劈下来）
  const ang = -0.62, ca = Math.cos(ang), sa = Math.sin(ang);
  const rot = (px, py) => [N * 0.5 + (px * ca - py * sa), N * 0.30 + (px * sa + py * ca)];
  const rrect = (cx, cy, hw, hh, r, col) => {
    for (let y = Math.floor(cy - hh - 2); y <= cy + hh + 2; y++) for (let x = Math.floor(cx - hw - 2); x <= cx + hw + 2; x++) {
      const ddx = Math.abs(x - cx) - (hw - r), ddy = Math.abs(y - cy) - (hh - r);
      const dd = (ddx > 0 && ddy > 0) ? Math.hypot(ddx, ddy) : Math.max(ddx, ddy);
      if (dd > r) continue;
      for (let sx = 0; sx < S; sx++) for (let sy = 0; sy < S; sy++) {
        const [rx, ry] = rot((x + sx / S) - N * 0.5, (y + sy / S) - N * 0.30);
        put(Math.round(rx), Math.round(ry), col[0], col[1], col[2], 1);
      }
    }
  };
  rrect(N * 0.5, N * 0.30, N * 0.055, N * 0.21, N * 0.03, [176, 112, 52]);      // 手柄
  rrect(N * 0.5, N * 0.30 - N * 0.20, N * 0.155, N * 0.075, N * 0.035, [222, 230, 245]); // 锤头
  // 冲击星芒
  for (const [sx, sy, len] of [[0.30, 0.52, 0.11], [0.70, 0.50, 0.10], [0.50, 0.40, 0.08]]) {
    const px = N * sx, py = N * sy, L = N * len, w = N * 0.022;
    for (let k = 0; k < L; k++) for (let o = -w / 2; o <= w / 2; o++) put(Math.round(px + o), Math.round(py + k), 255, 226, 150, .9);
  }
  // 降采样
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const i = ((y * S + sy) * N + (x * S + sx)) * 4;
      const al = buf[i + 3] / 255;
      r += buf[i] * al; g += buf[i + 1] * al; b += buf[i + 2] * al; a += al;
    }
    const n = S * S, i2 = (y * size + x) * 4;
    if (a > 0) { out[i2] = Math.round(r / a); out[i2 + 1] = Math.round(g / a); out[i2 + 2] = Math.round(b / a); out[i2 + 3] = Math.round((a / n) * 255); }
  }
  return out;
}
function buildICO(file, size) {
  const png = encodePNG(size, size, drawIcon(size));
  const hdr = Buffer.alloc(6); hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
  const e = Buffer.alloc(16);
  e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size; e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8); e.writeUInt32LE(22, 12);
  fs.writeFileSync(file, Buffer.concat([hdr, e, png]));
  return png.length;
}

/* ---------------- 2) 生成便携版目录 ---------------- */
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(PORTABLE, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });
fs.copyFileSync(path.join(REPO, 'index.html'), path.join(PORTABLE, 'game.html'));
const icoBytes = buildICO(path.join(PORTABLE, 'icon.ico'), 256);
log('图标 icon.ico 生成：PNG ' + icoBytes + ' 字节');

fs.writeFileSync(path.join(PORTABLE, 'play.bat'), [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  'set "GAME=%~dp0game.html"',
  'set "URL=file:///%GAME:\\=/%"',
  'set "BROWSER="',
  'for %%P in ("%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe") do if not defined BROWSER if exist %%P set "BROWSER=%%~P"',
  'if defined BROWSER (',
  '  start "" "%BROWSER%" --app="%URL%" --window-size=560,940',
  ') else (',
  '  start "" "%GAME%"',
  ')',
  'exit /b 0',
  ''
].join('\r\n'), 'ascii');

fs.writeFileSync(path.join(PORTABLE, 'README.txt'), '\uFEFF' + [
  '震震萌兽 v' + VERSION + ' 便携版',
  '',
  '怎么玩：双击 play.bat（会用 Edge/Chrome 的应用模式打开，没有地址栏，像原生小游戏）',
  '        也可以直接双击 game.html，效果一样，只是会有浏览器工具栏。',
  '',
  '完全离线：没有联网、没有广告、没有后端，存档在本机浏览器里。',
  '',
  '想装成快捷方式：双击 install.cmd（装到 %LOCALAPPDATA%\\ZhenZhenMengShou 并建桌面快捷方式）',
  '',
  '玩法：无限模式 / 限时 60 秒 / 15 关战役 / 今日挑战',
  '      敲一下 → 冲击波扩散 → 萌兽被掀起互撞 → 撞得够狠才合体',
  '      每关还有 💥 重锤 与 🧲 磁锤 各一次',
  '',
  '在线版：https://xcxi.github.io/shake-shake-beasts/',
  ''
].join('\r\n'), 'utf8');

/* 安装/卸载脚本：batch 里只放 ASCII，中文交给 PowerShell（用 base64 传递，彻底绕开编码问题） */
const installPs = `
$ErrorActionPreference='Stop'
$src=(Get-Location).Path
$dst=Join-Path $env:LOCALAPPDATA 'ZhenZhenMengShou'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
$ws=New-Object -ComObject WScript.Shell
$target=Join-Path $dst 'play.bat'
$icon=Join-Path $dst 'icon.ico'
$name='震震萌兽'
$desk=Join-Path ([Environment]::GetFolderPath('Desktop')) ($name+'.lnk')
$l=$ws.CreateShortcut($desk); $l.TargetPath=$target; $l.WorkingDirectory=$dst; $l.IconLocation=$icon+',0'; $l.Description=$name+' v${VERSION}'; $l.Save()
$sm=Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'
$l2=$ws.CreateShortcut((Join-Path $sm ($name+'.lnk'))); $l2.TargetPath=$target; $l2.WorkingDirectory=$dst; $l2.IconLocation=$icon+',0'; $l2.Description=$name+' v${VERSION}'; $l2.Save()
Start-Process -FilePath $target
Write-Host ('已安装到 ' + $dst)
`;
const uninstallPs = `
$dst=Join-Path $env:LOCALAPPDATA 'ZhenZhenMengShou'
$name='震震萌兽'
$desk=Join-Path ([Environment]::GetFolderPath('Desktop')) ($name+'.lnk')
$sm=Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'
Remove-Item -Force -ErrorAction SilentlyContinue $desk
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $sm ($name+'.lnk'))
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dst
Write-Host '已卸载'
`;
const b64 = (s) => Buffer.from(s, 'utf16le').toString('base64');
fs.writeFileSync(path.join(PORTABLE, 'install.cmd'), [
  '@echo off',
  'cd /d "%~dp0"',
  'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + b64(installPs),
  'exit /b 0',
  ''
].join('\r\n'), 'ascii');
fs.writeFileSync(path.join(PORTABLE, 'uninstall.cmd'), [
  '@echo off',
  'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + b64(uninstallPs),
  'exit /b 0',
  ''
].join('\r\n'), 'ascii');
log('便携版目录就绪：' + fs.readdirSync(PORTABLE).join(', '));

/* ---------------- 3) 便携版 zip ---------------- */
const zipName = 'ZhenZhenMengShou-' + VERSION + '-portable.zip';
execFileSync('tar.exe', ['-a', '-c', '-f', path.join(DIST, zipName), '-C', PORTABLE, '.'], { stdio: 'inherit' });
log('便携版压缩包：' + zipName + '  ' + fs.statSync(path.join(DIST, zipName)).size + ' 字节');

/* ---------------- 4) 用 csc 编译"自带图标的单文件自解压安装器" ---------------- */
/* IExpress 这条路试过了：只生成 makecab 的 DDF、静默模式下不产出 exe，所以改用 .NET 自带的 csc。
   安装器 = 内嵌便携版 zip（base64）+ 解压到临时目录 + 跑 install.cmd（负责拷到 LOCALAPPDATA、建快捷方式、启动） */
const exeName = 'ZhenZhenMengShou-Setup-' + VERSION + '.exe';
const exeOut = path.join(WORK, exeName);
const zipB64 = fs.readFileSync(path.join(DIST, zipName)).toString('base64');
const chunks = [];
for (let i = 0; i < zipB64.length; i += 7000) chunks.push('    "' + zipB64.slice(i, i + 7000) + '"');
const zh = (s) => s.split('').map((c) => c.charCodeAt(0) > 127 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c).join('');
const cs = `using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("ZhenZhenMengShou")]
[assembly: AssemblyProduct("ZhenZhenMengShou")]
[assembly: AssemblyCompany("ZhenZhenMengShou")]
[assembly: AssemblyDescription("${zh('震震萌兽 —— 冲击波连锁合成小游戏')}")]
[assembly: AssemblyVersion("${VERSION}.0")]
[assembly: AssemblyFileVersion("${VERSION}.0")]

static class Program
{
    static readonly string[] PAYLOAD = new string[]
    {
${chunks.join(',\n')}
    };

    [STAThread]
    static void Main()
    {
        try
        {
            string root = Path.Combine(Path.GetTempPath(), "zzms-setup-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            string appDir = Path.Combine(root, "app");
            Directory.CreateDirectory(appDir);
            string zip = Path.Combine(root, "app.zip");
            File.WriteAllBytes(zip, Convert.FromBase64String(string.Concat(PAYLOAD)));
            ZipFile.ExtractToDirectory(zip, appDir);
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c install.cmd");
            psi.WorkingDirectory = appDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            Process p = Process.Start(psi);
            p.WaitForExit();
            MessageBox.Show("${zh('安装完成，正在启动游戏。')}\\n\\n${zh('安装位置：')}%LOCALAPPDATA%\\\\ZhenZhenMengShou\\n${zh('卸载：运行该目录下的 uninstall.cmd')}",
                "${zh('震震萌兽')} v${VERSION}", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show("${zh('安装失败：')}" + ex.Message, "${zh('震震萌兽')}", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
`;
const csPath = path.join(WORK, 'installer.cs');
fs.writeFileSync(csPath, cs, 'ascii');
const csc = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const netDir = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
log('编译安装器（csc）…');
execFileSync(csc, [
  '/nologo', '/target:winexe', '/optimize+',
  '/win32icon:' + path.join(PORTABLE, 'icon.ico'),
  '/out:' + exeOut,
  '/r:' + path.join(netDir, 'System.IO.Compression.dll'),
  '/r:' + path.join(netDir, 'System.IO.Compression.FileSystem.dll'),
  '/r:' + path.join(netDir, 'System.Windows.Forms.dll'),
  csPath
], { stdio: 'inherit', cwd: WORK });
if (!fs.existsSync(exeOut)) throw new Error('csc 没有产出 exe');
fs.copyFileSync(exeOut, path.join(DIST, exeName));
log('安装包：' + exeName + '  ' + fs.statSync(path.join(DIST, exeName)).size + ' 字节');
log('\ndist 目录内容：');
for (const f of fs.readdirSync(DIST)) log('  ' + f + '  ' + fs.statSync(path.join(DIST, f)).size + ' 字节');
log('\n工作目录（可删）：' + WORK);
