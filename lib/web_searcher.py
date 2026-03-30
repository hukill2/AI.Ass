import json
import requests
from pathlib import Path
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0"}
DDG_URL = "https://html.duckduckgo.com/html/"

class WebSearcher:
    def __init__(self, config_path=r"C:\AI.Ass\config"):
        with open(Path(config_path) / "settings.json", encoding="utf-8") as f:
            self.config = json.load(f)

    def search(self, query: str) -> dict:
        try:
            resp = requests.post(
                DDG_URL,
                data={"q": query},
                headers=HEADERS,
                timeout=10
            )
            resp.raise_for_status()
        except requests.Timeout:
            return {"status": "error", "reason": "timeout"}
        except requests.RequestException:
            return {"status": "error", "reason": "network_error"}

        soup = BeautifulSoup(resp.text, "html.parser")
        results = []

        for result in soup.select(".result")[:5]:
            title_tag = result.select_one(".result__title a")
            snippet_tag = result.select_one(".result__snippet")

            if not title_tag:
                continue

            title = title_tag.get_text(strip=True)
            url = title_tag.get("href", "")
            snippet = snippet_tag.get_text(strip=True) if snippet_tag else ""

            if title and url:
                results.append({"title": title, "snippet": snippet, "url": url})

        if not results:
            return {"status": "success", "query": query, "results": [], "summary": "No results found"}

        summary = self._summarize(query, results)
        return {"status": "success", "query": query, "results": results, "summary": summary}

    def _summarize(self, query: str, results: list) -> str:
        snippets = [r["snippet"] for r in results if r["snippet"]][:3]
        if not snippets:
            titles = [r["title"] for r in results[:3]]
            return f"Found {len(results)} results for '{query}': {'; '.join(titles)}."

        combined = " ".join(snippets)
        # Trim to ~400 chars for a 2-3 sentence summary
        if len(combined) > 400:
            combined = combined[:400].rsplit(" ", 1)[0] + "..."

        return f"Regarding '{query}': {combined}"
