// Exile Build Advisor: stage 3, ranking and actions.
// Copyright (c) 2026 reytla. MIT licence.
//
// plan(analysis, char, snap, ctx) adds to every finding:
//   value   how much it helps, weighted by the player's goals
//   cost    currency (Exalted Orbs, from the player's price table), passive points, effort
//   ratio   value per cost, used for the ranking
//   links   trade-site searches; craft: crafting steps; stash: matching stash items
// Prices are never guessed: a blank price makes the currency cost "unknown".
(function (root) {
  'use strict';
  const A = typeof module !== 'undefined' && module.exports ? require('./analysis.js') : root.PobAnalysis;

  const GOALS = [
    ['damage', 'Damage', 'Kill things faster.'],
    ['survive', 'Survivability', 'Die less.'],
    ['mana', 'Mana', 'Stop running out of mana.'],
    ['ease', 'Ease of play', 'Fewer buttons and less to manage.'],
    ['speed', 'Progression', 'Level up and move through content faster.'],
  ];
  const DEFAULT_GOALS = { damage: 2, survive: 2, mana: 1, ease: 1, speed: 1 };
  const GOAL_LEVELS = ['Not', 'Some', 'A lot', 'Most'];

  // Price table rows. Values are in Exalted Orbs; blank = unknown.
  const PRICES = [
    ['divine', 'Divine Orb', 'How many Exalted Orbs one Divine Orb is worth.'],
    ['chaos', 'Chaos Orb', 'How many Exalted Orbs one Chaos Orb is worth.'],
    ['rareRes', 'Rare item with a resistance you need', 'A typical rare ring, belt or armour piece with about +30% of one resistance.'],
    ['rareGood', 'Good rare upgrade for one slot', 'A rare item with the stats your build wants.'],
    ['jewel', 'Rare jewel', 'A rare jewel with stats your build uses.'],
    ['uncutSkill', 'Uncut Skill Gem', 'At the level you need.'],
    ['uncutSpirit', 'Uncut Spirit Gem', 'At the level you need.'],
    ['essence', 'Essence (normal)', 'For example Essence of Insulation.'],
  ];
  const EFFORT = { 1: 'a few minutes', 2: 'a short trade or task', 3: 'a play session or more' };

  // ---------- inputs the player types ----------
  const CUR_ALIASES = [
    ['divine', /^div(ine)?s?( orbs?)?$/i], ['exalted', /^ex(alt(ed)?)?s?( orbs?)?$/i], ['chaos', /^c(haos)?( orbs?)?$/i],
    ['regal', /^regals?( orbs?)?$/i], ['alchemy', /^alch(emy)?s?|^orbs? of alchemy$/i], ['augmentation', /^aug(ment(ation)?)?s?|^orbs? of augmentation$/i],
    ['transmutation', /^trans(mut(ation)?)?s?|^orbs? of transmutation$/i], ['vaal', /^vaals?( orbs?)?$/i], ['annulment', /^annul(ment)?s?|^orbs? of annulment$/i],
  ];
  function parseSpare(text) {
    const out = {}, unknown = [];
    for (const line of String(text || '').split(/\n/)) {
      const m = line.trim().match(/^(\d+(?:[.,]\d+)?)\s*x?\s+(.+)$/i) || line.trim().match(/^(.+?)\s*[:=x]\s*(\d+(?:[.,]\d+)?)$/i);
      if (!m) { if (line.trim()) unknown.push(line.trim()); continue; }
      const [qty, name] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
      const k = (CUR_ALIASES.find(([, re]) => re.test(name.trim())) || [])[0] || name.trim().toLowerCase();
      out[k] = (out[k] || 0) + Number(qty.replace(',', '.'));
    }
    return { have: out, unknown };
  }
  const exRate = (k, prices) => k === 'exalted' ? 1 : k === 'divine' ? prices.divine : k === 'chaos' ? prices.chaos : null;
  function spareValue(spare, prices) {
    let ex = 0; const unpriced = [];
    for (const [k, q] of Object.entries(spare.have)) { const r = exRate(k, prices); if (r) ex += q * r; else unpriced.push(k); }
    return { ex, unpriced };
  }

  // Items copied from the game with Ctrl+C (or from the trade site).
  function parseStash(text) {
    const t = String(text || '').replace(/\r/g, '');
    const blocks = /^Item Class:/m.test(t) ? t.split(/(?=^Item Class:)/m) : t.split(/\n\s*\n/);
    const items = [];
    for (const b of blocks) {
      const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const cls = (lines.find(l => /^Item Class:/.test(l)) || '').replace('Item Class:', '').trim();
      const ri = lines.findIndex(l => /^Rarity:/.test(l));
      const name = ri >= 0 ? lines[ri + 1] : lines[0];
      const base = ri >= 0 && lines[ri + 2] && lines[ri + 2] !== '--------' ? lines[ri + 2] : '';
      const mods = lines.filter(l => l !== '--------' && !/^(Item Class|Rarity|Requires|Item Level|Quality|Sockets|Level|Stack Size|Note):/i.test(l))
        .map(l => l.replace(/\s*\((implicit|rune|enchant|crafted|desecrated|fractured)\)$/i, ''));
      items.push({ name, base, cls, mods });
    }
    return items.filter(i => i.mods.length);
  }

  // ---------- reading stat values from item text ----------
  function resOn(mods, el) {
    let v = 0;
    for (const m of mods) {
      const t = m.text || m;
      let r = t.match(/^\+?(\d+)% to all elemental resistances$/i);
      if (r && el !== 'Chaos') { v += +r[1]; continue; }
      r = t.match(/^\+?(\d+)% to ([a-z]+)(?: and ([a-z]+))? resistances?$/i);
      if (r && [r[2], r[3]].some(x => x && x.toLowerCase() === el.toLowerCase())) v += +r[1];
    }
    return v;
  }
  const ATTR_NAME = { Str: 'Strength', Dex: 'Dexterity', Int: 'Intelligence' };
  function attrOn(mods, k) {
    let v = 0;
    for (const m of mods) {
      const t = m.text || m;
      const r = t.match(/^\+?(\d+) to ([a-z ]+)$/i);
      if (!r) continue;
      const what = r[2].toLowerCase();
      if (what === ATTR_NAME[k].toLowerCase() || what === 'all attributes' || what.split(' and ').includes(ATTR_NAME[k].toLowerCase())) v += +r[1];
    }
    return v;
  }

  // ---------- trade site ----------
  const TRADE = 'https://www.pathofexile.com/trade2/search/poe2/';
  const SLOT_CAT = {
    'Helmet': 'armour.helmet', 'Body Armour': 'armour.chest', 'Gloves': 'armour.gloves', 'Boots': 'armour.boots',
    'Amulet': 'accessory.amulet', 'Ring 1': 'accessory.ring', 'Ring 2': 'accessory.ring', 'Ring 3': 'accessory.ring', 'Belt': 'accessory.belt',
  };
  const BASE_CAT = {
    'Claw': 'weapon.claw', 'Dagger': 'weapon.dagger', 'One Hand Sword': 'weapon.onesword', 'One Hand Axe': 'weapon.oneaxe', 'One Hand Mace': 'weapon.onemace',
    'Spear': 'weapon.spear', 'Flail': 'weapon.flail', 'Two Hand Sword': 'weapon.twosword', 'Two Hand Axe': 'weapon.twoaxe', 'Two Hand Mace': 'weapon.twomace',
    'Talisman': 'weapon.talisman', 'Bow': 'weapon.bow', 'Crossbow': 'weapon.crossbow', 'Wand': 'weapon.wand', 'Sceptre': 'weapon.sceptre',
    'Quiver': 'armour.quiver', 'Focus': 'armour.focus', 'Jewel': 'jewel',
  };
  function categoryOf(slot, it, snap) {
    if (SLOT_CAT[slot]) return SLOT_CAT[slot];
    const c = A.itemClass(snap, it);
    if (!c) return /Jewel/.test(slot) ? 'jewel' : null;
    if (c.t === 'Staff') return c.st === 'Warstaff' ? 'weapon.warstaff' : 'weapon.staff';
    if (c.t === 'Shield') return c.st === 'Evasion' ? 'armour.buckler' : 'armour.shield';
    return BASE_CAT[c.t] || null;
  }
  const PSEUDO_RES = { Fire: 'pseudo.pseudo_total_fire_resistance', Cold: 'pseudo.pseudo_total_cold_resistance', Lightning: 'pseudo.pseudo_total_lightning_resistance', Chaos: 'pseudo.pseudo_total_chaos_resistance' };
  const PSEUDO_ATTR = { Str: 'pseudo.pseudo_total_strength', Dex: 'pseudo.pseudo_total_dexterity', Int: 'pseudo.pseudo_total_intelligence' };
  const PSEUDO_LIFE = 'pseudo.pseudo_total_life';

  function tradeUrl(league, { category, stats = [], type, filters = {} }) {
    const q = { query: { status: { option: 'available' }, stats: [{ type: 'and', filters: stats.map(([id, min]) => ({ id, value: { min: Math.round(min) } })) }], filters: {} }, sort: { price: 'asc' } };
    if (type) q.query.type = type;
    if (category) q.query.filters.type_filters = { filters: { category: { option: category } } };
    Object.assign(q.query.filters, filters);
    return TRADE + encodeURIComponent(league || 'Standard') + '?q=' + encodeURIComponent(JSON.stringify(q));
  }

  // ---------- per-finding costs and actions ----------
  const ESSENCE_RES = { Fire: 'Essence of Insulation', Cold: 'Essence of Thawing', Lightning: 'Essence of Grounding', Chaos: 'Essence of Ruin' };
  const kindOf = f => f.id.split('-')[0];

  function actionsFor(f, c, snap, ctx, profile) {
    const out = { links: [], craft: [], stash: [], cost: { price: null, points: 0, effort: 2 } };
    const kind = kindOf(f);
    const lvl = ctx.level || c.level;
    const addTarget = lvl < 30 ? 15 : lvl < 50 ? 25 : lvl < 70 ? 30 : 40;
    const gear = profile.gear.filter(g => !g.set || g.set === profile.activeSet);
    const slotItem = s => c.slots[s] && c.items[c.slots[s]];

    if (kind === 'res') {
      const el = f.id.split('-')[1], gap = f.data?.gap ?? Math.max(0, 75 - (c.stats[el + 'Resist'] || 0));
      // Upgrade the rare armour or jewellery piece that gives the least of this resistance now.
      const cands = Object.keys(SLOT_CAT).map(s => ({ s, it: slotItem(s) })).filter(x => x.it && x.it.rarity !== 'UNIQUE')
        .map(x => ({ ...x, v: resOn(x.it.mods.concat(x.it.implicits), el) })).sort((a, b) => a.v - b.v);
      const pick = cands[0];
      const add = Math.min(Math.ceil(gap), addTarget);
      if (pick) {
        const keep = ['Fire', 'Cold', 'Lightning'].filter(e => e !== el).map(e => [e, resOn(pick.it.mods.concat(pick.it.implicits), e)]).filter(([, v]) => v > 0);
        out.links.push({ label: `Search: ${pick.s.replace(/ \d$/, '')} with ${pick.v + add}%+ ${el.toLowerCase()} resistance`,
          url: tradeUrl(ctx.league, { category: SLOT_CAT[pick.s], stats: [[PSEUDO_RES[el], pick.v + add], ...keep.map(([e, v]) => [PSEUDO_RES[e], v])] }),
          note: `Replaces ${pick.it.name} (${pick.s}), which has ${pick.v}%${keep.length ? `; keeps its ${list(keep.map(([e, v]) => `${v}% ${e.toLowerCase()}`))}` : ''}.` });
        out.craft.push(`Crafting instead: an ${ESSENCE_RES[el]} turns a magic (blue) ${pick.s.replace(/ \d$/, '').toLowerCase()} into a rare one with ${el.toLowerCase()} resistance guaranteed. On a rare item with a free suffix, an Exalted Orb adds a random mod, which may be a resistance.`);
      }
      out.stash = stashHits(ctx.stash, it => resOn(it.mods, el), v => `+${v}% ${el.toLowerCase()} resistance`);
      out.cost = { price: 'rareRes', points: 0, effort: 2 };
      if (gap > addTarget) out.note = `One item rarely covers ${Math.round(gap)}%. Plan on ${Math.ceil(gap / addTarget)} pieces.`;
      if (gap > addTarget) out.cost.qty = Math.ceil(gap / addTarget);
    } else if (kind === 'attr') {
      const k = f.id.split('-')[1], need = (c.stats['Req' + k] || 0) - (c.stats[k] || 0);
      const cands = ['Amulet', 'Ring 1', 'Ring 2', 'Belt', 'Gloves', 'Boots', 'Helmet'].map(s => ({ s, it: slotItem(s) })).filter(x => x.it && x.it.rarity !== 'UNIQUE')
        .map(x => ({ ...x, v: attrOn(x.it.mods.concat(x.it.implicits), k) })).sort((a, b) => a.v - b.v);
      if (cands[0]) out.links.push({ label: `Search: ${cands[0].s.replace(/ \d$/, '')} with ${cands[0].v + need}+ ${ATTR_NAME[k].toLowerCase()}`,
        url: tradeUrl(ctx.league, { category: SLOT_CAT[cands[0].s], stats: [[PSEUDO_ATTR[k], cands[0].v + need]] }), note: `Replaces ${cands[0].it.name}, which gives ${cands[0].v}.` });
      out.craft.push(`Quicker: ${Math.ceil(need / 5)} attribute passive${need > 5 ? 's' : ''} on the tree give +5 ${ATTR_NAME[k].toLowerCase()} each.`);
      out.stash = stashHits(ctx.stash, it => attrOn(it.mods, k), v => `+${v} ${ATTR_NAME[k].toLowerCase()}`);
      out.cost = { price: 'rareGood', points: 0, effort: 2, alt: `or ${Math.ceil(need / 5)} passive point${need > 5 ? 's' : ''}` };
    } else if (kind === 'gemlvl') {
      const m = f.title.match(/use level (\d+)/), L = m ? +m[1] : null;
      const spirit = /Spirit Gem/.test(f.action[0] || '');
      const type = spirit ? 'Uncut Spirit Gem' : 'Uncut Skill Gem';
      out.links.push({ label: `Search: ${type} level ${L}`, url: tradeUrl(ctx.league, { type, filters: { misc_filters: { filters: { gem_level: { min: L } } } } }), note: 'Or use one you already have.' });
      out.cost = { price: spirit ? 'uncutSpirit' : 'uncutSkill', points: 0, effort: 1 };
    } else if (kind === 'sup' || kind === 'supsoft' || kind === 'grp') {
      out.cost = { price: 0, points: 0, effort: 1 };
      out.craft.push('In the game: open the skill gem panel, take the support out, and socket it where it helps.');
    } else if (kind === 'mana') {
      out.cost = { price: 0, points: 0, effort: 1, alt: 'or regeneration on gear (cost unknown)' };
    } else if (kind === 'spirit') {
      out.cost = f.id === 'spirit-free' ? { price: 'uncutSpirit', points: 0, effort: 2 } : { price: 0, points: 0, effort: 1 };
    } else if (kind === 'tree') {
      if (f.id === 'tree-unspent') out.cost = { price: 0, points: 0, effort: 1 };
      else {
        const n = (f.nodes || []).length;
        out.cost = { price: 0, points: -n, effort: n > 4 ? 2 : 1, alt: 'plus gold to refund' };
        out.craft.push('Refunding costs gold. Open the passive tree, right-click a passive to mark it for refund, then confirm. Spend the freed points on something your build uses.');
      }
    } else if (kind === 'asc') {
      out.cost = { price: 0, points: 0, effort: 3 };
    } else if (kind === 'gear') {
      const slot = f.id.replace('gear-dead-', '');
      const it = slotItem(slot);
      const cat = it && categoryOf(slot, it, snap);
      if (it && cat) {
        // Keep what the item already gives: resistances and life.
        const mods = it.mods.concat(it.implicits);
        const keep = ['Fire', 'Cold', 'Lightning', 'Chaos'].map(e => [PSEUDO_RES[e], resOn(mods, e), e]).filter(([, v]) => v > 0);
        const life = mods.map(m => (m.text.match(/^\+(\d+) to maximum life$/i) || [])[1]).filter(Boolean).reduce((a, b) => a + +b, 0);
        if (it.rarity !== 'UNIQUE') out.links.push({ label: `Search: replacement ${cat.split('.').pop().replace('chest', 'body armour')}`,
          url: tradeUrl(ctx.league, { category: cat, stats: [...keep.map(([id, v]) => [id, v]), ...(life ? [[PSEUDO_LIFE, life]] : [])] }),
          note: keep.length || life ? `Keeps what ${it.name} gives you now: ${list([...keep.map(([, v, e]) => `${v}% ${e.toLowerCase()} resistance`), ...(life ? [`${life} life`] : [])])}. Add the stats you want on the trade site.` : 'Add the stats you want on the trade site.' });
        out.craft.push(it.rarity === 'UNIQUE' ? 'This is a unique item, so its mods cannot be changed. Swap it if a rare would serve you better.'
          : 'Crafting instead: these mods cannot be removed one by one without special currency, so replacing the item is usually simpler.');
      }
      out.cost = { price: /Jewel/.test(slot) ? 'jewel' : 'rareGood', points: 0, effort: 2 };
    } else if (kind === 'hit') {
      out.cost = { price: null, points: 0, effort: 2 };
    }
    return out;
  }
  function stashHits(items, valueOf, describe) {
    return (items || []).map(it => ({ it, v: valueOf(it) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3)
      .map(x => `${x.it.name}${x.it.base && x.it.base !== x.it.name ? ` (${x.it.base})` : ''}${x.it.cls ? `, ${x.it.cls.replace(/s$/, '').toLowerCase()}` : ''}: ${describe(x.v)}`);
  }
  const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

  // ---------- value, cost and ranking ----------
  const SEV_W = { bad: 3, warn: 2, info: 1 };
  const CERT_W = { sure: 1, likely: 0.8, check: 0.5 };
  function valueOf(f, goals) {
    const g = f.goals || {};
    let fit = 0;
    for (const [k] of GOALS) fit += ((goals[k] ?? 0) / 3) * (g[k] || 0);
    return SEV_W[f.sev] * (0.4 + Math.min(fit, 2)) * (CERT_W[f.certainty] || 1);
  }
  // Cost in "effort points": effort 1-3, a point per 2 passive points spent, and currency relative to budget.
  function costOf(cost, prices, budgetEx) {
    const price = cost.price === 0 ? 0 : cost.price ? prices[cost.price] : null;
    const ex = price == null ? null : price * (cost.qty || 1);
    let score = cost.effort + Math.max(0, cost.points) * 0.5;
    if (ex == null) score += cost.price === null ? 1 : 2; // unknown price: assume a middling cost
    else score += budgetEx ? 5 * ex / budgetEx : ex / 10;
    return { ex, score: Math.max(score, 0.5) };
  }

  function plan(analysis, c, snap, ctx) {
    const goals = Object.assign({}, DEFAULT_GOALS, ctx.goals || {});
    const prices = ctx.prices || {};
    const budgetEx = ctx.budget ? ctx.budget * (exRate(ctx.budgetCur || 'exalted', prices) || NaN) : null;
    const spare = parseSpare(ctx.spareText);
    const spareEx = spareValue(spare, prices);
    const stash = parseStash(ctx.stashText);
    const ctx2 = Object.assign({}, ctx, { stash });
    const out = analysis.findings.map(f => {
      const a = actionsFor(f, c, snap, ctx2, analysis.profile);
      const cs = costOf(a.cost, prices, isNaN(budgetEx) ? null : budgetEx);
      const value = valueOf(f, goals);
      const r = Object.assign({}, f, a, { value, costScore: cs.score, ex: cs.ex, ratio: value / cs.score });
      if (cs.ex != null && budgetEx && !isNaN(budgetEx)) r.overBudget = cs.ex > budgetEx;
      if (cs.ex != null && cs.ex > 0 && spareEx.ex) r.affordable = spareEx.ex >= cs.ex;
      return r;
    });
    const ranked = out.slice().sort((x, y) => y.ratio - x.ratio || y.value - x.value);
    ranked.forEach((f, i) => { f.rank = i + 1; });
    const maxR = Math.max(...out.map(f => f.ratio), 0.0001), maxV = Math.max(...out.map(f => f.value), 0.0001);
    for (const f of out) { f.ratioPct = f.ratio / maxR; f.valuePct = f.value / maxV; }
    return { findings: out, ranked, goals, budgetEx: isNaN(budgetEx) ? undefined : budgetEx, budgetUnknown: ctx.budget && isNaN(budgetEx), spare, spareEx, stash };
  }

  const api = { plan, GOALS, DEFAULT_GOALS, GOAL_LEVELS, PRICES, EFFORT, parseSpare, parseStash, tradeUrl, resOn, attrOn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PobPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
