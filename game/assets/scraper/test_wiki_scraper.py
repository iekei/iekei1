"""Offline regression tests; no requests to the Wiki or Wayback are made."""

import base64
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import scrape_wiki_assets as scraper
from wiki_crawl import (CategoryCrawl, FetchError, RateLimited, atomic_json,
                        canonical_wiki_url, original_url, parse_category_page, wiki_title)

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
ROOT = "https://hoi4.paradoxwikis.com/Category:Root"


def page(files=(), subcats=(), links=""):
    gallery = "".join(f'<li class="gallerybox"><a href="/File:{name}"><img src="/images/a/ab/{name}"></a></li>' for name in files)
    children = "".join(f'<li><a href="/Category:{name}">{name}</a></li>' for name in subcats)
    return f'<div id="mw-category-media"><ul>{gallery}</ul>{links}</div><div id="mw-subcategories"><ul>{children}</ul></div>'


def next_link(category, cursor, kind="filefrom"):
    return f'<a href="/index.php?title=Category:{category}&amp;{kind}={cursor}">next page</a>'


class ParserTests(unittest.TestCase):
    def test_relative_archived_and_query_urls_deduplicate(self):
        expected = canonical_wiki_url("/Category:National_focus_icons")
        variants = ["http://hoi4.paradoxwikis.com/Category:National%20focus%20icons#mw-category-media",
                    "/index.php?title=Category%3ANational_focus_icons",
                    "//web.archive.org/web/20240101000000/https://hoi4.paradoxwikis.com/Category:National_focus_icons"]
        for value in variants:
            self.assertEqual(canonical_wiki_url(value), expected)
        self.assertIsNone(canonical_wiki_url("https://example.com/Category:Root"))

    def test_encoded_filename_is_decoded_once(self):
        html = '<div id="mw-category-media"><a href="/index.php?title=File%3AA%26B%2BC%2520.png">file</a></div>'
        self.assertEqual(parse_category_page(html, ROOT)["files"][0]["name"], "A&B+C%20.png")

    def test_media_and_children_are_scoped(self):
        html = '<a href="/File:Wiki_logo.png">logo</a><a href="/Category:Icons">parent</a>' + page(["A.png"], ["Child"])
        parsed = parse_category_page(html, ROOT)
        self.assertEqual([file["name"] for file in parsed["files"]], ["A.png"])
        self.assertEqual([child["name"] for child in parsed["subcats"]], ["Child"])
        self.assertTrue(parsed["files"][0]["image_url"].endswith("/A.png"))

    def test_all_forward_cursor_types_and_no_previous(self):
        links = "".join(next_link("Child", "A%2BB%26C", kind) for kind in ("filefrom", "subcatfrom", "pagefrom"))
        links += '<a href="?title=Category:Child&amp;fileuntil=Z">previous page</a>'
        links += '<a href="?title=Category:Child&amp;filefrom=X">previous page</a>'
        parsed = parse_category_page(page(links=links), ROOT.replace("Root", "Child"))
        self.assertEqual(len(parsed["next_urls"]), 3)
        for url in parsed["next_urls"]:
            self.assertEqual(wiki_title(url), "Category:Child")
            self.assertIn("A%2BB%26C", url)

    def test_archived_relative_link_keeps_child_category(self):
        archive = "https://web.archive.org/web/20240101000000id_/https://hoi4.paradoxwikis.com/Category:Child"
        html = page(links='<a href="/web/20240101000000/https://hoi4.paradoxwikis.com/index.php?title=Category:Child&amp;filefrom=B">next page</a>')
        parsed = parse_category_page(html, archive)
        self.assertEqual(wiki_title(parsed["next_urls"][0]), "Category:Child")
        self.assertEqual(original_url("/images/A.png", archive), "https://hoi4.paradoxwikis.com/images/A.png")

    def test_forward_link_preserves_exact_request_query(self):
        target = "https://hoi4.paradoxwikis.com/index.php?title=Category:Child&filefrom=A%2BB.png#mw-category-media"
        html = page(links='<a href="/index.php?title=Category:Child&amp;filefrom=A%2BB.png#mw-category-media">next page</a>')
        parsed = parse_category_page(html, ROOT.replace("Root", "Child"))
        self.assertEqual(parsed["next_urls"], [target])
        self.assertNotEqual(canonical_wiki_url(target), target)

    def test_challenge_and_missing_pages_are_not_empty_successes(self):
        for html in ("<title>Client Challenge</title>", '<div class="noarticletext"></div>'):
            with self.assertRaises(FetchError):
                parse_category_page(html, ROOT)
        self.assertEqual(parse_category_page('<div class="mw-category-generated"></div>', ROOT)["files"], [])

    def test_valid_asset_words_are_not_blacklisted(self):
        for name in ("Crystal_focus.png", "Arrow_attack.png", "Unknown_country.png"):
            self.assertTrue(scraper.passes_filter(name))
        self.assertFalse(scraper.passes_filter("A.txt"))


class CrawlTests(unittest.TestCase):
    def test_all_descendants_pagination_duplicates_and_cycles(self):
        pages = {
            canonical_wiki_url(ROOT): page(["A.png"], ["Child"], next_link("Root", "B", "subcatfrom")),
            canonical_wiki_url("/index.php?title=Category:Root&subcatfrom=B"): page(["A.png"], ["Later"]),
            canonical_wiki_url("/Category:Child"): page(["B.png"], ["Grandchild"], next_link("Child", "C")),
            canonical_wiki_url("/index.php?title=Category:Child&filefrom=C"): page(["C.png", "A.png"]),
            canonical_wiki_url("/Category:Grandchild"): page(["D.png"], ["Deep"]),
            canonical_wiki_url("/Category:Deep"): page(["E.png"], ["Root"]),
            canonical_wiki_url("/Category:Later"): page(["F.png"]),
        }
        visited = []
        def fetch(url):
            visited.append(url)
            return pages[canonical_wiki_url(url)], url
        crawl = CategoryCrawl("Root")
        crawl.run(fetch, scraper.passes_filter)
        self.assertTrue(crawl.traversal_complete)
        self.assertEqual(len(visited), len(pages))
        self.assertEqual(len(set(visited)), len(visited))
        self.assertEqual(len(crawl.data["files"]), 6)
        self.assertEqual(crawl.data["files"]["E.png"]["subcategory"], "Deep")

    def test_crawl_sends_original_url_not_the_deduplication_key(self):
        target = "https://hoi4.paradoxwikis.com/index.php?title=Category:Root&filefrom=B.png#mw-category-media"
        visited = []
        def fetch(url):
            visited.append(url)
            if url == ROOT:
                return page(["A.png"], links='<a href="/index.php?title=Category:Root&amp;filefrom=B.png#mw-category-media">next page</a>'), url
            self.assertEqual(url, target)
            return page(["B.png"]), url
        crawl = CategoryCrawl("Root")
        crawl.run(fetch, scraper.passes_filter)
        self.assertEqual(visited, [ROOT, target])
        self.assertTrue(crawl.traversal_complete)

    def test_failed_page_is_resumed_without_revisiting_successes(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            def first(url):
                if wiki_title(url) == "Category:Root":
                    return page(["A.png"], ["Child"]), url
                raise FetchError("HTTP 404")
            crawl = CategoryCrawl("Root", state)
            crawl.run(first, scraper.passes_filter)
            self.assertFalse(crawl.traversal_complete)
            resumed = CategoryCrawl("Root", state)
            fetch = Mock(side_effect=lambda url: (page(["B.png"]), url))
            resumed.run(fetch, scraper.passes_filter)
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(wiki_title(fetch.call_args.args[0]), "Category:Child")
            self.assertTrue(resumed.traversal_complete)
            self.assertEqual(resumed.data["page_errors"], {})
            self.assertEqual(len(resumed.data["files"]), 2)

    def test_rate_limit_and_interrupt_keep_current_page_pending(self):
        for error in (RateLimited("429"), KeyboardInterrupt()):
            with tempfile.TemporaryDirectory() as directory:
                state = Path(directory) / "state.json"
                crawl = CategoryCrawl("Root", state)
                with self.assertRaises(type(error)):
                    crawl.run(Mock(side_effect=error), scraper.passes_filter)
                saved = json.loads(state.read_text())
                self.assertEqual(len(saved["pending"]), 1)
                self.assertFalse(saved["visited"])

    def test_limit_is_global_and_never_complete(self):
        crawl = CategoryCrawl("Root", limit=2)
        fetch = Mock(return_value=(page(["A.png", "B.png", "C.png"], ["Child"]), ROOT))
        crawl.run(fetch, scraper.passes_filter)
        self.assertEqual(len(crawl.data["files"]), 2)
        self.assertEqual(fetch.call_count, 1)
        self.assertFalse(crawl.traversal_complete)

    def test_redirect_and_image_metadata(self):
        crawl = CategoryCrawl("Root")
        crawl.add_files([{"name": "A.png", "snapshot_ts": None}])
        archive = "https://web.archive.org/web/20240101000000id_/https://hoi4.paradoxwikis.com/Category:Actual"
        next_url = canonical_wiki_url("/index.php?title=Category:Actual&filefrom=B")
        def fetch(url):
            if canonical_wiki_url(url) == next_url:
                return page(["B.png"]), url
            return page(["A.png"], links=next_link("Actual", "B")), archive
        crawl.run(fetch, scraper.passes_filter)
        self.assertTrue(crawl.traversal_complete)
        self.assertEqual(crawl.data["files"]["A.png"]["snapshot_ts"], "20240101000000")


class MappingAndDownloadTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.assets = Path(self.directory.name) / "assets"
        self.patches = [patch.object(scraper, "ASSETS_DIR", self.assets),
                        patch.object(scraper, "MAPPINGS_DIR", self.assets / "mappings"),
                        patch.object(scraper, "STATE_DIR", Path(self.directory.name) / ".state")]
        for replacement in self.patches:
            replacement.start()
        self.cat = {"id": "root", "wiki_category": "Root", "out_dir": "root", "label": "Root"}
        self.out = self.assets / "root"
        self.out.mkdir(parents=True)

    def tearDown(self):
        for replacement in reversed(self.patches):
            replacement.stop()
        self.directory.cleanup()

    def test_small_valid_images_not_html_or_truncated_images(self):
        self.assertLess(len(PNG), 300)
        self.assertTrue(scraper.is_image(PNG))
        self.assertFalse(scraper.is_image(PNG[:-12]))
        self.assertFalse(scraper.is_image(b"<html>Client Challenge</html>"))

    def test_complete_requires_every_page_and_every_saved_image(self):
        crawl = CategoryCrawl("Root")
        crawl.run(lambda url: (page(["A.png", "B.png"]), url), scraper.passes_filter)
        (self.out / "A.png").write_bytes(PNG)
        mapping = scraper.build_mapping(self.cat, crawl, "wayback")
        self.assertEqual(mapping["count"], 1)
        self.assertEqual(mapping["pending_downloads"], ["B.png"])
        self.assertFalse(scraper.mapping_is_complete(self.cat, "wayback"))
        (self.out / "B.png").write_bytes(PNG)
        scraper.build_mapping(self.cat, crawl, "wayback")
        self.assertTrue(scraper.mapping_is_complete(self.cat, "wayback"))
        (self.out / "B.png").unlink()
        self.assertFalse(scraper.mapping_is_complete(self.cat, "wayback"))

    def test_partial_index_update_keeps_other_categories(self):
        scraper.build_index({"old": {"count": 3}})
        scraper.build_index({"new": {"count": 1}})
        index = json.loads((self.assets / "asset-mapping.json").read_text())
        self.assertEqual(set(index["categories"]), {"old", "new"})

    def test_old_nonempty_mapping_is_not_complete(self):
        atomic_json(self.assets / "mappings/root.json", {"count": 1, "count_names": 1, "images": []})
        self.assertFalse(scraper.mapping_is_complete(self.cat, "wayback"))

    def test_rate_limit_preserves_legacy_names_and_saved_files(self):
        (self.out / "A.png").write_bytes(PNG)
        atomic_json(self.assets / "mappings/root.json", {"images": [{"name": "A.png", "source_page": "/File:A.png"}]})
        source = scraper.WikiScraper()
        source.fetch_category_page = Mock(side_effect=RateLimited("HTTP 429"))
        with self.assertRaises(RateLimited):
            scraper.scrape_category(source, self.cat)
        mapping = json.loads((self.assets / "mappings/root.json").read_text())
        self.assertEqual(mapping["count"], 1)
        self.assertFalse(mapping["complete"])
        self.assertEqual(len(mapping["pending_pages"]), 1)

    def test_text_only_member_resolves_original_from_file_page(self):
        source = scraper.WikiScraper()
        responses = [SimpleNamespace(content=b"<html>missing public image</html>"),
                     SimpleNamespace(text='<div class="fullImageLink"><a href="/images/a/ab/A.png">Original</a></div>', url="https://hoi4.paradoxwikis.com/File:A.png"),
                     SimpleNamespace(content=PNG)]
        source._get = Mock(side_effect=responses)
        result = source.download({"name": "A.png", "page_url": "/File:A.png"}, self.out)
        self.assertEqual(result.read_bytes(), PNG)
        self.assertEqual(source._get.call_count, 3)

    def test_original_thumbnail_urls_keep_filename_and_separator(self):
        self.assertEqual(list(scraper.image_candidates("/images/thumb/a/ab/Foo.png/120px-Foo.png"))[0],
                         "https://hoi4.paradoxwikis.com/images/a/ab/Foo.png")
        self.assertEqual(list(scraper.image_candidates("/images/thumb/a/ab/Foo.svg/120px-Foo.svg.png"))[0],
                         "https://hoi4.paradoxwikis.com/images/a/ab/Foo.svg")

    def test_cached_download_does_not_request_again(self):
        (self.out / "A.png").write_bytes(PNG)
        source = scraper.WikiScraper()
        source._get = Mock(side_effect=AssertionError("unexpected request"))
        self.assertEqual(source.download({"name": "A.png"}, self.out), self.out / "A.png")

    def test_invalid_download_is_not_saved(self):
        source = scraper.WikiScraper()
        source._get = Mock(return_value=SimpleNamespace(content=b"<html>blocked</html>", text="<html>blocked</html>", url=ROOT))
        with self.assertRaises(FetchError):
            source.download({"name": "A.png", "image_url": "/images/A.png"}, self.out)
        self.assertFalse((self.out / "A.png").exists())

    def test_dry_run_and_limit_do_not_change_real_state_or_mapping(self):
        for dry_run, limit in ((True, None), (False, 1)):
            source = scraper.WikiScraper()
            source.fetch_category_page = Mock(return_value=(page(["A.png"]), ROOT))
            source.download = Mock()
            scraper.scrape_category(source, self.cat, dry_run=dry_run, limit=limit)
            self.assertFalse((self.assets / "mappings").exists())
            self.assertFalse(scraper.STATE_DIR.exists())
            if dry_run:
                source.download.assert_not_called()

    def test_rate_limit_resume_gives_the_next_category_a_turn(self):
        with patch.object(scraper.sys, "argv", ["scraper", "--all"]), patch.object(
                scraper, "scrape_category", side_effect=RateLimited("429")) as run:
            self.assertEqual(scraper.main(), 1)
            self.assertEqual(run.call_args.args[1]["id"], "operative_portraits")
            cooldown_path = scraper.STATE_DIR / "wayback-cooldown.json"
            cooldown = json.loads(cooldown_path.read_text())
            cooldown["resume_at"] = 0
            atomic_json(cooldown_path, cooldown)
            self.assertEqual(scraper.main(), 1)
            self.assertEqual(run.call_args.args[1]["id"], "flags")

    def test_429_stops_without_repeating_the_request(self):
        source = scraper.WikiScraper()
        source.session.get = Mock(return_value=SimpleNamespace(status_code=429, headers={"Retry-After": "300"}))
        with self.assertRaises(RateLimited) as raised:
            source._get(ROOT)
        self.assertEqual(raised.exception.retry_after, 300)
        self.assertEqual(source.session.get.call_count, 1)


if __name__ == "__main__":
    unittest.main()
