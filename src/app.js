// Exile Build Advisor: page logic.
// Copyright (c) 2026 reytla. MIT licence.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? 'unknown' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));
  const STORE = 'eba.v1', SNAP_STORE = 'eba.snapshot', THEME_STORE = 'eba.theme';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  // ---------- plain-language glossary ----------
  const GLOSSARY = {
    resist: 'Resistances reduce damage of that element. They are capped at 75%, and anything below the cap means you take noticeably more damage. Later acts and the endgame lower them further, so players aim to reach the cap.',
    chaos: 'Chaos resistance works like the elemental ones (cap 75%) but is harder to find on gear, so most characters raise it later.',
    life: 'Life is your health. If it reaches zero you die.',
    es: 'Energy shield is a second health bar on top of life. It absorbs damage first and recharges by itself when you avoid damage for a short time.',
    mana: 'Mana pays for most skills. If you run out you cannot use them. Regeneration is how much mana you get back each second.',
    spirit: 'Spirit is a budget for skills that stay switched on (buffs, auras, minions, "Cast on…" gems). Each one reserves part of it. You cannot reserve more than you have.',
    ehp: 'Effective health is Path of Building\'s estimate of how much raw damage you can take before dying, after your resistances and defences.',
    dps: 'Damage per second of the skill marked as "main skill" in Path of Building, using its settings. It is an estimate, not a measurement.',
    support: 'Support gems are socketed together with a skill and change how it works. Most of them also make the skill cost more mana. The percentage shows that increase.',
    meta: 'A meta gem holds other skills and uses them for you, for example "Cast on Critical" casts its spells when you land critical hits. Supports in that group apply to the skills inside.',
    cost: 'What one use of the skill costs, read from the game data at your gem level. With supports, the cost is multiplied by every support\'s cost increase.',
    attrs: 'Strength, dexterity and intelligence. Gems and gear need a minimum amount; if you are below it, they stop working.',
    passives: 'Passive skill points you have spent on the tree. Notables are larger named nodes; keystones change rules in a big way.',
    ascendancy: 'Your ascendancy class gives strong bonuses. You earn its points by completing the Trials.',
    weaponset: 'You can switch between two weapon sets. Some passive points apply only while a particular set is equipped.',
  };
  const hint = key => GLOSSARY[key] ? `<details class="hint"><summary aria-label="Explain">?</summary><div>${esc(GLOSSARY[key])}</div></details>` : '';

  // ---------- state ----------
  const S = {
    embedded: null, snap: null, snapSource: 'embedded',
    char: null, xml: null, tab: 'checkup', analysis: null, plan: null, filter: 'all', back: 'welcome',
    prefs: Object.assign({ code: '', extras: {}, sel: {}, goals: {}, prices: {}, sort: 'value' }, store.get(STORE) || {}),
  };
  S.sort = S.prefs.sort || 'value';
  window.EBA = S; // handy for debugging in the browser console

  function loadSnapshot() {
    const el = document.getElementById('snapshot');
    S.embedded = el ? JSON.parse(el.textContent) : null;
    const cached = store.get(SNAP_STORE);
    if (cached && cached.meta && S.embedded && cached.meta.fetched > S.embedded.meta.fetched) { S.snap = cached; S.snapSource = 'refreshed'; }
    else { S.snap = S.embedded; S.snapSource = 'embedded'; }
    renderBadge();
  }
  function renderBadge() {
    const m = S.snap?.meta || {};
    $('#dataBadge').textContent = S.snap ? `Game data · ${(m.commitDate || m.fetched || '').slice(0, 10)}${S.snapSource === 'refreshed' ? ' · refreshed' : ''}` : 'No game data';
  }
  const skill = id => (S.snap && id ? S.snap.skills[id] : undefined);
  const node = id => (S.snap ? S.snap.nodes[id] : undefined);

  // ---------- theme ----------
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    const label = t === 'light' ? 'Light theme (click for dark)' : t === 'dark' ? 'Dark theme (click to follow system)' : 'Theme follows your system (click for light)';
    $('#themeBtn').title = label; $('#themeBtn').setAttribute('aria-label', label);
  }
  function cycleTheme() {
    const cur = store.get(THEME_STORE) || 'system';
    const next = cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system';
    store.set(THEME_STORE, next); applyTheme(next);
  }

  // ---------- views ----------
  function show(view) {
    $('#welcome').hidden = view !== 'welcome';
    $('#workspace').hidden = view !== 'workspace';
    $('#dataPage').hidden = view !== 'data';
    $('#aboutPage').hidden = view !== 'about';
    $('#tutorialPage').hidden = view !== 'tutorial';
    $('#setupPage').hidden = view !== 'setup';
    window.scrollTo(0, 0);
  }

  // ---------- your details ----------
  function savePrefs() { return store.set(STORE, S.prefs); }
  const EXTRA_IDS = ['league', 'eventLeague', 'levelOv', 'budget', 'budgetCur', 'spare', 'stash'];
  function bindExtras() {
    for (const id of EXTRA_IDS) {
      const el = document.getElementById(id);
      if (S.prefs.extras[id] != null) el.value = S.prefs.extras[id];
      el.addEventListener('input', () => {
        S.prefs.extras[id] = el.value;
        $('#savedNote').textContent = savePrefs() === false ? 'Could not save: this browser blocks storage.' : 'Saved in this browser only.';
        onExtrasChanged();
      });
    }
    onExtrasChanged();
  }
  function onExtrasChanged() {
    $('#eventLeagueRow').hidden = $('#league').value !== 'event';
    if (S.char) { renderBanner(); runAnalysis(); renderCheckup(); }
    const sp = PobPlan.parseSpare($('#spare').value);
    $('#spareNote').textContent = sp.unknown.length ? `Not understood: ${sp.unknown.join(', ')}. Write each line as a number and a name, like "12 exalted".` : '';
    const st = PobPlan.parseStash($('#stash').value);
    $('#stashNote').textContent = $('#stash').value.trim() ? `${st.length} item${st.length === 1 ? '' : 's'} read. Matching items show up in the check-up.` : '';
  }
  function extras() {
    const e = S.prefs.extras;
    return {
      league: e.league === 'event' ? (e.eventLeague || '').trim() || 'event league (name not set)' : 'Standard',
      level: e.levelOv ? Number(e.levelOv) : null,
      budget: e.budget ? Number(e.budget) : null,
      budgetCur: e.budgetCur || 'exalted',
      spare: e.spare || '', stash: e.stash || '',
    };
  }

  // ---------- reading a build ----------
  function msg(html, kind = 'info') { $('#charMsg').innerHTML = html ? `<div class="note ${kind}">${html}</div>` : ''; }

  async function readCharacter(code, keepSel) {
    if (!code.trim()) { msg('Paste the code from Path of Building first. Don’t have one yet? Click <b>Show me how to get it</b> above.', 'warn'); return; }
    msg('Reading your build…');
    try {
      S.xml = await PobChar.decodeExport(code);
      if (!keepSel || S.prefs.code !== code) S.prefs.sel = {};
      S.prefs.code = code; savePrefs();
      parseSelected(true);
    } catch (e) {
      msg(esc(e.message), 'bad');
      show('welcome');
    }
  }
  // Re-parse the decoded XML with the chosen tree / skill set / item set.
  function parseSelected(fresh) {
    try {
      const c = PobChar.parseBuild(S.xml, S.prefs.sel || {});
      if (!c.isPoe2) throw new Error('This code is from Path of Building for the first Path of Exile. Use the Path of Exile 2 version of Path of Building.');
      // A code generated before importing a character: nothing to check.
      const realNodes = (c.tree?.nodes || []).filter(id => { const n = node(id); return n && (n.s?.length || (n.f || []).includes('attr')); });
      if (!Object.keys(c.items || {}).length && !c.groups.some(g => g.gems.length) && !realNodes.length)
        throw new Error('This code is for an empty build: it was made before your character was imported. In Path of Building, open Import/Export Build, click Start if you see it, pick your league and character, click Passive Tree and Jewels and then Items and Skills. Then click Generate again, Copy, and paste the new code here.');
      S.char = c;
      msg('');
      renderAll();
      show('workspace');
      if (fresh) selectTab('checkup');
    } catch (e) {
      msg(esc(e.message), 'bad');
      show('welcome');
    }
  }
  function warnings(c) {
    const w = [];
    if (c.tree && S.snap && c.tree.version !== S.snap.meta.treeVersion)
      w.push(`Your build uses passive tree version ${esc(c.tree.version)}, but the game data here is version ${esc(S.snap.meta.treeVersion)}. Open <b>Game data</b> and refresh it so node names match.`);
    const missing = (c.tree?.nodes || []).filter(n => !node(n));
    if (missing.length) w.push(`${missing.length} passive node(s) are not in the game data and are shown as unknown.`);
    return w;
  }

  function runAnalysis() {
    try { S.analysis = PobAnalysis.analyse(S.char, S.snap, { level: extras().level }); }
    catch (e) { console.error(e); S.analysis = { findings: [], error: e.message }; }
    runPlan();
  }
  function runPlan() {
    if (!S.analysis || S.analysis.error) { S.plan = null; return; }
    const e = extras();
    const league = e.league === 'event league (name not set)' ? 'Standard' : e.league;
    try {
      S.plan = PobPlan.plan(S.analysis, S.char, S.snap, {
        goals: S.prefs.goals, prices: prices(), level: e.level, league,
        budget: e.budget, budgetCur: e.budgetCur, spareText: e.spare, stashText: e.stash });
      S.plan.league = league;
    } catch (err) { console.error(err); S.plan = null; }
  }
  function prices() {
    const out = {};
    for (const [k, v] of Object.entries(S.prefs.prices || {})) if (v !== '' && v != null && !isNaN(Number(v))) out[k] = Number(v);
    return out;
  }
  function renderPrices() {
    const el = $('#pricesBody'); if (!el) return;
    el.innerHTML = PobPlan.PRICES.map(([k, label, help]) => `<div class="price-row"><label for="price-${k}"><b>${esc(label)}</b><span class="small muted">${esc(help)}</span></label>
      <div class="inline"><input type="number" min="0" step="any" id="price-${k}" value="${esc(S.prefs.prices[k] ?? '')}" placeholder="unknown"><span class="small muted">exalted</span></div></div>`).join('');
    for (const inp of el.querySelectorAll('input')) inp.addEventListener('input', () => {
      S.prefs.prices[inp.id.slice(6)] = inp.value; savePrefs();
      if (S.char) { runPlan(); renderCheckup(); }
    });
  }
  function renderAll() {
    runAnalysis();
    renderBanner();
    renderCheckup();
    runGuide();
    renderGuide();
    renderOverview();
    $('#tab-skills').innerHTML = renderSkills(S.char);
    $('#tab-gear').innerHTML = renderGear(S.char);
    $('#tab-tree').innerHTML = renderTree(S.char);
    renderData($('#tab-data'));
  }

  // ---------- banner ----------
  function renderBanner() {
    const c = S.char, ex = extras(), ch = c.choices;
    const level = ex.level || c.level;
    const title = c.ascendancy || c.className;
    const pick = (key, label, list, cur) => list.length > 1 ? `<div><label for="sel-${key}">${label}</label><select id="sel-${key}" data-sel="${key}">${list.map((t, i) =>
      `<option value="${i + 1}"${i + 1 === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` : '';
    const pickers = pick('spec', 'Passive tree', ch.specs, ch.spec) + pick('skillSet', 'Skill set', ch.skillSets, ch.skillSet) + pick('itemSet', 'Item set', ch.itemSets, ch.itemSet);
    const w = warnings(c);
    $('#banner').innerHTML = `
      <div class="crest" aria-hidden="true"><span>${esc((c.className || '?')[0])}</span></div>
      <div class="banner-main">
        <h1>${esc(title)}</h1>
        <div class="banner-meta"><span>${esc(c.ascendancy ? c.className : 'No ascendancy yet')}</span><span>Level ${level}${ex.level && ex.level !== c.level ? ` (code says ${c.level})` : ''}</span><span>${esc(ex.league)}</span>
          <span>Main skill: ${esc(groupName(c.groups[c.mainSocketGroup - 1]) || 'not set')}</span></div>
        ${pickers ? '<p class="small muted" style="margin-top:6px">This code holds several versions of the build. Choose which one to review.</p>' : ''}
      </div>
      <div class="banner-side">${pickers}<button type="button" class="small" id="changeBuild">Change build</button></div>
      ${w.length ? `<div class="note warn" style="flex-basis:100%;margin-top:0">${w.join('<br>')}</div>` : ''}`;
    for (const el of $$('#banner select[data-sel]')) el.onchange = () => {
      S.prefs.sel = Object.assign({}, S.prefs.sel, { [el.dataset.sel]: Number(el.value) }); savePrefs(); parseSelected(false);
    };
    $('#changeBuild').onclick = () => show('welcome');
  }

  // ---------- check-up ----------
  const SEV_LABEL = { bad: 'Fix now', warn: 'Worth doing', info: 'Tip' };
  const CERT_LABEL = { likely: 'probably', check: 'check this' };
  const AREAS = ['Resistances', 'Health', 'Attributes', 'Spirit', 'Mana', 'Skills', 'Passive tree', 'Gear'];

  function findingCard(f) {
    const acts = (f.action || []).map(a => `<li>${esc(a)}</li>`).join('');
    const nodes = f.nodes && f.nodes.length > 1 ? `<details class="more"><summary>Show the ${f.nodes.length} passives</summary><div class="mods">${f.nodes.map(n => `<div><b>${esc(n.name)}</b>: ${esc((n.stats || []).join(' / '))}</div>`).join('')}</div></details>` : '';
    const links = (f.links || []).map(l => `<div class="trade"><a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>${l.note ? `<span class="small muted">${esc(l.note)}</span>` : ''}</div>`).join('');
    const craft = (f.craft || []).map(x => `<li>${esc(x)}</li>`).join('');
    const stash = (f.stash || []).length ? `<div class="note good" style="margin-top:8px"><b>In your stash:</b> ${f.stash.map(esc).join('<br>')}</div>` : '';
    const c = f.cost || {};
    const priceLabel = c.price ? (PobPlan.PRICES.find(p => p[0] === c.price) || [0, c.price])[1] : '';
    const money = c.price === 0 ? 'no currency'
      : f.ex != null ? `≈ ${fmt(f.ex, f.ex < 10 && f.ex % 1 ? 1 : 0)} exalted${c.qty > 1 ? ` (${c.qty} × ${esc(priceLabel.toLowerCase())})` : ''}`
      : c.price ? `price unknown: <button type="button" class="linkish small" data-goto="details">add a price for "${esc(priceLabel)}"</button>` : 'currency cost unknown';
    const pts = c.points < 0 ? `frees ${-c.points} passive point${c.points < -1 ? 's' : ''}` : c.points > 0 ? `${c.points} passive point${c.points > 1 ? 's' : ''}` : '';
    const flags = [f.overBudget ? '<span class="pill bad">over your budget</span>' : '', f.affordable ? '<span class="pill good">your spare currency covers it</span>' : ''].join(' ');
    const rank = S.sort === 'value' ? `<span class="rank" title="Rank by value for your goals and cost">#${f.rank}</span>` : '';
    const vp = Math.round((f.valuePct || 0) * 5);
    return `<article class="finding ${f.sev}">
      <div class="top">${rank}<span class="sev ${f.sev}">${SEV_LABEL[f.sev]}</span><span class="area">${esc(f.area)}</span>${CERT_LABEL[f.certainty] ? `<span class="cert" title="${f.certainty === 'check' ? 'The data cannot settle this. Check it in the game or in Path of Building.' : 'Very likely, but something the page cannot see could change it.'}">${CERT_LABEL[f.certainty]}</span>` : ''}
        <span class="meter" title="Value for your goals, compared with the other findings" role="img" aria-label="Value ${vp} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${vp >= i ? 'on' : ''}"></i>`).join('')}</span></div>
      <h3>${esc(f.title)}</h3>
      <dl class="rows">
        <dt>Why</dt><dd>${esc(f.why)}</dd>
        <dt>What it gains</dt><dd>${esc(f.effect || 'unknown')}${f.note ? ` ${esc(f.note)}` : ''}</dd>
        <dt>Cost</dt><dd>${money}${pts ? ' · ' + pts : ''} · ${esc(PobPlan.EFFORT[c.effort] || '')}${c.alt ? ` · ${esc(c.alt)}` : ''} ${flags}</dd>
        ${acts || links || craft ? `<dt>What to do</dt><dd>${acts ? `<ul>${acts}</ul>` : ''}${links}${craft ? `<ul class="craft">${craft}</ul>` : ''}${stash}${nodes}</dd>` : ''}
      </dl></article>`;
  }

  function goalsCard() {
    const g = (S.plan && S.plan.goals) || PobPlan.DEFAULT_GOALS;
    return `<details class="card goals" ${S.prefs.goalsOpen === false ? '' : 'open'} id="goalsBox">
      <summary><span class="card-title">What matters to you</span><span class="small muted">${PobPlan.GOALS.map(([k, n]) => `${n}: ${PobPlan.GOAL_LEVELS[g[k]]}`).join(' · ')}</span></summary>
      <p class="small muted" style="margin:6px 0 12px">The ranking puts fixes that help what you care about, for little cost, at the top.</p>
      <div class="goal-grid">${PobPlan.GOALS.map(([k, n, d]) => `<div class="goal"><div><b>${n}</b><div class="small muted">${d}</div></div>
        <div class="seg" role="radiogroup" aria-label="${n}">${PobPlan.GOAL_LEVELS.map((t, i) => `<button type="button" role="radio" aria-checked="${g[k] === i}" data-goal="${k}" data-v="${i}">${t}</button>`).join('')}</div></div>`).join('')}</div>
    </details>`;
  }

  function renderCheckup() {
    const el = $('#tab-checkup');
    const A = S.analysis || { findings: [] };
    if (A.error) { el.innerHTML = `<div class="note bad">The check-up could not run: ${esc(A.error)}. The other tabs still work.</div>`; return; }
    const PL = S.plan || { findings: A.findings, ranked: A.findings };
    const F = S.sort === 'value' ? PL.ranked : PL.findings;
    const n = k => F.filter(f => f.sev === k).length;
    const areaCount = a => F.filter(f => f.area === a).length;
    if (S.filter !== 'all' && !areaCount(S.filter)) S.filter = 'all';
    const shown = S.filter === 'all' ? F : F.filter(f => f.area === S.filter);
    const fine = AREAS.filter(a => !areaCount(a));
    const tally = [['bad', n('bad'), 'to fix now'], ['warn', n('warn'), 'worth doing'], ['info', n('info'), n('info') === 1 ? 'tip' : 'tips']]
      .filter(([, v]) => v).map(([k, v, t]) => `<span class="pill ${k === 'info' ? '' : k}">${v} ${t}</span>`).join('');
    const ex = extras();
    const money = [PL.budgetEx != null ? `Budget ≈ ${fmt(PL.budgetEx)} exalted` : PL.budgetUnknown ? 'Budget set, but its currency has no price yet' : '',
      PL.spareEx && PL.spareEx.ex ? `spare currency ≈ ${fmt(PL.spareEx.ex)} exalted` : ''].filter(Boolean).join(' · ');
    const missingPrices = PobPlan.PRICES.filter(([k]) => S.prefs.prices[k] == null || S.prefs.prices[k] === '').length;
    el.innerHTML = `
      ${goalsCard()}
      <div class="checkup-head">
        <div><h2 class="card-title">Check-up</h2>
          <p class="muted small">${F.length ? `${F.length} things found. Each says why it matters, what fixing it gains, what it costs and what to do.` : 'Nothing found that needs attention.'}</p></div>
        <div class="tally">${tally}</div>
      </div>
      <div class="toolbar">
        <div class="seg" role="radiogroup" aria-label="Order">
          <button type="button" role="radio" data-sort="value" aria-checked="${S.sort === 'value'}">Best value for you</button>
          <button type="button" role="radio" data-sort="sev" aria-checked="${S.sort !== 'value'}">Most serious first</button>
        </div>
        <span class="small muted">${money ? esc(money) + ' · ' : ''}Trade links search the <b>${esc(PL.league || ex.league)}</b> league.${missingPrices ? ` <button type="button" class="linkish small" data-goto="details">${missingPrices} price${missingPrices > 1 ? 's' : ''} not set</button>` : ''}</span>
      </div>
      ${F.length > 3 ? `<div class="filters" role="group" aria-label="Show findings for">
        <button type="button" data-f="all" aria-pressed="${S.filter === 'all'}">All<span class="n">${F.length}</span></button>
        ${AREAS.filter(areaCount).map(a => `<button type="button" data-f="${esc(a)}" aria-pressed="${S.filter === a}">${esc(a)}<span class="n">${areaCount(a)}</span></button>`).join('')}
      </div>` : ''}
      <div class="findings">${shown.map(findingCard).join('') || '<div class="card"><p class="muted">Nothing here.</p></div>'}</div>
      <div class="card" style="margin-top:18px">
        <h3 class="sub" style="margin-top:0">No problems found in</h3>
        <div class="fine-list">${fine.length ? fine.map(a => `<span class="pill good">${esc(a)}</span>`).join('') : '<span class="muted small">Every area has at least one finding.</span>'}</div>
        <details class="more" style="margin-top:12px"><summary>How the ranking works</summary><div class="small muted" style="margin-top:6px">
          <p><b>Value</b> grows with how serious a finding is and how much it helps the goals you rated above. Findings marked "probably" count a little less, and "check this" counts half.</p>
          <p style="margin-top:6px"><b>Cost</b> adds up effort (a few minutes, a short trade, or a play session), passive points spent, and currency. With a budget, spending all of it counts as 5; without one, every 10 exalted counts as 1. Unknown prices count as a middling cost.</p>
          <p style="margin-top:6px">The list is ordered by value divided by cost. Prices come only from your own price table, so they are as current as you make them.</p></div></details>
        <p class="small muted" style="margin-top:12px">"Probably" means very likely but not certain; "check this" means the page cannot settle it, so look in the game or in Path of Building. Effects that cannot be calculated are marked unknown. The trade site may ask you to sign in.</p>
      </div>`;
    for (const b of el.querySelectorAll('.filters button')) b.onclick = () => { S.filter = b.dataset.f; renderCheckup(); };
    for (const b of el.querySelectorAll('[data-sort]')) b.onclick = () => { S.sort = S.prefs.sort = b.dataset.sort; savePrefs(); renderCheckup(); };
    for (const b of el.querySelectorAll('[data-goal]')) b.onclick = () => {
      S.prefs.goals = Object.assign({}, PobPlan.DEFAULT_GOALS, S.prefs.goals, { [b.dataset.goal]: Number(b.dataset.v) }); savePrefs(); runPlan(); renderCheckup();
    };
    for (const b of el.querySelectorAll('[data-goto]')) b.onclick = () => selectTab(b.dataset.goto);
    $('#goalsBox').ontoggle = e => { S.prefs.goalsOpen = e.target.open; savePrefs(); };
  }

  // ---------- guide comparison ----------
  const GUIDE_DEFAULT = { code: '', text: '', title: '', updated: '', patch: '', currentPatch: '0.5.5', currentPatchDate: '2026-09-04', sel: {} };
  function guidePrefs() { return (S.prefs.guide = Object.assign({}, GUIDE_DEFAULT, S.prefs.guide || {})); }

  async function loadGuideChar() {
    const gp = guidePrefs();
    S.guideChar = null; S.guideErr = '';
    if (!gp.code.trim()) return;
    try {
      const xml = await PobChar.decodeExport(gp.code);
      const g = PobChar.parseBuild(xml, gp.sel || {});
      if (!g.isPoe2) throw new Error('This code is from Path of Building for the first Path of Exile.');
      S.guideChar = g;
    } catch (e) { S.guideErr = e.message; }
  }
  function runGuide() {
    const gp = guidePrefs();
    if (!S.char || (!S.guideChar && !gp.text.trim())) { S.guide = null; return; }
    const over = {};
    if (gp.title.trim()) over.title = gp.title.trim();
    if (gp.updated) over.updated = gp.updated;
    if (gp.patch.trim()) over.patch = gp.patch.trim();
    try { S.guide = PobGuide.compare(S.char, S.guideChar, gp.text, S.snap, { meta: over, currentPatch: gp.currentPatch.trim(), currentPatchDate: gp.currentPatchDate }); }
    catch (e) { console.error(e); S.guide = { error: e.message }; }
  }

  const chips = (arr, cls = '') => arr.length ? arr.map(n => `<span class="chip ${cls}">${esc(n)}</span>`).join('') : '<span class="muted small">none</span>';
  function guideResults() {
    const R = S.guide, gp = guidePrefs();
    if (!R) return `<div class="card"><p class="muted">Paste the guide's Path of Building code, its text, or both, then click <b>Compare</b>.</p></div>`;
    if (R.error) return `<div class="note bad">The comparison could not run: ${esc(R.error)}</div>`;
    const m = R.meta;
    const head = `<div class="card guide-meta ${R.outdated ? 'stale' : ''}">
      <div class="section-head"><h2 class="card-title">${esc(m.title || 'Your guide')}</h2><p>${R.source === 'text' ? 'Compared using the guide text' : R.source === 'code' ? 'Compared using the guide\'s build code' : 'Compared using the guide\'s build code and text'}</p></div>
      <dl class="kv">
        <dt>Last updated</dt><dd>${m.updated ? esc(m.updated) : '<span class="pill warn">unknown</span> Check the date on the guide page and enter it above.'}</dd>
        <dt>Written for patch</dt><dd>${m.patch ? esc(m.patch) : '<span class="pill warn">unknown</span> Enter it above if the guide says.'}</dd>
        <dt>Current game patch</dt><dd>${esc(gp.currentPatch || 'not set')}${gp.currentPatchDate ? `, released ${esc(gp.currentPatchDate)}` : ''}</dd>
      </dl>
      ${R.outdated ? `<div class="note bad"><b>This guide may be out of date.</b> ${R.freshness.map(esc).join(' ')}</div>` : m.patch || m.updated ? '<div class="note good">The guide is up to date with the current patch.</div>' : ''}
      ${R.classMismatch ? `<div class="note warn">${esc(R.classMismatch)} Differences below may come from that.</div>` : ''}
      ${S.guideChar && S.guideChar.level ? `<p class="small muted" style="margin-top:10px">The guide's code is a level ${S.guideChar.level} ${esc(S.guideChar.ascendancy || S.guideChar.className)}; you are level ${S.char.level}. Some differences are just stages of the same plan.</p>` : ''}
    </div>`;
    const sec = R.sections.map(s => {
      if (s.id === 'skills' && s.exact) {
        const order = { missing: 0, differs: 1, extra: 2, same: 3 };
        const rows = s.rows.slice().sort((a, b) => order[a.kind] - order[b.kind]).map(r => {
          if (r.kind === 'missing') return `<tr><td><b>${esc(r.skill)}</b></td><td><span class="pill warn">guide only</span></td><td>${chips(r.sups)}</td></tr>`;
          if (r.kind === 'extra') return `<tr class="dim"><td><b>${esc(r.skill)}</b></td><td><span class="pill">yours only</span></td><td>${chips(r.sups)}</td></tr>`;
          if (r.kind === 'same') return `<tr><td><b>${esc(r.skill)}</b></td><td><span class="pill good">matches</span></td><td></td></tr>`;
          return `<tr><td><b>${esc(r.skill)}</b></td><td><span class="pill warn">differs</span></td><td>${r.missing.length ? `<div class="small">Guide adds: ${chips(r.missing, 'add')}</div>` : ''}${r.extra.length ? `<div class="small">You add: ${chips(r.extra)}</div>` : ''}</td></tr>`;
        }).join('');
        return `<div class="card"><h2 class="card-title">${esc(s.title)}</h2><p class="small muted" style="margin-bottom:10px">Support tiers (I, II, III) count as the same support.</p>
          <div class="tbl-wrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Supports</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      }
      if (s.id === 'skills') return `<div class="card"><h2 class="card-title">${esc(s.title)}</h2>
        <p class="small muted" style="margin-bottom:10px">Names of gems found in the guide text. Text cannot tell which support goes with which skill; the guide's build code can.</p>
        <h3 class="sub">In the guide, not in your build</h3><p>${chips(s.guideOnly.acts, 'add')} ${chips(s.guideOnly.sups, 'add')}</p>
        <h3 class="sub">In your build, not mentioned in the guide text</h3><p>${chips(s.yoursOnly.acts)} ${s.yoursOnly.sups.length ? chips(s.yoursOnly.sups) : ''}</p>
        <p class="small muted" style="margin-top:8px">Many guides show gems as pictures, which do not copy as text. If a list looks short, use the guide's build code instead.</p></div>`;
      if (s.id === 'tree') {
        const pts = s.points ? `<p class="small muted" style="margin-bottom:10px">You have ${s.points.mine} points in the tree; the guide's code has ${s.points.theirs}${s.theirLevel ? ` at level ${s.theirLevel}` : ''}.</p>` : '';
        const exact = s.exact;
        return `<div class="card"><h2 class="card-title">${esc(s.title)}</h2>${pts}
          <h3 class="sub">Keystones the guide takes and you do not</h3><p>${chips(s.keystone.missing, 'add')}</p>
          ${exact ? `<h3 class="sub">Keystones you take and the guide does not</h3><p>${chips(s.keystone.extra)}</p>` : ''}
          <h3 class="sub">Notables the guide ${exact ? 'takes' : 'mentions'} and you do not</h3><p>${chips(s.notable.missing, 'add')}</p>
          ${exact ? `<h3 class="sub">Notables you take and the guide does not</h3><p>${chips(s.notable.extra)}</p><p class="small muted" style="margin-top:8px">These are respec candidates if you want to follow the guide closely. Notables you lack may just come later in the guide's plan.</p>` : `<p class="small muted" style="margin-top:8px">Already taken from the guide: ${s.notable.have.length + s.keystone.have.length}.</p>`}</div>`;
      }
      if (s.id === 'asc') return `<div class="card"><h2 class="card-title">${esc(s.title)}</h2>
        ${!s.sameClass ? `<div class="note warn">The guide is for ${esc(s.theirAsc)}.</div>` : ''}
        <p class="small muted" style="margin-bottom:10px">${s.fromText ? 'Order as the guide text first mentions them.' : 'From the guide\'s code, which does not record an order.'}</p>
        <ol class="asc-order">${s.order.map(n => `<li class="${s.taken.includes(n) ? 'done' : ''}">${esc(n)}${s.taken.includes(n) ? ' <span class="pill good">taken</span>' : n === s.next[0] ? ' <span class="pill warn">next</span>' : ''}</li>`).join('')}</ol>
        ${s.offPlan.length ? `<p class="small" style="margin-top:8px">You took ${chips(s.offPlan)}, which the guide does not ${s.fromText ? 'mention' : 'take'}.</p>` : ''}</div>`;
      if (s.id === 'gear') return `<div class="card"><h2 class="card-title">${esc(s.title)}</h2>
        ${s.priorities.length ? `<h3 class="sub">The guide's stat priorities, and where you have them</h3><div class="tbl-wrap"><table><tbody>${s.priorities.map((p, i) => `<tr><td class="num">${i + 1}</td><td><b>${esc(p.label)}</b></td><td>${p.slots.length ? `<span class="pill good">${p.slots.length} item${p.slots.length > 1 ? 's' : ''}</span> <span class="small muted">${esc(p.slots.join(', '))}</span>` : '<span class="pill warn">none of your gear</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">No stat priority list found in the text. The page looks for a heading such as "Stat priority" or "Affixes".</p>'}
        ${s.uniques ? `<h3 class="sub">Unique items in the guide's code</h3><p>${s.uniques.missing.length ? s.uniques.missing.map(u => `<span class="chip add">${esc(u.name)} <span class="small muted">${esc(u.slot)}</span></span>`).join('') : '<span class="muted small">You have every unique it uses.</span>'}</p>${s.uniques.have.length ? `<p class="small muted">You already have: ${s.uniques.have.map(esc).join(', ')}.</p>` : ''}` : ''}</div>`;
      return '';
    }).join('');
    return head + sec;
  }

  function renderGuide() {
    const el = $('#tab-guide'); if (!el) return;
    const gp = guidePrefs();
    const ch = S.guideChar && S.guideChar.choices;
    const pick = (key, label, list, cur) => list && list.length > 1 ? `<div><label class="field-label" for="gsel-${key}">${label}</label><select id="gsel-${key}" data-gsel="${key}">${list.map((t, i) => `<option value="${i + 1}"${i + 1 === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` : '';
    const pickers = ch ? pick('spec', 'Guide passive tree', ch.specs, ch.spec) + pick('skillSet', 'Guide skill set', ch.skillSets, ch.skillSet) + pick('itemSet', 'Guide item set', ch.itemSets, ch.itemSet) : '';
    el.innerHTML = `<div class="cols-2 guide-cols">
      <div class="card">
        <h2 class="card-title">Compare with a guide</h2>
        <p class="small muted">Use either input, or both. Everything stays in this browser.</p>
        <label class="field-label" for="gCode">The guide's Path of Building code</label>
        <textarea id="gCode" rows="3" spellcheck="false" placeholder="On the guide page, find the Path of Building button for the stage you are at, copy the code and paste it here.">${esc(gp.code)}</textarea>
        ${S.guideErr ? `<div class="note bad">${esc(S.guideErr)}</div>` : ''}
        ${pickers ? `<p class="small muted" style="margin-top:8px">The guide's code holds several stages. Choose the one closest to where you are.</p><div class="form-grid">${pickers}</div>` : ''}
        <label class="field-label" for="gText">The guide's text</label>
        <textarea id="gText" rows="6" placeholder="Select the guide page (Ctrl+A), copy it (Ctrl+C) and paste it here. The page reads the date, patch, ascendancy order, stat priorities and gem and passive names from it.">${esc(gp.text)}</textarea>
        <div class="form-grid" style="margin-top:4px">
          <div><label class="field-label" for="gUpdated">Guide last updated</label><input type="date" id="gUpdated" value="${esc(gp.updated)}"><p class="help">Blank: read from the text${S.guide?.meta?.updated && !gp.updated ? ` (${esc(S.guide.meta.updated)})` : ''}.</p></div>
          <div><label class="field-label" for="gPatch">Guide written for patch</label><input type="text" id="gPatch" value="${esc(gp.patch)}" placeholder="${esc(S.guide?.meta?.patch || 'e.g. 0.5.5')}"><p class="help">Blank: read from the text.</p></div>
          <div><label class="field-label" for="gCur">Current game patch</label><input type="text" id="gCur" value="${esc(gp.currentPatch)}"></div>
          <div><label class="field-label" for="gCurDate">Released on</label><input type="date" id="gCurDate" value="${esc(gp.currentPatchDate)}"></div>
        </div>
        <div class="actions"><button type="button" class="primary" id="gCompare">Compare</button>${gp.code || gp.text ? '<button type="button" id="gClear">Clear guide</button>' : ''}</div>
      </div>
      <div class="card">
        <h2 class="card-title">Where to find these</h2>
        <ol class="steps compact">
          <li><b>Open your guide</b> in the browser, for example on maxroll.gg, and check it is for your class and ascendancy.</li>
          <li><b>Build code:</b> most guides have a <i>Path of Building</i> or <i>PoB</i> button, sometimes one per stage (levelling, early maps, endgame). Copy the code for the stage nearest your level.</li>
          <li><b>Text:</b> press Ctrl+A then Ctrl+C on the guide page and paste. Pictures (like gem panels) do not copy; the build code covers those.</li>
          <li><b>Date and patch:</b> guides show "Last updated" near the top. If the page cannot find it, type it in.</li>
        </ol>
      </div>
    </div>
    <div class="guide-results">${guideResults()}</div>`;
    const save = () => {
      Object.assign(gp, { code: $('#gCode').value.trim(), text: $('#gText').value, updated: $('#gUpdated').value, patch: $('#gPatch').value, currentPatch: $('#gCur').value, currentPatchDate: $('#gCurDate').value });
      S.prefs.guide = gp;
      if (!savePrefs()) console.warn('guide not saved');
    };
    $('#gCompare').onclick = async () => {
      const codeChanged = $('#gCode').value.trim() !== gp.code;
      save(); if (codeChanged) gp.sel = {};
      $('#gCompare').disabled = true;
      await loadGuideChar(); runGuide(); renderGuide();
    };
    const clr = $('#gClear');
    if (clr) clr.onclick = () => { S.prefs.guide = Object.assign({}, GUIDE_DEFAULT, { currentPatch: gp.currentPatch, currentPatchDate: gp.currentPatchDate }); savePrefs(); S.guideChar = null; S.guide = null; S.guideErr = ''; renderGuide(); };
    for (const s of el.querySelectorAll('select[data-gsel]')) s.onchange = async () => {
      gp.sel = Object.assign({}, gp.sel, { [s.dataset.gsel]: Number(s.value) }); S.prefs.guide = gp; savePrefs();
      await loadGuideChar(); runGuide(); renderGuide();
    };
  }

  // ---------- overview ----------
  const RES = [['Fire', 'FireResist', 'var(--fire)'], ['Cold', 'ColdResist', 'var(--cold)'], ['Lightning', 'LightningResist', 'var(--lightning)'], ['Chaos', 'ChaosResist', 'var(--chaos)']];
  const CAP = 75;

  function glanceRows(c) {
    const st = c.stats, rows = [];
    const ele = RES.slice(0, 3).filter(([, k]) => st[k] != null);
    if (ele.length) {
      const capped = ele.filter(([, k]) => st[k] >= CAP).length;
      rows.push({
        pill: capped === ele.length ? ['good', 'All capped'] : capped ? ['warn', `${capped} of ${ele.length} capped`] : ['bad', 'None capped'],
        t: 'Elemental resistances', h: 'resist',
        d: ele.map(([n, k]) => `${n} ${fmt(st[k])}%`).join(', ') + `. The cap is ${CAP}%.`,
      });
    }
    if (st.ChaosResist != null) rows.push({ pill: st.ChaosResist >= CAP ? ['good', 'Capped'] : ['', `${fmt(st.ChaosResist)}%`], t: 'Chaos resistance', h: 'chaos', d: `${fmt(st.ChaosResist)}% of the ${CAP}% cap.` });
    const pool = [st.Life ? `${fmt(st.Life)} life` : null, st.EnergyShield ? `${fmt(st.EnergyShield)} energy shield` : null, st.Ward ? `${fmt(st.Ward)} ward` : null].filter(Boolean);
    if (pool.length) rows.push({ pill: ['', fmt((st.Life || 0) + (st.EnergyShield || 0))], t: 'Health pool', h: st.EnergyShield ? 'es' : 'life', d: pool.join(' + ') + (st.TotalEHP ? `. Path of Building estimates ${fmt(st.TotalEHP)} effective health.` : '.') });
    if (st.Spirit != null) {
      const free = st.SpiritUnreserved;
      rows.push({ pill: free == null ? ['', 'unknown'] : free < 0 ? ['bad', 'Over budget'] : free === 0 ? ['warn', 'All used'] : ['good', `${fmt(free)} free`], t: 'Spirit', h: 'spirit',
        d: `${fmt(st.Spirit)} in total${free != null ? `, ${fmt(free)} not reserved (Path of Building's figure)` : ''}.` });
    }
    if (st.Mana) rows.push({ pill: ['', `${fmt(st.ManaRegenRecovery, 1)}/s`], t: 'Mana', h: 'mana', d: `${fmt(st.Mana)} mana, regenerating ${fmt(st.ManaRegenRecovery, 1)} per second.` });
    const dps = firstStat(st, ['FullDPS', 'CombinedDPS', 'TotalDPS', 'TotalDotDPS']);
    rows.push(dps
      ? { pill: ['', fmt(dps.v)], t: 'Damage', h: 'dps', d: `Path of Building calculated ${fmt(dps.v)} damage per second for ${esc(groupName(c.groups[c.mainSocketGroup - 1]) || 'the main skill')}.` }
      : { pill: ['warn', 'Unknown'], t: 'Damage', h: 'dps', d: 'Path of Building did not calculate damage for the main skill, so damage changes will be marked unknown. Choosing your main attack or spell as "Main Skill" in Path of Building before copying the code fixes this.' });
    const short = [['Str', 'strength'], ['Dex', 'dexterity'], ['Int', 'intelligence']].filter(([k]) => st['Req' + k] > st[k]);
    rows.push(short.length
      ? { pill: ['bad', 'Not met'], t: 'Attribute requirements', h: 'attrs', d: short.map(([k, n]) => `${n} ${fmt(st[k])} of ${fmt(st['Req' + k])} needed`).join(', ') + '. Gems or gear above your attributes do not work.' }
      : { pill: ['good', 'Met'], t: 'Attribute requirements', h: 'attrs', d: 'Your strength, dexterity and intelligence cover all equipped gems and gear.' });
    return rows;
  }

  function renderOverview() {
    const c = S.char, st = c.stats;
    const glance = glanceRows(c).map(r => `<div class="glance-row"><span class="pill ${r.pill[0]}">${r.pill[1]}</span>
      <div><span class="t">${r.t}</span>${hint(r.h)}</div><div class="d">${r.d}</div></div>`).join('');

    const dps = firstStat(st, ['FullDPS', 'CombinedDPS', 'TotalDPS', 'TotalDotDPS']);
    const offence = [
      ['Damage per second', dps ? dps.v : null, dps ? 'main skill, Path of Building' : '', 'dps'],
      ['Average hit', st.AverageHit || st.AverageDamage, ''],
      ['Uses per second', st.Speed, '', null, 2],
      ['Critical chance', st.CritChance, 'percent', null, 1],
      ['Hit chance', st.HitChance && st.HitChance < 100 ? st.HitChance : null, 'percent'],
    ];
    const defence = [
      ['Life', st.Life, st.LifeRegenRecovery ? `+${fmt(st.LifeRegenRecovery, 1)} per second` : '', 'life'],
      ['Energy shield', st.EnergyShield, '', 'es'],
      ['Mana', st.Mana, st.ManaRegenRecovery ? `+${fmt(st.ManaRegenRecovery, 1)} per second` : '', 'mana'],
      ['Spirit', st.Spirit, st.SpiritUnreserved != null ? `${fmt(st.SpiritUnreserved)} not reserved` : '', 'spirit'],
      ['Ward', st.Ward, ''],
      ['Effective health', st.TotalEHP, 'estimate', 'ehp'],
      ['Armour', st.Armour, st.PhysicalDamageReduction ? `${fmt(st.PhysicalDamageReduction)}% less physical damage` : ''],
      ['Evasion', st.Evasion, st.EvadeChance ? `${fmt(st.EvadeChance)}% chance to evade` : ''],
      ['Deflection', st.DeflectionRating, st.DeflectChance ? `${fmt(st.DeflectChance)}% chance to deflect` : ''],
      ['Block', st.EffectiveBlockChance, 'percent'],
      ['Movement speed', st.EffectiveMovementSpeedMod, 'multiplier with buffs', null, 2, '×'],
    ];
    const stat = ([k, v, d, h, dec, pre]) => v ? `<div class="stat"><div class="k">${k}${hint(h)}</div><div class="v">${(pre || '') + fmt(v, dec || 0)}</div><div class="d">${esc(d)}</div></div>` : '';
    const charges = [['Power', 'PowerCharges'], ['Frenzy', 'FrenzyCharges'], ['Endurance', 'EnduranceCharges']]
      .filter(([, k]) => st[k + 'Max']).map(([n, k]) => `${n} ${fmt(st[k])} of ${fmt(st[k + 'Max'])}`).join(' · ');
    // Without a damage calculation the other offence numbers describe a non-damage skill; hide them.
    const offHtml = dps ? offence.map(stat).join('') : '';

    $('#tab-overview').innerHTML = `<div class="cols-2">
      <div class="card">
        <h2 class="card-title">At a glance</h2>
        <p class="muted small" style="margin-bottom:6px">Facts from your build code. Tap a <b>?</b> for an explanation.</p>
        <div class="glance">${glance}</div>
      </div>
      <div class="card">
        <h2 class="card-title">Resistances${hint('resist')}</h2>
        <p class="muted small" style="margin-bottom:14px">The mark on each bar is the ${CAP}% cap.</p>
        <div class="res">${RES.map(([n, k, col]) => {
          const v = c.stats[k];
          if (v == null) return `<div class="nm">${n}</div><div class="gauge"></div><div class="val">unknown</div>`;
          const gap = CAP - v;
          return `<div class="nm">${n}</div><div class="gauge" role="img" aria-label="${n} resistance ${fmt(v)} percent"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></i><b></b></div>
            <div class="val">${fmt(v)}%<em style="color:${gap > 0 ? 'var(--bad)' : 'var(--good)'}">${gap > 0 ? '−' + fmt(gap) : 'capped'}</em></div>`;
        }).join('')}</div>
        <h3 class="sub">Attributes${hint('attrs')}</h3>
        <div class="stats">${[['Strength', 'Str'], ['Dexterity', 'Dex'], ['Intelligence', 'Int']].map(([n, k]) =>
          `<div class="stat"><div class="k">${n}</div><div class="v">${fmt(st[k])}</div><div class="d">${st['Req' + k] ? `${fmt(st['Req' + k])} needed` : 'none needed'}</div></div>`).join('')}</div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <h2 class="card-title">Numbers</h2>
      <p class="muted small" style="margin-bottom:14px">Calculated by Path of Building. Only stats your build has are shown.</p>
      ${offHtml ? `<h3 class="sub" style="margin-top:0">Offence</h3><div class="stats">${offHtml}</div>` : ''}
      <h3 class="sub">Defence and resources</h3><div class="stats">${defence.map(stat).join('')}</div>
      ${charges ? `<p class="small muted" style="margin-top:10px">Charges: ${charges}</p>` : ''}
      <details class="more"><summary>Show all ${Object.keys(st).length} stats from Path of Building</summary><div class="tbl-wrap" style="margin-top:8px"><table class="small"><tbody>${
        Object.entries(st).filter(([, v]) => v !== 0).map(([k, v]) => `<tr><td class="mono">${esc(k)}</td><td class="num">${fmt(v, Math.abs(v) < 10 && v % 1 ? 2 : 0)}</td></tr>`).join('')
      }</tbody></table></div><p class="small muted">Stats equal to 0 are hidden.</p></details>
    </div>`;
  }

  function firstStat(st, keys) {
    for (const k of keys) if (st[k]) return { k, v: st[k] };
    return null;
  }
  function groupName(g) {
    if (!g) return '';
    const act = g.gems.find(x => skill(x.skillId) && !skill(x.skillId).support && !skill(x.skillId).types?.includes('Meta'))
      || g.gems.find(x => !skill(x.skillId)?.support) || g.gems[0];
    return act ? (act.name || skill(act.skillId)?.name || g.label || act.skillId) : g.label;
  }

  // ---------- skills ----------
  // A socket group: its active skills (meta gem first), supports, and anything not in the data.
  function describeGroup(g) {
    const gems = g.gems.map(x => ({ x, d: skill(x.skillId) }));
    const acts = gems.filter(o => o.d && !o.d.support);
    const sups = gems.filter(o => o.d && o.d.support);
    const unknown = gems.filter(o => !o.d);
    const meta = acts.find(o => o.d.types?.includes('Meta'));
    if (meta) acts.splice(acts.indexOf(meta), 1), acts.unshift(meta);
    return { gems, acts, sups, unknown, meta };
  }
  const has = (o, t) => !!o?.d?.types?.includes(t);
  const COST_UNIT = { Mana: 'mana', 'Mana %': '% mana', Rage: 'rage', Ward: 'ward', Life: 'life' };
  const itemName = g => g.source.split(':').slice(2).join(':').split(',')[0];

  // An item-granted skill appears twice when you also set it up in your own group:
  // once as the item's bare grant and once with your supports. Mark the bare one.
  function duplicateGrants(c) {
    const own = new Set(c.groups.filter(g => !g.source?.startsWith('Item:')).flatMap(g => g.gems.map(x => x.skillId)));
    return new Set(c.groups.filter(g => g.source?.startsWith('Item:') && g.gems.every(x => !skill(x.skillId)?.support) && g.gems.every(x => own.has(x.skillId))));
  }

  function renderSkills(c) {
    const dup = duplicateGrants(c);
    let nSup = 0;
    const rows = c.groups.map(g => {
      const { acts, sups, unknown, meta } = describeGroup(g);
      nSup += sups.length;
      if (dup.has(g)) {
        return `<tr class="dim"><td><div class="skill-name">${esc(acts.map(o => o.x.name || o.d.name).join(', '))}</div><div class="skill-sub">from ${esc(itemName(g))}</div></td>
          <td colspan="4" class="small muted">Granted by this item and already listed above with your supports.</td></tr>`;
      }
      const builtIn = !acts.length && unknown.length && unknown.every(o => !o.x.gemId); // e.g. Thorns
      const mult = sups.reduce((m, o) => m * (1 + (o.d.manaMult || 0) / 100), 1);
      const src = g.source && g.source.startsWith('Item:') ? `from ${itemName(g)}` : (builtIn ? g.source || '' : '');
      const actHtml = acts.map(o => {
        const tags = [];
        if (o === meta) tags.push(['meta', 'brass']);
        if (has(o, 'Minion') || has(o, 'CreatesMinion')) tags.push(['minion', '']);
        if (has(o, 'Persistent') && o !== meta) tags.push(['always on', '']);
        return `<div><span class="skill-name">${esc(o.x.name || o.d.name)}</span>${tags.map(([t, cl]) => `<span class="tag ${cl}">${t}</span>`).join('')}
          <div class="skill-sub">level ${o.x.level}${o.x.quality ? ` · quality ${o.x.quality}%` : ''}${o.x.count > 1 ? ` · ${o.x.count} copies` : ''}</div></div>`;
      }).join('') || (builtIn ? `<span class="skill-name">${esc(g.label || unknown[0].x.skillId)}</span><span class="tag">built-in effect</span>` : '<span class="muted">No active skill in this group</span>');
      // Cost of skills you use directly. Skills inside a trigger meta gem are not cast by you.
      const costs = acts.filter(o => o !== meta).map(o => {
        if (meta && has(meta, 'Triggers')) return `<div class="small muted">triggered</div>`;
        if (meta) return `<div class="small muted">unknown</div>`;
        const cs = PobData.costAt(o.d, o.x.level).filter(x => x.value > 0);
        if (!cs.length) return '<div>0</div>';
        const dec = v => (v < 10 && v % 1 ? 1 : 0);
        return cs.map(x => `<div>${fmt(x.value, dec(x.value))} ${COST_UNIT[x.type] || esc(x.type)}${x.perSecond ? '/s' : ''}${mult > 1 ? ` → <b>${fmt(x.value * mult, dec(x.value * mult))}</b>` : ''}</div>`).join('');
      }).join('');
      const res = acts.map(o => {
        const flat = PobData.atLevel(o.d.spirit, o.x.level), pct = PobData.atLevel(o.d.spiritPct, o.x.level);
        return flat ? fmt(flat * (o.x.count || 1)) : pct ? fmt(pct) + '%' : '';
      }).filter(Boolean).join(' + ');
      return `<tr class="${g.enabled ? '' : 'dim'}">
        <td>${actHtml}${src ? `<div class="skill-sub">${esc(src)}</div>` : ''}${!g.enabled ? '<span class="tag">switched off</span>' : ''}</td>
        <td>${sups.map(o => `<span class="chip" title="${esc(o.d.desc || '')}">${esc(o.x.name || o.d.name)}${o.d.manaMult ? ` <span class="cost">+${o.d.manaMult}%</span>` : ''}</span>`).join('') || '<span class="muted small">none</span>'}
          ${unknown.filter(() => !builtIn).map(o => `<span class="chip warn">${esc(o.x.name || o.x.skillId)} · not in game data</span>`).join('')}</td>
        <td class="num">${costs || '<span class="muted">–</span>'}</td>
        <td class="num">${mult > 1 ? '×' + mult.toFixed(2) : ''}</td>
        <td class="num">${res}</td></tr>`;
    }).join('');
    return `<div class="card">
      <div class="section-head"><h2 class="card-title">Skills</h2><p>${c.groups.length} groups · ${nSup} support gems</p></div>
      <div class="tbl-wrap"><table>
      <thead><tr><th>Skill</th><th>Supports${hint('support')}</th><th class="num">Cost${hint('cost')}</th><th class="num">Multiplier</th><th class="num">Spirit${hint('spirit')}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="small muted" style="margin-top:12px">Hover a support for its description. "Meta" gems hold other skills${hint('meta')}. Costs use the gem level in your code; extra levels from gear and cost changes from passives are not included yet.</p></div>`;
  }

  // ---------- gear ----------
  const SLOT_ORDER = ['Weapon 1', 'Weapon 2', 'Weapon 1 Swap', 'Weapon 2 Swap', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Ring 3', 'Belt', 'Flask 1', 'Flask 2', 'Charm 1', 'Charm 2', 'Charm 3'];
  function itemCard(slot, it, socketed) {
    const li = (m, cls) => `<li class="${cls}">${esc(m.text)}${m.tags.length ? `<span class="tag">${esc(m.tags.join(' '))}</span>` : ''}</li>`;
    const props = ['Energy Shield', 'Armour', 'Evasion Rating', 'Evasion', 'Ward', 'Spirit'].filter(k => it.props[k]).map(k => `${k} ${it.props[k]}`).join(' · ');
    return `<div class="item ${esc(it.rarity)}"><div class="slot">${esc(slot)}</div>
      <div class="nm">${esc(it.name)}</div>${it.base && it.base !== it.name ? `<div class="base">${esc(it.base)}</div>` : ''}
      ${props ? `<div class="props">${esc(props)}</div>` : ''}
      <ul>${it.implicits.map(m => li(m, 'imp')).join('')}${it.mods.map(m => li(m, '')).join('')}</ul>
      ${it.flags.length ? `<div class="flag">${esc(it.flags.join(' · '))}</div>` : ''}
      ${(socketed || []).map(([n, j]) => `<div class="socketed"><b>Jewel in socket ${esc(n)}:</b> ${esc(j.name)} (${esc(j.base)})<br>${j.mods.map(m => esc(m.text)).join('<br>')}</div>`).join('')}</div>`;
  }
  function slotLabel(s, c) {
    if (/^Jewel \d+$/.test(s)) return 'Jewel · passive tree socket';
    if (s === 'Weapon 1' || s === 'Weapon 2') return `${s === 'Weapon 1' ? 'Main hand' : 'Off hand'} · weapon set 1${c.useSecondWeaponSet ? '' : ' · in use'}`;
    if (s === 'Weapon 1 Swap' || s === 'Weapon 2 Swap') return `${s.startsWith('Weapon 1') ? 'Main hand' : 'Off hand'} · weapon set 2${c.useSecondWeaponSet ? ' · in use' : ''}`;
    if (/^(Arm|Leg) \d$/.test(s)) return `Limb · ${s}`;
    return s;
  }
  function renderGear(c) {
    const inGear = {};
    for (const s of Object.keys(c.slots)) {
      const m = s.match(/^(.*) Jewel Socket (\d+)$/);
      if (m) (inGear[m[1]] = inGear[m[1]] || []).push([m[2], c.items[c.slots[s]]]);
    }
    const slots = Object.keys(c.slots).filter(s => !/ Jewel Socket \d+$/.test(s)).sort((a, b) => {
      const ia = SLOT_ORDER.indexOf(a), ib = SLOT_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return `<div class="section-head"><h2 class="card-title">Gear</h2><p>${slots.length} items equipped. Grey lines are built-in (implicit) or rune properties.</p></div>
      <div class="gear">${slots.map(s => { const it = c.items[c.slots[s]]; return it ? itemCard(slotLabel(s, c), it, (inGear[s] || []).filter(x => x[1])) : ''; }).join('')}</div>`;
  }

  // ---------- passive tree ----------
  function renderTree(c) {
    if (!c.tree) return '<div class="card"><p class="muted">This code has no passive tree.</p></div>';
    const ws1 = new Set(c.tree.ws1), ws2 = new Set(c.tree.ws2);
    const attrOf = id => c.tree.attr.str.includes(id) ? 'Strength' : c.tree.attr.dex.includes(id) ? 'Dexterity' : c.tree.attr.int.includes(id) ? 'Intelligence' : null;
    const groups = { asc: [], keystone: [], notable: [], jewel: [], small: new Map(), unknown: [] };
    for (const id of c.tree.nodes) {
      const n = node(id);
      if (!n) { groups.unknown.push(id); continue; }
      const f = n.f || [];
      if (f.includes('ascStart') || f.includes('image')) continue;
      if (!n.s && !f.includes('jewel') && !f.includes('attr')) continue; // class start nodes
      const set = ws1.has(id) ? 1 : ws2.has(id) ? 2 : 0;
      const item = { id, n, set };
      if (n.a) groups.asc.push(item);
      else if (f.includes('keystone')) groups.keystone.push(item);
      else if (f.includes('notable')) groups.notable.push(item);
      else if (f.includes('jewel')) groups.jewel.push(item);
      else {
        const name = f.includes('attr') ? (attrOf(id) ? '+5 ' + attrOf(id) : 'Attribute (choice not in code)') : n.n;
        const key = name + '|' + (n.s || []).join('/') + '|' + set;
        const g = groups.small.get(key) || { name, s: n.s, set, count: 0 };
        g.count++; groups.small.set(key, g);
      }
    }
    const setTag = s => s ? `<span class="tag">weapon set ${s}</span>` : '';
    const nodeHtml = (it, cls) => `<div class="node ${cls}"><b>${esc(it.n.n)}</b>${setTag(it.set)}<div class="s">${(it.n.s || []).map(esc).join('<br>')}</div></div>`;
    const sect = (title, arr, cls, h) => arr.length ? `<h3 class="sub">${title} · ${arr.length}${h ? hint(h) : ''}</h3><div class="nodes">${arr.map(x => nodeHtml(x, cls)).join('')}</div>` : '';
    const smalls = [...groups.small.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return `<div class="card">
      <div class="section-head"><h2 class="card-title">Passive tree${hint('passives')}</h2>
        <p>${c.tree.nodes.length} points spent${c.tree.ws1.length || c.tree.ws2.length ? ` · ${c.tree.ws1.length} only with weapon set 1 · ${c.tree.ws2.length} only with weapon set 2` : ''}</p></div>
      ${sect('Ascendancy' + (c.ascendancy ? ' · ' + esc(c.ascendancy) : ''), groups.asc, 'asc', 'ascendancy')}
      ${sect('Keystones', groups.keystone, 'keystone')}
      ${sect('Notables', groups.notable, 'notable')}
      ${groups.jewel.length ? `<h3 class="sub">Jewel sockets · ${groups.jewel.length}</h3><div class="nodes">${groups.jewel.map(j => {
        const itId = c.tree.sockets[j.id]; const it = itId && c.items[itId];
        return `<div class="node"><b>${it ? esc(it.name) : 'Empty socket'}</b><div class="s">${it ? esc(it.base) + '<br>' + it.mods.map(m => esc(m.text)).join('<br>') : 'No jewel'}</div></div>`;
      }).join('')}</div>` : ''}
      <h3 class="sub">Small passives · ${smalls.reduce((a, b) => a + b.count, 0)}${hint('weaponset')}</h3>
      <div class="nodes">${smalls.map(g => `<div class="node"><b>${esc(g.name)}</b>${g.count > 1 ? ` <span class="muted">×${g.count}</span>` : ''}${setTag(g.set)}<div class="s">${(g.s || []).map(esc).join('<br>')}</div></div>`).join('')}</div>
      ${groups.unknown.length ? `<div class="note warn">Not in the game data: nodes ${groups.unknown.join(', ')}.</div>` : ''}
    </div>`;
  }

  // ---------- game data ----------
  function renderData(target, progress) {
    const m = S.snap?.meta || {};
    const e = S.embedded?.meta || {};
    const sk = Object.values(S.snap?.skills || {});
    target.innerHTML = `<div class="card narrow">
      <h2 class="card-title">Game data</h2>
      <p class="muted" style="margin-bottom:14px">Gem costs, support effects and passive node text come from the public Path of Building files, so numbers match the game patch those files describe. A copy is built into this page so it works offline.</p>
      <dl class="kv">
        <dt>Copy in use</dt><dd>${S.snapSource === 'refreshed' ? 'Refreshed in this browser' : 'Built into this page'}</dd>
        <dt>Files dated</dt><dd>${esc((m.commitDate || m.fetched || 'unknown').slice(0, 10))}</dd>
        <dt>Path of Building</dt><dd>version ${esc(m.pobVersion || 'unknown')}</dd>
        <dt>Passive tree</dt><dd>version ${esc(m.treeVersion)} · ${fmt(Object.keys(S.snap?.nodes || {}).length)} nodes</dd>
        <dt>Gems</dt><dd>${sk.filter(s => s.gem && !s.support).length} skill gems · ${sk.filter(s => s.gem && s.support).length} support gems</dd>
        <dt>Source</dt><dd class="mono">${esc(m.source)}</dd>
        ${m.commit ? `<dt>Commit</dt><dd class="mono">${esc(m.commit.slice(0, 12))}</dd>` : ''}
      </dl>
      <p class="help" style="margin-top:12px">The files do not state the game patch number. If the game has had a patch after the date above, refresh.</p>
      <h3 class="sub">Get the latest data</h3>
      <p class="small" style="margin-bottom:10px">Downloads about 6.5 MB from GitHub and keeps it in this browser.</p>
      <div class="actions" style="align-items:flex-end">
        <div style="flex:0 1 140px"><label class="field-label" for="treeVer" style="margin-top:0">Tree version</label><input type="text" id="treeVer" value="${esc(S.char?.tree?.version || m.treeVersion)}"></div>
        <button type="button" class="primary" id="refreshBtn">Refresh game data</button>
        ${S.snapSource === 'refreshed' ? `<button type="button" id="revertBtn">Use the built-in copy (${esc((e.commitDate || e.fetched || '').slice(0, 10))})</button>` : ''}
      </div>
      <div class="prog" id="refreshProg" aria-live="polite">${progress || ''}</div></div>`;
    target.querySelector('#refreshBtn').onclick = () => refreshData(target);
    const rv = target.querySelector('#revertBtn');
    if (rv) rv.onclick = () => { store.del(SNAP_STORE); S.snap = S.embedded; S.snapSource = 'embedded'; renderBadge(); if (S.char) renderAll(); renderData(target, 'Now using the built-in copy.'); };
  }

  async function refreshData(target) {
    const prog = target.querySelector('#refreshProg');
    const tv = target.querySelector('#treeVer').value.trim() || '0_5';
    target.querySelector('#refreshBtn').disabled = true;
    const text = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} for ${u.split('/src/')[1] || u}`); return r.text(); };
    try {
      const { tree, gems, skills, bases } = await PobData.fetchAll(tv, text, f => { prog.textContent = 'Downloading ' + f + '…'; });
      const meta = { source: PobData.BASE, treeVersion: tv, fetched: new Date().toISOString() };
      try {
        const c = (await (await fetch('https://api.github.com/repos/PathOfBuildingCommunity/PathOfBuilding-PoE2/commits?sha=dev&per_page=1')).json())[0];
        meta.commit = c.sha; meta.commitDate = c.commit.committer.date;
        meta.pobVersion = ((await text('https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/dev/manifest.xml')).match(/Version number="([^"]+)"/) || [])[1];
      } catch { /* commit info is optional */ }
      S.snap = PobData.assemble(tree, gems, skills, meta, bases);
      S.snapSource = 'refreshed';
      const saved = store.set(SNAP_STORE, S.snap);
      renderBadge();
      if (S.char) renderAll();
      renderData(target, saved ? 'Done. The new data is saved in this browser and works offline.' : 'Done, but this browser would not save it, so it lasts until you close the page.');
    } catch (e) {
      renderData(target);
      target.querySelector('#refreshProg').innerHTML = `<div class="note bad">Could not refresh: ${esc(e.message)}. Check your internet connection. The previous data is still in use.</div>`;
    }
  }

  // ---------- account lookup ----------
  function initLookup() {
    const lp = S.prefs.lookup = Object.assign({ account: '', name: '', league: 'Standard', other: '', proxy: '' }, S.prefs.lookup || {});
    const sel = $('#luLeague');
    sel.innerHTML = PobLookup.LEAGUES.map(l => `<option>${esc(l)}</option>`).join('') + '<option value="__other">Another league…</option>';
    sel.value = PobLookup.LEAGUES.includes(lp.league) ? lp.league : '__other';
    $('#luAccount').value = lp.account; $('#luName').value = lp.name; $('#luOther').value = lp.other; $('#luProxy').value = lp.proxy;
    $('#luWorker').textContent = PobLookup.WORKER;
    const sync = () => {
      $('#luOtherRow').hidden = sel.value !== '__other';
      Object.assign(lp, { account: $('#luAccount').value.trim(), name: $('#luName').value.trim(), league: sel.value === '__other' ? '__other' : sel.value, other: $('#luOther').value.trim(), proxy: $('#luProxy').value.trim() });
      savePrefs();
    };
    for (const id of ['#luAccount', '#luName', '#luOther', '#luProxy']) $(id).addEventListener('input', sync);
    sel.addEventListener('change', sync);
    sync();
    if (lp.account || lp.proxy) $('#lookupBox').open = true;
    const say = (html, kind = 'info') => { $('#luMsg').innerHTML = html ? `<div class="note ${kind}">${html}</div>` : ''; };
    $('#luBtn').onclick = async () => {
      sync();
      const league = lp.league === '__other' ? lp.other : lp.league;
      $('#luBtn').disabled = true;
      try {
        const r = await PobLookup.lookup({ account: lp.account, name: lp.name, league }, { proxy: lp.proxy, onStep: s => say(esc(s)) });
        say(`Found ${esc(r.info.name)}, level ${esc(r.info.level)} ${esc(r.info.cls)} in ${esc(r.info.league)} (${esc(r.via.toLowerCase())}). poe.ninja last updated it ${esc((r.info.updated || '').slice(0, 10) || 'at an unknown time')}.`, 'good');
        $('#code').value = r.code;
        if (!['Standard', 'Hardcore'].includes(league)) {
          S.prefs.extras.league = 'event'; S.prefs.extras.eventLeague = league; $('#league').value = 'event'; $('#eventLeague').value = league; savePrefs(); onExtrasChanged();
        }
        await readCharacter(r.code);
      } catch (e) {
        const reasons = (e.reasons || [{ message: e.message }]).map(x => `<li>${esc(x.via ? x.via + ': ' : '')}${esc(x.message)}</li>`).join('');
        const blocked = (e.reasons || []).some(x => x.kind === 'blocked');
        say(`<b>The lookup did not work.</b><ul style="margin:6px 0 6px 18px;padding:0">${reasons}</ul>${blocked && !lp.proxy ? 'This is expected without a proxy (see Advanced below). ' : ''}Use the build code from Path of Building instead: the steps are on the right.`, 'warn');
      } finally { $('#luBtn').disabled = false; }
    };
    $('#luCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(PobLookup.WORKER); $('#luCopied').textContent = 'Copied.'; }
      catch { const r = document.createRange(); r.selectNodeContents($('#luWorker')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $('#luCopied').textContent = 'Selected. Press Ctrl+C to copy.'; }
    };
  }

  // ---------- tabs and wiring ----------
  function selectTab(name) {
    S.tab = name;
    for (const b of $$('#mainTabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const s of $$('#workspace > section.tab')) s.hidden = s.id !== 'tab-' + name;
  }

  function init() {
    applyTheme(store.get(THEME_STORE) || 'system');
    $('#themeBtn').onclick = cycleTheme;
    loadSnapshot();
    renderPrices();
    bindExtras();
    initLookup();
    $$('#mainTabs button').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab)));
    $('#decodeBtn').onclick = () => readCharacter($('#code').value);
    $('#codeFileBtn').onclick = () => $('#codeFile').click();
    $('#codeFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const t = await f.text(); $('#code').value = t.trim(); readCharacter(t);
      e.target.value = '';
    };
    const ex = document.getElementById('example');
    if (ex && ex.textContent.trim()) $('#exampleBtn').onclick = () => { $('#code').value = ex.textContent.trim(); readCharacter(ex.textContent.trim()); };
    else $('#exampleBtn').parentElement.hidden = true;
    $('#homeLink').onclick = e => { e.preventDefault(); show(S.char ? 'workspace' : 'welcome'); };
    $('#dataLink').onclick = () => {
      if (S.char && !$('#workspace').hidden) { selectTab('data'); return; }
      renderData($('#dataPageBody')); show('data');
    };
    $('#dataBack').onclick = () => show(S.char ? 'workspace' : 'welcome');
    $('#aboutLink').onclick = () => {
      S.back = !$('#workspace').hidden ? 'workspace' : !$('#dataPage').hidden ? 'data' : 'welcome';
      show('about');
    };
    $('#aboutBack').onclick = () => show(S.back === 'workspace' && !S.char ? 'welcome' : S.back);
    const openTut = () => {
      if ($('#tutorialPage').hidden) S.tutBack = !$('#workspace').hidden ? 'workspace' : !$('#dataPage').hidden ? 'data' : !$('#aboutPage').hidden ? 'about' : 'welcome';
      show('tutorial');
    };
    $('#tutLink').onclick = openTut; $('#tutLink2').onclick = openTut;
    const openSetup = () => {
      if ($('#setupPage').hidden) S.setupBack = !$('#tutorialPage').hidden ? 'tutorial' : !$('#workspace').hidden ? 'workspace' : 'welcome';
      show('setup');
    };
    $('#setupLink').onclick = openSetup; $('#setupLink2').onclick = openSetup; $('#setupLink3').onclick = openSetup;
    $('#setupBack').onclick = () => show(S.setupBack === 'workspace' && !S.char ? 'welcome' : S.setupBack || 'welcome');
    $('#setupDone').onclick = () => { show('welcome'); $('#code').focus(); };
    $('#tutBack').onclick = () => show(S.tutBack === 'workspace' && !S.char ? 'welcome' : S.tutBack || 'welcome');
    $('#tutExample').onclick = () => { const ex = document.getElementById('example'); if (ex) { $('#code').value = ex.textContent.trim(); readCharacter(ex.textContent.trim()); } };
    for (const a of $$('#tutorialPage a[data-jump]')) a.onclick = e => { e.preventDefault(); const t = document.querySelector(a.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    loadGuideChar().then(() => { if (S.char) { runGuide(); renderGuide(); } });
    if (S.prefs.code) { $('#code').value = S.prefs.code; readCharacter(S.prefs.code, true); }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
