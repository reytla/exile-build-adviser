// Collect one public ladder build per class/ascendancy from poe.ninja, for testing.
// Copyright (c) 2026 reytla. MIT licence.
//   node tools/fetch-corpus.js <outDir> [league snapshot, default forbidden-rites]
// Keep the output OUTSIDE the project folder: these are other players' characters.
// The search endpoint returns protobuf; names and accounts are scraped from its strings,
// so pairing is a heuristic and a few ascendancies may be skipped.
'use strict';
const fs = require('fs'), path = require('path');
const snap = require('../data/snapshot.json');
const [outDir, OV = 'forbidden-rites'] = process.argv.slice(2);
if (!outDir) { console.error('usage: node tools/fetch-corpus.js <outDir> [snapshot]'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error(r.status + ' ' + u); return r; };
function firstPairs(buf) {
  const s = buf.toString('utf8').match(/[\x20-\x7e]{2,}/g);
  const ni = s.findIndex(x => x.startsWith('name ')), ai = s.findIndex(x => x.startsWith('account '));
  const clean = x => x.replace(/[:"*<|]?$/, '').replace(/[^\w\-]+$/, '');
  return { names: s.slice(ni + 1, ni + 6).map(clean), accounts: s.slice(ai + 1, ai + 6).map(clean) };
}
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const idx = await (await get('https://poe.ninja/poe2/api/data/index-state')).json();
  const V = (idx.snapshotVersions.find(s => s.snapshotName === OV) || {}).version;
  if (!V) throw new Error('No snapshot named ' + OV);
  const ascs = snap.classes.flatMap(c => c.ascendancies.map(a => a)).concat(snap.classes.map(c => c.name));
  for (const asc of ascs) {
    const file = path.join(outDir, asc.replace(/\W+/g, '_') + '.txt');
    if (fs.existsSync(file)) continue;
    try {
      const pb = Buffer.from(await (await get(`https://poe.ninja/poe2/api/builds/${V}/search?overview=${OV}&type=exp&class=${encodeURIComponent(asc)}`)).arrayBuffer());
      const { names, accounts } = firstPairs(pb);
      await sleep(1200);
      let ok = false;
      for (const [ni, ai] of [[0, 1], [1, 0], [1, 2], [2, 1], [3, 3], [0, 2]]) {
        if (ok) break;
        try {
          const j = await (await get(`https://poe.ninja/poe2/api/builds/${V}/character?account=${encodeURIComponent(accounts[ai])}&name=${encodeURIComponent(names[ni])}&overview=${OV}`)).json();
          if (j.pathOfBuildingExport) { fs.writeFileSync(file, j.pathOfBuildingExport); console.log(asc.padEnd(24), '->', j.class, j.level); ok = true; }
        } catch (e) { /* try the next pairing */ }
        await sleep(1200);
      }
      if (!ok) console.log(asc.padEnd(24), '-> skipped');
    } catch (e) { console.log(asc, 'search failed:', e.message); await sleep(1200); }
  }
})().catch(e => { console.error(e); process.exit(1); });
