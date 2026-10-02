// 当 github.com:443 推送不通、但 api.github.com 通时，用 Git Data API 把本地提交送上远端。
// 校验策略：
//   1) 每个改动文件的 blob sha 必须与本地一致（内容逐字节相同）
//   2) 拼出来的 tree sha 必须与本地 tree 一致（整棵目录树相同）
//   3) commit sha 若因 GitHub 规范化时间而有差异，则照远端元数据在本地重建同一对象，
//      把本地分支也对齐到那个 sha —— 这样本地/远端完全一致，不会留下"分叉"。
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OWNER = 'XCxi', REPO = 'shake-shake-beasts', BRANCH = 'main';
const TOKEN = process.env.GH_TOKEN;

/* 注意：必须关掉 core.quotepath，否则中文文件名会被转义成 \345... 导致读不到文件 */
const git = (args) => execSync('git -c core.quotepath=false ' + args, { cwd: ROOT, encoding: 'utf8' }).replace(/\n$/, '');
const raw = (args) => execSync('git -c core.quotepath=false ' + args, { cwd: ROOT, encoding: 'utf8' });

async function api(method, p, body) {
  const r = await fetch('https://api.github.com' + p, {
    method,
    headers: { 'user-agent': 'dsh-api-push', authorization: 'Bearer ' + TOKEN, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { }
  return { status: r.status, json: j, txt: t };
}
function gitDate(iso) {
  const m = String(iso).match(/(Z|[+-]\d{2}:\d{2})$/);
  const epoch = Math.floor(Date.parse(iso) / 1000);
  return epoch + ' ' + (m && m[1] !== 'Z' ? m[1].replace(':', '') : '+0000');
}

(async () => {
  if (!TOKEN) { console.log('NO_TOKEN'); process.exit(1); }
  const head = git('rev-parse HEAD');
  const parent = git('rev-parse HEAD~1');
  const localTree = git('show -s --format=%T HEAD');
  const parentTree = git('show -s --format=%T HEAD~1');
  console.log('本地 HEAD  ' + head);
  console.log('父提交     ' + parent);
  console.log('本地 tree  ' + localTree);

  const commitObj = raw('cat-file commit HEAD');
  const sep = commitObj.indexOf('\n\n');
  const headers = commitObj.slice(0, sep).split('\n');
  const message = commitObj.slice(sep + 2);
  const parseWho = (line) => { const m = line.match(/^(\w+) (.*) <(.*)> (\d+) ([+-]\d{4})$/); return { name: m[2], email: m[3], ts: Number(m[4]), tz: m[5] }; };
  const author = parseWho(headers.find(l => l.startsWith('author ')));
  const committer = parseWho(headers.find(l => l.startsWith('committer ')));
  const iso = (w) => {
    /* 把 epoch+时区 正确转成 ISO（之前这里把 UTC 当成了本地时间，差了 8 小时 → SHA 对不上） */
    const sign = w.tz[0] === '-' ? -1 : 1;
    const offMin = sign * (Number(w.tz.slice(1, 3)) * 60 + Number(w.tz.slice(3, 5)));
    const shifted = new Date((w.ts + offMin * 60) * 1000).toISOString().slice(0, 19);
    return shifted + w.tz.slice(0, 3) + ':' + w.tz.slice(3);
  };
  console.log('author 时间 ' + iso(author) + '  (epoch ' + author.ts + ' ' + author.tz + ')');

  const refRes = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const remoteHead = refRes.json && refRes.json.object && refRes.json.object.sha;
  let allowForce = false;
  if (remoteHead === parent) { console.log('\n远端 main  ' + remoteHead + '  ✅ 正好是父提交'); }
  else if (remoteHead === head) { console.log('\n远端已经就是这个提交，收工'); process.exit(0); }
  else {
    /* 远端可能是上一次"时间戳算错"的同内容提交：只要 tree 相同就允许覆盖（内容未变） */
    const rc = await api('GET', `/repos/${OWNER}/${REPO}/git/commits/${remoteHead}`);
    const rt = rc.json && rc.json.tree && rc.json.tree.sha;
    console.log('\n远端 main  ' + remoteHead + '  远端 tree ' + rt);
    if (rt === localTree) { allowForce = true; console.log('  远端内容与本地 tree 完全相同（只是提交时间戳不同）→ 允许覆盖引用'); }
    else { console.log('  远端和本地内容不一致，人工处理，停止'); process.exit(2); }
  }

  const changed = git('diff --name-only HEAD~1 HEAD').split('\n').filter(Boolean);
  console.log('\n变更文件 ' + changed.length + ' 个：' + changed.join(', '));
  const treeEntries = [];
  for (const f of changed) {
    const content = fs.readFileSync(path.join(ROOT, f));
    const localBlob = git('rev-parse HEAD:' + f);
    const up = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content: content.toString('base64'), encoding: 'base64' });
    const sha = up.json && up.json.sha;
    const ok = sha === localBlob;
    console.log('  blob ' + f.padEnd(28) + ' ' + sha + (ok ? '  ✅与本地一致' : '  ❌与本地不符 ' + localBlob));
    if (!ok) { console.log('blob 不一致，停止'); process.exit(3); }
    const mode = git('ls-tree HEAD -- ' + JSON.stringify(f)).split(/\s+/)[0];
    treeEntries.push({ path: f, mode: mode || '100644', type: 'blob', sha: sha });
  }

  const treeRes = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: parentTree, tree: treeEntries });
  const newTree = treeRes.json && treeRes.json.sha;
  console.log('\n新 tree ' + newTree + (newTree === localTree ? '  ✅与本地 tree 一致（整棵树逐字节相同）' : '  ❌与本地 tree 不符'));
  if (newTree !== localTree) { console.log('tree 不一致，停止'); process.exit(4); }

  const commitRes = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: message, tree: newTree, parents: [parent],
    author: { name: author.name, email: author.email, date: iso(author) },
    committer: { name: committer.name, email: committer.email, date: iso(committer) }
  });
  const newCommit = commitRes.json && commitRes.json.sha;
  console.log('新提交 ' + newCommit + (newCommit === head ? '  ✅与本地 HEAD 完全一致' : '  ⚠ 与本地 HEAD 不同（GitHub 规范化了时间，内容仍相同）'));

  const upd = await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: newCommit, force: !!allowForce });
  console.log('更新远端 ref: ' + upd.status + (upd.status < 300 ? '  ✅ 已推送' : '  ' + upd.txt.slice(0, 200)));
  if (upd.status >= 300) process.exit(6);

  // 让本地也对齐到远端那个提交对象（重建对象 → 校验 sha → 移动分支指针）
  const got = await api('GET', `/repos/${OWNER}/${REPO}/git/commits/${newCommit}`);
  const g = got.json;
  const obj = 'tree ' + g.tree.sha + '\n' +
    (g.parents || []).map(p => 'parent ' + p.sha + '\n').join('') +
    'author ' + g.author.name + ' <' + g.author.email + '> ' + gitDate(g.author.date) + '\n' +
    'committer ' + g.committer.name + ' <' + g.committer.email + '> ' + gitDate(g.committer.date) + '\n\n' +
    g.message;
  const w = spawnSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: ROOT, input: obj, encoding: 'utf8' });
  const rebuilt = (w.stdout || '').trim();
  console.log('\n本地重建该提交对象: ' + rebuilt + (rebuilt === newCommit ? '  ✅ 与远端 SHA 完全一致' : '  ❌ 重建不符，本地指针不动'));
  if (rebuilt === newCommit) {
    git('update-ref refs/heads/' + BRANCH + ' ' + newCommit + ' ' + head);
    execSync('git update-ref refs/remotes/origin/' + BRANCH + ' ' + newCommit, { cwd: ROOT });
    execSync('git symbolic-ref HEAD refs/heads/' + BRANCH, { cwd: ROOT });
    console.log('本地分支已对齐：' + git('rev-parse HEAD'));
    console.log('git status: ' + (git('status --porcelain') || '(干净)'));
    console.log('git log: ' + git('log --oneline -1'));
  }
  console.log('\n推送完成 ✅ 远端 main = ' + newCommit);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
