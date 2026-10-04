"""MediaWiki links, category parsing and a resumable, cycle-safe crawl queue."""

import json
import re
from collections import deque
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlsplit

from bs4 import BeautifulSoup

WIKI_BASE = "https://hoi4.paradoxwikis.com"
CRAWLER_VERSION = 6
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
    title = wiki_title(page_url)
    if not title or not title.startswith("Category:"):
        raise FetchError("カテゴリ以外にリダイレクトされました")
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
    current_params = dict(parse_qsl(urlsplit(original_url(page_url)).query, keep_blank_values=True))
    for section in sections:
        for link in section.select("a[href]"):
            url = original_url(link["href"], page_url)
            if wiki_title(url) != current_title:
                continue
            params = dict(parse_qsl(urlsplit(url).query, keep_blank_values=True))
            label = " ".join([link.get_text(" ", strip=True), link.get("title", ""),
                              link.get("aria-label", "")]).casefold()
            if re.search(r"previous|prev\b|前", label):
                continue
            # MediaWiki preserves the other sections' cursors in a next link.
            # An unrelated *until must not hide a forward link; a retained
            # *from on a back link must not create a new forward page either.
            if any(key in params and params[key] != current_params.get(key)
                   for key in ("filefrom", "subcatfrom", "pagefrom")):
                # Keep the EXACT original path, query ordering and encoding.
                next_urls[canonical_wiki_url(url)] = url
    page_members = set()
    page_section = soup.select_one("#mw-pages")
    if page_section:
        for link in page_section.select(".mw-category a[href], .mw-content-ltr li a[href]"):
            url = original_url(link["href"], page_url)
            parsed_url = urlsplit(url)
            if parsed_url.hostname != "hoi4.paradoxwikis.com":
                continue
            params = dict(parse_qsl(parsed_url.query))
            member = params.get("title") or unquote(parsed_url.path).lstrip("/")
            if member and not (PAGING_KEYS & params.keys()):
                page_members.add(member.replace(" ", "_"))

    def advertised_total(section):
        if section is None:
            return None
        text = section.get_text(" ", strip=True)
        match = re.search(r"out of\s+([\d,]+)\s+total", text, re.I)
        if not match:
            match = re.search(r"following\s+([\d,]+)\s+(?:files|subcategories|pages)", text, re.I)
        return int(match.group(1).replace(",", "")) if match else None

    return {"files": list(files.values()), "subcats": list(subcats.values()),
            "next_urls": list(next_urls.values()), "file_total": advertised_total(media),
            "subcategory_total": advertised_total(sub_section),
            "pages": sorted(page_members), "page_total": advertised_total(page_section)}


def coverage_satisfied(coverage):
    return all(entry.get(expected) is None or len(entry.get(members, [])) >= entry[expected]
               for entry in coverage.values()
               for members, expected in (("files", "expected_files"),
                                         ("subcategories", "expected_subcategories"),
                                         ("pages", "expected_pages")))


class CategoryCrawl:
    """Persist successful pages, pending retries and files after every page."""

    def __init__(self, category, state_path=None, limit=None):
        self.path = state_path
        self.limit = limit
        root_url = WIKI_BASE + "/Category:" + quote(category.replace(" ", "_"), safe="_")
        root = canonical_wiki_url(root_url)
        self.data = {"version": CRAWLER_VERSION, "root": root, "pending": [
            {"url": root_url, "subcategory": None}], "visited": [], "files": {}, "page_errors": {},
            "coverage": {}}
        if self.path and self.path.exists():
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            if saved.get("root") == root:
                if saved.get("version") == CRAWLER_VERSION:
                    self.data = saved
                else:
                    # New completion checks require a fresh traversal, not new downloads.
                    self.add_files(saved.get("files", {}).values())

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
    def coverage_complete(self):
        return coverage_satisfied(self.data["coverage"])

    @property
    def traversal_complete(self):
        return (bool(self.data["visited"]) and not self.data["pending"] and not self.data["page_errors"]
                and self.coverage_complete and self.limit is None)

    def record_coverage(self, parsed, response_url, item):
        title = wiki_title(response_url)
        entry = self.data["coverage"].setdefault(title, {
            "url": original_url(response_url), "subcategory": item["subcategory"],
            "files": [], "subcategories": [], "pages": [], "expected_files": None,
            "expected_subcategories": None, "expected_pages": None})
        entry["files"] = sorted(set(entry["files"]) | {name_key(file["name"]) for file in parsed["files"]})
        entry["subcategories"] = sorted(set(entry["subcategories"]) | {child["name"] for child in parsed["subcats"]})
        entry["pages"] = sorted(set(entry.get("pages", [])) | set(parsed["pages"]))
        for source, target in (("file_total", "expected_files"), ("subcategory_total", "expected_subcategories"),
                               ("page_total", "expected_pages")):
            if parsed[source] is not None:
                entry[target] = max(entry[target] or 0, parsed[source])

    def run(self, fetch, accept_file, on_progress=lambda: None, max_pages=None):
        queue = deque(self.data["pending"])
        deferred = []
        visited = set(self.data["visited"])
        queued = {canonical_wiki_url(item["url"]) for item in queue} | visited
        attempts = 0
        try:
            while queue and (max_pages is None or attempts < max_pages):
                # Keep the current page pending until its fetch has succeeded.
                item = queue[0]
                url = item["url"]
                key = canonical_wiki_url(url)
                if key in visited:
                    queue.popleft()
                    continue
                attempts += 1
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
                self.record_coverage(parsed, response_url, item)
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
            if not queue and not deferred and self.limit is None and not self.coverage_complete:
                # Missing continuation links must not silently truncate a category.
                for title, entry in self.data["coverage"].items():
                    missing_files = entry["expected_files"] is not None and len(entry["files"]) < entry["expected_files"]
                    missing_children = (entry["expected_subcategories"] is not None
                                        and len(entry["subcategories"]) < entry["expected_subcategories"])
                    missing_pages = (entry.get("expected_pages") is not None
                                     and len(entry.get("pages", [])) < entry["expected_pages"])
                    if missing_files or missing_children or missing_pages:
                        visited = {key for key in visited if wiki_title(key) != title}
                        deferred.append({"url": entry["url"], "subcategory": entry["subcategory"]})
                        self.data["page_errors"][entry["url"]] = "カテゴリの公表件数に届いていません。巡回を再試行します"
            # An alias may redirect successfully to a previously failed page.
            # Resolve that deferred page/error in this pass, not forever later.
            self.data["visited"] = sorted(visited)
            self.data["pending"] = [item for item in list(queue) + deferred
                                    if canonical_wiki_url(item["url"]) not in visited]
            self.data["page_errors"] = {url: error for url, error in self.data["page_errors"].items()
                                        if canonical_wiki_url(url) not in visited}
            self.save()
            on_progress()
