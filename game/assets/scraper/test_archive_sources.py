"""Offline tests for snapshot recovery and public original image addressing."""

import unittest
from types import SimpleNamespace
from unittest.mock import Mock

import scrape_wiki_assets as scraper
from archive_sources import category_candidates, original_image_candidates, original_image_url
from wiki_crawl import FetchError, RateLimited


class ArchiveSourceTests(unittest.TestCase):
    def test_exact_cursor_is_first_and_preserved(self):
        url = "https://hoi4.paradoxwikis.com/index.php?title=Category:Flags&filefrom=A%2BB.png#mw-category-media"
        candidates = list(category_candidates(url))
        self.assertEqual(candidates, [(url, "2"), (url, "2024")])

    def test_operative_legacy_alias_is_a_fallback_only(self):
        url = "https://hoi4.paradoxwikis.com/Category:Operative_portraits"
        candidates = list(category_candidates(url))
        self.assertEqual(candidates[0], (url, "2"))
        self.assertEqual(len(candidates), len(set(candidates)))
        self.assertIn((url.replace("Operative_", "Operatives_"), "2024"), candidates)

    def test_archived_challenge_falls_back_to_real_category(self):
        source = scraper.WikiScraper()
        url = "https://hoi4.paradoxwikis.com/Category:Flags"
        valid = '<div id="mw-category-media"></div>'
        source._get = Mock(side_effect=[SimpleNamespace(text="<title>Client Challenge</title>", url=url),
                                       SimpleNamespace(text=valid, url=url)])
        self.assertEqual(source.fetch_category_page(url), (valid, url))
        self.assertEqual(source._get.call_args.kwargs["timestamp"], "2024")

    def test_rate_limit_does_not_probe_other_snapshots(self):
        source = scraper.WikiScraper()
        source._get = Mock(side_effect=RateLimited("429"))
        with self.assertRaises(RateLimited):
            source.fetch_category_page("https://hoi4.paradoxwikis.com/Category:Flags")
        self.assertEqual(source._get.call_count, 1)

    def test_all_missing_captures_stay_a_failure(self):
        source = scraper.WikiScraper()
        source._get = Mock(side_effect=FetchError("404"))
        with self.assertRaises(FetchError):
            source.fetch_category_page("https://hoi4.paradoxwikis.com/Category:Flags")

    def test_standard_hash_and_escaped_original_filename(self):
        self.assertEqual(original_image_url("ABC Republic.png"),
                         "https://hoi4.paradoxwikis.com/images/c/cf/ABC_Republic.png")
        self.assertIn("%26", original_image_url("A&B.png"))
        self.assertEqual(list(original_image_candidates("/images/thumb/a/ab/Foo.svg/120px-Foo.svg.png"))[0],
                         "https://hoi4.paradoxwikis.com/images/a/ab/Foo.svg")
        self.assertEqual(list(original_image_candidates("/thumb.php?f=Foo.png&width=100")),
                         [original_image_url("Foo.png")])
        self.assertEqual(list(original_image_candidates("/thumb.php?width=100")), [])


if __name__ == "__main__":
    unittest.main()
