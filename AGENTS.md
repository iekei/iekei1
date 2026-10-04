# Base44 Dev Environment

## Project Overview
Static HTML/CSS/JS website (Japanese "家系" themed site with a Hearts of Iron-style game section). No build step for the static frontend. The `lineup/` directory contains a prebuilt React app; `lineup_src/` is its source (not needed for serving).

## Architecture
- **nginx** (`web` service): serves all static files on port 3000, proxies `/api/` to the backend.
- **Node.js API** (`api` service, `server/server.js`): Express + multer backend that stores uploaded videos to disk and serves them via REST API. Enables cross-device video sharing for the `math/` community feature.
- Video files are stored in the `api-data` Docker volume (not in git).

## Running the App
```
docker compose -f docker-compose.base44.yml up -d
```
- nginx serves static files on port 3000.
- The API runs on port 3001 (internal), accessible via nginx proxy at `/api/`.
- The API uses nodemon for live reload (watches `server/` but ignores `data/` and `node_modules/`).

## Key Details
- nginx runs as `user root` (via `nginx.base44.conf`) because the bind-mounted repo directory has `700` permissions that block the default non-root nginx worker.
- `location /` uses `try_files $uri $uri/ $uri.html` so clean URLs like `/about` resolve to `/about/index.html`.
- `client_max_body_size 500M` in nginx allows large video uploads.
- The API supports HTTP Range requests for video streaming/seeking.
- `math/js/community/backend.js` auto-detects the API at startup (`/api/health`); falls back to IndexedDB if unavailable.
- No external credentials or secrets are needed.
- Health check: `curl http://localhost:3000/` returns 200; `curl http://localhost:3000/api/health` returns `{"ok":true}`.

## Asset Images — GitHub Upload Mode (scraping discontinued)

- Scraping is retired by user decision: the `scraper` service was removed from `docker-compose.base44.yml`; never re-add it or run the scraper scripts again.
- All images are user-uploaded to this GitHub repository (`iekei/iekei1`, `main`) under `game/assets/<folder>/` with filenames EXACTLY as the HoI4 database PNGs (no renaming, no extension changes).
- `game/assets/upload-checklist.json` lists, per category, the exact expected filenames (`files`), already-saved ones (`already_saved`) and still-missing ones (`missing`). Regenerate it only with a user-approved one-off script run from `/tmp` (source: `mappings/*.json` coverage + on-disk diff).
- `AssetRegistry` (game/assets/asset-registry.js) owns the connection: `categoryFolders` maps category id → folder; `getLocalAssetUrl(id, file)` returns the served relative path, `getGithubAssetUrl(id, file)` the `iekei.github.io/iekei1` fallback, `categoryImg(id, file, …)` renders local → GitHub-fallback lazy `<img>`. The old `getFlagUrl` now returns the local flags path.
- The leftover `game/assets/scraper/` directory and `.state/` are historical only; mappings `coverage` lists remain the filename source of truth for the checklist.

## Wiki Asset Scraper (game/assets/scraper/) — HISTORICAL, DO NOT RUN

- Start the optional source-mounted Python job with `docker compose -f docker-compose.base44.yml --profile assets up -d scraper`; follow progress with `docker compose -f docker-compose.base44.yml logs -f scraper`. It exits only on verified completion/error by default (`SCRAPER_MAX_PASSES=0`), not a permanently responsive app service, and has no automatic restart. A positive pass limit bounds the job. Re-running the same command resumes checkpoints.
- `wiki_crawl.py` owns both modes' cycle-safe traversal. Canonical URLs are deduplication keys ONLY; keep the actual request path, query ordering and escaping from the source link (archive lookup may otherwise 404). Follow forward `filefrom`, `subcatfrom` and `pagefrom` URLs as given; they belong to the CURRENT category, including redirected categories. Only `mw-subcategories` supplies children; never fall back to the whole page. There is no descendant depth cutoff.
- `.state/` (ignored by git) persists successful/pending pages and file records after each page/image. Failed/challenge/missing pages remain pending. Successful empty categories can complete; unrecognized HTML cannot. Existing legacy mappings seed file records, NOT traversal completion.
- `--skip-done` requires the current crawler version (6), successful full traversal and EVERY image saved and still valid locally. Neither nonzero counts nor name-only records prove completion. `--dry-run` writes nothing; `--limit` uses transient state and never replaces a real mapping.
- Wayback actively returns 429; the live Wiki returns a 200 `Client Challenge` in this sandbox. A 429 immediately pauses the whole pass, honours Retry-After and saves the next-allowed request time; after cooldown the next category gets a turn, avoiding starvation. The background loop immediately resumes when progress is made and uses 120–1800s increasing cooldowns when idle; it keeps going until verified complete unless a positive pass limit is configured. A bounded incomplete run exits nonzero. Do not poll with multi-minute blocking shell sleeps or claim all assets are fetched from tests alone.
- Category root requests use pretty URLs because archive captures often omit index.php?title=... roots. Thumbnails are converted by removing the last rendition segment, retaining the original filename and slash; text-only members resolve via their File: page / Special:FilePath. Image signatures, not a >300-byte size heuristic, determine the cache; small valid flags/icons are retained.
- Mappings and the merged index update atomically after every page/image, preserving other categories and previously saved files. Progress fields include `complete`, `traversal_complete`, `pending_pages`, `page_errors` and `pending_downloads`; `images[].local` remains frontend-compatible.
- Offline tests: `docker compose -f docker-compose.base44.yml run --rm --no-deps scraper sh -ec 'pip install -q -r game/assets/scraper/requirements.txt && python3 -m unittest discover -s game/assets/scraper -p "test_*.py" -v'`. Status without network: run `python3 game/assets/scraper/scrape_wiki_assets.py --all --status` inside the scraper container (0=all complete, 1=incomplete).
- App-side integration remains `AssetRegistry.loadScrapedMapping()` and `loadCategoryMapping(id)` / `getLocal(id, key)` in game/assets/asset-registry.js. Do not change gameplay/UI to repair scraping. See the scraper README for live-mode prerequisites and archive availability limitations.
- Compose selects `SCRAPER_MODE=reader` and `SCRAPER_ONLY=scientist_portraits,equipment_icons,flags` to finish these three targets first. Other category checkpoints remain untouched; set `SCRAPER_ONLY` empty to resume all 14. The loop first discovers pages across all selected targets with `--download-budget 0`, then downloads in bounded batches; discovery persists checkpoints/mappings without treating missing binaries as complete. Reader gets full public category HTML from Jina Reader (`X-Return-Format: html`); resolve relative links against the original Wiki URL. Images use Wiki originals then Wayback fallback. Modes have separate checkpoints/cooldowns, but the CLI uses one nonblocking `.state/writer.lock` across all modes to protect shared mappings. Already-valid images from other categories are copied locally rather than requested again.
- The reader traversal found 105 scientists, 353 equipment icons (40 root + 13 slots + 92 plane + 93 ship + 115 tank), and 731 current flag members. Flags also retain eight legacy names from prior mappings; total discovered records may exceed the current category total. These are discovery counts, not proof of locally downloaded images. `thumb.php?f=...` must resolve to the hashed original URL for BOTH live and archive downloads, never to the thumbnail.
- Pagination sections retain each other's cursors: ignore previous-link labels, but do not reject an entire next link just because it also has an unrelated `*until`. A retained/unchanged `*from` is not evidence of a forward page. Successful redirects clear already-resolved deferred pages and errors. Version 6 also checks advertised ordinary-page totals against unique `#mw-pages` members; missing `pagefrom` continuation cannot complete.

## Research Tree

- `assets/research-tree.js` owns dependency-depth lanes, orthogonal edges and the click detail panel. Data `x/y` only orders branches; long chains no longer wrap upward between data columns. `ResearchManager` still owns prerequisites, slots, progress and multiplayer writes. Clicking a node only inspects it; the explicit detail action invokes the original research method.
- `assets/research-icons.js` loads technology/equipment mappings only when the research window opens, resolves exact `asset_key`/`icon_key`/ID then category keys. Resolution order: mapping `local` path → `game/assets/<folder>/<name>.png` on GitHub (`getGithubFromMapping`) → category-specific inline drawings. `ResearchTreeUI.image()` retries the GitHub URL once on image error before the drawing fallback. Wiki images use `ImageLoader` intersection loading. Unobserve removed node images on rerender to avoid retaining offscreen elements.
- The detail is an accessible interactive dialog (not a noninteractive ARIA tooltip). Close button, Escape (restores node focus), outside click, category changes, scrolling, window close and resize close it; locked/researched/researching techs still show details but cannot start through the action.
- Pure-layout tests cover all 49 country/category datasets: source-mounted Node 22, `node --test game/assets/test-research-tree.cjs`. Scraper regression suite currently has 57 offline tests. A headless Chromium run exercised all seven categories, loaded images, nonmutating detail clicks, explicit research action, locked details, Escape focus, and a 390-wide tooltip with no runtime errors; the live preview bridge was unavailable in that session, so visual appearance was not verified there.

## Game Topbar

- `/game/` is a separate static document; root `/` is the website homepage, not the game. No SPA router or HMR: refresh after frontend edits. For browser verification, a separate `window.location.assign('/game/')` expression navigates the document; do not return/await across the reload.
- `assets/topbar-ui.js` owns the seven status instruments and tooltip presentation; CoreEngine still owns values/explanations. Render updates text/gauges without replacing the instruments, so keyboard focus survives daily ticks. Order: political power, stability, war support, manpower, factories, fuel, convoys.
- Status explanations support mouseover/mouseout, focus, Escape, and touch/click; world tension retains its diplomacy action. Small screens scroll the instruments rather than reordering or hiding them. `assets/topbar.css` overrides the theme only for the topbar and existing navigation icons.
- Existing focus-tree icons still request missing GitHub raw images. These image errors are not topbar script failures; check loaded inline status images, nonempty `#game-root`, and the absence of script errors separately.
