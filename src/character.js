// Path of Building export code -> character model.
// Copyright (c) 2026 reytla. MIT licence.
// Works in the browser (DecompressionStream) and Node (zlib) so it can be tested.
(function (root) {
  'use strict';

  // ---------- decoding ----------
  function base64ToBytes(code) {
    let s = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    if (!/^[A-Za-z0-9+/]+=*$/.test(s)) throw new Error('The code contains characters that are not base64. Copy it again from Path of Building (Import/Export Build, Generate, Copy).');
    if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    const bin = atob(s), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function inflate(bytes) {
    if (typeof window === 'undefined') return require('zlib').inflateSync(Buffer.from(bytes)).toString('utf8');
    // 'deflate' in DecompressionStream is the zlib-wrapped format PoB uses.
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return await new Response(stream).text();
  }
  async function decodeExport(code) {
    const t = code.trim();
    if (t.startsWith('<')) return t; // already XML
    if (/^https?:\/\//.test(t)) throw new Error('This is a link, not an export code. In Path of Building use Import/Export Build, then Generate and Copy, and paste the long code itself.');
    let xml;
    try { xml = await inflate(base64ToBytes(t)); }
    catch (e) { throw new Error('Could not decompress the code (' + e.message + '). The code may be cut off: copy the whole code again.'); }
    if (!xml.includes('<PathOfBuilding')) throw new Error('Decoded, but the result is not a Path of Building document.');
    return xml;
  }

  // ---------- minimal XML reader (PoB output is regular, generated XML) ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decodeEnt = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? m));
  function parseXml(xml) {
    const rootEl = { tag: '#root', attrs: {}, children: [], text: '' };
    const stack = [rootEl];
    const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(xml))) {
      const top = stack[stack.length - 1];
      if (m[1] !== undefined) top.text += m[1];
      else if (m[6] !== undefined) top.text += decodeEnt(m[6]);
      else if (m[3]) {
        if (m[2]) { stack.pop(); continue; }
        const attrs = {};
        for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = decodeEnt(a[2]);
        const el = { tag: m[3], attrs, children: [], text: '' };
        top.children.push(el);
        if (!m[5]) stack.push(el);
      }
    }
    return rootEl;
  }
  const kids = (el, tag) => (el ? el.children.filter(c => c.tag === tag) : []);
  const kid = (el, tag) => kids(el, tag)[0];
  const nilOr = v => (v === undefined || v === 'nil' ? undefined : v);

  // ---------- items ----------
  const PROP_RE = /^(Unique ID|Item Level|Quality|LevelReq|Sockets|Rune|Radius|Limited to|Charm Slots|Energy Shield|Armour|Evasion|Ward|Evasion Rating|Spirit|Physical Damage|Elemental Damage|Critical Hit Chance|Attacks per Second|Reload Time|Block chance|Requires|Corrupted|Mirrored|Talisman Tier|Selected Variant|Has Alt Variant|League|Source|Variant|Catalyst|CatalystQuality|Prefix|Suffix|Crafted|Unreleased|Item Class|Base Percentile|ArmourBasePercentile|EvasionBasePercentile|EnergyShieldBasePercentile|Shaper Item|Elder Item|Implicits):?\s*(.*)$/;
  function parseItem(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const it = { rarity: 'NORMAL', name: '', base: '', props: {}, implicits: [], mods: [], inactive: [], runes: [], grants: [], variants: [], flags: [], corrupted: false, raw: text.trim() };
    let i = 0;
    const r = lines[0] && lines[0].match(/^Rarity:\s*(\w+)/i);
    if (r) { it.rarity = r[1].toUpperCase(); i = 1; }
    it.name = lines[i++] || '';
    if (it.rarity === 'RARE' || it.rarity === 'UNIQUE' || it.rarity === 'RELIC') it.base = lines[i++] || '';
    else it.base = it.name;
    let implicitCount = null;
    for (; i < lines.length; i++) {
      const L = lines[i];
      if (implicitCount === null) {
        const p = L.match(PROP_RE);
        if (p) {
          if (p[1] === 'Implicits') { implicitCount = Number(p[2]) || 0; continue; }
          if (p[1] === 'Corrupted') it.corrupted = true;
          if (p[1] === 'Rune') it.runes.push(p[2]);
          if (p[1] === 'Variant') { it.variants.push(p[2]); continue; }
          it.props[p[1]] = p[2];
          continue;
        }
        implicitCount = 0; // no Implicits line: everything after props is a mod
      }
      // Status lines PoB writes after the mods.
      if (/^(Corrupted|Mirrored|Sanctified|Unmodifiable|Split|Fractured Item|Desecrated)$/i.test(L)) {
        it.flags.push(L); if (/^Corrupted$/i.test(L)) it.corrupted = true; continue;
      }
      const mod = parseModLine(L);
      const target = implicitCount > 0 ? it.implicits : it.mods;
      if (implicitCount > 0) implicitCount--;
      // Unique items with variants: keep only the mods of the selected variant.
      const sel = Number(it.props['Selected Variant'] || it.variants.length || 0);
      if (mod.variant && sel && !mod.variant.includes(sel)) { it.inactive.push(mod); continue; }
      if (/^Grants Skill:/i.test(mod.text)) it.grants.push(mod.text.replace(/^Grants Skill:\s*/i, ''));
      target.push(mod);
    }
    return it;
  }
  // "{crafted}{variant:1,2}{range:0.5}text" -> { text, tags: ['crafted', ...], variant: [1, 2] }
  function parseModLine(L) {
    const tags = []; let variant;
    const t = L.replace(/^((?:\{[^}]*\})+)/, (_, g) => {
      for (const x of g.matchAll(/\{([^}:]*)(?::([^}]*))?\}/g)) {
        if (x[1] === 'variant') variant = x[2].split(',').map(Number);
        else if (x[1] !== 'range' && x[1] !== 'tags') tags.push(x[1]);
      }
      return '';
    });
    const o = { text: t.trim(), tags };
    if (variant) o.variant = variant;
    return o;
  }

  // ---------- whole build ----------
  // opts: { spec, skillSet, itemSet } - 1-based indexes; default = the set active in PoB.
  function parseBuild(xml, opts) {
    opts = opts || {};
    const doc = parseXml(xml);
    const pob = kid(doc, 'PathOfBuilding2') || kid(doc, 'PathOfBuilding');
    if (!pob) throw new Error('No PathOfBuilding root element.');
    const isPoe2 = pob.tag === 'PathOfBuilding2';
    const b = kid(pob, 'Build');
    const stats = {};
    for (const s of kids(b, 'PlayerStat')) stats[s.attrs.stat] = Number(s.attrs.value);
    const buffs = kid(b, 'Buffs');

    const treeEl = kid(pob, 'Tree');
    const specs = kids(treeEl, 'Spec');
    const specIdx = Number(opts.spec || treeEl?.attrs.activeSpec || 1);
    const spec = specs[specIdx - 1] || specs[0];
    const ids = s => (s ? s.split(',').map(x => x.trim()).filter(Boolean).map(Number) : []);
    const ov = kid(kid(spec, 'Overrides'), 'AttributeOverride');
    const tree = spec ? {
      version: spec.attrs.treeVersion,
      ascendClassId: spec.attrs.ascendClassId,
      nodes: ids(spec.attrs.nodes),
      ws1: ids(kid(spec, 'WeaponSet1')?.attrs.nodes),
      ws2: ids(kid(spec, 'WeaponSet2')?.attrs.nodes),
      sockets: Object.fromEntries(kids(kid(spec, 'Sockets'), 'Socket').map(s => [s.attrs.nodeId, s.attrs.itemId])),
      attr: ov ? { str: ids(ov.attrs.strNodes), dex: ids(ov.attrs.dexNodes), int: ids(ov.attrs.intNodes) } : { str: [], dex: [], int: [] },
      url: (kid(spec, 'URL')?.text || '').trim(),
      title: spec.attrs.title || '',
    } : null;

    const skillsEl = kid(pob, 'Skills');
    const sets = kids(skillsEl, 'SkillSet');
    const setIdx = opts.skillSet || (sets.findIndex(s => s.attrs.id === (skillsEl?.attrs.activeSkillSet || '1')) + 1) || 1;
    const set = sets[setIdx - 1] || sets[0] || skillsEl;
    const groups = kids(set, 'Skill').map((s, idx) => ({
      index: idx + 1,
      label: s.attrs.label || '',
      slot: s.attrs.slot,
      source: s.attrs.source,
      enabled: s.attrs.enabled !== 'false',
      gems: kids(s, 'Gem').map(g => ({
        name: g.attrs.nameSpec || '',
        skillId: g.attrs.skillId,
        gemId: g.attrs.gemId,
        level: Number(g.attrs.level || 1),
        quality: Number(g.attrs.quality || 0),
        enabled: g.attrs.enabled !== 'false',
        corrupted: g.attrs.corrupted === 'true',
        count: Number(nilOr(g.attrs.count) || 1),
      })),
    }));

    const itemsEl = kid(pob, 'Items');
    const items = {};
    for (const it of kids(itemsEl, 'Item')) items[it.attrs.id] = Object.assign({ id: it.attrs.id }, parseItem(it.text));
    const itemSets = kids(itemsEl, 'ItemSet');
    const isetIdx = opts.itemSet || (itemSets.findIndex(s => s.attrs.id === itemsEl?.attrs.activeItemSet) + 1) || 1;
    const iset = itemSets[isetIdx - 1] || itemSets[0] || itemsEl;
    const slots = {};
    for (const s of kids(iset, 'Slot')) if (s.attrs.itemId && s.attrs.itemId !== '0') slots[s.attrs.name] = s.attrs.itemId;
    if (tree) for (const [node, itemId] of Object.entries(tree.sockets)) if (itemId && itemId !== '0') slots['Jewel ' + node] = itemId;

    const config = {};
    const cfg = kid(pob, 'Config');
    const cset = kids(cfg, 'ConfigSet').find(s => s.attrs.id === cfg?.attrs.activeConfigSet) || kids(cfg, 'ConfigSet')[0] || cfg;
    for (const inp of kids(cset, 'Input')) config[inp.attrs.name] = inp.attrs.number ?? inp.attrs.boolean ?? inp.attrs.string;

    return {
      isPoe2,
      className: b?.attrs.className, ascendancy: nilOr(b?.attrs.ascendClassName),
      level: Number(b?.attrs.level || 1), targetVersion: b?.attrs.targetVersion,
      mainSocketGroup: Number(b?.attrs.mainSocketGroup || 1),
      stats, buffs: buffs ? { buffs: splitList(buffs.attrs.buffList), curses: splitList(buffs.attrs.curseList) } : { buffs: [], curses: [] },
      tree, groups, items, slots, config,
      // What can be chosen, and what was chosen (1-based).
      choices: {
        specs: specs.map((s, i) => s.attrs.title || `Tree ${i + 1}`),
        skillSets: sets.map((s, i) => s.attrs.title || `Skill set ${i + 1}`),
        itemSets: itemSets.map((s, i) => s.attrs.title || `Item set ${i + 1}`),
        spec: specs.indexOf(spec) + 1, skillSet: sets.indexOf(set) + 1, itemSet: itemSets.indexOf(iset) + 1,
      },
      useSecondWeaponSet: iset?.attrs?.useSecondWeaponSet === 'true',
    };
  }
  const splitList = s => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : []);

  async function load(code, opts) { return parseBuild(await decodeExport(code), opts); }

  const api = { decodeExport, parseXml, parseItem, parseBuild, load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PobChar = api;
})(typeof window !== 'undefined' ? window : globalThis);
