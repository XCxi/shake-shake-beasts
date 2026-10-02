// 建 GitHub Release（GitHub 会顺手在 main 当前位置打上 v1.2.1 标签）
// uploads.github.com 在这个网络里不通，所以不传附件，改成在说明里链到仓库里的 dist/ 文件
const OWNER = 'XCxi', REPO = 'shake-shake-beasts', TAG = 'v1.2.1';
const TOKEN = process.env.GH_TOKEN;
const RAW = `https://github.com/${OWNER}/${REPO}/raw/main/dist/`;

const body = `## 震震萌兽 v1.2.1 —— 第一个正式版本号 + Windows 桌面版

🎮 **在线玩**：https://xcxi.github.io/shake-shake-beasts/ （手机点开即玩，不用下载）

### 📦 桌面版（Windows）
| 文件 | 说明 |
| --- | --- |
| [\`ZhenZhenMengShou-1.2.1-portable.zip\`](${RAW}ZhenZhenMengShou-1.2.1-portable.zip) | **免安装便携版**（38 KB）解压后双击 \`play.bat\` 即玩 |
| [\`ZhenZhenMengShou-Setup-1.2.1.exe\`](${RAW}ZhenZhenMengShou-Setup-1.2.1.exe) | **单文件安装包**（124 KB）装到 \`%LOCALAPPDATA%\\\\ZhenZhenMengShou\`，自动建桌面 + 开始菜单快捷方式 |

- 桌面版用 Edge/Chrome 的**应用模式**打开：没有地址栏、没有标签页，跟原生小游戏一样
- **完全离线可玩**：没有联网、没有广告、没有后端，存档在本机
- 打包只用系统自带工具（.NET csc 编译的自解压安装器），**不需要 Electron / 运行库**，所以只有 100KB 级（Electron 方案要 80MB）
- ⚠️ 安装包是**未签名**的 exe，Windows SmartScreen / Defender 可能提示拦截，选「更多信息 → 仍要运行」即可；不想折腾就用 zip 便携版（解压后双击 \`install.cmd\` 一样会建快捷方式）

### 本版内容
- 🏷️ 版本号正式进游戏（首页卡片副标题 + 控制台），并补齐 \`CHANGELOG.md\`
- 📦 桌面版产物 + 一键安装/卸载脚本 + 图标（自带 PNG/ICO 编码器生成，无外部依赖）
- 🐞 修复：自动敲击钩子不会自动进下一波（无尽模式跑到第 1 波就停）
- 🐞 修复：API 兜底推送脚本遇到中文文件名读不到文件（需 \`core.quotepath=false\`）

### 四种玩法
- **15 关战役**：分数到目标过关，1.6 倍目标 2 星、2.4 倍 3 星
- **♾️ 无尽模式**：第 16 波起目标分每波 ×1.15，输了结算，可「见好就收」
- **⏱ 限时 60 秒**：每 8 秒空投 12 只，拼一分钟能炸多少分（本机前 5 名榜）
- **🔥 今日挑战**：按日期固定局面

### 自检工具（都在 tools/）
\`\`\`
node tools/_test.js           # 物理不变量 + 4 策略 × 15 关平衡验收
node tools/_tools_test.cjs    # 特殊锤：受控方向测试 + 产出对比
node tools/_endless_test.cjs  # 无尽曲线 + 机器人跑到底
node tools/_timed_test.cjs    # 限时模式跑满 60 秒
node tools/build-desktop.mjs  # 一键重新打包桌面版
node tools/_verify_live.cjs   # 逐字节比对线上 Pages 与本地文件
\`\`\`
`;

(async () => {
  if (!TOKEN) { console.log('NO_TOKEN'); process.exit(1); }
  const list = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, { headers: { authorization: 'Bearer ' + TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'dsh' } });
  const existing = await list.json();
  if (Array.isArray(existing) && existing.some(r => r.tag_name === TAG)) {
    console.log('RELEASE_EXISTS ' + TAG); process.exit(0);
  }
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + TOKEN, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'dsh' },
    body: JSON.stringify({ tag_name: TAG, target_commitish: 'main', name: '震震萌兽 v1.2.1 · 桌面版 + 正式版本号', body: body, draft: false, prerelease: false })
  });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { }
  console.log('RELEASE ' + r.status + ' ' + (j ? (j.html_url + '  tag=' + j.tag_name) : t.slice(0, 300)));
})();
