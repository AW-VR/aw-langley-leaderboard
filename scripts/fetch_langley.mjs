#!/usr/bin/env node
// Usage: node scripts/fetch_langley.mjs [outDir]   (Node 18+; no npm packages needed)
// Writes langley-all.json, langley-year.json, langley-month.json to outDir (default ./data).
// If a board fails to load, the previous file's rows for that board are kept, so a hiccup never blanks the site.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPeriod, PERIODS } from '../lib/langley-lib.mjs';

const outDir = process.argv[2] || 'data';
const imageBase = process.env.IMAGE_BASE || '../img/';
await mkdir(outDir, { recursive: true });
let failed = 0;
for (const period of Object.keys(PERIODS)) {
  const file = join(outDir, `langley-${period}.json`);
  try {
    const doc = await buildPeriod(period, { imageBase });
    let prev = null; try { prev = JSON.parse(await readFile(file, 'utf8')); } catch {}
    if (prev) for (const b of doc.boards) {
      const old = prev.boards.find(x => x.id === b.id); if (!old) continue;
      if (b.teams.error) b.teams = { ...old.teams, stale: true };
      if (b.players.error) b.players = { ...old.players, stale: true };
    }
    await writeFile(file, JSON.stringify(doc, null, 1));
    const withData = doc.boards.filter(b => b.teams.rows.length).length;
    console.log(`${period}: ${withData}/${doc.boards.length} boards with team scores, ${doc.errors.length} errors`);
  } catch (e) { failed++; console.error(`${period}: FAILED, kept previous file. ${e.message}`); }
}
process.exit(failed === Object.keys(PERIODS).length ? 1 : 0);
