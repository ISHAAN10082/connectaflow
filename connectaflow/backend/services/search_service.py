from ddgs import DDGS
from loguru import logger
from typing import List

class SearchService:
    def __init__(self):
        self.ddgs = DDGS()

    def search_urls(self, query: str, max_results: int = 3) -> List[str]:
        """
        Search for URLs related to the query using DuckDuckGo.
        """
        logger.info(f"Searching web for: {query}")
        try:
            results = self.ddgs.text(query, max_results=max_results)
            urls = [r['href'] for r in results]
            logger.info(f"Found {len(urls)} URLs: {urls}")
            return urls
        except Exception as e:
            logger.error(f"Search failed for '{query}': {e}")
            return []
