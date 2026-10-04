#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HoI4 Wiki asset scraper: forward pagination, all descendants, resumable downloads.

python3 game/assets/scraper/scrape_wiki_assets.py --mode wayback --all --skip-done
python3 game/assets/scraper/scrape_wiki_assets.py --mode live --all
python3 game/assets/scraper/scrape_wiki_assets.py --all --status

The default Wayback mode needs requirements.txt. Live mode additionally needs
Playwright and Chromium. HTTP 429 pauses the whole pass; it is never completion.
--dry-run performs discovery only, without downloads, mappings or checkpoints.
"""

import argparse
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

from wiki_crawl import (CRAWLER_VERSION, WIKI_BASE, CategoryCrawl, FetchError,
                        RateLimited, atomic_json, name_key, original_url, wiki_title)

SCRIPT_DIR = Path(__file__).resolve().parent
ASSETS_DIR = SCRIPT_DIR.parent
MAPPINGS_DIR = ASSETS_DIR / "mappings"
STATE_DIR = SCRIPT_DIR / ".state"
WAYBACK_BASE = "https://web.archive.org"
WAYBACK_TS = "2024"
PAGE_DELAY = 10.0
DL_DELAY = 3.0
HTTP_TIMEOUT = (10, 60)
MAX_RETRIES = 3
RETRY_429_WAIT = 120
EXT_OK = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}

CATEGORIES = [
    {"id": "operative_portraits", "wiki_category": "Operative_portraits", "out_dir": "operatives", "label": "諜報機関ポートレート"},
    {"id": "flags", "wiki_category": "Flags", "out_dir": "flags", "label": "国旗"},
    {"id": "technology_icons", "wiki_category": "Technology_icons", "out_dir": "technology", "label": "テクノロジーアイコン"},
    {"id": "equipment_icons", "wiki_category": "Equipment_icons", "out_dir": "equipment", "label": "兵器設計・モジュール"},
    {"id": "national_focus_icons", "wiki_category": "National_focus_icons", "out_dir": "focus", "label": "国家方針アイコン"},
    {"id": "topbar_icons", "wiki_category": "Topbar_icons", "out_dir": "topbar", "label": "トップバーアイコン"},
    {"id": "top_menu_icons", "wiki_category": "Top_menu_icons", "out_dir": "top_menu", "label": "トップメニューアイコン"},
    {"id": "special_project_icons", "wiki_category": "Special_project_icons", "out_dir": "special_projects", "label": "特別研究計画アイコン"},
    {"id": "scientist_portraits", "wiki_category": "Scientist_portraits", "out_dir": "scientists", "label": "科学者ポートレート"},
    {"id": "land_unit_icons", "wiki_category": "Land_unit_icons", "out_dir": "land_units", "label": "陸軍ユニットアイコン"},
]


def sanitize_filename(name):
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name.replace(" ", "_"))


def file_key(name):
    return re.sub(r"[\s_]+", "_", Path(name).stem.lower())


def passes_filter(name):
    # Only category members are parsed. Broad word blacklists also remove real
    # game assets (e.g. focus icons containing 'crystal' or 'arrow').
    return Path(name).suffix.lower() in EXT_OK


def is_image(content):
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return len(content) >= 33 and b"IEND" in content[-12:]
    if content.startswith(b"\xff\xd8\xff"):
        return content.rstrip().endswith(b"\xff\xd9")
    if content.startswith((b"GIF87a", b"GIF89a")):
        return len(content) >= 14 and content.endswith(b";")
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return len(content) >= 20 and int.from_bytes(content[4:8], "little") + 8 == len(content)
    if b"<svg" in content[:4096]:
        try:
            return ET.fromstring(content).tag.rsplit("}", 1)[-1] == "svg"
        except ET.ParseError:
            pass
    return False


def cached_image(path):
    return path.is_file() and is_image(path.read_bytes())


def read_json(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def retry_after_seconds(value):
    try:
        return max(RETRY_429_WAIT, int(value))
    except (TypeError, ValueError):
        try:
            return max(RETRY_429_WAIT, int((parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()))
        except (TypeError, ValueError, OverflowError):
            return RETRY_429_WAIT


def pretty_wiki_url(url):
    """The archive usually stores the pretty root URL, not index.php?title=..."""
    params = dict(parse_qsl(urlsplit(url).query))
    if set(params) == {"title"}:
        return WIKI_BASE + "/" + quote(params["title"], safe=":_")
    return url


def image_candidates(url):
    url = original_url(url)
    parsed = urlsplit(url)
    if "/images/thumb/" in parsed.path:
        prefix, thumbnail = parsed.path.split("/thumb/", 1)
        # Keep the original filename segment, including .svg; drop only the rendition.
        full_path = prefix + "/" + thumbnail.rsplit("/", 1)[0]
        yield urlunsplit(parsed._replace(path=full_path))
    yield url


class WikiScraper:
    def __init__(self, mode="wayback", timestamp=WAYBACK_TS):
        self.mode = mode
        self.timestamp = timestamp
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "HoI4AssetCollector/2.0", "Accept-Language": "en"})
        self.next_request = 0
        self.context = None

    def _get(self, url, image=False, timestamp=None):
        url = original_url(url)
        if self.mode == "wayback":
            modifier = "im_" if image else "id_"
            url = f"{WAYBACK_BASE}/web/{timestamp or self.timestamp}{modifier}/{url}"
        last_error = "取得失敗"
        for attempt in range(MAX_RETRIES):
            time.sleep(max(0, self.next_request - time.monotonic()))
            try:
                response = self.session.get(url, timeout=HTTP_TIMEOUT)
                self.next_request = time.monotonic() + (DL_DELAY if image else PAGE_DELAY)
                if response.status_code == 429:
                    raise RateLimited(f"HTTP 429: {url}", retry_after_seconds(response.headers.get("Retry-After")))
                if response.status_code == 200:
                    return response
                if response.status_code in (403, 404, 410):
                    raise FetchError(f"HTTP {response.status_code}: {url}")
                last_error = f"HTTP {response.status_code}: {url}"
            except requests.RequestException as error:
                self.next_request = time.monotonic() + PAGE_DELAY
                last_error = str(error)
            print(f"    ! 再試行 {attempt + 1}/{MAX_RETRIES}: {last_error}", flush=True)
        raise FetchError(last_error)

    def fetch_category_page(self, url):
        url = original_url(url)
        if self.context is None:
            response = self._get(url)
            return response.text, response.url
        time.sleep(max(0, self.next_request - time.monotonic()))
        page = self.context.new_page()
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            self.next_request = time.monotonic() + PAGE_DELAY
            if response and response.status == 429:
                raise RateLimited(f"HTTP 429: {url}", retry_after_seconds(response.headers.get("retry-after")))
            if response and response.status >= 400:
                raise FetchError(f"HTTP {response.status}: {url}")
            # Wait for a real category, not a 200 Client Challenge page.
            page.wait_for_selector("#mw-category-media, #mw-subcategories, #mw-pages, .mw-category-generated", timeout=25000)
            for cookie in self.context.cookies():
                self.session.cookies.set(cookie["name"], cookie["value"], domain=cookie["domain"])
            return page.content(), page.url
        except (FetchError, RateLimited):
            raise
        except Exception as error:
            raise FetchError(str(error)) from error
        finally:
            page.close()

    def download(self, record, out_dir):
        destination = out_dir / sanitize_filename(record["name"])
        if cached_image(destination):
            return destination
        timestamp = record.get("snapshot_ts")
        attempted = set()
        errors = []

        def try_image(url):
            for candidate in image_candidates(url):
                if candidate in attempted:
                    continue
                attempted.add(candidate)
                try:
                    response = self._get(candidate, image=True, timestamp=timestamp)
                    if not is_image(response.content) or (destination.suffix.lower() == ".svg" and b"<svg" not in response.content[:4096]):
                        raise FetchError(f"画像ではない、不完全、または形式が異なる: {candidate}")
                    out_dir.mkdir(parents=True, exist_ok=True)
                    temporary = destination.with_suffix(destination.suffix + ".part")
                    temporary.write_bytes(response.content)
                    temporary.replace(destination)
                    return destination
                except RateLimited:
                    raise
                except FetchError as error:
                    errors.append(str(error))
            return None

        if record.get("image_url"):
            result = try_image(record["image_url"])
            if result:
                return result
        # A text-only member still has a File: page; do not silently omit it.
        file_page = record.get("page_url") or record.get("source_page") or WIKI_BASE + "/File:" + quote(record["name"])
        try:
            response = self._get(pretty_wiki_url(file_page), timestamp=timestamp)
            link = BeautifulSoup(response.text, "html.parser").select_one(".fullImageLink a[href], a.internal[href]")
            if link:
                result = try_image(original_url(link["href"], response.url))
                if result:
                    return result
        except RateLimited:
            raise
        except FetchError as error:
            errors.append(str(error))
        result = try_image(WIKI_BASE + "/Special:FilePath/" + quote(record["name"], safe=""))
        if result:
            return result
        raise FetchError("; ".join(errors) or "画像URLを解決できません")


def build_index(entries):
    path = ASSETS_DIR / "asset-mapping.json"
    index = read_json(path)
    index.setdefault("categories", {}).update(entries)
    index.update({"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "source": WIKI_BASE,
                  "note": "game/index.html からの相対パス。AssetRegistry.loadScrapedMapping() で読み込む。"})
    atomic_json(path, index)


def build_mapping(cat, crawl, mode):
    images = []
    for record in crawl.data["files"].values():
        candidate = ASSETS_DIR / cat["out_dir"] / sanitize_filename(record["name"])
        images.append({"name": record["name"], "key": file_key(record["name"]),
                       "local": "assets/" + cat["out_dir"] + "/" + candidate.name if cached_image(candidate) else None,
                       "live_url": WIKI_BASE + "/Special:FilePath/" + quote(record["name"], safe=""),
                       "source_page": record.get("page_url") or record.get("source_page"),
                       "subcategory": record.get("subcategory"), "image_url": record.get("image_url"),
                       "snapshot_ts": record.get("snapshot_ts")})
    pending_downloads = [image["name"] for image in images if not image["local"]]
    complete = crawl.traversal_complete and not pending_downloads
    mapping = {"id": cat["id"], "label": cat["label"],
               "source": WIKI_BASE + "/Category:" + cat["wiki_category"], "mode": mode,
               "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "local_base": "assets/" + cat["out_dir"] + "/",
               "count": len(images) - len(pending_downloads), "count_names": len(images), "images": images,
               "crawler_version": CRAWLER_VERSION, "complete": complete,
               "traversal_complete": crawl.traversal_complete, "pages_visited": len(crawl.data["visited"]),
               "pending_pages": [item["url"] for item in crawl.data["pending"]],
               "page_errors": crawl.data["page_errors"], "pending_downloads": pending_downloads,
               "failed": [record["name"] for record in crawl.data["files"].values() if record.get("download_error")]}
    path = MAPPINGS_DIR / f"{cat['id']}.json"
    atomic_json(path, mapping)
    build_index({cat["id"]: {key: mapping[key] for key in (
        "label", "local_base", "count", "count_names", "complete")}
        | {"mapping_file": "assets/mappings/" + path.name}})
    return mapping


def mapping_is_complete(cat, mode):
    mapping = read_json(MAPPINGS_DIR / f"{cat['id']}.json")
    return (mapping.get("crawler_version") == CRAWLER_VERSION and mapping.get("complete") is True
            and mapping.get("mode") == mode and not mapping.get("pending_pages")
            and not mapping.get("pending_downloads") and not mapping.get("page_errors")
            and mapping.get("count_names") == len(mapping.get("images", []))
            and all(image.get("local") and cached_image(ASSETS_DIR / cat["out_dir"] / sanitize_filename(image["name"]))
                    for image in mapping.get("images", [])))


def scrape_category(scraper, cat, limit=None, dry_run=False):
    print(f"[{scraper.mode}] {cat['id']}", flush=True)
    path = None if dry_run or limit is not None else STATE_DIR / f"{scraper.mode}-{cat['id']}.json"
    crawl = CategoryCrawl(cat["wiki_category"], path, limit)
    previous = read_json(MAPPINGS_DIR / f"{cat['id']}.json")
    if limit is None:
        crawl.add_files(previous.get("images", []))
    # Test-limited runs must not replace a real category's complete mapping.
    publish = (lambda: None) if dry_run or limit is not None else lambda: build_mapping(cat, crawl, scraper.mode)
    try:
        crawl.run(scraper.fetch_category_page, passes_filter, publish)
        if not dry_run:
            for record in crawl.data["files"].values():
                try:
                    scraper.download(record, ASSETS_DIR / cat["out_dir"])
                    record.pop("download_error", None)
                except FetchError as error:
                    record["download_error"] = str(error)
                    print(f"    ! 画像保留: {record['name']} — {error}", flush=True)
                    if isinstance(error, RateLimited):
                        raise
                finally:
                    crawl.save()
                    publish()
    finally:
        publish()
    print(f"    - {len(crawl.data['files'])} 件発見 / 巡回完了={crawl.traversal_complete}", flush=True)
    return crawl


def main():
    parser = argparse.ArgumentParser(description="HoI4 Paradox Wiki asset scraper")
    parser.add_argument("--mode", choices=["wayback", "live"], default="wayback")
    targets_arg = parser.add_mutually_exclusive_group(required=True)
    targets_arg.add_argument("--all", action="store_true")
    targets_arg.add_argument("--only", help="カテゴリidのカンマ区切り")
    parser.add_argument("--limit", type=int, help="テスト用収集件数。完了扱いにはしません")
    parser.add_argument("--dry-run", action="store_true", help="巡回のみ。画像・JSON・状態を保存しない")
    parser.add_argument("--skip-done", action="store_true", help="全ページ巡回＋全画像保存済みのみスキップ")
    parser.add_argument("--status", action="store_true", help="通信なしで進捗を表示（全件完了なら終了コード0）")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit は1以上にしてください")
    ids = {value.strip() for value in args.only.split(",")} if args.only else {cat["id"] for cat in CATEGORIES}
    unknown = ids - {cat["id"] for cat in CATEGORIES}
    if unknown:
        parser.error(f"未知のカテゴリid: {sorted(unknown)}")
    targets = [cat for cat in CATEGORIES if cat["id"] in ids]
    if args.status:
        complete = True
        for cat in targets:
            mapping = read_json(MAPPINGS_DIR / f"{cat['id']}.json")
            done = mapping_is_complete(cat, args.mode)
            complete &= done
            print(f"{cat['id']}: 保存 {mapping.get('count', 0)}/{mapping.get('count_names', 0)} / "
                  f"{'完了' if done else '未完了'}", flush=True)
        return 0 if complete else 1
    if args.skip_done:
        targets = [cat for cat in targets if not mapping_is_complete(cat, args.mode)]
    if not targets:
        print("全カテゴリ完了済み", flush=True)
        return 0
    cooldown_path = STATE_DIR / f"{args.mode}-cooldown.json"
    cooldown = read_json(cooldown_path)
    remaining = int(cooldown.get("resume_at", 0) - time.time())
    if remaining > 0:
        print(f"HTTP 429 冷却中: あと {remaining} 秒。進捗を保持しています。", flush=True)
        return 1
    # A host-wide rate limit must not starve every category behind the first one.
    # Once the cooldown expires, resume with the next category, keeping each queue.
    next_category = cooldown.get("next_category")
    if next_category:
        order = [cat["id"] for cat in CATEGORIES]
        if next_category in order:
            pivot = order.index(next_category)
            targets.sort(key=lambda cat: (order.index(cat["id"]) - pivot) % len(order))
    scraper = WikiScraper(args.mode)
    browser = None
    playwright = None
    try:
        if args.mode == "live":
            from playwright.sync_api import sync_playwright
            playwright = sync_playwright().start()
            browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
            scraper.context = browser.new_context(locale="en-US")
        for cat in targets:
            scrape_category(scraper, cat, args.limit, args.dry_run)
    except RateLimited as error:
        if not args.dry_run:
            next_category = CATEGORIES[(CATEGORIES.index(cat) + 1) % len(CATEGORIES)]["id"]
            atomic_json(cooldown_path, {"resume_at": time.time() + error.retry_after,
                                        "next_category": next_category})
        print(f"HTTP 429: 全体を一時停止。少なくとも {error.retry_after} 秒後に未完了分を再開します。", flush=True)
        return 1
    finally:
        scraper.session.close()
        if browser:
            browser.close()
        if playwright:
            playwright.stop()
    complete = not args.dry_run and args.limit is None and all(mapping_is_complete(cat, args.mode) for cat in targets)
    print("全件完了" if complete else "未完了のページ・画像を保持しました", flush=True)
    return 0 if complete else 1


if __name__ == "__main__":
    sys.exit(main())
