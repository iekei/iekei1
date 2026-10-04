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

## Wiki Asset Scraper (game/assets/scraper/)

- Start the optional source-mounted Python job with `docker compose -f docker-compose.base44.yml --profile assets up -d scraper`; follow progress with `docker compose -f docker-compose.base44.yml logs -f scraper`. It is a bounded one-shot job, not an app service, and has no automatic restart. Re-running the same command resumes checkpoints.
- `wiki_crawl.py` owns both modes' cycle-safe traversal. Canonical URLs are deduplication keys ONLY; keep the actual request path, query ordering and escaping from the source link (archive lookup may otherwise 404). Follow forward `filefrom`, `subcatfrom` and `pagefrom` URLs as given; they belong to the CURRENT category, including redirected categories. Only `mw-subcategories` supplies children; never fall back to the whole page. There is no descendant depth cutoff.
- `.state/` (ignored by git) persists successful/pending pages and file records after each page/image. Failed/challenge/missing pages remain pending. Successful empty categories can complete; unrecognized HTML cannot. Existing legacy mappings seed file records, NOT traversal completion.
- `--skip-done` requires crawler version 3, successful full traversal and EVERY image saved and still valid locally. Neither nonzero counts nor name-only records prove completion. `--dry-run` writes nothing; `--limit` uses transient state and never replaces a real mapping.
- Wayback actively returns 429; the live Wiki returns a 200 `Client Challenge` in this sandbox. A 429 immediately pauses the whole pass, honours Retry-After and saves the next-allowed request time; after cooldown the next category gets a turn, avoiding starvation. The background loop uses 120–1800s increasing cooldowns for at most 10 passes and exits nonzero if incomplete. Do not poll with multi-minute blocking shell sleeps or claim all assets are fetched from tests alone.
- Category root requests use pretty URLs because archive captures often omit index.php?title=... roots. Thumbnails are converted by removing the last rendition segment, retaining the original filename and slash; text-only members resolve via their File: page / Special:FilePath. Image signatures, not a >300-byte size heuristic, determine the cache; small valid flags/icons are retained.
- Mappings and the merged index update atomically after every page/image, preserving other categories and previously saved files. Progress fields include `complete`, `traversal_complete`, `pending_pages`, `page_errors` and `pending_downloads`; `images[].local` remains frontend-compatible.
- Offline tests: `docker compose -f docker-compose.base44.yml run --rm --no-deps scraper sh -ec 'pip install -q -r game/assets/scraper/requirements.txt && python3 -m unittest discover -s game/assets/scraper -p "test_*.py" -v'`. Status without network: run `python3 game/assets/scraper/scrape_wiki_assets.py --all --status` inside the scraper container (0=all complete, 1=incomplete).
- App-side integration remains `AssetRegistry.loadScrapedMapping()` and `loadCategoryMapping(id)` / `getLocal(id, key)` in game/assets/asset-registry.js. Do not change gameplay/UI to repair scraping. See the scraper README for live-mode prerequisites and archive availability limitations.
