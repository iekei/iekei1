"""Archive source candidates and MediaWiki original-image addressing.

Exact discovered links are always first; aliases are only fallback lookups.
A capture that contains a challenge is not an acceptable category response.
"""

import hashlib
from urllib.parse import parse_qsl, quote, urlsplit, urlunsplit

from wiki_crawl import WIKI_BASE, name_key, original_url, wiki_title

# Older Wiki captures used this plural spelling before the category was renamed.
CATEGORY_ALIASES = {"Category:Operative_portraits": "Category:Operatives_portraits"}


def category_candidates(url, timestamp="2"):
    url = original_url(url)
    urls = [url]
    title = wiki_title(url)
    params = dict(parse_qsl(urlsplit(url).query))
    if title and not (set(params) - {"title"}):
        urls.append(WIKI_BASE + "/index.php?title=" + quote(title, safe=":_"))
        alias = CATEGORY_ALIASES.get(title)
        if alias:
            urls.append(WIKI_BASE + "/" + quote(alias, safe=":_"))
    seen = set()
    for candidate in urls:
        for stamp in (timestamp, "2024" if timestamp != "2024" else "2"):
            key = (candidate, stamp)
            if key not in seen:
                seen.add(key)
                yield key


def original_image_url(name):
    # The Wiki's public /images directory uses MediaWiki's standard hash layout.
    filename = name_key(name)
    digest = hashlib.md5(filename.encode("utf-8")).hexdigest()
    return f"{WIKI_BASE}/images/{digest[0]}/{digest[:2]}/{quote(filename, safe='')}"


def original_image_candidates(url):
    url = original_url(url)
    parsed = urlsplit(url)
    if "/images/thumb/" in parsed.path:
        prefix, thumbnail = parsed.path.split("/thumb/", 1)
        yield urlunsplit(parsed._replace(path=prefix + "/" + thumbnail.rsplit("/", 1)[0]))
    # Resolve thumb.php's filename to the original, never save its rendition.
    if parsed.path.endswith("/thumb.php"):
        filename = dict(parse_qsl(parsed.query)).get("f")
        if filename:
            yield original_image_url(filename)
    else:
        yield url
