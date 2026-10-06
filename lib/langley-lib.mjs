// Shared fetch + parse logic for the Langley leaderboard.
// The franchise site (Next.js) has no public JSON API. Each board page is server-rendered;
// requesting it with the header "RSC: 1" returns the React Server Component payload, which
// contains each row's data as plain JSON props. We read those props.
import { BOARDS, SOURCE_ORIGIN, VENUE } from './boards.mjs';

// The franchise's date filters are calendar periods in UTC (Month = since the 1st, Year = since Jan 1).
// "Week" and "Day" exist too (dateFilterType=Week / Day) but are usually empty for one venue, so not used.
export const PERIODS = {
  all:   { label: 'All time',   param: null },
  year:  { label: 'This year',  param: 'Year' },
  month: { label: 'This month', param: 'Month' },
};
export const ROW_LIMIT = 10;

export function boardUrl(board, { personal = false, period = 'all', limit = ROW_LIMIT } = {}) {
  const u = new URL(`/en/leaderboard/game/${board.gameId}`, SOURCE_ORIGIN);
  for (const [k, v] of Object.entries(board.extra || {})) u.searchParams.set(k, v);
  u.searchParams.set('country', VENUE.country);
  u.searchParams.set('city', VENUE.city);
  u.searchParams.set('location', VENUE.location);
  const p = PERIODS[period].param;
  if (p) u.searchParams.set('dateFilterType', p);
  if (personal) u.searchParams.set('personal', 'true');
  u.searchParams.set('limit', String(limit));
  return u.toString();
}

// "Lunar Legends R" -> { name: "Lunar Legends", side: "red" }. The franchise system appends
// R / B (red / blue team colour) to team names.
export function splitSide(raw) {
  const m = /^(.*\S)\s+([RB])$/.exec(raw || '');
  if (!m) return { name: (raw || '').trim(), side: null };
  return { name: m[1], side: m[2] === 'R' ? 'red' : 'blue' };
}

function inVenue(c, city) {
  return (!c || c === VENUE.country) && (!city || city === VENUE.city);
}

export function parseTeamRows(rsc) {
  const rows = [];
  const seen = new Set();
  const re = /\{"gameId":"[0-9a-f-]+","country":"[^"]*"[^{}]*?"place":"\d+"[^{}]*\}/g;
  for (const m of rsc.matchAll(re)) {
    let o; try { o = JSON.parse(m[0]); } catch { continue; }
    if (typeof o.teamName !== 'string' || typeof o.score !== 'string') continue;
    if (!inVenue(o.country, o.city)) continue;
    const key = o.place + '|' + o.teamName;
    if (seen.has(key)) continue; seen.add(key);
    const s = splitSide(o.teamName);
    rows.push({ place: +o.place, name: s.name, side: s.side, raw: o.teamName, score: Number(o.score) });
  }
  return rows.sort((a, b) => a.place - b.place);
}

export function parsePlayerRows(rsc) {
  const rows = [];
  const seen = new Set();
  let total = null;
  const re = /"score":(\{"venue_country":[^{}]*\})/g;
  for (const m of rsc.matchAll(re)) {
    let o; try { o = JSON.parse(m[1]); } catch { continue; }
    if (!inVenue(o.venue_country, o.venue_city)) continue;
    const key = o.place + '|' + o.player_global_unique_id;
    if (seen.has(key)) continue; seen.add(key);
    if (o.count) total = Number(o.count);
    const s = splitSide(o.team_name);
    rows.push({ place: +o.place, name: (o.player_name || '').trim(), team: s.name, side: s.side,
      score: Number(o.score), sessions: o.sessions_count ? Number(o.sessions_count) : null });
  }
  return { rows: rows.sort((a, b) => a.place - b.place), total };
}

async function getRsc(url, fetchImpl, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchImpl(url, { headers: { RSC: '1', 'User-Agent': 'anotherworldbc.ca leaderboard sync (Another World VR Langley)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      const t = await r.text();
      if (!t.includes('gameRatingBody')) throw new Error(`Unexpected payload (layout changed?) for ${url}`);
      return t;
    } catch (e) { lastErr = e; await new Promise(res => setTimeout(res, 800 * (i + 1))); }
  }
  throw lastErr;
}

// Build one period's JSON document. imageBase: where the snippet should load game images
// from when no HighLevel media URL is configured (relative paths are resolved by the snippet).
export async function buildPeriod(period, { fetchImpl = fetch, imageBase = 'img/', concurrency = 4, delayMs = 250 } = {}) {
  const jobs = [];
  for (const b of BOARDS) for (const personal of [false, true]) jobs.push({ b, personal });
  const out = new Map();
  const errors = [];
  let idx = 0;
  async function worker() {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      const url = boardUrl(j.b, { personal: j.personal, period });
      try {
        const rsc = await getRsc(url, fetchImpl);
        out.set(j.b.id + (j.personal ? ':p' : ':t'), j.personal ? parsePlayerRows(rsc) : { rows: parseTeamRows(rsc) });
      } catch (e) { errors.push(String(e.message || e)); }
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (errors.length > jobs.length / 2) throw new Error('Too many failures: ' + errors.slice(0, 3).join(' | '));
  return {
    venue: 'Another World VR Langley (3078 275 St, Aldergrove, BC)',
    period, periodLabel: PERIODS[period].label,
    generatedAt: new Date().toISOString(),
    source: SOURCE_ORIGIN + '/en/leaderboard',
    errors,
    boards: BOARDS.map(b => ({
      id: b.id, game: b.game, mode: b.mode,
      title: b.mode ? `${b.game} / ${b.mode}` : b.game,
      image: imageBase + b.id + '.webp',
      sourceUrl: boardUrl(b, { period }).replace(/&limit=\d+/, ''),
      teams: out.get(b.id + ':t') || { rows: [], error: true },
      players: out.get(b.id + ':p') || { rows: [], total: null, error: true },
    })),
  };
}
