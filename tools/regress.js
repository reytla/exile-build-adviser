// Browser regression: load every build code into the built page in headless Chrome.
// Copyright (c) 2026 reytla. MIT licence.
//   node tools/build.js --offline && node tools/regress.js <dir of .txt build codes> [tmpDir]
// For each code it makes a copy of poe2-advisor.html that pastes the code and clicks
// "Read my build", then reads the page title: "OK n findings", "BAD <message>" or "ERR <js error>".
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [dir, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eba-'))] = process.argv.slice(2);
const page = fs.readFileSync(path.join(__dirname, '../poe2-advisor.html'), 'utf8');
const files = [path.join(__dirname, '../data/example-build.txt'), ...(dir ? fs.readdirSync(dir).map(f => path.join(dir, f)) : [])];
let fails = 0;
for (const f of files) {
  const code = fs.readFileSync(f, 'utf8').trim();
  const html = page.replace('</body>', `<script>window.onerror=(m,s,l)=>{document.title="ERR "+m+" @"+l};
document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{document.getElementById("code").value=${JSON.stringify(code)};document.getElementById("decodeBtn").click();
setTimeout(()=>{const n=document.querySelector('#charMsg .note');if(n&&n.classList.contains('bad'))document.title='BAD '+n.textContent;else if(!document.title.startsWith('ERR'))document.title='OK '+document.querySelectorAll('#tab-checkup .finding').length+' findings';},1500)},50));</script></body>`);
  const out = path.join(tmp, 'regress.html');
  fs.writeFileSync(out, html);
  let title = '';
  try {
    const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=6000', `--user-data-dir=${path.join(tmp, 'profile')}`, '--dump-dom', 'file:///' + out.replace(/\\/g, '/')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });
    title = (dom.match(/<title>([^<]*)/) || [])[1] || '';
  } catch (e) { title = 'CHROME FAILED ' + e.message; }
  if (!/^OK [1-9]/.test(title)) fails++;
  console.log(path.basename(f).padEnd(30), title);
}
console.log(`\nfailures: ${fails} of ${files.length}`);
process.exit(fails ? 1 : 0);
