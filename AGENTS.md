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
