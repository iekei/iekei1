"""Public HTML reader regressions; these tests make no network requests."""

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import scrape_wiki_assets as scraper
from archive_sources import original_image_url
from test_wiki_scraper import PNG, ROOT, page
from wiki_crawl import CategoryCrawl, FetchError, RateLimited


class ReaderSourceTests(unittest.TestCase):
    def test_reader_html_uses_original_url_for_relative_links(self):
        source = scraper.WikiScraper("reader")
        source._get = Mock(return_value=SimpleNamespace(text=page(["A.png"], ["Child"])))
        crawl = CategoryCrawl("Root")
        crawl.run(source.fetch_category_page, scraper.passes_filter, max_pages=1)
        self.assertEqual(source._get.call_args.args[0], "https://r.jina.ai/" + ROOT)
        self.assertTrue(source._get.call_args.kwargs["live"])
        self.assertEqual(source._get.call_args.kwargs["headers"], {"X-Return-Format": "html"})
        self.assertEqual(crawl.data["files"]["A.png"]["image_url"],
                         "https://hoi4.paradoxwikis.com/images/a/ab/A.png")
        self.assertEqual(crawl.data["pending"][0]["url"],
                         "https://hoi4.paradoxwikis.com/Category:Child")
        self.assertIsNone(crawl.data["files"]["A.png"]["snapshot_ts"])

    def test_reader_preserves_query_order_and_encoding(self):
        source = scraper.WikiScraper("reader")
        source._get = Mock(return_value=SimpleNamespace(text=page()))
        url = "https://hoi4.paradoxwikis.com/index.php?title=Category:Flags&filefrom=A%2BB.png"
        self.assertEqual(source.fetch_category_page(url)[1], url)
        self.assertEqual(source._get.call_args.args[0], "https://r.jina.ai/" + url)

    def test_reader_challenge_is_not_completion(self):
        source = scraper.WikiScraper("reader")
        source._get = Mock(return_value=SimpleNamespace(text="<title>Client Challenge</title>"))
        with self.assertRaises(FetchError):
            source.fetch_category_page(ROOT)

    def test_reader_rate_limit_is_not_retried(self):
        source = scraper.WikiScraper("reader")
        source._get = Mock(side_effect=RateLimited("429"))
        with self.assertRaises(RateLimited):
            source.fetch_category_page(ROOT)
        self.assertEqual(source._get.call_count, 1)

    def test_only_targets_start_in_requested_order(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(
                scraper, "STATE_DIR", Path(directory)), patch.object(
                scraper.sys, "argv", ["scraper", "--mode", "reader", "--only",
                                      "scientist_portraits,equipment_icons,flags"]), patch.object(
                scraper, "scrape_category", side_effect=RateLimited("429")) as run:
            self.assertEqual(scraper.main(), 1)
            self.assertEqual(run.call_args.args[1]["id"], "scientist_portraits")

    def test_thumb_php_can_download_archived_original(self):
        source = scraper.WikiScraper("reader")
        source._get = Mock(side_effect=[SimpleNamespace(content=b"<html>Client Challenge</html>"),
                                       SimpleNamespace(content=PNG)])
        with tempfile.TemporaryDirectory() as directory:
            result = source.download({"name": "A.png", "image_url":
                                      "https://hoi4.paradoxwikis.com/thumb.php?f=A.png&width=120"},
                                     Path(directory))
            self.assertEqual(result.read_bytes(), PNG)
        self.assertEqual(source._get.call_count, 2)
        self.assertEqual(source._get.call_args.args[0], original_image_url("A.png"))
        self.assertFalse(source._get.call_args.kwargs["live"])


if __name__ == "__main__":
    unittest.main()
