"""MediaWiki links, category parsing and a resumable, cycle-safe crawl queue."""

import json
import re
from collections import deque
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlsplit

from bs4 import BeautifulSoup

WIKI_BASE = "https://hoi4.paradoxwikis.com"
CRAWLER_VERSION = 3
PAGING_KEYS = {"filefrom", "fileuntil", "subcatfrom", "subcatuntil", "pagefrom", "pageuntil"}


class FetchError(Exception):
    pass


class RateLimited(FetchError):
    def __init__(self, message, retry_after=120):
        super().__init__(message)
        self.retry_after = retry_after


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=1), encoding="utf-8")
    temporary.replace(path)


def original_url(url, base=WIKI_BASE + "/"):
    """Unwrap archived links before resolving relative/protocol-relative URLs."""
    pattern = r"^(?:https?:)?(?://web\.archive\.org)?/web/\d{1,14}[a-z_]*/(.*)$"
    match = re.match(pattern, url)
    if match:
        url = match.group(1)
    base_match = re.match(pattern, base)
    if base_match:
        base = base_match.group(1)
    return urljoin(base, url)


def wiki_title(url):
    parsed = urlsplit(original_url(url))
    if parsed.hostname != "hoi4.paradoxwikis.com":
        return None
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if "title" in query:
        return query["title"].replace(" ", "_")
    path = unquote(parsed.path).lstrip("/")
    return path.replace(" ", "_") if ":" in path else None


def canonical_wiki_url(url, base=WIKI_BASE + "/"):
    """Identity ONLY. Never send this reordered/re-encoded URL to the archive."""
    url = original_url(url, base)
    title = wiki_title(url)
    if title is None:
        return None
    params = {key: value for key, value in parse_qsl(urlsplit(url).query, keep_blank_values=True)
              if key in PAGING_KEYS}
    params["title"] = title
    return WIKI_BASE + "/index.php?" + urlencode(sorted(params.items()), quote_via=quote)


def name_key(name):
    name = name.replace(" ", "_")
    return name[:1].upper() + name[1:]


def parse_category_page(html, page_url):
    soup = BeautifulSoup(html, "html.parser")
    sections = soup.select("#mw-category-media, #mw-subcategories, #mw-pages")
    empty_category = soup.select_one(".mw-category-generated, body.ns-14 #mw-content-text")
    if soup.select_one(".noarticletext") or not (sections or empty_category):
        raise FetchError("カテゴリ本文がありません（チャレンジ・未収録・存在しないページ）")

    files = {}
    media = soup.select_one("#mw-category-media")
    if media:
        for link in media.select("a[href]"):
            page = original_url(link["href"], page_url)
            title = wiki_title(page)
            if not title or not title.startswith("File:"):
                continue
            name = title[5:]
            # Never borrow an adjacent file's thumbnail or a navigation image.
            gallery_item = link.find_parent(class_="gallerybox")
            image = link.find("img") or (gallery_item.find("img") if gallery_item else None)
            src = (image.get("src") or image.get("data-src")) if image else None
            entry = files.setdefault(name_key(name), {"name": name, "page_url": page, "image_url": None})
            if src:
                entry["image_url"] = original_url(src, page_url)

    subcats = {}
    sub_section = soup.select_one("#mw-subcategories")
    if sub_section:
        for link in sub_section.select("a[href]"):
            url = original_url(link["href"], page_url)
            title = wiki_title(url)
            params = dict(parse_qsl(urlsplit(url).query))
            if title and title.startswith("Category:") and not (PAGING_KEYS & params.keys()):
                subcats[canonical_wiki_url(url)] = {"name": title[9:], "url": url}

    next_urls = {}
    current_title = wiki_title(page_url)
    for section in sections:
        for link in section.select("a[href]"):
            url = original_url(link["href"], page_url)
            if wiki_title(url) != current_title:
                continue
            params = dict(parse_qsl(urlsplit(url).query, keep_blank_values=True))
            label = " ".join([link.get_text(" ", strip=True), link.get("title", ""),
                              link.get("aria-label", "")]).casefold()
            if any(key.endswith("until") for key in params) or re.search(r"previous|prev\b|前", label):
                continue
            if any(key in params for key in ("filefrom", "subcatfrom", "pagefrom")):
                # Keep the EXACT original path, query ordering and encoding.
                next_urls[canonical_wiki_url(url)] = url
    return {"files": list(files.values()), "subcats": list(subcats.values()),
            "next_urls": list(next_urls.values())}


class CategoryCrawl:
    """Persist successful pages, pending retries and files after every page."""

    def __init__(self, category, state_path=None, limit=None):
        self.path = state_path
        self.limit = limit
        root_url = WIKI_BASE + "/Category:" + quote(category.replace(" ", "_"), safe="_")
        root = canonical_wiki_url(root_url)
        self.data = {"version": CRAWLER_VERSION, "root": root, "pending": [
            {"url": root_url, "subcategory": None}], "visited": [], "files": {}, "page_errors": {}}
        if self.path and self.path.exists():
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            if saved.get("version") == CRAWLER_VERSION and saved.get("root") == root:
                self.data = saved

    def add_files(self, files, subcategory=None, timestamp=None):
        for entry in files:
            key = name_key(entry["name"])
            previous = self.data["files"].get(key, {})
            merged = dict(previous)
            merged.update({key: value for key, value in entry.items() if value is not None})
            if subcategory is not None:
                merged["subcategory"] = subcategory
            else:
                merged.setdefault("subcategory", None)
            if timestamp is not None:
                merged["snapshot_ts"] = timestamp
            else:
                merged.setdefault("snapshot_ts", None)
            self.data["files"][key] = merged

    def save(self):
        if self.path:
            atomic_json(self.path, self.data)

    @property
    def traversal_complete(self):
        return bool(self.data["visited"]) and not self.data["pending"] and self.limit is None

    def run(self, fetch, accept_file, on_progress=lambda: None):
        queue = deque(self.data["pending"])
        deferred = []
        visited = set(self.data["visited"])
        queued = {canonical_wiki_url(item["url"]) for item in queue} | visited
        try:
            while queue:
                # Keep the current page pending until its fetch has succeeded.
                item = queue[0]
                url = item["url"]
                key = canonical_wiki_url(url)
                if key in visited:
                    queue.popleft()
                    continue
                try:
                    html, response_url = fetch(url)
                    parsed = parse_category_page(html, response_url)
                except FetchError as error:
                    queue.popleft()
                    deferred.append(item)
                    self.data["page_errors"][url] = str(error)
                    print(f"    ! 保留: {url} — {error}", flush=True)
                    if isinstance(error, RateLimited):
                        raise
                    continue
                queue.popleft()
                # A redirect's actual category owns its continuation links.
                visited.add(key)
                actual = canonical_wiki_url(response_url)
                if actual:
                    visited.add(actual)
                    queued.add(actual)
                self.data["page_errors"].pop(url, None)
                files = [entry for entry in parsed["files"] if accept_file(entry["name"])]
                if self.limit is not None:
                    known = [entry for entry in files if name_key(entry["name"]) in self.data["files"]]
                    new = [entry for entry in files if name_key(entry["name"]) not in self.data["files"]]
                    files = known + new[:max(0, self.limit - len(self.data["files"]))]
                match = re.search(r"/web/(\d{14})", response_url)
                self.add_files(files, item["subcategory"], match.group(1) if match else None)
                for next_url in parsed["next_urls"]:
                    key = canonical_wiki_url(next_url)
                    if key not in queued:
                        queued.add(key)
                        queue.append({"url": next_url, "subcategory": item["subcategory"]})
                for subcat in parsed["subcats"]:
                    key = canonical_wiki_url(subcat["url"])
                    if key not in queued:
                        queued.add(key)
                        queue.append({"url": subcat["url"], "subcategory": subcat["name"]})
                self.data["visited"] = sorted(visited)
                self.data["pending"] = list(queue) + deferred
                self.save()
                print(f"    - 巡回 {len(visited)} ページ / {len(self.data['files'])} 件 / "
                      f"残り {len(queue) + len(deferred)} ページ", flush=True)
                on_progress()
                if self.limit is not None and len(self.data["files"]) >= self.limit:
                    break
        finally:
            self.data["visited"] = sorted(visited)
            self.data["pending"] = list(queue) + deferred
            self.save()
            on_progress()
