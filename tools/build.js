// Build the single-file page.
// Copyright (c) 2026 reytla. MIT licence.
//   node tools/build.js            download fresh PoB data, rebuild snapshot and page
//   node tools/build.js --offline  reuse data/snapshot.json, only rebuild the page
// Output: poe2-advisor.html in the project folder (open it directly in a browser).
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../src/pobdata.js');

const ROOT = path.join(__dirname, '..');
const SNAP = path.join(ROOT, 'data', 'snapshot.json');
const OUT = path.join(ROOT, 'poe2-advisor.html');
const TREE_VERSION = process.env.TREE_VERSION || '0_5';
const REPO = 'PathOfBuildingCommunity/PathOfBuilding-PoE2';

async function text(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'poe2-advisor-build' } });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return r.text();
}

async function buildSnapshot() {
  const t0 = Date.now();
  const { tree, gems, skills, bases } = await P.fetchAll(TREE_VERSION, text, f => process.stdout.write(`  ${f}\n`));
  let commit = {}, pobVersion;
  try {
    const c = JSON.parse(await text(`https://api.github.com/repos/${REPO}/commits?sha=dev&per_page=1`))[0];
    commit = { sha: c.sha, date: c.commit.committer.date };
  } catch (e) { console.warn('  commit lookup failed:', e.message); }
  try {
    pobVersion = (await text(`https://raw.githubusercontent.com/${REPO}/dev/manifest.xml`)).match(/Version number="([^"]+)"/)[1];
  } catch (e) { console.warn('  manifest lookup failed:', e.message); }
  const meta = {
    source: P.BASE, treeVersion: TREE_VERSION, pobVersion,
    commit: commit.sha, commitDate: commit.date, fetched: new Date().toISOString(),
  };
  const snap = P.assemble(tree, gems, skills, meta, bases);
  fs.mkdirSync(path.dirname(SNAP), { recursive: true });
  fs.writeFileSync(SNAP, JSON.stringify(snap));
  console.log(`snapshot: ${Object.keys(snap.nodes).length} nodes, ${Object.keys(snap.bases).length} item bases, ${Object.keys(snap.skills).length} skills, ` +
    `${(fs.statSync(SNAP).size / 1e6).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

function buildPage() {
  const src = p => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8');
  // Escape "</" so embedded JSON/JS cannot close the <script> element early.
  const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');
  let html = src('index.html');
  html = html.replace(/<!--INLINE:([\w.-]+)-->/g, (_, f) =>
    f.endsWith('.css') ? `<style>\n${src(f)}\n</style>` : `<script>\n${safe(src(f))}\n</script>`);
  const snap = fs.readFileSync(SNAP, 'utf8');
  html = html.replace('<!--SNAPSHOT-->', () => `<script id="snapshot" type="application/json">${safe(snap)}</script>`);
  // Optional example build for the "Try an example build" button.
  const EX = path.join(ROOT, 'data', 'example-build.txt');
  const ex = fs.existsSync(EX) ? fs.readFileSync(EX, 'utf8').trim().replace(/[^A-Za-z0-9+/=_-]/g, '') : '';
  html = html.replace('<!--EXAMPLE-->', ex ? `<script id="example" type="text/plain">${ex}</script>` : '');
  // Setup sheet: one source (docs/pob-setup.html) for the shareable sheet and the in-app page.
  const SETUP = path.join(ROOT, 'docs', 'pob-setup.html');
  const setup = fs.existsSync(SETUP) ? (fs.readFileSync(SETUP, 'utf8').match(/<main[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '' : '';
  html = html.replace('<!--SETUP-->', () => setup.replace(/<p class="foot">[\s\S]*?<\/p>/, ''));
  fs.writeFileSync(OUT, html);
  console.log(`page: ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
}

(async () => {
  if (!process.argv.includes('--offline')) await buildSnapshot();
  buildPage();
})().catch(e => { console.error(e); process.exit(1); });
