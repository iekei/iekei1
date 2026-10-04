"""Mixed MediaWiki cursors and redirect/resume completion regressions."""
import unittest
from unittest.mock import Mock

import scrape_wiki_assets as scraper
from test_wiki_scraper import ROOT, next_link, page
from wiki_crawl import CategoryCrawl, FetchError, canonical_wiki_url, parse_category_page, wiki_title


class PaginationResumeTests(unittest.TestCase):
    def test_forward_cursor_keeps_unrelated_backward_cursor(self):
        target = '/index.php?title=Category:Root&filefrom=B%2B.png&subcatuntil=Z#mw-category-media'
        parsed = parse_category_page(page(links='<a href="' + target.replace('&', '&amp;') + '">next page</a>'), ROOT)
        self.assertEqual(parsed['next_urls'], ['https://hoi4.paradoxwikis.com' + target])

    def test_retained_forward_cursor_is_not_itself_a_next_page(self):
        current = ROOT + '?subcatfrom=Child'
        links = '<a href="?subcatfrom=Child&amp;fileuntil=A">back</a>'
        parsed = parse_category_page(page(links=links), current)
        self.assertEqual(parsed['next_urls'], [])

    def test_three_independent_paginators_and_deep_descendants_finish_in_batches(self):
        pages = {
            canonical_wiki_url(ROOT): page(['A.png'], ['Child'],
                next_link('Root', 'B') + next_link('Root', 'Later', 'subcatfrom') + next_link('Root', 'Page', 'pagefrom')),
            canonical_wiki_url('/index.php?title=Category:Root&filefrom=B'): page(['B.png']),
            canonical_wiki_url('/index.php?title=Category:Root&subcatfrom=Later'): page(subcats=['Later']),
            canonical_wiki_url('/index.php?title=Category:Root&pagefrom=Page'): page(subcats=['PagesChild']),
            canonical_wiki_url('/Category:Child'): page(['C.png'], ['Grandchild']),
            canonical_wiki_url('/Category:Grandchild'): page(['D.png'], ['Deep']),
            canonical_wiki_url('/Category:Deep'): page(['E.png'], ['Root']),
            canonical_wiki_url('/Category:Later'): page(['F.png']),
            canonical_wiki_url('/Category:PagesChild'): page(['G.png'])
        }
        fetch = Mock(side_effect=lambda url: (pages[canonical_wiki_url(url)], url))
        crawl = CategoryCrawl('Root')
        for _ in range(len(pages)):
            crawl.run(fetch, scraper.passes_filter, max_pages=1)
        self.assertTrue(crawl.traversal_complete)
        self.assertEqual(fetch.call_count, len(pages))
        self.assertEqual(len(crawl.data['files']), 7)

    def test_successful_redirect_resolves_previous_error_and_deferred_alias(self):
        def fetch(url):
            title = wiki_title(url)
            if title == 'Category:Root':
                return page(subcats=['Child', 'Alias']), url
            if title == 'Category:Child':
                raise FetchError('temporarily unavailable')
            return page(['A.png']), 'https://hoi4.paradoxwikis.com/Category:Child'
        crawl = CategoryCrawl('Root')
        crawl.run(fetch, scraper.passes_filter)
        self.assertTrue(crawl.traversal_complete)
        self.assertEqual(crawl.data['pending'], [])
        self.assertEqual(crawl.data['page_errors'], {})


if __name__ == '__main__':
    unittest.main()
