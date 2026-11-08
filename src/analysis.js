// Exile Build Advisor: stage 2 analysis rules.
// Copyright (c) 2026 reytla. MIT licence.
//
// analyse(char, snapshot, opts) -> { findings, profile, spirit, mana }
// Every rule works from game data (skill types, item classes, stat text) and Path of
// Building's own numbers, never from class or build specific lists, so it applies to
// every class and play style. Anything the page cannot work out is labelled unknown.
(function (root) {
  'use strict';
  const P = typeof module !== 'undefined' && module.exports ? require('./pobdata.js') : root.PobData;

  const CAP = 75;
  const ELEMENTS = ['Fire', 'Cold', 'Lightning'];
  const r0 = n => Math.round(n), r1 = n => Math.round(n * 10) / 10;
  const num = n => (n == null || isNaN(n) ? 'unknown' : Math.abs(n) < 10 && n % 1 ? r1(n).toString() : Math.round(n).toLocaleString('en'));
  const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const pl = (n, w, wp) => `${num(n)} ${n === 1 ? w : (wp || w + 's')}`;

  // ---------- build profile: what the character actually uses ----------
  const SET_SLOTS = { 1: ['Weapon 1', 'Weapon 2'], 2: ['Weapon 1 Swap', 'Weapon 2 Swap'] };
  const isWeaponSlot = s => /^Weapon [12]( Swap)?$/.test(s);

  function itemClass(snap, it) {
    const b = it && snap.bases && (snap.bases[it.base] || snap.bases[it.name]);
    return b ? { t: b.t, st: b.st || '' } : null;
  }

  function profile(c, snap) {
    const skill = id => (id ? snap.skills[id] : undefined);
    const activeSet = c.useSecondWeaponSet ? 2 : 1;
    const weapons = {};
    for (const set of [1, 2]) {
      weapons[set] = SET_SLOTS[set].map(s => c.slots[s] && c.items[c.slots[s]]).filter(Boolean)
        .map(it => ({ it, cls: itemClass(snap, it) }));
    }
    // Gear whose mods apply right now: everything except the weapon set you are not holding.
    const gear = [];
    for (const [slot, id] of Object.entries(c.slots)) {
      const it = c.items[id]; if (!it) continue;
      const w = slot.match(/^Weapon [12]( Swap)?/);
      const set = w ? (w[1] ? 2 : 1) : 0;
      gear.push({ slot, it, set, cls: itemClass(snap, it), jewel: /^Jewel /.test(slot) || / Jewel Socket /.test(slot) });
    }
    const groups = c.groups.map((g, i) => {
      const gems = g.gems.filter(x => x.enabled !== false).map(x => ({ x, d: skill(x.skillId) }));
      const acts = gems.filter(o => o.d && !o.d.support);
      const sups = gems.filter(o => o.d && o.d.support);
      const meta = acts.find(o => o.d.types?.includes('Meta'));
      return { g, i, gems, acts, sups, meta, item: !!g.source?.startsWith('Item:'), enabled: g.enabled !== false };
    });
    // A skill an item grants appears twice when you also set it up yourself.
    const own = new Set(groups.filter(G => !G.item).flatMap(G => G.acts.map(o => o.x.skillId)));
    for (const G of groups) G.duplicate = G.item && !G.sups.length && G.acts.length > 0 && G.acts.every(o => own.has(o.x.skillId));

    const types = new Set();
    const used = [];
    for (const G of groups) {
      if (!G.enabled) continue;
      for (const o of G.acts) {
        if (o === G.meta && G.acts.length > 1) continue; // the skills inside define what the group does
        for (const t of o.d.types || []) types.add(t);
        used.push(o);
      }
    }
    // Elements the build deals: from its skills, plus gear/tree lines that add or convert damage.
    const elements = new Set(['Fire', 'Cold', 'Lightning', 'Chaos', 'Physical'].filter(e => types.has(e)));
    const allLines = [...gear.flatMap(g => g.it.mods.concat(g.it.implicits).map(m => m.text)),
      ...(c.tree?.nodes || []).flatMap(id => snap.nodes[id]?.s || [])];
    for (const e of ['Fire', 'Cold', 'Lightning', 'Chaos', 'Physical'])
      if (allLines.some(l => new RegExp(`(adds|gain|as extra|converted to|convert).*\\b${e}\\b|\\b${e}\\b damage .*(as extra|converted)`, 'i').test(l))) elements.add(e);
    if (types.has('Attack')) elements.add('Physical');
    return { activeSet, weapons, gear, groups, types, used, elements, skill };
  }

  // ---------- conditions in stat text ----------
  // Each rule: a test on the text, and what the build must have for it to do anything.
  const WEAPONS = [
    ['Quarterstaff', /\bquarterstav(es|e)|\bquarterstaff/i, c => c.t === 'Staff' && c.st === 'Warstaff'],
    ['Staff', /\bstav(es)\b|\bstaff\b/i, c => c.t === 'Staff' && c.st !== 'Warstaff'],
    ['Crossbow', /\bcrossbows?\b/i, c => c.t === 'Crossbow'],
    ['Bow', /\bbows?\b/i, c => c.t === 'Bow'],
    ['Mace', /\bmaces?\b/i, c => /Mace/.test(c.t)],
    ['Spear', /\bspears?\b/i, c => c.t === 'Spear'],
    ['Sword', /\bswords?\b/i, c => /Sword/.test(c.t)],
    ['Axe', /\baxes?\b/i, c => /Axe/.test(c.t)],
    ['Dagger', /\bdaggers?\b/i, c => c.t === 'Dagger'],
    ['Claw', /\bclaws?\b/i, c => c.t === 'Claw'],
    ['Flail', /\bflails?\b/i, c => c.t === 'Flail'],
    ['Wand', /\bwands?\b/i, c => c.t === 'Wand'],
    ['Sceptre', /\bsceptres?\b/i, c => c.t === 'Sceptre'],
    ['Talisman', /\btalismans?\b/i, c => c.t === 'Talisman'],
    ['Buckler', /\bbucklers?\b/i, c => c.t === 'Shield' && c.st === 'Evasion'],
    ['Shield', /\bshields?\b/i, c => c.t === 'Shield'],
    ['Focus', /\bfoci\b|\bfocus\b/i, c => c.t === 'Focus'],
    ['Quiver', /\bquivers?\b/i, c => c.t === 'Quiver'],
  ];
  const TWO_HAND = c => /^Two Hand/.test(c.t) || ['Bow', 'Crossbow', 'Staff', 'Talisman'].includes(c.t);
  const ONE_HAND = c => /^One Hand/.test(c.t) || ['Wand', 'Sceptre', 'Dagger', 'Claw', 'Flail', 'Spear'].includes(c.t);
  const IS_WEAPON = c => c && !['Shield', 'Focus', 'Quiver'].includes(c.t);
  // Wording that ties a line to a weapon you hold, e.g. "with Maces", "while wielding a Bow".
  const HOLD = /\b(with|while wielding|while holding|while using|using|from|if you have|for|wielding)\s+(an?\s+)?([a-z ]+?)(\s|,|\.|$)/ig;

  function weaponNeeds(text) {
    const out = [];
    if (/\bdual wield/i.test(text)) out.push(['dual wielding', w => w.filter(x => IS_WEAPON(x.cls)).length >= 2]);
    if (/\btwo hand(ed)? (weapon|melee|attack)|\bwith two hand/i.test(text)) out.push(['a two-handed weapon', w => w.some(x => x.cls && TWO_HAND(x.cls))]);
    if (/\bone hand(ed)? (weapon|melee|attack)|\bwith one hand/i.test(text)) out.push(['a one-handed weapon', w => w.some(x => x.cls && ONE_HAND(x.cls))]);
    // Only weapon words that the line ties to holding something count; "Bow Attacks" or "Spear Skills" too.
    text = text.replace(/energy shield/ig, 'ES'); // "Energy Shield" is not a shield
    for (const [name, re, test] of WEAPONS) {
      const m = text.match(re); if (!m) continue;
      const near = new RegExp(`(with|wielding|holding|using|while|if you have|equipped)[^.,;]{0,24}${m[0]}|${m[0]}\\s+(attacks?|skills?|damage|hits?)|raised\\s+${m[0]}|${m[0]}\\s+is\\s+raised`, 'i');
      if (!near.test(text)) continue;
      // "Bow" inside "Crossbow" is excluded by \b; "Staff" vs "Quarterstaff" likewise.
      out.push([(/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name, w => w.some(x => x.cls && test(x.cls))]);
      break;
    }
    return out;
  }

  // Needs on the build's skills. [label, test on profile, certainty]
  const SKILL_NEEDS = [
    [/\bminions?\b/i, 'a minion skill', p => ['Minion', 'CreatesMinion', 'Companion', 'CreatesCompanion', 'CommandsMinions'].some(t => p.types.has(t))],
    [/\btotems?\b/i, 'a totem skill', p => ['SummonsTotem', 'UsedByTotem', 'SummonsAttackTotem'].some(t => p.types.has(t)) || p.used.some(o => /totem/i.test(o.d.name))],
    [/\bspells?\b|\bcast speed\b/i, 'a spell', p => p.types.has('Spell')],
    [/\battacks?\b|\baccuracy\b/i, 'an attack', p => p.types.has('Attack')],
    [/\bprojectiles?\b/i, 'a projectile skill', p => p.types.has('Projectile')],
    [/\bmelee\b/i, 'a melee skill', p => p.types.has('Melee')],
    [/\bcurses?\b|\bhex(es)?\b/i, 'a curse', p => p.types.has('AppliesCurse')],
    [/\bwarcr(y|ies)\b/i, 'a warcry', p => p.types.has('Warcry')],
    [/\bheralds?\b/i, 'a herald', p => p.types.has('Herald')],
    [/\bmarks?\b(?! of)/i, 'a mark skill', p => p.types.has('Mark')],
    [/\bgrenades?\b/i, 'a grenade skill', p => p.types.has('Grenade')],
    [/\bbanners?\b/i, 'a banner', p => p.types.has('Banner')],
    [/\boffering/i, 'an offering', p => p.types.has('Offering')],
    [/\bshapeshift|\bbear form|\bwolf form|\bwyvern form/i, 'a shapeshift skill', p => ['Shapeshift', 'Bear', 'Wolf', 'Wyvern'].some(t => p.types.has(t))],
    [/\bcompanions?\b/i, 'a companion', p => ['Companion', 'CreatesCompanion'].some(t => p.types.has(t))],
    [/\binvocation|\binvoked\b/i, 'an invocation skill', p => p.types.has('Invocation') || p.types.has('Invokable')],
    [/\bchannell?ing\b/i, 'a channelling skill', p => p.types.has('Channel')],
  ];
  // Element-specific damage lines. Conversion makes these uncertain, so they are "likely", not "sure".
  const ELEMENT_NEEDS = ['Fire', 'Cold', 'Lightning', 'Chaos'].map(e => [new RegExp(`\\b${e} (damage|spell|skill|penetration)|penetrates? .*${e}|\\b${e} exposure`, 'i'), e]);
  const AILMENT = [[/\bignit/i, 'Fire'], [/\bshock/i, 'Lightning'], [/\b(freez|chill)/i, 'Cold']];

  // Lines about an enemy or a general effect never need anything; skip lines that are a downside.
  const NEUTRAL = /^(\d+% )?(reduced|less) |enemies .* (you|your) |^you take|^minions have|^grants? (\d+ )?passive|^\+?\d+ to (strength|dexterity|intelligence|all attributes)/i;

  // Why a line does nothing for this build, or null if it works or we cannot tell.
  function deadReason(text, p, c, set) {
    const st = c.stats || {};
    if (!text || NEUTRAL.test(text)) return null;
    // Lines that buff allies (minions, companions, totems, party members) do nothing for you alone.
    if (/^allies\b|\ballies in your presence\b/i.test(text)) {
      const allies = SKILL_NEEDS[0][2](p) || SKILL_NEEDS[1][2](p);
      return allies ? null : { why: 'Only helps allies, and you have no minions, companions or totems.', sure: false };
    }
    if (/^minions /i.test(text) || /\bminion/i.test(text)) {
      const need = SKILL_NEEDS[0];
      return need[2](p) ? null : { why: 'You have no minions.', sure: true };
    }
    // Weapon conditions are checked against the weapon set the line applies to.
    for (const [label, test] of weaponNeeds(text)) {
      const sets = set ? [set] : [p.activeSet];
      if (!sets.some(s => test(p.weapons[s]))) {
        const other = set ? null : test(p.weapons[p.activeSet === 1 ? 2 : 1]);
        return other ? null : { why: `Needs ${label}${set ? ` in weapon set ${set}` : ''}, and you are not using one.`, sure: true };
      }
    }
    for (const [re, label, test] of SKILL_NEEDS.slice(1)) {
      if (!re.test(text)) continue;
      if (label === 'an attack' && /\bspell/i.test(text)) continue; // "Attack and Spell" lines
      if (label === 'a spell' && /\battack/i.test(text)) continue;
      if (!test(p)) return { why: `Only helps ${label}, and none of your skills is one.`, sure: true };
    }
    if (/increased (maximum )?life\b|maximum life\b/i.test(text) && st.Life != null && st.Life <= 1) return { why: 'Your maximum life is 1 (Chaos Inoculation), so life bonuses do nothing.', sure: true };
    // Armour, evasion, energy shield and block are left alone: keystones and items convert them
    // (Eldritch Battery, weapon-swap shields), so a 0 in Path of Building's totals is not proof.
    for (const [re, e] of ELEMENT_NEEDS) {
      if (re.test(text) && !/elemental|all elemental|resistance/i.test(text) && !p.elements.has(e))
        return { why: `Only helps ${e.toLowerCase()} damage, and none of your skills deals it.`, sure: false };
    }
    for (const [re, e] of AILMENT) {
      if (re.test(text) && !/(against|on|to) (you|your)|you are|avoid|immun|duration on you|(shocks?|ignites?|freezes?|chills?) you\b/i.test(text) && !p.elements.has(e) && !/elemental ailment/i.test(text))
        return { why: `${e} damage causes this ailment, and none of your skills deals ${e.toLowerCase()} damage.`, sure: false };
    }
    return null;
  }

  // ---------- gem levels and costs ----------
  const LEVEL_RE = /^\+(\d+) to level of all ([a-z ]*?)\s*skills?$/i;
  const LEVEL_WORDS = { spell: 'Spell', minion: 'Minion', melee: 'Melee', projectile: 'Projectile', attack: 'Attack', fire: 'Fire', cold: 'Cold', lightning: 'Lightning', chaos: 'Chaos', physical: 'Physical', elemental: null };
  function gearLevelBonus(p, d) {
    let n = 0;
    const types = new Set(d.types || []);
    if (types.has('CreatesMinion')) types.add('Minion');
    for (const g of p.gear) {
      if (g.set && g.set !== p.activeSet) continue;
      for (const m of g.it.mods.concat(g.it.implicits)) {
        const r = m.text.match(LEVEL_RE); if (!r) continue;
        const words = r[2].trim().toLowerCase().split(/\s+/).filter(w => w && w !== 'all');
        const ok = words.every(w => w === 'elemental' ? ['Fire', 'Cold', 'Lightning'].some(e => types.has(e)) : LEVEL_WORDS[w] ? types.has(LEVEL_WORDS[w]) : w === 'skill' || w === '');
        if (ok && words.length && words.every(w => w in LEVEL_WORDS)) n += Number(r[1]);
        else if (!words.length) n += Number(r[1]);
      }
    }
    return n;
  }
  // "+N% increased/reduced Mana Cost (of Skills)" and cost efficiency, from gear and the tree.
  function costModifiers(c, p, snap) {
    let inc = 0, eff = 0; const src = [];
    const lines = [...p.gear.filter(g => !g.set || g.set === p.activeSet).flatMap(g => g.it.mods.concat(g.it.implicits).map(m => m.text)),
      ...(c.tree?.nodes || []).flatMap(id => snap.nodes[id]?.s || [])];
    for (const l of lines) {
      let m = l.match(/^(\d+)% (increased|reduced) (mana )?cost of skills$|^(\d+)% (increased|reduced) mana cost of skills$/i);
      if (m) { const v = Number(m[1] || m[4]) * (/reduced/i.test(m[2] || m[5]) ? -1 : 1); inc += v; src.push(l); continue; }
      m = l.match(/^(\d+)% increased (mana )?cost efficiency( of skills)?$/i);
      if (m) { eff += Number(m[1]); src.push(l); }
    }
    return { inc, eff, src, factor: Math.max(0, 1 + inc / 100) / (1 + eff / 100) };
  }
  const supportMult = sups => sups.reduce((m, o) => m * (1 + (o.d.manaMult || 0) / 100), 1);

  // ---------- the rules ----------
  function analyse(c, snap, opts = {}) {
    const p = profile(c, snap);
    const st = c.stats || {};
    const level = opts.level || c.level;
    const F = [];
    const add = f => F.push(Object.assign({ sev: 'info', certainty: 'sure', action: [] }, f));

    // Resistances
    const penaltyNote = 'Path of Building includes the resistance penalty set in its Configuration tab.';
    const over = ELEMENTS.filter(e => (st[e + 'ResistOverCap'] || 0) > 0);
    for (const e of ELEMENTS) {
      const v = st[e + 'Resist']; if (v == null || v >= CAP) continue;
      const gap = CAP - v;
      const less = 100 - 100 * (100 - CAP) / (100 - v);
      add({
        id: 'res-' + e, area: 'Resistances', sev: gap >= 30 ? 'bad' : gap >= 10 ? 'warn' : 'info',
        title: `${e} resistance is ${num(v)}%, ${num(gap)} below the cap`,
        why: `Below the ${CAP}% cap you take more ${e.toLowerCase()} damage than you need to. ${penaltyNote}`,
        effect: `Capping it means about ${r0(less)}% less ${e.toLowerCase()} damage taken.`,
        action: [`Find +${num(gap)}% ${e} Resistance in total on gear. Rings, amulet, belt, boots, gloves and helmet can all have it.`,
          ...(over.length ? [`You are over the cap on ${list(over.map(x => x.toLowerCase()))}; a piece with less of that and more ${e.toLowerCase()} is free value.`] : [])],
        goals: { survive: Math.min(1, gap / 50) },
        data: { stat: e + 'Resist', gap },
      });
    }
    if (st.ChaosResist != null && st.ChaosResist < 0) {
      add({ id: 'res-Chaos', area: 'Resistances', sev: st.ChaosResist <= -30 ? 'warn' : 'info',
        title: `Chaos resistance is negative (${num(st.ChaosResist)}%)`,
        why: 'Negative resistance makes chaos damage hit harder than its listed amount.',
        effect: `Raising it to 0% means about ${r0(100 - 100 * 100 / (100 - st.ChaosResist))}% less chaos damage taken.`,
        action: ['Look for Chaos Resistance on gear when other upgrades are done. It is less urgent than the elemental ones.'],
        goals: { survive: 0.3 } });
    }

    // Biggest single hit you survive, per damage type (Path of Building's numbers).
    const hits = ['Physical', 'Fire', 'Cold', 'Lightning', 'Chaos'].map(t => [t, st[t + 'MaximumHitTaken']]).filter(([, v]) => v > 0);
    if (hits.length >= 3) {
      hits.sort((a, b) => a[1] - b[1]);
      const [low, lv] = hits[0], med = hits[Math.floor(hits.length / 2)][1];
      if (lv < med * 0.6) add({
        id: 'hit-' + low, area: 'Health', sev: 'info',
        title: `${low} hits are your weak spot`,
        why: `The biggest ${low.toLowerCase()} hit you survive is ${num(lv)}, against about ${num(med)} for most other damage types (Path of Building's estimate).`,
        effect: `Closing the gap protects against one-shots from ${low.toLowerCase()} attacks. The exact gain depends on what you add: unknown.`,
        action: [low === 'Physical' ? 'Physical hits are reduced by armour, evasion, deflection and block. Raise one of these or your health pool.'
          : `Raise ${low.toLowerCase()} resistance, or your health pool.`],
        goals: { survive: 0.5 }, certainty: 'likely' });
    }

    // Attribute requirements
    const short = [['Str', 'strength'], ['Dex', 'dexterity'], ['Int', 'intelligence']].filter(([k]) => st['Req' + k] > st[k]);
    for (const [k, n] of short) add({
      id: 'attr-' + k, area: 'Attributes', sev: 'bad',
      title: `Not enough ${n}: ${num(st[k])} of ${num(st['Req' + k])}`,
      why: 'A gem or item needs more of this attribute than you have, so it does not work.',
      effect: `${num(st['Req' + k] - st[k])} more ${n} switches it back on.`,
      action: [`Get +${num(st['Req' + k] - st[k])} ${n}: attribute passives on the tree, or gear with ${n}.`],
      goals: { damage: 0.6, survive: 0.6 } });

    // Spirit
    const spirit = spiritBudget(c, p, snap);
    if (st.Spirit != null) {
      const pobFree = st.SpiritUnreserved;
      if (pobFree != null && pobFree < 0) add({
        id: 'spirit-over', area: 'Spirit', sev: 'warn', certainty: 'check',
        title: `Spirit over budget by ${num(-pobFree)}`,
        why: `Path of Building says your always-on skills reserve more Spirit than the ${num(st.Spirit)} you have. In the game, a skill that does not fit will not switch on. If all of them do switch on in the game, Path of Building is missing a Spirit source or a reservation bonus (often a setting in its Configuration tab), and you can ignore this.`,
        effect: 'If it is real, fixing it makes every reserved skill work.',
        action: [`Remove a support from a Spirit skill, swap a skill out, or get more Spirit (body armour, sceptres, amulets). ${spirit.items.length ? 'Biggest reservations: ' + spirit.items.slice().sort((a, b) => b.value - a.value).slice(0, 3).map(x => `${x.name} ${num(x.value)}`).join(', ') + '.' : ''}`],
        goals: { damage: 0.5, survive: 0.5, ease: 0.5 } });
      else if (pobFree >= 30) add({
        id: 'spirit-free', area: 'Spirit', sev: 'info',
        title: `${num(pobFree)} Spirit unused`,
        why: 'Spirit you do not reserve does nothing.',
        effect: 'An extra buff, aura or minion that fits in it is a free gain. How much depends on the skill: unknown.',
        action: [`Pick a Persistent skill gem that reserves ${num(pobFree)} Spirit or less, or add a support to an existing one.`],
        goals: { damage: 0.3, survive: 0.3 } });
    }

    // Mana
    const mana = manaCheck(c, p, snap, st);
    for (const f of mana.findings) add(f);

    // Supports and skill groups
    for (const G of p.groups) {
      if (!G.enabled || G.duplicate) continue;
      if (!G.acts.length && G.sups.length) {
        add({ id: 'grp-empty-' + G.i, area: 'Skills', sev: 'warn',
          title: `Support gems with no skill: ${list(G.sups.map(o => o.x.name || o.d.name))}`,
          why: 'This group has supports but no active skill, so the supports do nothing.',
          effect: 'Moving them to a skill puts them to use.', action: ['Socket these supports into one of your skills, or remove them.'], goals: { damage: 0.2 } });
        continue;
      }
      for (const s of G.sups) {
        // A support works if it can support any skill the gems in this group grant.
        const granted = o => [o.d, ...(o.d.extra || []).map(id => snap.skills[id]).filter(Boolean)];
        // Types that other supports in the group add (PoB's addSkillTypes) also count.
        const added = G.sups.filter(o => o !== s).flatMap(o => o.d.add || []);
        const targets = G.acts.filter(o => granted(o).some(d => P.canSupport(s.d, d, added)));
        // Minion skills whose minions' own skill types are not in the data: cannot tell.
        const unsure = G.acts.some(o => (o.d.types || []).some(t => /Minion|Companion/.test(t)) && !(o.d.minionTypes || []).length);
        const nm = s.x.name || s.d.name, skn = G.acts.filter(o => o !== G.meta || G.acts.length === 1).map(o => o.x.name || o.d.name);
        if (!targets.length && !unsure) {
          add({ id: `sup-${G.i}-${s.x.skillId}`, area: 'Skills', sev: 'warn',
            title: `${nm} cannot support ${list(skn)}`,
            why: `The game data says ${nm} only works with skills of certain types, and ${list(skn)} ${skn.length > 1 ? 'are' : 'is'} not one of them. It still raises the cost.`,
            effect: s.d.manaMult ? `Removing it lowers this skill's cost by ${r0(100 - 100 / (1 + s.d.manaMult / 100))}% and frees the socket.` : 'Removing it frees the socket for a support that works.',
            action: [`Remove ${nm} from this group, or move it to a skill it can support.`], goals: { damage: 0.3, mana: s.d.manaMult ? 0.3 : 0 } });
          continue;
        }
        if (!targets.length) continue;
        // Soft rule: a damage support on a buff that only deals damage in narrow cases.
        // Only when the support lands on the buff itself; reaching a damaging skill the gem also grants is fine.
        const buffOnly = d => ['Persistent', 'Buff'].every(t => d.types?.includes(t)) && !['Attack', 'Herald', 'Minion', 'Aura'].some(t => d.types.includes(t));
        const soft = G.acts.every(o => buffOnly(o.d)) && targets.every(o => P.canSupport(s.d, o.d) && !(o.d.extra || []).some(id => snap.skills[id] && P.canSupport(s.d, snap.skills[id])));
        if (soft && /damage|\bhits?\b|ailment|freez|ignit|shock|chill|penetrat|critical/i.test(s.d.desc || '') && !/reservation|spirit|duration|buff|effect of/i.test(s.d.desc || '')) {
          add({ id: `supsoft-${G.i}-${s.x.skillId}`, area: 'Skills', sev: 'info', certainty: 'check',
            title: `${nm} probably does little on ${list(skn)}`,
            why: `${list(skn)} is a buff that stays on and deals damage only in narrow cases. ${nm} is allowed here but improves damage or hits.`,
            effect: 'Likely a small gain. A support for the buff itself, or this support on your main skill, is usually better: unknown how much.',
            action: [`Consider moving ${nm} to your main damage skill.`], goals: { damage: 0.15 } });
        }
      }
    }

    // Gem levels below what your character level allows. Skills granted by items are levelled by the item.
    const itemSkills = new Set(p.groups.filter(G => G.item).flatMap(G => G.acts.map(o => o.x.skillId)));
    for (const G of p.groups) {
      if (!G.enabled || G.item || G.g.source) continue;
      for (const o of G.acts) {
        if (!o.d.gem || !o.d.lvReq || o.x.level == null || !o.x.gemId || itemSkills.has(o.x.skillId)) continue;
        const cap = Math.min(o.d.maxLevel || 20, 20);
        let best = 0;
        for (let L = 1; L <= cap; L++) if (P.atLevel(o.d.lvReq, L) != null && P.atLevel(o.d.lvReq, L) <= level) best = L;
        if (best >= o.x.level + 2) add({
          id: `gemlvl-${G.i}-${o.x.skillId}`, area: 'Skills', sev: best - o.x.level >= 5 ? 'warn' : 'info',
          title: `${o.x.name || o.d.name} is level ${o.x.level}; you can use level ${best}`,
          why: `At character level ${level} this gem can be level ${best}. Higher levels mean more damage or a stronger effect.`,
          effect: `${best - o.x.level} gem levels. The exact gain is unknown; it also raises the cost${o.d.spirit ? ' and Spirit' : ''} a little.`,
          action: [`Use an ${o.d.types?.includes('Persistent') && o.d.spirit ? 'Uncut Spirit Gem' : o.d.support ? 'Uncut Support Gem' : 'Uncut Skill Gem'} of level ${best} (or as high as you have) to level it up.`],
          goals: { damage: G.i + 1 === c.mainSocketGroup ? 0.6 : 0.25, speed: 0.3 } });
      }
    }

    // Passive points: a sure lower bound on unspent points (quests only ever add more).
    if (c.tree && snap.nodes) {
      const ws = new Set([...c.tree.ws1, ...c.tree.ws2]);
      const main = c.tree.nodes.filter(id => { const n = snap.nodes[id]; return n && !n.a && !ws.has(id) && !(n.f || []).includes('ascStart') && (n.s?.length || (n.f || []).includes('attr') || (n.f || []).includes('jewel')); });
      const spent = main.length + Math.max(c.tree.ws1.length, c.tree.ws2.length);
      if (spent < level - 1) add({
        id: 'tree-unspent', area: 'Passive tree', sev: 'warn',
        title: `At least ${pl(level - 1 - spent, 'passive point')} unspent`,
        why: `At level ${level} you have at least ${level - 1} points from levelling, plus more from quests. The tree has ${spent} spent.`,
        effect: 'Every point is a free upgrade.', action: ['Spend them in the game, then make a new code.'], goals: { damage: 0.4, survive: 0.4 } });
      if (!c.ascendancy && level >= 35) add({
        id: 'asc-none', area: 'Passive tree', sev: 'info', title: 'No ascendancy class yet',
        why: 'Ascendancy points come from the Trials and are among the strongest upgrades in the game.',
        effect: 'Large, but how large depends on the class: unknown.', action: ['Complete the Trial of the Sekhemas or the Trial of Chaos to choose an ascendancy.'], goals: { damage: 0.7, survive: 0.7 } });
    }

    // Passive nodes that do nothing for this build.
    const deadNodes = [];
    if (c.tree) {
      const ws1 = new Set(c.tree.ws1), ws2 = new Set(c.tree.ws2);
      for (const id of c.tree.nodes) {
        const n = snap.nodes[id]; if (!n || !n.s?.length || (n.f || []).includes('attr')) continue;
        const set = ws1.has(id) ? 1 : ws2.has(id) ? 2 : 0;
        const reasons = n.s.map(l => deadReason(l, p, c, set));
        if (reasons.every(Boolean)) deadNodes.push({ id, n, why: reasons[0].why, sure: reasons.every(r => r.sure), kind: n.a ? 'ascendancy' : (n.f || []).includes('keystone') ? 'keystone' : (n.f || []).includes('notable') ? 'notable' : 'small' });
      }
    }
    if (deadNodes.length) {
      const byWhy = new Map();
      for (const d of deadNodes) { const k = d.why + '|' + d.sure; (byWhy.get(k) || byWhy.set(k, []).get(k)).push(d); }
      for (const [, arr] of byWhy) {
        const sure = arr[0].sure;
        const named = arr.filter(d => d.kind !== 'small');
        add({
          id: 'tree-dead-' + arr.map(d => d.id).join('-'), area: 'Passive tree', sev: sure ? 'warn' : 'info', certainty: sure ? 'sure' : 'likely',
          title: `${pl(arr.length, 'passive')} ${sure ? 'doing nothing' : 'probably doing nothing'}: ${arr[0].why.replace(/\.$/, '').toLowerCase().replace(/^only helps /, 'only for ').replace(/, and.*$/, '')}`,
          why: arr[0].why + (sure ? '' : ' Conversion or a skill you swap in could still use it, so check before you change it.'),
          effect: `Refunding ${arr.length === 1 ? 'it' : 'them'} frees ${pl(arr.length, 'point')} for something that helps.`,
          action: [`Refund in the game: ${list([...named.map(d => d.n.n), ...(arr.length > named.length ? [pl(arr.length - named.length, 'small passive')] : [])])}.`],
          nodes: arr.map(d => ({ id: d.id, name: d.n.n, stats: d.n.s })),
          goals: { damage: 0.2 * Math.min(arr.length, 5), survive: 0.1 * Math.min(arr.length, 5) } });
      }
    }

    // Gear mods that do nothing for this build.
    for (const g of p.gear) {
      if (g.set && g.set !== p.activeSet && !(p.weapons[g.set] || []).length) continue;
      const dead = [];
      for (const m of g.it.mods) {
        const r = deadReason(m.text, p, c, g.set || 0);
        if (r) dead.push({ text: m.text, ...r });
      }
      if (!dead.length) continue;
      const sure = dead.some(d => d.sure);
      const slot = g.slot.replace(/ Swap$/, ' (weapon set 2)');
      add({
        id: 'gear-dead-' + g.slot, area: 'Gear', sev: sure ? 'warn' : 'info', certainty: sure ? 'sure' : 'likely',
        title: `${g.it.name} (${slot}): ${pl(dead.length, 'mod')} ${sure ? 'doing nothing' : 'probably doing nothing'}`,
        why: dead.map(d => `"${d.text}": ${d.why}`).join(' '),
        effect: `A replacement with useful mods in ${dead.length > 1 ? 'these slots' : 'that slot'} is a straight upgrade. How big depends on the mod: unknown.`,
        action: ['Replace the item, or craft over these mods.'],
        mods: dead.map(d => d.text), goals: { damage: 0.15 * dead.length, survive: 0.1 * dead.length } });
    }

    // Order: severity, then area.
    const SEV = { bad: 0, warn: 1, info: 2 };
    F.sort((a, b) => SEV[a.sev] - SEV[b.sev] || (a.certainty === 'sure' ? 0 : 1) - (b.certainty === 'sure' ? 0 : 1));
    return { findings: F, profile: p, spirit, mana };
  }

  // Spirit reserved by each always-on skill, counted once per skill (item grants deduplicated).
  function spiritBudget(c, p, snap) {
    const items = [], dupes = [];
    for (const G of p.groups) {
      if (!G.enabled) continue;
      if (G.duplicate) { dupes.push(...G.acts.map(o => o.x.name || o.d.name)); continue; }
      const mult = supportMult(G.sups);
      for (const o of G.acts) {
        const lvl = (o.x.level || 1) + gearLevelBonus(p, o.d);
        const flat = P.atLevel(o.d.spirit, Math.min(lvl, (o.d.spirit || []).length || lvl)) || 0;
        if (!flat) continue;
        items.push({ name: o.x.name || o.d.name, base: flat * (o.x.count || 1), value: Math.floor(flat * mult) * (o.x.count || 1), mult });
      }
    }
    const total = items.reduce((a, b) => a + b.value, 0);
    return { items, dupes: [...new Set(dupes)], total, pob: c.stats.Spirit != null && c.stats.SpiritUnreserved != null ? c.stats.Spirit - c.stats.SpiritUnreserved : null };
  }

  // Mana: cost per use with supports and gear levels, and whether regeneration keeps up.
  function manaCheck(c, p, snap, st) {
    const out = { skills: [], findings: [] };
    const cm = costModifiers(c, p, snap);
    const regen = st.ManaRegenRecovery || 0, leech = st.ManaLeechGainRate || 0;
    const pool = st.ManaUnreserved ?? st.Mana ?? 0;
    for (const G of p.groups) {
      if (!G.enabled || G.duplicate) continue;
      const triggered = G.meta && G.meta.d.types?.includes('Triggers');
      for (const o of G.acts) {
        if (o === G.meta && G.acts.length > 1) continue;
        if (o.d.types?.includes('Persistent')) continue;
        const main = G.i + 1 === c.mainSocketGroup && o === G.acts.find(a => a !== G.meta || G.acts.length === 1);
        const lvl = (o.x.level || 1) + gearLevelBonus(p, o.d);
        const base = P.costAt(o.d, lvl).find(x => x.type === 'Mana' && x.value > 0);
        const mult = supportMult(G.sups);
        let per = base ? base.value * mult * cm.factor : 0, perSecond = base?.perSecond || false, source = 'estimate';
        if (main && st.ManaCost > 0) { per = st.ManaCost; source = 'pob'; perSecond = false; }
        if (main && st.ManaPerSecondCost > 0) { per = st.ManaPerSecondCost; source = 'pob'; perSecond = true; }
        if (!per) continue;
        const rec = { name: o.x.name || o.d.name, group: G.i, per, perSecond, mult, level: lvl, gearLevels: lvl - (o.x.level || 1), triggered, main, source, sups: G.sups };
        if (main && !triggered) rec.uses = perSecond ? 1 : st.Speed || null;
        out.skills.push(rec);
      }
    }
    out.regen = regen; out.pool = pool; out.costMods = cm;
    const fmtCost = s => `${num(s.per)} mana${s.perSecond ? ' per second' : ' per use'}`;
    for (const s of out.skills) {
      if (s.triggered) continue;
      if (!s.perSecond && s.per > pool && pool > 0) {
        out.findings.push({ id: 'mana-cant-' + s.group, area: 'Mana', sev: 'bad',
          title: `${s.name} costs more mana than you have`,
          why: `One use costs about ${fmtCost(s)}; you have ${num(pool)} unreserved mana.`, effect: 'You cannot use it at all until this is fixed.',
          action: costActions(s), goals: { damage: 0.8, mana: 1, ease: 0.6 }, certainty: s.source === 'pob' ? 'sure' : 'likely' });
        continue;
      }
      if (s.main && s.uses) {
        const spend = st.ManaPerSecondCost > 0 ? st.ManaPerSecondCost : s.perSecond ? s.per : s.per * s.uses;
        const drain = spend - regen - leech;
        if (drain > 0) {
          const secs = pool / drain;
          if (secs < 30) out.findings.push({ id: 'mana-main', area: 'Mana', sev: secs < 5 ? 'warn' : 'info',
            title: `Used non-stop, ${s.name} empties your mana in about ${num(secs)} seconds`,
            why: `${s.name} costs ${num(spend)} mana per second at ${num(s.uses)} uses per second. You recover ${num(regen)} per second from regeneration${leech ? ` and ${num(leech)} from leech while hitting` : ''}. These are Path of Building's numbers. Mana flasks, mana on kill and pauses between packs are not counted, so how much this matters in play is unknown.`,
            effect: `Sustaining it non-stop needs +${num(drain)} mana per second, or about ${r0(100 * drain / spend)}% lower cost.`,
            action: costActions(s, drain), goals: { mana: 1, ease: 0.6, damage: 0.3 }, certainty: s.source === 'pob' ? 'sure' : 'likely',
            data: { drain, secs } });
        }
      } else if (!s.perSecond && pool > 0 && pool / s.per < 6) {
        out.findings.push({ id: 'mana-few-' + s.group, area: 'Mana', sev: 'info', certainty: 'likely',
          title: `${s.name}: a full mana bar pays for about ${num(Math.floor(pool / s.per))} uses`,
          why: `About ${fmtCost(s)}${s.gearLevels ? ` at level ${s.level} (including +${s.gearLevels} from gear)` : ''}, with supports ×${s.mult.toFixed(2)}. Your regeneration is ${num(regen)} per second. How often you use it is unknown, so this is a rough guide.`,
          effect: 'Fine for an occasional skill; a problem if you use it constantly.', action: costActions(s), goals: { mana: 0.4, ease: 0.3 } });
      }
    }
    return out;
  }
  function costActions(s, drain) {
    const a = [];
    const costly = s.sups.filter(o => o.d.manaMult > 0).sort((x, y) => y.d.manaMult - x.d.manaMult);
    if (costly.length) {
      const top = costly[0];
      a.push(`Removing ${top.x.name || top.d.name} (+${top.d.manaMult}% cost) cuts the cost by ${r0(100 - 100 / (1 + top.d.manaMult / 100))}%.`);
    }
    a.push('Add mana regeneration on gear or the tree, mana leech, or use a mana flask in long fights.');
    if (drain) a.push(`Target: +${num(drain)} mana per second.`);
    return a;
  }

  const api = { analyse, profile, deadReason, spiritBudget, gearLevelBonus, itemClass };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PobAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
