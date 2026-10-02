// 生成 Windows 桌面版：便携版 zip + 单文件安装包 exe（图标复用 tools/make-icon.mjs）
// 只依赖系统自带工具：tar（打 zip）、.NET csc（编译安装器）。不联网、不装 Electron。
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { makeIco } from './make-icon.mjs';

const VERSION = '1.2.1';
const REPO = path.join(import.meta.dirname, '..');
const DIST = path.join(REPO, 'dist');
const WORK = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'zzms-build');
const PORTABLE = path.join(WORK, 'portable');
const log = (...a) => console.log(...a);
const desktopDir = execSync('powershell -NoProfile -Command "[Environment]::GetFolderPath(\'Desktop\')"', { encoding: 'utf8' }).trim();

/* 1) 便携版目录 */
fs.rmSync(PORTABLE, { recursive: true, force: true });
fs.mkdirSync(PORTABLE, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });
fs.copyFileSync(path.join(REPO, 'index.html'), path.join(PORTABLE, 'game.html'));
fs.writeFileSync(path.join(PORTABLE, 'icon.ico'), makeIco());
log('图标：' + fs.statSync(path.join(PORTABLE, 'icon.ico')).size + ' 字节（含 16/32/48/64/128/256 六个尺寸）');

fs.writeFileSync(path.join(PORTABLE, 'play.bat'), [
  '@echo off', 'setlocal', 'cd /d "%~dp0"',
  'set "GAME=%~dp0game.html"',
  'set "URL=file:///%GAME:\\=/%"',
  'set "BROWSER="',
  'for %%P in ("%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe") do if not defined BROWSER if exist %%P set "BROWSER=%%~P"',
  'if defined BROWSER (start "" "%BROWSER%" --app="%URL%" --window-size=560,940) else (start "" "%GAME%")',
  'exit /b 0', ''
].join('\r\n'), 'ascii');

fs.writeFileSync(path.join(PORTABLE, 'README.txt'), '\uFEFF' + [
  '震震萌兽 v' + VERSION + ' 桌面版（便携）', '',
  '怎么玩：双击 play.bat —— 会用 Edge/Chrome 的应用模式打开，没有地址栏，像原生小游戏。',
  '        也可以直接双击 game.html（会有浏览器工具栏）。', '',
  '装快捷方式：双击 install.cmd —— 装到 %LOCALAPPDATA%\\ZhenZhenMengShou，并建桌面 + 开始菜单快捷方式。',
  '卸载：运行安装目录下的 uninstall.cmd。', '',
  '完全离线：不联网、无广告、无后端，存档在本机浏览器里。', '',
  '四种玩法：15 关战役 / 无尽模式 / 限时 60 秒 / 今日挑战',
  '核心操作：敲一下 → 冲击波扩散 → 萌兽被掀起来互撞 → 撞得够狠才合体',
  '每关还有 💥 重锤 与 🧲 磁锤 各一次', '',
  '在线版：https://xcxi.github.io/shake-shake-beasts/', ''
].join('\r\n'), 'utf8');

/* 安装/卸载：batch 里只放 ASCII，中文交给 PowerShell（base64 传递，彻底绕开编码问题） */
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
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Desktop')) ($name+'.lnk'))
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $env:APPDATA ('Microsoft\\Windows\\Start Menu\\Programs\\'+$name+'.lnk'))
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dst
Write-Host '已卸载'
`;
const b64 = (s) => Buffer.from(s, 'utf16le').toString('base64');
fs.writeFileSync(path.join(PORTABLE, 'install.cmd'), ['@echo off', 'cd /d "%~dp0"', 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + b64(installPs), 'exit /b 0', ''].join('\r\n'), 'ascii');
fs.writeFileSync(path.join(PORTABLE, 'uninstall.cmd'), ['@echo off', 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + b64(uninstallPs), 'exit /b 0', ''].join('\r\n'), 'ascii');
log('便携版目录：' + fs.readdirSync(PORTABLE).join(', '));

/* 2) 便携版 zip */
const zipName = 'ZhenZhenMengShou-' + VERSION + '-portable.zip';
execFileSync('tar.exe', ['-a', '-c', '-f', path.join(DIST, zipName), '-C', PORTABLE, '.'], { stdio: 'inherit' });
log('便携版：' + zipName + '  ' + fs.statSync(path.join(DIST, zipName)).size + ' 字节');

/* 3) csc 编译自带图标的单文件安装器（内嵌 zip，解压后跑 install.cmd） */
const exeName = 'ZhenZhenMengShou-Setup-' + VERSION + '.exe';
const exeOut = path.join(WORK, exeName);
const zipB64 = fs.readFileSync(path.join(DIST, zipName)).toString('base64');
const chunks = [];
for (let i = 0; i < zipB64.length; i += 7000) chunks.push('    "' + zipB64.slice(i, i + 7000) + '"');
const zh = (s) => s.split('').map((ch) => ch.charCodeAt(0) > 127 ? '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0') : ch).join('');
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
const netDir = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
log('编译安装器（.NET csc）…');
execFileSync(path.join(netDir, 'csc.exe'), [
  '/nologo', '/target:winexe', '/optimize+',
  '/win32icon:' + path.join(PORTABLE, 'icon.ico'),
  '/out:' + exeOut,
  '/r:' + path.join(netDir, 'System.IO.Compression.dll'),
  '/r:' + path.join(netDir, 'System.IO.Compression.FileSystem.dll'),
  '/r:' + path.join(netDir, 'System.Windows.Forms.dll'),
  csPath
], { stdio: 'inherit' });
if (!fs.existsSync(exeOut)) throw new Error('csc 没产出 exe');
fs.copyFileSync(exeOut, path.join(DIST, exeName));

/* 4) 同步一份到桌面（用系统给的桌面路径，兼容 OneDrive 重定向） */
const deskZip = path.join(desktopDir, '震震萌兽-桌面版-' + VERSION + '.zip');
const deskExe = path.join(desktopDir, '震震萌兽-安装包-' + VERSION + '.exe');
fs.copyFileSync(path.join(DIST, zipName), deskZip);
fs.copyFileSync(path.join(DIST, exeName), deskExe);
fs.copyFileSync(path.join(REPO, 'index.html'), path.join(desktopDir, '震震萌兽.html'));

log('\n产物：');
for (const f of fs.readdirSync(DIST)) log('  dist/' + f + '  ' + fs.statSync(path.join(DIST, f)).size + ' 字节');
log('  桌面/' + path.basename(deskZip) + '  ' + fs.statSync(deskZip).size + ' 字节');
log('  桌面/' + path.basename(deskExe) + '  ' + fs.statSync(deskExe).size + ' 字节');
log('  桌面/震震萌兽.html（已同步最新版）');
log('\n桌面路径：' + desktopDir);
