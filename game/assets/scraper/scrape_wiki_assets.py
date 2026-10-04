#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_wiki_assets.py — HoI4 Paradox Wiki 画像アセット一括抽出スクリプト

参照元: https://hoi4.paradoxwikis.com/ の10カテゴリ
  1.  Operative_portraits    → assets/operatives/
  2.  Flags                  → assets/flags/
  3.  Technology_icons       → assets/technology/
  4.  Equipment_icons        → assets/equipment/
  5.  National_focus_icons   → assets/focus/
  6.  Topbar_icons           → assets/topbar/
  7.  Top_menu_icons         → assets/top_menu/
  8.  Special_project_icons  → assets/special_projects/
  9.  Scientist_portraits    → assets/scientists/
  10. Land_unit_icons        → assets/land_units/

機能:
  - ページネーション対応  : MediaWikiカテゴリの「next page」(filefrom=) を自動巡回
  - サブカテゴリ対応      : mw-subcategories 内の Category: リンクを再帰辿り (深さ制限付き)
  - フィルタリング        : Wiki UI部品 (ロゴ・Ambox・ライセンスマーク等) を名前ベースで除外
  - 保存 + マッピングJSON : assets/mappings/<id>.json と assets/asset-mapping.json を生成

2つの取得モード:
  --mode live     : Playwright(Chromium) でWikiを直接訪問。FastlyのJSチャレンジを
                    ヘッドレスブラウザで通過してから BeautifulSoup で解析する。
                    ローカルPC (一般回線) での実行を想定。
  --mode wayback  : web.archive.org にアーカイブされた同一ページ/画像から取得。
                    Wiki本家にアクセスできない環境 (サーバ/CI) 向けフォールバック。
                    サンドボックス環境ではこちらが既定。

使い方:
  python3 scrape_wiki_assets.py --mode wayback --all
  python3 scrape_wiki_assets.py --mode live   --all
  python3 scrape_wiki_assets.py --mode wayback --only flags,topbar --limit 50
  python3 scrape_wiki_assets.py --dry-run                # 収集のみ (DL無し)

必要ライブラリ (liveモードのみ playwright):
  pip install requests beautifulsoup4 playwright && playwright install chromium
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ============================================================
# 設定
# ============================================================

WIKI_BASE = "https://hoi4.paradoxwikis.com"
WAYBACK_BASE = "https://web.archive.org"
# 「2024」はWaybackが最も近いスナップショットへリダイレクトする
WAYBACK_TS = "2024"

# スクリプト位置 = game/assets/scraper/ → リポジトリの game/ が2つ上
SCRIPT_DIR = Path(__file__).resolve().parent
GAME_ROOT = SCRIPT_DIR.parent.parent
ASSETS_DIR = GAME_ROOT / "assets"
MAPPINGS_DIR = ASSETS_DIR / "mappings"

# ── 10カテゴリ定義 (ユーザー指定URLと出力先ディレクトリ) ──
CATEGORIES = [
    {"id": "operative_portraits", "wiki_category": "Operative_portraits",   "out_dir": "operatives",
     "label": "諜報機関ポートレート", "subcat_depth": 2},
    {"id": "flags",               "wiki_category": "Flags",                 "out_dir": "flags",
     "label": "国旗",                 "subcat_depth": 1},
    {"id": "technology_icons",    "wiki_category": "Technology_icons",      "out_dir": "technology",
     "label": "テクノロジーアイコン", "subcat_depth": 2},
    {"id": "equipment_icons",     "wiki_category": "Equipment_icons",       "out_dir": "equipment",
     "label": "兵器設計・モジュール", "subcat_depth": 2},
    {"id": "national_focus_icons","wiki_category": "National_focus_icons",  "out_dir": "focus",
     "label": "国家方針アイコン",     "subcat_depth": 1},
    {"id": "topbar_icons",        "wiki_category": "Topbar_icons",          "out_dir": "topbar",
     "label": "トップバーアイコン",   "subcat_depth": 1},
    {"id": "top_menu_icons",      "wiki_category": "Top_menu_icons",        "out_dir": "top_menu",
     "label": "トップメニューアイコン","subcat_depth": 1},
    {"id": "special_project_icons","wiki_category": "Special_project_icons","out_dir": "special_projects",
     "label": "特別研究計画アイコン", "subcat_depth": 2},
    {"id": "scientist_portraits", "wiki_category": "Scientist_portraits",   "out_dir": "scientists",
     "label": "科学者ポートレート",   "subcat_depth": 2},
    {"id": "land_unit_icons",     "wiki_category": "Land_unit_icons",       "out_dir": "land_units",
     "label": "陸軍ユニットアイコン", "subcat_depth": 2},
]

# ── フィルタリング設定 ──
EXT_OK = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}

# Wiki UI部品・ゲーム無関係画像の除外 (大文字小文字を区別しない部分一致)
NAME_BLACKLIST = re.compile(
    r"(logo|wiki|ambox|stub|licen[cs]e|cc-|commons|copyright|edit[-_ ]?(icon|section)|"
    r"padlock|semi-?protect|arrow|sort_|blank|no[-_ ]?image|question[-_ ]?book|"
    r"red[-_ ]?x|green[-_ ]?check|cscr-|featured|template|disambig|merge|split|"
    r"copyedit|translation|broom|symbol[-_ ]?(confirm|wait|question|info)|"
    r"icon[-_ ]?info|pixel[-_ ]?icon|folder|file[-_ ]?icon| Magnify|magnify|"
    r"crystal|globe|banner[-_ ]?placeholder|unknown|khongro|vandal|discussion)",
    re.IGNORECASE,
)

# 最低ファイルサイズ (プレースホルダー/明らかに破損した画像の排除)
MIN_BYTES = 300

# 取得の丁寧さ (archive.org / 本家への負荷軽減)
PAGE_DELAY = 10.0     # カテゴリページ巡回の間隔 (秒) — Waybackのレート制限回避
DL_THREADS = 1        # 画像ダウンロードの同時数
DL_DELAY = 3.0        # 各ダウンロード間の最小間隔 (秒)
HTTP_TIMEOUT = 60
MAX_RETRIES = 6
RETRY_429_WAIT = 120  # 429 (Rate Limit) 時の待機秒数 — ブロック解除待ちを含む

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")


# ============================================================
# 共通ユーティリティ
# ============================================================

def sanitize_filename(name: str) -> str:
    """File:名から安全なローカルファイル名を生成する"""
    name = urllib.parse.unquote(name)
    name = name.replace(" ", "_")
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name


def file_key(name: str) -> str:
    """マッピング用の正規化キー (大文字小文字・空白・_ を統一)"""
    return re.sub(r"[\s_]+", "_", name.lower()).replace(".png", "")


def passes_filter(file_name: str, size: int | None = None) -> bool:
    """WikiのUI部品など不要画像を除外する"""
    stem = Path(file_name).stem
    ext = Path(file_name).suffix.lower()
    if ext not in EXT_OK:
        return False
    if NAME_BLACKLIST.search(stem):
        return False
    if size is not None and size < MIN_BYTES:
        return False
    return True


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9"})
    return s


# ============================================================
# カテゴリページ解析 (BeautifulSoup — live/wayback 共通)
# ============================================================

def parse_category_page(html: str) -> dict:
    """
    MediaWikiカテゴリページのHTMLを解析する。

    戻り値:
      {
        "files":  [ {name, image_url(ある場合), page_url} ],   # ファイルメンバー
        "subcats": [ {name, category_url} ],                   # サブカテゴリ
        "next_from": str | None,                               # ページネーション (filefrom=)
      }
    """
    soup = BeautifulSoup(html, "html.parser")

    files, seen = [], set()
    # カテゴリ本体セクション (mw-category-media / gallery / li を包括的に走査)
    for a in soup.find_all("a", href=True):
        href = urllib.parse.unquote(a["href"])
        m = re.search(r"hoi4\.paradoxwikis\.com/File:([^&#]+)", href)
        if not m:
            continue
        name = m.group(1)
        if name in seen:
            continue
        seen.add(name)
        entry = {"name": name, "image_url": None, "page_url": None}

        # ギャラリー表示: サムネイルまたはフルサイズ画像の <img> が隣接する
        img = a.find("img") or (a.parent and a.parent.find("img")) or \
              (a.parent and a.parent.parent and a.parent.parent.find("img"))
        if img and img.get("src"):
            entry["image_url"] = img["src"]
        files.append(entry)

    # サブカテゴリ (mw-subcategories 内の Category: リンク)
    subcats, seen_c = [], set()
    sub_div = soup.find(id="mw-subcategories") or soup
    for a in sub_div.find_all("a", href=True):
        href = urllib.parse.unquote(a["href"])
        m = re.search(r"hoi4\.paradoxwikis\.com/Category:([^&#]+)$", href)
        if not m:
            continue
        cname = m.group(1)
        if cname in seen_c:
            continue
        seen_c.add(cname)
        subcats.append({"name": cname, "url": WIKI_BASE + "/Category:" + cname})

    # ページネーション: 「next page」リンク (filefrom= パラメータを含む)
    next_from = None
    for a in soup.find_all("a", href=True):
        if re.search(r"filefrom=", urllib.parse.unquote(a["href"])):
            m = re.search(r"filefrom=([^&\"]+)", urllib.parse.unquote(a["href"]))
            if m and a.get_text(strip=True).lower().startswith("next"):
                next_from = m.group(1).replace("+", " ")
                break
    # next page のテキストが無い古いスナップショット用: filefrom リンク自体を採用
    if next_from is None:
        for a in soup.find_all("a", href=True):
            if "filefrom=" in urllib.parse.unquote(a["href"]):
                m = re.search(r"filefrom=([^&\"]+)", urllib.parse.unquote(a["href"]))
                if m:
                    next_from = m.group(1).replace("+", " ")
                    break

    return {"files": files, "subcats": subcats, "next_from": next_from}


# ============================================================
# Wayback モード (web.archive.org のアーカイブから取得)
# ============================================================

class WaybackScraper:
    def __init__(self, limit=None):
        self.session = make_session()
        self.limit = limit

    def _get(self, url, **kw):
        last_err = None
        for i in range(MAX_RETRIES):
            try:
                r = self.session.get(url, timeout=HTTP_TIMEOUT, **kw)
                if r.status_code == 200:
                    return r
                last_err = f"HTTP {r.status_code}"
                if r.status_code == 404:
                    return None
                if r.status_code == 429:  # Rate Limit — 長めに待って再試行
                    time.sleep(RETRY_429_WAIT)
                    continue
            except requests.RequestException as e:
                last_err = str(e)
            time.sleep(1.5 * (i + 1))
        print(f"    ! fetch failed: {url[:110]} ({last_err})")
        return None

    def fetch_category_page(self, category_url: str):
        """カテゴリページのスナップショットを取得し解析する。戻り値: (parsed, snapshot_ts)"""
        wrapped = f"{WAYBACK_BASE}/web/{WAYBACK_TS}/{category_url}"
        r = self._get(wrapped, allow_redirects=True)
        if r is None:
            return None, None
        # 最終スナップショットのタイムスタンプを URL から取り出す
        m = re.search(r"/web/(\d{14})/", r.url)
        ts = m.group(1) if m else WAYBACK_TS
        return parse_category_page(r.text), ts

    def download(self, task):
        """画像を1つダウンロードして保存する。task: (name, image_url, out_dir, subcat)"""
        name, image_url, out_dir, subcat = task
        dest = out_dir / sanitize_filename(name)
        if dest.exists() and dest.stat().st_size > MIN_BYTES:
            return ("cached", name, dest)
        # Wayback の画像URL (im_ = オリジナルバイト列) を正規化
        # - 相対形:  /web/<ts>im_/https://hoi4.paradoxwikis.com/images/...
        # - 絶対形:  https://web.archive.org/web/<ts>im_/https://...
        m = re.search(r"/web/(\d{14})[a-z_]*/", image_url)
        ts = m.group(1) if m else WAYBACK_TS
        raw = re.sub(r"^(?:https?://web\.archive\.org)?(/web/[^/]+/)", r"\1", image_url)
        if not raw.startswith("/web/"):
            raw = f"/web/{ts}im_/" + image_url
        dl_url = WAYBACK_BASE + raw
        r = None
        # サムネイルURLの場合、先にフルサイズ原画を試す (未アーカイブならサムネイルへ)
        if "/thumb/" in raw:
            full = re.sub(r"(/images/)thumb/([^/]+/[^/]+)/[^/]+/(?:\d+px-)?(.+)$",
                          r"\1\2\3", raw)
            r = self._get(WAYBACK_BASE + full)
        if r is None:
            r = self._get(dl_url)
        if r is None:
            return ("failed", name, None)
        ctype = r.headers.get("content-type", "")
        if not ctype.startswith("image/") or len(r.content) < MIN_BYTES:
            return ("failed", name, None)
        out_dir.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.content)
        time.sleep(DL_DELAY)
        return ("ok", name, dest)

    def scrape(self, cat: dict):
        """1カテゴリを巡回してページネーション + サブカテゴリをすべて辿る"""
        cat_url = f"{WIKI_BASE}/Category:{cat['wiki_category']}"
        print(f"[wayback] {cat['id']} ({cat_url})")
        out_dir = ASSETS_DIR / cat["out_dir"]
        results, failed = [], []
        visited_pages = set()

        pages = [(cat_url, 0, None)]  # (url, depth, subcat_name)
        while pages:
            url, depth, subcat = pages.pop(0)
            if url in visited_pages:
                continue
            visited_pages.add(url)
            parsed, ts = self.fetch_category_page(url)
            if parsed is None:
                print(f"    ! スナップショット無し: {url}")
                if not results:
                    return results, failed, None   # このカテゴリは Wayback 未対応
                continue
            time.sleep(PAGE_DELAY)
            for f in parsed["files"]:
                if not passes_filter(f["name"]):
                    continue
                results.append({"name": f["name"], "image_url": f["image_url"],
                                "subcategory": subcat, "snapshot_ts": ts,
                                "file_page": f"{WIKI_BASE}/File:{f['name']}"})
                if self.limit and len(results) >= self.limit:
                    break
            # ページネーション: 次ページを自動巡回
            if parsed["next_from"] and not (self.limit and len(results) >= self.limit):
                nxt = (f"{WIKI_BASE}/index.php?title=Category:{cat['wiki_category']}"
                       f"&filefrom={urllib.parse.quote(parsed['next_from'])}")
                pages.append((nxt, depth, subcat))
            # サブカテゴリ: リンクを辿って再帰
            if depth < cat.get("subcat_depth", 1):
                for sc in parsed["subcats"]:
                    sc_url = f"{WIKI_BASE}/Category:{sc['name']}"
                    if sc_url not in visited_pages:
                        pages.append((sc_url, depth + 1, sc["name"]))

        # 画像URLが判明しているもののみダウンロード (list表示のみのカテゴリは名前収集のみ)
        downloadable = [r for r in results if r["image_url"]]
        name_only = len(results) - len(downloadable)
        if name_only:
            print(f"    - {name_only} 件はアーカイブに画像が無く名前のみ収集")
        ok = fail = 0
        tasks = [(r["name"], r["image_url"], out_dir, r["subcategory"])
                 for r in downloadable if r["image_url"]]
        with ThreadPoolExecutor(max_workers=DL_THREADS) as ex:
            futs = [ex.submit(self.download, t) for t in tasks]
            for fut in as_completed(futs):
                status, name, dest = fut.result()
                if status in ("ok", "cached"):
                    ok += 1
                else:
                    failed.append(name)
                    fail += 1
        print(f"    - {len(results)} 件収集 / {ok} 件保存 / {fail} 件失敗")
        return results, failed, out_dir


# ============================================================
# Live モード (本家Wikiを Playwright で直接取得)
# ============================================================

class LiveScraper:
    """
    Fastly JSチャレンジをヘッドレスChromiumで通過してから、
    BeautifulSoup でカテゴリを解析し Special:FilePath から画像をDLする。
    ローカルPCでの実行を想定。
    """

    def __init__(self, limit=None):
        self.limit = limit
        self.session = make_session()

    def _browser_context(self, pw):
        browser = pw.chromium.launch(headless=True, args=[
            "--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        ctx = browser.new_context(user_agent=BROWSER_UA, locale="en-US",
                                  viewport={"width": 1280, "height": 900})
        # チャレンジ回避 (navigator.webdriver 隠蔽)
        ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        return browser, ctx

    def _fetch_page(self, ctx, url, wait_ms=25000):
        page = ctx.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            # JSチャレンジ解除を待つ (タイトルが Client Challenge でなくなるまで)
            deadline = wait_ms
            while deadline > 0:
                if "Challenge" not in page.title():
                    break
                page.wait_for_timeout(2000)
                deadline -= 2000
            # クッキーを requests セッションへ引き継ぐ (画像DL用)
            for c in ctx.cookies():
                self.session.cookies.set(c["name"], c["value"], domain=c["domain"])
            return page.content()
        finally:
            page.close()

    def download(self, task):
        name, out_dir, subcat = task
        dest = out_dir / sanitize_filename(name)
        if dest.exists() and dest.stat().st_size > MIN_BYTES:
            return ("cached", name, dest)
        url = f"{WIKI_BASE}/Special:FilePath/" + urllib.parse.quote(name)
        for i in range(MAX_RETRIES):
            try:
                r = self.session.get(url, timeout=HTTP_TIMEOUT, allow_redirects=True)
                ct = r.headers.get("content-type", "")
                if r.status_code == 200 and ct.startswith("image/") and len(r.content) >= MIN_BYTES:
                    out_dir.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(r.content)
                    time.sleep(DL_DELAY)
                    return ("ok", name, dest)
                if r.status_code == 404:
                    break
            except requests.RequestException:
                pass
            time.sleep(1.5 * (i + 1))
        return ("failed", name, None)

    def scrape(self, cat: dict):
        from playwright.sync_api import sync_playwright
        cat_url = f"{WIKI_BASE}/Category:{cat['wiki_category']}"
        print(f"[live] {cat['id']} ({cat_url})")
        out_dir = ASSETS_DIR / cat["out_dir"]
        results, failed = [], []
        visited = set()
        pages = [(cat_url, 0, None)]

        with sync_playwright() as pw:
            browser, ctx = self._browser_context(pw)
            try:
                while pages:
                    url, depth, subcat = pages.pop(0)
                    if url in visited:
                        continue
                    visited.add(url)
                    html = self._fetch_page(ctx, url)
                    parsed = parse_category_page(html)
                    time.sleep(PAGE_DELAY)
                    for f in parsed["files"]:
                        if not passes_filter(f["name"]):
                            continue
                        results.append({"name": f["name"], "image_url":
                                        f"{WIKI_BASE}/Special:FilePath/" + urllib.parse.quote(f["name"]),
                                        "subcategory": subcat, "snapshot_ts": None,
                                        "file_page": f"{WIKI_BASE}/File:{f['name']}"})
                        if self.limit and len(results) >= self.limit:
                            break
                    if parsed["next_from"] and not (self.limit and len(results) >= self.limit):
                        nxt = (f"{WIKI_BASE}/index.php?title=Category:{cat['wiki_category']}"
                               f"&filefrom={urllib.parse.quote(parsed['next_from'])}")
                        pages.append((nxt, depth, subcat))
                    if depth < cat.get("subcat_depth", 1):
                        for sc in parsed["subcats"]:
                            if sc["url"] not in visited:
                                pages.append((sc["url"], depth + 1, sc["name"]))
            finally:
                browser.close()

        ok = fail = 0
        tasks = [(r["name"], out_dir, r["subcategory"]) for r in results]
        with ThreadPoolExecutor(max_workers=DL_THREADS) as ex:
            for fut in as_completed([ex.submit(self.download, t) for t in tasks]):
                status, name, dest = fut.result()
                if status in ("ok", "cached"):
                    ok += 1
                else:
                    failed.append(name)
                    fail += 1
        print(f"    - {len(results)} 件収集 / {ok} 件保存 / {fail} 件失敗")
        return results, failed, out_dir


# ============================================================
# マッピングJSON生成
# ============================================================

def build_mapping(cat: dict, results, out_dir, failed, mode):
    """1カテゴリ分のマッピングJSONを書き出す"""
    images = []
    for r in results:
        local = None
        if out_dir is not None:
            candidate = out_dir / sanitize_filename(r["name"])
            if candidate.exists() and candidate.stat().st_size > MIN_BYTES:
                # game/ 起点の相対パス (ブラウザから game/ がルート)
                local = "assets/" + cat["out_dir"] + "/" + candidate.name
        images.append({
            "name": r["name"],
            "key": file_key(Path(r["name"]).stem),
            "local": local,
            "live_url": f"{WIKI_BASE}/Special:FilePath/" + urllib.parse.quote(r["name"]),
            "source_page": r["file_page"],
            "subcategory": r["subcategory"],
        })
    mapping = {
        "id": cat["id"],
        "label": cat["label"],
        "source": f"{WIKI_BASE}/Category:{cat['wiki_category']}",
        "mode": mode,
        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "local_base": "assets/" + cat["out_dir"] + "/",
        "count": len([i for i in images if i["local"]]),
        "count_names": len(images),
        "failed": failed[:200],
        "images": images,
    }
    MAPPINGS_DIR.mkdir(parents=True, exist_ok=True)
    path = MAPPINGS_DIR / f"{cat['id']}.json"
    path.write_text(json.dumps(mapping, ensure_ascii=False, indent=1), encoding="utf-8")
    return path, mapping


def build_index(entries):
    """全カテゴリ統合インデックス assets/asset-mapping.json"""
    index = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "source": WIKI_BASE,
        "note": "game/index.html からの相対パス。AssetRegistry.loadScrapedMapping() で読み込む。",
        "categories": entries,
    }
    (ASSETS_DIR / "asset-mapping.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")


# ============================================================
# メイン
# ============================================================

def main():
    ap = argparse.ArgumentParser(description="HoI4 Paradox Wiki asset scraper")
    ap.add_argument("--mode", choices=["wayback", "live"], default="wayback",
                    help="wayback=archive.orgから / live=本家をPlaywrightで (既定: wayback)")
    ap.add_argument("--all", action="store_true", help="全10カテゴリを処理")
    ap.add_argument("--only", help="カテゴリidのカンマ区切り (例: flags,topbar_icons)")
    ap.add_argument("--limit", type=int, default=None, help="カテゴリあたり最大収集数 (テスト用)")
    ap.add_argument("--dry-run", action="store_true", help="収集のみで画像をDLしない")
    args = ap.parse_args()

    targets = CATEGORIES if args.all else (
        [c for c in CATEGORIES if c["id"] in args.only.split(",")] if args.only else [])
    if not targets:
        ap.error("--all または --only <id,...> を指定してください")
    if args.only:
        known = {c["id"] for c in CATEGORIES}
        unknown = set(args.only.split(",")) - known
        if unknown:
            ap.error(f"未知のカテゴリid: {unknown}\n既知: {sorted(known)}")

    if args.mode == "live" and args.dry_run:
        print("dry-run は live モードでは未対応です (収集だけでもページ取得が必要)")
        sys.exit(1)

    index_entries = {}
    for cat in targets:
        if args.dry_run:
            scraper = WaybackScraper(args.limit)
            results, failed, out_dir = scraper.scrape(cat)
            # dry-run ではDLせず名前一覧だけ出す
            print(f"[dry-run] {cat['id']}: {len(results)} 件")
            continue
        if args.mode == "live":
            results, failed, out_dir = LiveScraper(args.limit).scrape(cat)
        else:
            results, failed, out_dir = WaybackScraper(args.limit).scrape(cat)
        path, mapping = build_mapping(cat, results, out_dir, failed, args.mode)
        index_entries[cat["id"]] = {
            "label": cat["label"],
            "mapping_file": "assets/mappings/" + path.name,
            "local_base": mapping["local_base"],
            "count": mapping["count"],
            "count_names": mapping["count_names"],
        }
        print(f"    → {path}")

    if index_entries and not args.dry_run:
        build_index(index_entries)
        print("→ assets/asset-mapping.json (統合インデックス)")

    print("完了")


if __name__ == "__main__":
    main()
