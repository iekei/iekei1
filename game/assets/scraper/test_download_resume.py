"""Archive binary recovery and interrupted download checkpoint tests."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import scrape_wiki_assets as scraper
from test_wiki_scraper import PNG, ROOT, page
from wiki_crawl import CategoryCrawl, FetchError, RateLimited


class DownloadResumeTests(unittest.TestCase):
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

    def test_archived_challenge_retries_older_binary_capture(self):
        source = scraper.WikiScraper("reader")
        def fetch(url, **kwargs):
            if kwargs.get("timestamp") == "2024":
                return SimpleNamespace(content=PNG)
            return SimpleNamespace(content=b"<html>Client Challenge</html>")
        source._get = Mock(side_effect=fetch)
        saved = source.download({"name": "A.png", "image_url": "/images/a/ab/A.png",
                                 "snapshot_ts": "20260527232323"}, self.out)
        self.assertEqual(saved.read_bytes(), PNG)
        archive_calls = [call for call in source._get.call_args_list if not call.kwargs.get("live")]
        self.assertEqual([call.kwargs["timestamp"] for call in archive_calls],
                         ["20260527232323", "2", "2024"])

    def test_archive_rate_limit_does_not_try_older_capture(self):
        source = scraper.WikiScraper("reader")
        source._get = Mock(side_effect=[FetchError("live unavailable"), RateLimited("429", 300)])
        with self.assertRaises(RateLimited):
            source.download({"name": "A.png", "image_url": scraper.original_image_url("A.png")}, self.out)
        self.assertEqual(source._get.call_count, 2)
        self.assertFalse((self.out / "A.png").exists())

    def test_missing_archive_captures_are_not_saved(self):
        source = scraper.WikiScraper("reader")
        source._get = Mock(side_effect=FetchError("404"))
        with self.assertRaises(FetchError):
            source.download({"name": "A.png", "image_url": scraper.original_image_url("A.png")}, self.out)
        self.assertFalse((self.out / "A.png").exists())
        archive_image_calls = [call for call in source._get.call_args_list
                               if call.kwargs.get("image") and not call.kwargs.get("live")]
        self.assertEqual(len({(call.args[0], call.kwargs["timestamp"]) for call in archive_image_calls}),
                         len(archive_image_calls))

    def test_interrupt_resumes_missing_images_without_revisiting_pages(self):
        source = scraper.WikiScraper("reader")
        source.fetch_category_page = Mock(return_value=(page(["A.png", "B.png", "C.png"]), ROOT))
        def first_download(record, directory):
            if record["name"] == "B.png":
                raise KeyboardInterrupt()
            destination = directory / record["name"]
            destination.write_bytes(PNG)
            return destination
        source.download = Mock(side_effect=first_download)
        with self.assertRaises(KeyboardInterrupt):
            scraper.scrape_category(source, self.cat)
        interrupted = json.loads((self.assets / "mappings/root.json").read_text())
        self.assertEqual(interrupted["count"], 1)
        self.assertEqual(set(interrupted["pending_downloads"]), {"B.png", "C.png"})
        self.assertFalse(interrupted["complete"])
        source.fetch_category_page = Mock(side_effect=AssertionError("successful page revisited"))
        def resumed_download(record, directory):
            destination = directory / record["name"]
            destination.write_bytes(PNG)
            return destination
        source.download = Mock(side_effect=resumed_download)
        scraper.scrape_category(source, self.cat)
        self.assertEqual({call.args[0]["name"] for call in source.download.call_args_list}, {"B.png", "C.png"})
        self.assertTrue(scraper.mapping_is_complete(self.cat, "reader"))
        source.fetch_category_page.assert_not_called()

    def test_stale_download_error_clears_for_already_saved_image(self):
        source = scraper.WikiScraper("reader")
        source.fetch_category_page = Mock(side_effect=AssertionError("successful page revisited"))
        source.download = Mock(side_effect=AssertionError("saved image requested"))
        crawl = CategoryCrawl("Root", scraper.STATE_DIR / "reader-root.json")
        crawl.run(lambda url: (page(["A.png"]), url), scraper.passes_filter)
        crawl.data["files"]["A.png"]["download_error"] = "previous timeout"
        crawl.save()
        (self.out / "A.png").write_bytes(PNG)
        scraper.scrape_category(source, self.cat)
        mapping = json.loads((self.assets / "mappings/root.json").read_text())
        self.assertEqual(mapping["failed"], [])
        saved_state = json.loads((scraper.STATE_DIR / "reader-root.json").read_text())
        self.assertNotIn("download_error", saved_state["files"]["A.png"])
        self.assertTrue(scraper.mapping_is_complete(self.cat, "reader"))
