# aw-langley-leaderboard

Langley-only scores from the Another World network leaderboard, cached as JSON for anotherworldbc.ca.

- `data/langley-all.json`, `data/langley-year.json`, `data/langley-month.json`: top 10 teams and players per game.
  Served with CORS from `https://raw.githubusercontent.com/AW-VR/aw-langley-leaderboard/main/data/langley-{period}.json`.
- `img/`: game images (960x540 WebP, built once from the franchise leaderboard art listed in `img/SOURCES.csv`).
- `.github/workflows/update-leaderboard.yml`: refreshes the data every hour and builds any missing images.
- Run locally: `node scripts/fetch_langley.mjs data` (Node 18+). Images: `npm i sharp && node scripts/build_images.mjs img`.
