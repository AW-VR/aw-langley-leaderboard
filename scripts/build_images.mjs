#!/usr/bin/env node
// Usage: node scripts/build_images.mjs [imgDir]   (needs the `sharp` npm package)
// Builds any missing img/<slug>.webp (960x540, cover crop) from the source URLs in img/SOURCES.csv.
// Existing images are left alone, so this only downloads once. Delete a .webp to rebuild it.
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const dir = process.argv[2] || 'img';
const rows = (await readFile(join(dir, 'SOURCES.csv'), 'utf8')).trim().split('\n').slice(1).map(l => l.split(','));
let made = 0, failed = 0;
for (const [slug, url] of rows) {
  const out = join(dir, `${slug}.webp`);
  try { await access(out); continue; } catch {}
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'aw-langley-leaderboard (anotherworldbc.ca)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile(out, await sharp(buf).resize(960, 540, { fit: 'cover' }).webp({ quality: 78 }).toBuffer());
    made++; console.log(`built ${out}`);
  } catch (e) { failed++; console.error(`${slug}: ${e.message}`); }
}
console.log(`images: ${made} built, ${failed} failed, ${rows.length - made - failed} already present`);
