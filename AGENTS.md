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
- 軍事XP（陸/海/空）の基本増加は `DLC.onTick()` → `DLC.accrueExperienceXP()` の **各軍種 0.2 XP/日**（`DLC.XP_PER_DAY`）。`CoreEngine.tick()` は1時間単位なので毎時 0.2/24 を加算し、同じ時刻の再Tickは `DLC._lastXpStamp` で無視する。戦時補正はなく、ミッション完了報酬は +1。トップバーと兵器設計は小数第1位まで表示する（`assets/topbar-ui.js` の `formatExperience` / `EquipmentDesigner.xpAvailable`）。
- Status explanations support mouseover/mouseout, focus, Escape, and touch/click; world tension retains its diplomacy action. Small screens scroll the instruments rather than reordering or hiding them. `assets/topbar.css` overrides the theme only for the topbar and existing navigation icons.
- Existing focus-tree icons still request missing GitHub raw images. These image errors are not topbar script failures; check loaded inline status images, nonempty `#game-root`, and the absence of script errors separately.

## 兵器設計 Equipment Designer（game/index.html）

- 画面は `assets/equipment-designer.js`（`window.EquipmentDesigner`）+ `assets/equipment-designer.css`。データ本体は `dlc.js` の `EquipmentDesigner.DATA`（tank/ship/plane の hull と slot→module）で、asset 側が必須スロット・サイズ制限・倍率メタデータを後付けする。`hoi4.html` 側の `js/designers.js` とは独立実装。
- 唯一の描画先は `DLC.installUI()` が注入する `#designer-content`。旧 `dlc.js` の設計UIと `strategy-systems.js` の `updateDesigner()` は `.eqd` があるとき無効化される（二重描画防止）。CSS/JS を更新したら `index.html` の `?v=designer-N` を上げる。
- 研究ゲートは `ResearchManager.researchedTech`。研究データ未読込（空 Set + `techData` 未設定）の間だけプレビューとして全解禁し、`init()` 後は 1936年以前の技術のみ解禁。`init`/`onTick` をラップして研究完了時に再描画する。
- 必須スロット（戦車: 主砲/エンジン、艦船: 主砲/機関、航空機: エンジン/武装）は `pickModule(slot,'')` を拒否し、`validation()` も空スロットをエラーにする。サイズ制限（小型機体への大型爆弾、駆逐艦への大口径砲、軽戦車への重榴弾砲など）はピッカーで `aria-disabled` + 理由表示、`pickModule` でも拒否。
- 保存は 20 XP（陸/海/空）。`saveDesign()` は検証 → XP 消費 → `designs` へ push → `MultiplayerManager.broadcast`。`strategy-systems.js` が `saveDesign` をラップして `registerDesign`（生産カタログ）へ登録し、「生産」ボタンは未登録の復元設計を補完してから生産画面を開く。
- 回帰テスト: `game/tests/hoi4-systems.test.cjs` の「equipment designer enforces mandatory slots, size limits and XP spending」。

## HOI4風大戦略ゲーム（hoi4.html）

- エントリはリポジトリルートの `hoi4.html`（アセットは厳密に `game/assets/...`・`game/card/...` を参照するため、ページはルートに置く）。
- ES6 Modules のみで構成（`game/js/` 以下）、ビルド不要。デザインシステムは `game/css/steel-ui.css`。
- ローカライズ辞書は `game/locales/ja.json`。**研究技術名（全294件）は `game/eng/tec/data/tech_*.json` から自動生成**しており、辞書を手編集で更新する場合は `/tmp/gen_data.py` 相当のルールで再生成すること（現行ジェネレータはセッションスクリプト）。
- 指揮官カードは `game/card/{army,navy,air,mio}/*.json` + `game/card/manifest.json` で管理。
- マルチプレイ時間同期サーバー: `node server/timesync-server.js 8787`（依存パッケージなしの簡易WebSocketリレー。`server/package.json` は ESM なので import 構文を使うこと）。
- 起動: `python3 -m http.server 8000`（ルートから）→ `/hoi4.html`。マルチプレイは `?mp=host&room=xxx` / `?mp=client&room=xxx`。
- **`game/index.html` への統合**: 将軍カードゲームの「HOI4 大戦略」は `../hoi4.html` を
  iframe で全画面表示する（`game/hoi4-screen.js` / `game/css/hoi4-screen.css`）。
  起動は H キー・ナビレール・スタート画面・`?screen=hoi4`。Esc で戻る。
  iframe は初回オープンまで読み込まず、閉じても破棄しない（状態保持）。閉じている間は
  `?embed=1` の `game/js/ui/embed.js` が親からの `postMessage` を受けて時間を一時停止する。
  埋め込み時は `game/js/ui/topbar.js` が「← 将軍カードゲーム」ボタンを追加する。
  `steel-ui.css` はグローバル CSS（`html`/`body`/`button`）を所有するため、直接読み込まず
  iframe で分離するのが前提。レイヤーのスタイルは `game/index.html` の既存 UI と衝突させない。

## 面的バトルプラン（game/index.html）

- `assets/area-battle-plan.js` を `strategy.js` の後に読み込み、通常陸軍の `OffensivePlanner.execute/next/tickArmy/result` をプロヴィンスグラフ方式へ接続する。旧 `army.arrow` は互換表示データのみ。`offensiveLine.pids` が目標線、`army.areaPlan` が有限の作戦範囲・到達済み区画・動的前線を持つ。師団の `plan*` フィールドと戦闘の `divisionIds/originPids` は既存JSONセーブに含まれる。
- `MapRenderer.buildAdjacency()` は双方向隣接と実ピクセル境界 `provinceBoundarySegments` を同時構築する。前線の描画は共有境界を使い、離れた区画の中心を結ばない。占領後は当該計画内の境界を更新し、全世界の敵国境へ再配備しない。
- `BattleManager.startOffensive(...,{divisionIds})` は軍集団内の並列戦闘を許可するが、一師団の二重参加・非隣接攻撃・同一区画の重複戦闘を拒否する。組織力・装備損耗・勝利後の移動は参加師団のみ。通常攻勢で `OffensivePlanner.hold()` を使うと軍集団全体が集結するため使用しない。上陸・空挺の旧専用結果処理は別扱い。
- 自国領行軍/再配備は隣接1区画/24時間。師団の隙間埋めにテレポートを再導入しない。攻撃線は敵領の目標ラインをなぞって入力し、向きを示す矢印として解釈しない。
- 仕様と手順: `game/README-area-battle-plan.md`。回帰テスト: `game/tests/area-battle-plan.test.cjs`（16件）。`game/tests/helpers/strategy-fixture.cjs` は旧strategyテストと共有するVMフィクスチャ。

## 将軍・併合師団の配属互換

- `CardSystem.normalizeHiredCard(s)` は雇用時・localStorage読み込み・セーブ復元時に種別/能力値を保持し、古い名前/レアリティのみのレコードは読み込み済みの `allCards` から補完する。`ForceSystems` の指揮官候補・配属判定も同じ正規化を使う。雇用データから `type` / `branch` / `stats` を削除しないこと。
- 師団選択のDOM値は文字列として受け取り、`ArmyRoster.transfer` は `String(id)` で照合する。既存セーブには `POL-0` のような外国由来IDが存在するため、`Number(input.value)` に戻さない。
- 今後の併合は領土所有権変更前に生存師団を確保し、`ArmyRoster.absorbDivisions` で一意な自国数値IDと元の `sourceCountry/sourceDivisionId` を付与する。編成と組織力は保持。所有権変更後に再度 `IntelOperations.forces(target)` を呼ぶと師団が全滅扱いになるため呼ばない。配属時に軍集団全体を `hold()` で瞬間移動させない。
- 回帰テスト: `game/tests/roster-assignment.test.cjs`（6件）。実データの雇用→候補表示→配属、旧雇用レコード補完、文字列IDのDOM選択、併合・ID衝突・セーブ復元を検証。
