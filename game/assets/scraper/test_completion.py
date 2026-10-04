"""Completion, fair scheduling and interrupted-run regression tests."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import scrape_wiki_assets as scraper
from test_wiki_scraper import PNG, ROOT, page, next_link
from wiki_crawl import CRAWLER_VERSION, CategoryCrawl, FetchError, atomic_json, canonical_wiki_url, parse_category_page


class CoverageTests(unittest.TestCase):
    def test_advertised_totals_are_parsed_with_commas(self):
        html = page(["A.png"], ["Child"]).replace('<ul>', '<p>The following 200 files, out of 1,362 total.</p><ul>', 1)
        parsed = parse_category_page(html, ROOT)
        self.assertEqual(parsed["file_total"], 1362)

    def test_missing_media_continuation_never_completes(self):
        html = page(["A.png"]).replace('<ul>', '<p>The following 1 files, out of 2 total.</p><ul>', 1)
        crawl = CategoryCrawl("Root")
        crawl.run(lambda url: (html, url), scraper.passes_filter)
        self.assertFalse(crawl.traversal_complete)
        self.assertEqual(len(crawl.data["pending"]), 1)
        self.assertTrue(crawl.data["page_errors"])
        crawl.run(lambda url: (page(["A.png", "B.png"]), url), scraper.passes_filter)
        self.assertTrue(crawl.traversal_complete)

    def test_missing_subcategory_continuation_never_completes(self):
        html = page(subcats=["Child"]).replace('<div id="mw-subcategories">',
                    '<div id="mw-subcategories"><p>The following 1 subcategories, out of 2 total.</p>')
        crawl = CategoryCrawl("Root")
        crawl.run(lambda url: (html if url == ROOT else page(), url), scraper.passes_filter)
        self.assertFalse(crawl.traversal_complete)
        self.assertTrue(crawl.data["pending"])

    def test_page_budget_keeps_the_remainder_for_next_round(self):
        crawl = CategoryCrawl("Root")
        crawl.run(lambda url: (page(["A.png"], ["Child"]), url), scraper.passes_filter, max_pages=1)
        self.assertFalse(crawl.traversal_complete)
        self.assertEqual(len(crawl.data["pending"]), 1)
        crawl.run(lambda url: (page(["B.png"]), url), scraper.passes_filter, max_pages=1)
        self.assertTrue(crawl.traversal_complete)

    def test_old_checkpoint_preserves_files_but_rechecks_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            crawl = CategoryCrawl("Root")
            crawl.run(lambda url: (page(["A.png"]), url), scraper.passes_filter)
            saved = crawl.data
            saved["version"] = CRAWLER_VERSION - 1
            atomic_json(path, saved)
            resumed = CategoryCrawl("Root", path)
            self.assertIn("A.png", resumed.data["files"])
            self.assertFalse(resumed.traversal_complete)
            self.assertEqual(len(resumed.data["pending"]), 1)


class BatchTests(unittest.TestCase):
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

    def test_failed_first_image_does_not_starve_later_batches(self):
        source = scraper.WikiScraper()
        source.fetch_category_page = Mock(return_value=(page(["A.png", "B.png", "C.png"]), ROOT))
        def download(record, directory):
            if record["name"] == "A.png":
                raise FetchError("missing image")
            (directory / record["name"]).write_bytes(PNG)
        source.download = Mock(side_effect=download)
        scraper.scrape_category(source, self.cat, download_budget=1)
        self.assertEqual(source.download.call_args.args[0]["name"], "A.png")
        scraper.scrape_category(source, self.cat, download_budget=1)
        self.assertEqual(source.download.call_args.args[0]["name"], "B.png")
        scraper.scrape_category(source, self.cat, download_budget=1)
        self.assertEqual(source.download.call_args.args[0]["name"], "C.png")
        mapping = json.loads((self.assets / "mappings/root.json").read_text())
        self.assertEqual(mapping["count"], 2)
        self.assertEqual(mapping["pending_downloads"], ["A.png"])
        self.assertFalse(mapping["complete"])

    def test_original_live_download_precedes_archive_requests(self):
        source = scraper.WikiScraper()
        source._get = Mock(return_value=SimpleNamespace(content=PNG))
        result = source.download({"name": "A.png", "image_url": "/images/thumb/a/ab/A.png/120px-A.png"}, self.out)
        self.assertEqual(result.read_bytes(), PNG)
        self.assertEqual(source._get.call_count, 1)
        self.assertTrue(source._get.call_args.kwargs["live"])
        self.assertTrue(source._get.call_args.args[0].endswith("/a/ab/A.png"))

    def test_all_targets_get_a_turn_and_repeated_rounds_finish(self):
        other = {"id": "other", "wiki_category": "Other", "out_dir": "other", "label": "Other"}
        source = scraper.WikiScraper()
        pages = {canonical_wiki_url(ROOT): page(["A.png"], ["Child"], next_link("Root", "B")),
                 canonical_wiki_url("/Category:Child"): page(["C.png"]),
                 canonical_wiki_url("/index.php?title=Category:Root&filefrom=B"): page(["B.png"]),
                 canonical_wiki_url("/Category:Other"): page(["D.png"])}
        source.fetch_category_page = Mock(side_effect=lambda url: (pages[canonical_wiki_url(url)], url))
        def download(record, directory):
            directory.mkdir(parents=True, exist_ok=True)
            destination = directory / record["name"]
            destination.write_bytes(PNG)
            return destination
        source.download = Mock(side_effect=download)
        args = ["scraper", "--all", "--skip-done", "--page-budget", "1", "--download-budget", "1"]
        with patch.object(scraper, "CATEGORIES", [self.cat, other]), patch.object(scraper.sys, "argv", args), patch.object(
                scraper, "WikiScraper", return_value=source):
            self.assertEqual(scraper.main(), 1)
            self.assertTrue(scraper.mapping_is_complete(other, "wayback"))
            self.assertEqual(scraper.main(), 1)
            self.assertEqual(scraper.main(), 0)
        self.assertTrue(scraper.mapping_is_complete(self.cat, "wayback"))
        self.assertEqual(source.fetch_category_page.call_count, 4)
        index = json.loads((self.assets / "asset-mapping.json").read_text())
        self.assertTrue(all(entry["complete"] for entry in index["categories"].values()))

    def test_json_status_is_read_only_and_reports_incomplete(self):
        with patch.object(scraper.sys, "argv", ["scraper", "--all", "--status", "--json"]), patch.object(
                scraper, "CATEGORIES", [self.cat]), patch("builtins.print") as output:
            self.assertEqual(scraper.main(), 1)
        report = json.loads(output.call_args.args[0])
        self.assertFalse(report["complete"])
        self.assertEqual(report["categories"][0]["id"], "root")
        self.assertFalse(scraper.STATE_DIR.exists())


if __name__ == "__main__":
    unittest.main()
