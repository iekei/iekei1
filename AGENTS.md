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

- Runs inside a throwaway `python:3.12-slim` container (host has no pip deps):
  `docker run -d --name scraper-main -v "$PWD:/repo" -w /repo -e PYTHONUNBUFFERED=1 python:3.12-slim sh -c "pip install -q requests beautifulsoup4; python3 game/assets/scraper/scrape_wiki_assets.py --mode wayback --all; echo EXIT_CODE=$?"`
- Progress: `docker logs -f scraper-main`; output dirs `game/assets/<category>/`, mappings `game/assets/mappings/<id>.json` + index `game/assets/asset-mapping.json`.
- Wayback Machine rate-limits aggressively (HTTP 429, bursts last minutes). Pacing: PAGE_DELAY 4s, DL threads 1, DL_DELAY 2s, RETRY_429_WAIT 45s. If a category page 429s through all retries it is SKIPPED with an empty mapping — re-run with `--only <id1>,<id2>` afterwards to fill the gaps.
- Downloads are resumable: existing files >300 bytes are skipped ("cached").
- App-side integration: `AssetRegistry.loadScrapedMapping()` (fetches asset-mapping.json) and `loadCategoryMapping(id)` / `getLocal(id, key)` in game/assets/asset-registry.js; index is fetched at boot from `CoreEngine.init()` in game/index.html.
