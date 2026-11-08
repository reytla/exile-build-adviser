// Parser for the public Path of Building (PoE2) data files.
// Copyright (c) 2026 reytla. MIT licence.
// Shared by tools/build.js (Node, builds the embedded snapshot) and the page's
// "refresh game data" button (browser). No Lua interpreter: the files are
// generated tables, so field-level regular expressions are enough.
(function (root) {
  'use strict';

  const BASE = 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/dev/src/';
  const SKILL_FILES = ['act_int', 'act_str', 'act_dex', 'sup_int', 'sup_str', 'sup_dex', 'other'];

  // Item base files: used to tell the item class (mace, bow, shield, ...) of each equipped base.
  const BASE_FILES = ['amulet', 'axe', 'belt', 'body', 'boots', 'bow', 'claw', 'crossbow', 'dagger', 'flail', 'flask', 'focus', 'gloves', 'helmet',
    'jewel', 'mace', 'quiver', 'ring', 'sceptre', 'shield', 'spear', 'staff', 'sword', 'talisman', 'traptool', 'wand'];
  // itemBases["Name"] = { type = "One Hand Mace", subType = "...", tags = { ... } }  ->  { Name: { t, st } }
  function parseBases(text) {
    const out = {};
    for (const { key, body } of luaBlocks(text, 'itemBases')) {
      const t = str(body, 'type', '\\t'); if (!t) continue;
      const e = { t };
      const st = str(body, 'subType', '\\t'); if (st) e.st = st;
      out[key] = e;
    }
    return out;
  }
  function fileList(treeVersion) {
    return {
      tree: `TreeData/${treeVersion}/tree.json`,
      gems: 'Data/Gems.lua',
      skills: SKILL_FILES.map(f => `Data/Skills/${f}.lua`),
      bases: BASE_FILES.map(f => `Data/Bases/${f}.lua`),
    };
  }

  // Find each `<prefix>["key"] = {` and return { key, body } with balanced braces.
  function luaBlocks(text, prefix) {
    const out = [];
    const re = new RegExp('^\\t?' + prefix.replace(/[[\]]/g, '\\$&') + '\\["([^"]+)"\\] = \\{', 'gm');
    let m;
    while ((m = re.exec(text))) {
      let i = re.lastIndex, depth = 1, inStr = false;
      while (i < text.length && depth > 0) {
        const c = text[i];
        if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; }
        else if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
      }
      out.push({ key: m[1], body: text.slice(re.lastIndex, i - 1) });
      re.lastIndex = i;
    }
    return out;
  }

  const unescape = s => s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  function str(body, field, indent) {
    const m = body.match(new RegExp('^' + indent + field + ' = "((?:[^"\\\\]|\\\\.)*)"', 'm'));
    return m ? unescape(m[1]) : undefined;
  }
  function num(body, field, indent) {
    const m = body.match(new RegExp('^' + indent + field + ' = (-?[\\d.]+)', 'm'));
    return m ? Number(m[1]) : undefined;
  }
  function flag(body, field, indent) {
    return new RegExp('^' + indent + field + ' = true', 'm').test(body);
  }
  // Ordered token list: `{ SkillType.A, SkillType.B, SkillType.AND, }`
  function typeList(body, field) {
    const m = body.match(new RegExp('^\\t' + field + ' = \\{([^}]*)\\}', 'm'));
    return m ? [...m[1].matchAll(/SkillType\.(\w+)/g)].map(x => x[1]) : [];
  }
  // Set form: `{ [SkillType.A] = true, ... }`
  function typeSet(body, field) {
    const m = body.match(new RegExp('^\\t' + field + ' = \\{([^}]*)\\}', 'm'));
    return m ? [...m[1].matchAll(/\[SkillType\.(\w+)\] = true/g)].map(x => x[1]) : [];
  }
  // Top-level `levels = { [n] = { ... }, }` of a skill.
  function levels(body) {
    const m = body.match(/^\tlevels = \{\n([\s\S]*?)^\t\},/m);
    const out = {};
    if (!m) return out;
    for (const lm of m[1].matchAll(/^\t\t\[(\d+)\] = \{(.*)\},?$/gm)) {
      const lv = {}, t = lm[2];
      const g = (re) => { const x = t.match(re); return x ? Number(x[1]) : undefined; };
      lv.req = g(/levelRequirement = (\d+)/);
      // Every cost type (Mana, ManaPerMinute, ManaPercentPerMinute, RagePerMinute, Ward, ...).
      const cm = t.match(/cost = \{([^}]*)\}/);
      if (cm) for (const [, k, v] of cm[1].matchAll(/(\w+) = (-?[\d.]+)/g)) lv['cost:' + k] = Number(v);
      lv.manaMult = g(/manaMultiplier = (-?[\d.]+)/);
      lv.spirit = g(/spiritReservationFlat = (-?[\d.]+)/);
      lv.spiritPct = g(/spiritReservationPercent = (-?[\d.]+)/);
      lv.cd = g(/cooldown = ([\d.]+)/);
      out[lm[1]] = lv;
    }
    return out;
  }
  function constantStats(body) {
    const m = body.match(/^\t\t\tconstantStats = \{\n([\s\S]*?)^\t\t\t\},/m);
    if (!m) return [];
    return [...m[1].matchAll(/\{ "([^"]+)", (-?[\d.]+) \}/g)].map(x => [x[1], Number(x[2])]);
  }
  // Compact per-level arrays, index = gem level.
  function series(lv, key) {
    const ks = Object.keys(lv).map(Number).sort((a, b) => a - b);
    if (!ks.some(k => lv[k][key] !== undefined)) return undefined;
    const arr = [];
    for (const k of ks) arr[k] = lv[k][key] ?? null;
    return arr;
  }

  // { Mana: [..per level..], RagePerMinute: [...] } or undefined.
  function costSeries(lv) {
    const keys = new Set();
    for (const l of Object.values(lv)) for (const k of Object.keys(l)) if (k.startsWith('cost:')) keys.add(k);
    if (!keys.size) return undefined;
    const out = {};
    for (const k of keys) out[k.slice(5)] = series(lv, k);
    return out;
  }

  // Cost of a skill at a level, as { type, value, perSecond } entries.
  // Per-minute costs are converted to per second.
  function costAt(sk, level) {
    if (!sk || !sk.cost) return [];
    const out = [];
    for (const [k, arr] of Object.entries(sk.cost)) {
      let v = arr[level];
      if (v == null) { // level beyond the table: use the highest listed level
        for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) { v = arr[i]; break; }
      }
      if (v == null) continue;
      const pm = k.endsWith('PerMinute');
      out.push({ type: k.replace(/PerMinute$/, '').replace(/^ManaPercent$/, 'Mana %'), value: pm ? v / 60 : v, perSecond: pm });
    }
    return out;
  }
  function atLevel(arr, level) {
    if (!arr) return undefined;
    if (arr[level] != null) return arr[level];
    for (let i = Math.min(level, arr.length - 1); i >= 0; i--) if (arr[i] != null) return arr[i];
    return undefined;
  }

  function parseSkillFile(text) {
    const out = {};
    for (const { key, body } of luaBlocks(text, 'skills')) {
      const lv = levels(body);
      const s = {
        name: str(body, 'name', '\\t'),
        desc: str(body, 'description', '\\t'),
        support: flag(body, 'support', '\\t'),
        hidden: flag(body, 'hidden', '\\t'),
        castTime: num(body, 'castTime', '\\t'),
        types: typeSet(body, 'skillTypes'),
        minionTypes: typeSet(body, 'minionSkillTypes'),
        req: typeList(body, 'requireSkillTypes'),
        add: typeList(body, 'addSkillTypes'),
        excl: typeList(body, 'excludeSkillTypes'),
        isTrigger: flag(body, 'isTrigger', '\\t'),
        cannotBeSupported: flag(body, 'cannotBeSupported', '\\t'),
        supportGemsOnly: flag(body, 'supportGemsOnly', '\\t'),
        cost: costSeries(lv),
        spirit: series(lv, 'spirit'),
        spiritPct: series(lv, 'spiritPct'),
        cd: series(lv, 'cd'),
        lvReq: series(lv, 'req'),
        stats: constantStats(body),
      };
      const mult = series(lv, 'manaMult');
      if (mult) s.manaMult = mult.find(v => v != null);
      for (const k of Object.keys(s)) {
        const v = s[k];
        if (v === undefined || v === false || (Array.isArray(v) && v.length === 0)) delete s[k];
      }
      out[key] = s;
    }
    return out;
  }

  function parseGems(text) {
    const out = {};
    for (const { key, body } of luaBlocks(text, '')) {
      const ge = str(body, 'grantedEffectId', '\\t\\t');
      if (!ge) continue;
      const tm = body.match(/^\t\ttags = \{([\s\S]*?)^\t\t\},/m);
      const g = {
        gameId: key,
        name: str(body, 'name', '\\t\\t'),
        gemType: str(body, 'gemType', '\\t\\t'),
        tagString: str(body, 'tagString', '\\t\\t'),
        tags: tm ? [...tm[1].matchAll(/(\w+) = true/g)].map(x => x[1]) : [],
        tier: num(body, 'Tier', '\\t\\t'),
        maxLevel: num(body, 'naturalMaxLevel', '\\t\\t'),
        reqStr: num(body, 'reqStr', '\\t\\t'),
        reqDex: num(body, 'reqDex', '\\t\\t'),
        reqInt: num(body, 'reqInt', '\\t\\t'),
        // A gem can grant more than one skill (e.g. a buff plus the attack it triggers).
        extra: [1, 2, 3, 4].map(i => str(body, 'additionalGrantedEffectId' + i, '\\t\\t')).filter(Boolean),
      };
      // Several base items can grant the same effect; keep the first.
      if (!out[ge]) out[ge] = g;
    }
    return out;
  }

  function parseTree(json) {
    const t = typeof json === 'string' ? JSON.parse(json) : json;
    const nodes = {};
    for (const [id, n] of Object.entries(t.nodes)) {
      if (id === 'root' || !n.name) continue;
      const o = { n: n.name };
      if (n.stats && n.stats.length) o.s = n.stats;
      const f = [];
      if (n.isNotable) f.push('notable');
      if (n.isKeystone) f.push('keystone');
      if (n.isJewelSocket) f.push('jewel');
      if (n.isAttribute) f.push('attr');
      if (n.isAscendancyStart) f.push('ascStart');
      if (n.isOnlyImage) f.push('image');
      if (n.isMultipleChoiceOption) f.push('choice');
      if (f.length) o.f = f;
      if (n.ascendancyName) o.a = n.ascendancyName;
      if (Array.isArray(n.options)) o.o = n.options.map(x => ({ id: x.id, n: x.name, s: x.stats }));
      o.c = (n.connections || []).map(c => c.id);
      nodes[id] = o;
    }
    // Connections are listed one way only; make them two-way.
    for (const [id, o] of Object.entries(nodes)) {
      for (const c of o.c) {
        const other = nodes[c];
        if (other && !other.c.includes(Number(id))) other.c.push(Number(id));
      }
    }
    for (const o of Object.values(nodes)) if (!o.c.length) delete o.c;
    const classes = (t.classes || []).map(c => ({
      name: c.name,
      ascendancies: (c.ascendancies || []).map(a => a.name || a.id),
    }));
    return { nodes, classes };
  }

  // Combine skill effects with gem base items into one lookup keyed by skillId.
  function assemble(treeData, gems, skills, meta, bases) {
    const g = {};
    for (const [id, s] of Object.entries(skills)) {
      if (!s.name) continue;
      const base = gems[id];
      const e = Object.assign({}, s);
      if (base) {
        e.gemType = base.gemType; e.tags = base.tags; e.tier = base.tier;
        e.maxLevel = base.maxLevel; e.tagString = base.tagString;
        if (base.extra && base.extra.length) e.extra = base.extra;
        e.gem = true;
      }
      g[id] = e;
    }
    return Object.assign({ meta, skills: g, bases: bases || {} }, treeData);
  }

  // PoB's calcLib.doesTypeExpressionMatch: an RPN expression over skill types.
  function typeExprMatch(expr, typeSet) {
    const st = [];
    for (const t of expr) {
      if (t === 'OR') { const b = st.pop(); st[st.length - 1] = st[st.length - 1] || b; }
      else if (t === 'AND') { const b = st.pop(); st[st.length - 1] = st[st.length - 1] && b; }
      else if (t === 'NOT') { st[st.length - 1] = !st[st.length - 1]; }
      else st.push(typeSet.has(t));
    }
    return st.some(Boolean);
  }
  // PoB's calcLib.canGrantedEffectSupportActiveSkill (gem-only subset).
  // Exclusions look at the skill's own types; requirements also accept its minions' types.
  function canSupport(sup, act, extraTypes) {
    if (act.cannotBeSupported) return false;
    const own = new Set(act.types || []);
    const types = new Set([...own, ...(act.minionTypes || []), ...(extraTypes || [])]);
    if (sup.excl && sup.excl.length && typeExprMatch(sup.excl, own)) return false;
    return !(sup.req && sup.req.length) || typeExprMatch(sup.req, types);
  }

  async function fetchAll(treeVersion, fetchText, onProgress) {
    const fl = fileList(treeVersion);
    const say = onProgress || (() => {});
    say('tree.json');
    const tree = parseTree(await fetchText(BASE + fl.tree));
    say('Gems.lua');
    const gems = parseGems(await fetchText(BASE + fl.gems));
    const skills = {};
    for (const f of fl.skills) {
      say(f.split('/').pop());
      Object.assign(skills, parseSkillFile(await fetchText(BASE + f)));
    }
    const bases = {};
    for (const f of fl.bases) {
      say(f.split('/').pop());
      try { Object.assign(bases, parseBases(await fetchText(BASE + f))); } catch { /* bases are optional */ }
    }
    return { tree, gems, skills, bases };
  }

  const api = { BASE, fileList, parseBases, parseSkillFile, parseGems, parseTree, assemble, typeExprMatch, canSupport, fetchAll, costAt, atLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PobData = api;
})(typeof window !== 'undefined' ? window : globalThis);
