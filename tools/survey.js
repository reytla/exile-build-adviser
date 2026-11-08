// Run the analysis and ranking on many builds and print every finding (no browser needed).
// Copyright (c) 2026 reytla. MIT licence.
//   node tools/survey.js <dir of .txt build codes> [filter]      add V=1 to print the "why" text
// Use it after changing a rule: read the output for false positives across classes.
'use strict';
const fs = require('fs'), path = require('path');
const C = require('../src/character.js'), A = require('../src/analysis.js'), PL = require('../src/plan.js');
const snap = require('../data/snapshot.json');
const [dir, filt = ''] = process.argv.slice(2);
(async () => {
  const files = [path.join(__dirname, '../data/example-build.txt'), ...(dir ? fs.readdirSync(dir).map(f => path.join(dir, f)) : [])].filter(f => f.includes(filt));
  let total = 0;
  for (const f of files) {
    try {
      const c = await C.load(fs.readFileSync(f, 'utf8'));
      const a = A.analyse(c, snap);
      const p = PL.plan(a, c, snap, { league: 'Standard' });
      total += p.ranked.length;
      console.log(`\n=== ${path.basename(f)}  ${c.ascendancy || c.className} L${c.level}  spirit est=${a.spirit.total} pob=${a.spirit.pob}`);
      for (const x of p.ranked) console.log(` #${x.rank} [${x.sev}/${x.certainty}] ${x.area}: ${x.title}${process.env.V ? '\n      ' + x.why : ''}`);
    } catch (e) { console.log(`\n=== ${path.basename(f)}  ERROR ${e.message}`); }
  }
  console.log(`\n${files.length} builds, ${total} findings`);
})();
