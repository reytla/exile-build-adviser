// Exile Build Advisor: stage 5, look up a character by account name.
// Copyright (c) 2026 reytla. MIT licence.
//
// Source: poe.ninja, which keeps a Path of Building code for characters it has indexed
// (public profile, seen in its league snapshot). Order of attempts:
//   1. direct from this page (works only if poe.ninja allows other pages to read it)
//   2. through a proxy the player set up (template with {url}, or a prefix the url is appended to)
// If both fail, the error lists every reason so the page can fall back to the export code.
(function (root) {
  'use strict';
  const NINJA = 'https://poe.ninja/poe2/api/';
  const LEAGUES = ['Standard', 'Hardcore', 'Forbidden Rites', 'HC Forbidden Rites', 'SSF Forbidden Rites', 'Runes of Aldur', 'HC Runes of Aldur'];

  // poe.ninja writes "Name#1234" as "Name-1234".
  const ninjaAccount = a => String(a || '').trim().replace(/#(\d+)$/, '-$1');
  const slug = name => String(name || '').trim().toLowerCase().replace(/\s+/g, '-');

  function viaProxy(proxy, url) {
    const p = String(proxy || '').trim();
    return p.includes('{url}') ? p.replace('{url}', encodeURIComponent(url)) : p + encodeURIComponent(url);
  }

  class LookupError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }
  async function getJson(url, fetchImpl) {
    let r;
    try { r = await fetchImpl(url, { headers: { Accept: 'application/json' } }); }
    catch (e) { throw new LookupError('blocked', 'The browser was not allowed to read the answer. The site does not let other web pages read its data (no CORS permission), or you are offline.'); }
    if (r.status === 404) throw new LookupError('notfound', 'poe.ninja has no character with that account, name and league.');
    if (r.status === 429) throw new LookupError('busy', 'poe.ninja asked to slow down (too many requests). Try again in a minute.');
    if (!r.ok) throw new LookupError('http', `poe.ninja answered with error ${r.status}.`);
    try { return await r.json(); } catch { throw new LookupError('bad', 'The answer was not readable data. If you use a proxy, check its address.'); }
  }

  async function attempt(route, q, fetchImpl, say) {
    const wrap = u => route.proxy ? viaProxy(route.proxy, u) : u;
    say(`${route.label}: finding the latest ${q.league} snapshot…`);
    const idx = await getJson(wrap(NINJA + 'data/index-state'), fetchImpl);
    const snaps = idx.snapshotVersions || [];
    const s = snaps.find(x => x.name.toLowerCase() === q.league.toLowerCase()) || snaps.find(x => x.snapshotName === slug(q.league));
    if (!s || !s.version || s.version === 'unknown') throw new LookupError('league', `poe.ninja has no character snapshot for the league "${q.league}". Leagues it has: ${snaps.slice(0, 9).map(x => x.name).join(', ')}.`);
    say(`${route.label}: fetching ${q.name}…`);
    const url = `${NINJA}builds/${encodeURIComponent(s.version)}/character?account=${encodeURIComponent(ninjaAccount(q.account))}&name=${encodeURIComponent(q.name.trim())}&overview=${encodeURIComponent(s.snapshotName)}`;
    const j = await getJson(wrap(url), fetchImpl);
    if (!j.pathOfBuildingExport) throw new LookupError('nocode', 'poe.ninja found the character but has no build code for it.');
    return { code: j.pathOfBuildingExport, info: { account: j.account, name: j.name, league: j.league, level: j.level, cls: j.class, updated: j.updatedUtc || j.lastCheckedUtc } };
  }

  async function lookup(q, opts = {}) {
    const fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    const say = opts.onStep || (() => {});
    if (!String(q.account || '').trim() || !String(q.name || '').trim()) throw new LookupError('input', 'Enter both your account name (like Name#1234) and the character name.');
    const routes = [{ label: 'Direct' }];
    if (opts.proxy && opts.proxy.trim()) routes.push({ label: 'Through your proxy', proxy: opts.proxy });
    const reasons = [];
    for (const r of routes) {
      try { const out = await attempt(r, q, fetchImpl, say); out.via = r.label; return out; }
      catch (e) {
        reasons.push({ via: r.label, kind: e.kind || 'error', message: e.message });
        // A definite "not found" means the next route would get the same answer.
        if (e.kind === 'notfound' || e.kind === 'league') break;
      }
    }
    const err = new LookupError('failed', reasons.map(r => `${r.via}: ${r.message}`).join(' '));
    err.reasons = reasons;
    throw err;
  }

  // A minimal Cloudflare Worker the player can deploy as their own proxy.
  const WORKER = `// Exile Build Advisor proxy (Cloudflare Worker). Forwards poe.ninja PoE2 API reads only.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const target = new URL(request.url).searchParams.get('url') || '';
    if (request.method !== 'GET' || !target.startsWith('https://poe.ninja/poe2/api/'))
      return new Response('Only poe.ninja PoE2 API addresses are allowed.', { status: 400, headers: CORS });
    const r = await fetch(target, { headers: { 'User-Agent': 'exile-build-advisor-proxy' }, cf: { cacheTtl: 300 } });
    return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': r.headers.get('Content-Type') || 'application/json' } });
  },
};`;

  const api = { lookup, LEAGUES, WORKER, ninjaAccount, slug, viaProxy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PobLookup = api;
})(typeof window !== 'undefined' ? window : globalThis);
