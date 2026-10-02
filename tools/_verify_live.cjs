// 线上验收 v1.1：Pages 服务的字节是否已经是新版 + 仓库文件是否齐全
const fs = require('fs'), path = require('path');
const LOCAL = path.join(__dirname, '..', 'index.html');
const URL = 'https://xcxi.github.io/shake-shake-beasts/';
const local = fs.readFileSync(LOCAL);
const sleep = ms => new Promise(s => setTimeout(s, ms));

(async () => {
  let ok = false;
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(URL, { redirect: 'follow' });
      const served = Buffer.from(await r.arrayBuffer());
      const same = served.length === local.length && served.equals(local);
      const html = served.toString('utf8');
      console.log('#' + (i + 1), 'HTTP', r.status, 'served=' + served.length + 'B local=' + local.length + 'B', 'BYTE_IDENTICAL=' + same);
      if (same) {
        console.log('新版功能自检：');
        console.log('  磁锤按钮 id=btnMagnet :', html.indexOf('id="btnMagnet"') >= 0);
        console.log('  磁力碾压逻辑 mergeBoost:', html.indexOf('mergeBoost') >= 0);
        console.log('  星级 spread ★ repeat   :', html.indexOf("'★'.repeat(star)") >= 0);
        console.log('  选关地图 levelSelect   :', html.indexOf('function levelSelect') >= 0);
        console.log('  萌兽图鉴 gallery       :', html.indexOf('function gallery') >= 0);
        console.log('  无尽模式 startEndless  :', html.indexOf('function startEndless') >= 0 && html.indexOf('planForEndless') >= 0);
        console.log('  无尽曲线 1.15 复利     :', html.indexOf('ENDLESS_GROWTH=1.15') >= 0);
        console.log('  限时模式 startTimed    :', html.indexOf('function startTimed') >= 0 && html.indexOf('TIMED_SECONDS=60') >= 0);
        console.log('  限时空投 spawnBatch    :', html.indexOf('function spawnBatch') >= 0);
        console.log('  限时排行榜 zz_timed    :', html.indexOf("'zz_timed'") >= 0);
        ok = true; break;
      }
      console.log('   还有旧版缓存/构建中，20 秒后重试…');
    } catch (e) { console.log('#' + (i + 1), 'ERR', e.message); }
    await sleep(20000);
  }
  console.log(ok ? '\nLIVE_OK 线上已经是最新版' : '\nLIVE_NOT_YET 还在构建，稍后再看');

  const api = async p => { const r = await fetch('https://api.github.com' + p, { headers: { 'user-agent': 'dsh', accept: 'application/vnd.github+json' } }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const tools = await api('/repos/XCxi/shake-shake-beasts/contents/tools');
  console.log('TOOLS', (tools.j || []).map(f => f.name).join(' '));
  const docs = await api('/repos/XCxi/shake-shake-beasts/contents/docs');
  console.log('DOCS', (docs.j || []).map(f => f.name).join(' '));
  const c = await api('/repos/XCxi/shake-shake-beasts/commits?per_page=3');
  (c.j || []).forEach(x => console.log('  ' + x.sha.slice(0, 7) + ' ' + x.commit.message.split('\n')[0]));
})();
