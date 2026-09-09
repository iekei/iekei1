# Base44 Dev Environment

## Project Overview
Static HTML/CSS/JS website (Japanese "家系" themed site with a Hearts of Iron-style game section). No backend, no database, no build step. The `lineup/` directory contains a prebuilt React app; `lineup_src/` is its source (not needed for serving).

## Running the App
```
docker compose -f docker-compose.base44.yml up -d
```
Serves all static files via nginx on port 3000. Files are bind-mounted read-only, so edits appear immediately without restart.

## Key Details
- nginx runs as `user root` (via `nginx.base44.conf`) because the bind-mounted repo directory has `700` permissions that block the default non-root nginx worker.
- `location /` uses `try_files $uri $uri/ $uri.html` so clean URLs like `/about` resolve to `/about/index.html`.
- No external credentials or secrets are needed.
- Health check: `curl http://localhost:3000/` returns 200.
