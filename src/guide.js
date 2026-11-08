// Exile Build Advisor: stage 4, comparison with a build guide.
// Copyright (c) 2026 reytla. MIT licence.
//
// Two optional inputs: the guide's Path of Building code (exact) and the guide's text
// (date, patch, ascendancy order, stat priorities, names it mentions).
// compare(char, guideChar|null, text, snap, meta) -> sections for the Guide tab.
(function (root) {
  'use strict';

  // ---------- reading the guide text ----------
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  function findDate(s) {
    let m = s.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
    if (m) return iso(m[1], +m[2], +m[3]);
    m = s.match(/\b([A-Z][a-z]{2,8})\.? (\d{1,2})(?:st|nd|rd|th)?,? (20\d\d)\b/);
    if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return iso(m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
    m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)? ([A-Z][a-z]{2,8})\.?,? (20\d\d)\b/);
    if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return iso(m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
    m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/); // ambiguous; read as month/day like most guide sites
    if (m) return iso(m[3], +m[1], +m[2]);
    return null;
  }
  function parseMeta(text) {
    const t = String(text || '');
    const lines = t.split(/\n/).map(l => l.trim()).filter(Boolean);
    const title = (lines.find(l => /guide|build/i.test(l) && l.length < 140) || lines[0] || '').slice(0, 140);
    // Prefer a date on an "updated" line; fall back to the first date anywhere.
    const upd = lines.find(l => /updated|last update|revised/i.test(l) && findDate(l));
    const updated = upd ? findDate(upd) : (lines.map(findDate).find(Boolean) || null);
    const pm = t.match(/\b(?:patch|version|update|for)\s*v?(\d\.\d+(?:\.\d+)?[a-z]?)\b/i) || t.match(/\b(0\.\d{1,2}\.\d{1,2}[a-z]?)\b/);
    return { title, updated, patch: pm ? pm[1] : null };
  }
  function cmpVersion(a, b) {
    const pa = String(a).split(/[.]/).map(x => parseInt(x, 10) || 0), pb = String(b).split(/[.]/).map(x => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
    return 0;
  }

  // Support tiers ("Magnified Area II") are compared by family name.
  const family = n => String(n || '').replace(/\s+(I|II|III|IV|V)$/, '').trim();
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Names from the game data that appear in the text, with their first position.
  function namesIn(text, names) {
    const out = new Map();
    const sorted = [...new Set(names)].filter(n => n && n.length > 2).sort((a, b) => b.length - a.length);
    let masked = String(text || '');
    for (const n of sorted) {
      const re = new RegExp(`(^|[^A-Za-z'])(${reEsc(n)})(?![A-Za-z'])`, 'g'); // case-sensitive: guides capitalise names
      let m, first = -1;
      while ((m = re.exec(masked))) { if (first < 0) first = m.index + m[1].length; }
      if (first >= 0) {
        out.set(n, first);
        masked = masked.replace(re, (all, pre, hit) => pre + ' '.repeat(hit.length)); // longer names win over their parts
      }
    }
    return out;
  }

  function gemNames(snap) {
    const act = new Set(), sup = new Set();
    for (const s of Object.values(snap.skills)) {
      if (!s.gem || !s.name || s.hidden) continue;
      (s.support ? sup : act).add(s.support ? family(s.name) : s.name);
    }
    return { act, sup };
  }
  function nodeNames(snap, ascendancy) {
    const notable = new Set(), keystone = new Set(), asc = new Set();
    for (const n of Object.values(snap.nodes)) {
      if (!n.n) continue;
      const f = n.f || [];
      if (n.a) { if ((!ascendancy || n.a === ascendancy) && f.includes('notable')) asc.add(n.n); }
      else if (f.includes('keystone')) keystone.add(n.n);
      else if (f.includes('notable')) notable.add(n.n);
    }
    return { notable, keystone, asc };
  }

  // Stat priorities: [label, how a guide says it, how it appears on items]
  const STATS = [
    ['Spirit', /\bspirit\b/i, /to spirit\b|\bspirit$/i],
    ['+ level of spell skills', /level (of|to) (all )?(spell|cold spell|lightning spell|fire spell|chaos spell)/i, /level of all .*spell skills/i],
    ['+ level of minion skills', /level (of|to) (all )?minion/i, /level of all minion skills/i],
    ['+ level of projectile or melee skills', /level (of|to) (all )?(projectile|melee)/i, /level of all (projectile|melee) skills/i],
    ['Cast speed', /cast speed/i, /cast speed/i],
    ['Attack speed', /attack speed/i, /attack speed/i],
    ['Critical hit chance', /crit(ical)?( hit| strike)? chance/i, /critical hit chance/i],
    ['Critical damage bonus', /crit(ical)?( hit| strike)? (damage|multi)/i, /critical damage bonus|critical hit damage/i],
    ['Spell damage', /spell damage/i, /spell damage/i],
    ['Elemental damage', /\b(cold|fire|lightning|elemental) damage\b/i, /(cold|fire|lightning|elemental) damage/i],
    ['Physical damage', /physical damage/i, /physical damage/i],
    ['Life', /\b(maximum )?life\b/i, /to maximum life|increased maximum life/i],
    ['Energy shield', /energy shield/i, /energy shield/i],
    ['Mana', /\bmaximum mana\b|\bmana\b(?! regen)/i, /to maximum mana|increased maximum mana/i],
    ['Mana regeneration', /mana regen/i, /mana regeneration/i],
    ['Resistances', /resist/i, /resistance/i],
    ['Movement speed', /movement speed/i, /movement speed/i],
    ['Armour', /\barmour\b/i, /\barmour\b/i],
    ['Evasion', /\bevasion\b/i, /evasion/i],
    ['Attributes', /\b(strength|dexterity|intelligence|attributes)\b/i, /to (strength|dexterity|intelligence|all attributes)/i],
  ];
  // Only text near a "priority"/"stats"/"affixes" heading counts, to avoid matching passing mentions.
  function statPriorities(text) {
    const lines = String(text || '').split(/\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/priorit|stats to look for|affix|what to look for|gear stats/i.test(lines[i])) continue;
      const block = lines.slice(i, i + 25).join('\n');
      for (const [label, re] of STATS) {
        const m = block.match(re);
        if (m && !out.some(o => o.label === label)) out.push({ label, pos: i * 1000 + m.index });
      }
    }
    return out.sort((a, b) => a.pos - b.pos).map(o => o.label);
  }

  // ---------- what a build uses ----------
  function buildSkills(c, snap) {
    const res = new Map(); // active name -> Set(support families)
    for (const g of c.groups) {
      if (g.enabled === false) continue;
      const gems = g.gems.filter(x => x.enabled !== false).map(x => ({ x, d: snap.skills[x.skillId] }));
      const sups = gems.filter(o => o.d?.support).map(o => family(o.x.name || o.d.name));
      const acts = gems.filter(o => o.d && !o.d.support);
      for (const o of acts) {
        const n = o.x.name || o.d.name;
        if (!res.has(n)) res.set(n, new Set());
        sups.forEach(s => res.get(n).add(s));
      }
    }
    return res;
  }
  function buildNodes(c, snap) {
    const out = { notable: new Set(), keystone: new Set(), asc: new Set() };
    for (const id of c.tree?.nodes || []) {
      const n = snap.nodes[id]; if (!n?.n) continue;
      const f = n.f || [];
      if (n.a) { if (f.includes('notable')) out.asc.add(n.n); }
      else if (f.includes('keystone')) out.keystone.add(n.n);
      else if (f.includes('notable')) out.notable.add(n.n);
    }
    return out;
  }
  function uniques(c) {
    const out = new Map();
    for (const [slot, id] of Object.entries(c.slots)) { const it = c.items[id]; if (it && it.rarity === 'UNIQUE') out.set(it.name, slot); }
    return out;
  }
  function gearStatCoverage(c, label) {
    const re = (STATS.find(s => s[0] === label) || [])[2];
    if (!re) return [];
    const slots = [];
    for (const [slot, id] of Object.entries(c.slots)) {
      if (/Swap$/.test(slot) !== !!c.useSecondWeaponSet && /^Weapon/.test(slot)) continue;
      const it = c.items[id]; if (!it) continue;
      if (it.mods.concat(it.implicits).some(m => re.test(m.text))) slots.push(slot);
    }
    return slots;
  }

  // ---------- comparison ----------
  function compare(c, g, text, snap, settings = {}) {
    const meta = Object.assign(parseMeta(text), settings.meta || {});
    const out = { meta, sections: [], source: g ? (text ? 'code+text' : 'code') : 'text' };
    const cur = settings.currentPatch, curDate = settings.currentPatchDate;
    // Freshness
    const fresh = [];
    if (meta.patch && cur && cmpVersion(meta.patch, cur) < 0) fresh.push(`The guide is for patch ${meta.patch}; the game is on ${cur}. Some of its advice may no longer hold.`);
    if (meta.updated && curDate && meta.updated < curDate && !(meta.patch && cur && cmpVersion(meta.patch, cur) >= 0)) fresh.push(`The guide was last updated on ${meta.updated}, before patch ${cur || ''} came out on ${curDate}.`);
    out.outdated = fresh.length > 0;
    out.freshness = fresh;
    out.unknownMeta = [!meta.updated && 'last updated date', !meta.patch && 'patch'].filter(Boolean);

    const mine = buildSkills(c, snap);
    const myNodes = buildNodes(c, snap);
    const { act: ACT, sup: SUP } = gemNames(snap);
    const NN = nodeNames(snap, c.ascendancy);

    // Skills and supports
    if (g) {
      const theirs = buildSkills(g, snap);
      const rows = [];
      for (const [n, sups] of theirs) {
        const m = mine.get(n);
        if (!m) { rows.push({ kind: 'missing', skill: n, sups: [...sups] }); continue; }
        const missing = [...sups].filter(s => !m.has(s)), extra = [...m].filter(s => !sups.has(s));
        rows.push({ kind: missing.length || extra.length ? 'differs' : 'same', skill: n, missing, extra });
      }
      for (const [n, sups] of mine) if (!theirs.has(n)) rows.push({ kind: 'extra', skill: n, sups: [...sups] });
      out.sections.push({ id: 'skills', title: 'Skills and supports', exact: true, rows });
    } else if (text) {
      const actsIn = namesIn(text, ACT), supsIn = namesIn(text, SUP);
      const myActs = new Set(mine.keys()), mySups = new Set([...mine.values()].flatMap(s => [...s]));
      out.sections.push({ id: 'skills', title: 'Skills and supports', exact: false,
        mentioned: { acts: [...actsIn.keys()], sups: [...supsIn.keys()] },
        guideOnly: { acts: [...actsIn.keys()].filter(n => !myActs.has(n)), sups: [...supsIn.keys()].filter(n => !mySups.has(n)) },
        yoursOnly: { acts: [...myActs].filter(n => !actsIn.has(n)), sups: [...mySups].filter(n => !supsIn.has(n)) } });
    }

    // Passives
    if (g) {
      const theirs = buildNodes(g, snap);
      const diff = k => ({ missing: [...theirs[k]].filter(n => !myNodes[k].has(n)), extra: [...myNodes[k]].filter(n => !theirs[k].has(n)) });
      out.sections.push({ id: 'tree', title: 'Passive tree', exact: true, keystone: diff('keystone'), notable: diff('notable'),
        points: { mine: c.tree?.nodes.length || 0, theirs: g.tree?.nodes.length || 0 }, theirLevel: g.level });
    } else if (text) {
      const ks = namesIn(text, NN.keystone), nt = namesIn(text, NN.notable);
      out.sections.push({ id: 'tree', title: 'Passive tree', exact: false,
        keystone: { missing: [...ks.keys()].filter(n => !myNodes.keystone.has(n)), have: [...ks.keys()].filter(n => myNodes.keystone.has(n)) },
        notable: { missing: [...nt.keys()].filter(n => !myNodes.notable.has(n)), have: [...nt.keys()].filter(n => myNodes.notable.has(n)) } });
    }

    // Ascendancy order: from the text (order of first mention); exact set from the code.
    const ascText = text ? [...namesIn(text, NN.asc)].sort((a, b) => a[1] - b[1]).map(([n]) => n) : [];
    const ascCode = g ? [...buildNodes(g, snap).asc] : [];
    if (ascText.length || ascCode.length) {
      const order = ascText.length ? ascText : ascCode;
      const next = order.filter(n => !myNodes.asc.has(n));
      const offPlan = [...myNodes.asc].filter(n => !order.includes(n) && !(ascCode.length && ascCode.includes(n)));
      out.sections.push({ id: 'asc', title: 'Ascendancy', order, taken: order.filter(n => myNodes.asc.has(n)), next, offPlan, fromText: !!ascText.length,
        sameClass: !g || !g.ascendancy || !c.ascendancy || g.ascendancy === c.ascendancy, theirAsc: g?.ascendancy });
    }

    // Gear
    const pri = statPriorities(text);
    const gear = { id: 'gear', title: 'Gear', priorities: pri.map(label => ({ label, slots: gearStatCoverage(c, label) })) };
    if (g) {
      const mu = uniques(c), tu = uniques(g);
      gear.uniques = { missing: [...tu].filter(([n]) => !mu.has(n)).map(([n, s]) => ({ name: n, slot: s })), have: [...tu.keys()].filter(n => mu.has(n)) };
    }
    if (gear.priorities.length || gear.uniques) out.sections.push(gear);

    // Classes
    if (g && g.className && c.className && g.className !== c.className) out.classMismatch = `The guide's code is for a ${g.ascendancy || g.className}; yours is a ${c.ascendancy || c.className}.`;
    else if (g && g.ascendancy && c.ascendancy && g.ascendancy !== c.ascendancy) out.classMismatch = `The guide's code is for a ${g.ascendancy}; yours is a ${c.ascendancy}.`;
    return out;
  }

  const api = { compare, parseMeta, cmpVersion, namesIn, statPriorities, family };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PobGuide = api;
})(typeof window !== 'undefined' ? window : globalThis);
