"""Full-category page coverage, singleton writes and overlapping asset reuse."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import scrape_wiki_assets as scraper
from test_wiki_scraper import PNG, ROOT, page
from wiki_crawl import CategoryCrawl, coverage_satisfied, parse_category_page


def ordinary_pages(names, total, next_url=''):
    links = ''.join('<li><a href="/' + name + '">' + name + '</a></li>' for name in names)
    next_link = '<a href="' + next_url + '">next page</a>' if next_url else ''
    return ('<div id="mw-pages"><p>The following ' + str(len(names)) + ' pages, out of ' + str(total) +
            ' total.</p><div class="mw-category"><ul>' + links + '</ul></div>' + next_link + '</div>')


class FullCoverageTests(unittest.TestCase):
    def test_missing_ordinary_page_pagination_is_pending(self):
        crawl = CategoryCrawl('Root')
        crawl.run(lambda url: (ordinary_pages(['A'], 2), url), scraper.passes_filter)
        self.assertFalse(crawl.traversal_complete)
        self.assertEqual(len(crawl.data['pending']), 1)
        self.assertEqual(crawl.data['coverage']['Category:Root']['expected_pages'], 2)

    def test_ordinary_pagination_resumes_and_completes(self):
        crawl = CategoryCrawl('Root')
        first = ordinary_pages(['A'], 2, '/index.php?title=Category:Root&amp;pagefrom=B')
        crawl.run(lambda url: (first, url), scraper.passes_filter, max_pages=1)
        self.assertFalse(crawl.traversal_complete)
        crawl.run(lambda url: (ordinary_pages(['B'], 2), url), scraper.passes_filter, max_pages=1)
        self.assertTrue(crawl.traversal_complete)
        self.assertEqual(crawl.data['coverage']['Category:Root']['pages'], ['A', 'B'])

    def test_member_namespace_encoding_and_totals(self):
        html = ordinary_pages(['A%26B', 'Guide:Weapons'], 1234)
        parsed = parse_category_page(html.replace('1234', '1,234'), ROOT)
        self.assertEqual(parsed['pages'], ['A&B', 'Guide:Weapons'])
        self.assertEqual(parsed['page_total'], 1234)
        self.assertFalse(coverage_satisfied({'root': {'pages': ['A'], 'expected_pages': 2}}))

    def test_shared_valid_binary_is_reused_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory)
            (assets / 'technology').mkdir()
            (assets / 'technology/A.png').write_bytes(PNG)
            source = scraper.WikiScraper('reader')
            source._get = Mock(side_effect=AssertionError('duplicate download'))
            with patch.object(scraper, 'ASSETS_DIR', assets):
                saved = source.download({'name': 'A.png'}, assets / 'equipment')
            self.assertEqual(saved.read_bytes(), PNG)
            source._get.assert_not_called()

    def test_zero_download_budget_persists_discovery_without_binaries(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory) / 'assets'
            source = scraper.WikiScraper('reader')
            source.fetch_category_page = Mock(return_value=(page(['A.png']), ROOT))
            source.download = Mock(side_effect=AssertionError('discovery must not download'))
            cat = {'id': 'root', 'wiki_category': 'Root', 'out_dir': 'root', 'label': 'Root'}
            with patch.object(scraper, 'ASSETS_DIR', assets), patch.object(scraper, 'MAPPINGS_DIR', assets / 'mappings'), patch.object(
                    scraper, 'STATE_DIR', Path(directory) / '.state'):
                crawl = scraper.scrape_category(source, cat, download_budget=0)
                self.assertTrue(crawl.traversal_complete)
                self.assertTrue((assets / 'mappings/root.json').exists())
                self.assertFalse(scraper.mapping_is_complete(cat, 'reader'))
                source.download.assert_not_called()

    def test_singleton_rejects_second_writer(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(scraper, 'STATE_DIR', Path(directory)):
            with scraper.acquire_writer_lock():
                with self.assertRaises(BlockingIOError):
                    scraper.acquire_writer_lock()
            with scraper.acquire_writer_lock():
                pass


if __name__ == '__main__':
    unittest.main()
