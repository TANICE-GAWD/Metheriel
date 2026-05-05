"""Espacenet patent-database search provider.

Free tier: 20K requests per month, no API key required for basic queries.

Note: this is a faithful port of the Go implementation, which targets
the legacy `cgi-bin/espacenet` endpoint and may not return JSON in
production. Failures fall through gracefully via `multi_search`.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List
from urllib.parse import quote_plus

import httpx

from app.search.base import SearchProvider, SearchQuery, SearchResult
from app.search.registry import register_provider

logger = logging.getLogger(__name__)


def _build_espacenet_query(keywords: List[str]) -> str:
    keywords = [k.strip() for k in keywords if k.strip()][:5]
    return " AND ".join(keywords)


class EspacenetProvider(SearchProvider):
    BASE_URL = "https://www.espacenet.com/cgi-bin/espacenet"

    def name(self) -> str:
        return "espacenet"

    def _pick_keywords(self, query: SearchQuery) -> List[str]:
        for lang in ("EN", "DE", "ZH"):
            kws = query.keywords.get(lang) or []
            if kws:
                return kws
        return []

    async def search(self, query: SearchQuery) -> List[SearchResult]:
        keywords = self._pick_keywords(query)
        if not keywords:
            raise RuntimeError("no keywords provided for Espacenet search")

        search_query = _build_espacenet_query(keywords)

        url = (
            f"{self.BASE_URL}"
            f"?action=Search&CL=&QUERY={quote_plus(search_query)}"
            f"&STR=&DB=espacenet&FIRST=1&NUM={query.max_results}&format=json"
        )

        headers = {"User-Agent": "Mozilla/5.0 (compatible; Metheriel/1.0)"}

        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            resp = await client.get(url)

        if resp.status_code != 200:
            raise RuntimeError(
                f"espacenet API error: status {resp.status_code} - {resp.text[:200]}"
            )

        try:
            payload = resp.json()
        except ValueError as exc:
            raise RuntimeError(f"failed to parse Espacenet response: {exc}") from exc

        entries = payload.get("results") or []
        results: List[SearchResult] = []
        for entry in entries:
            title = (entry.get("title") or "").strip()
            if not title:
                continue

            pub_date_str = entry.get("publication_date") or ""
            pub_date: datetime = datetime.utcnow()
            if pub_date_str:
                try:
                    pub_date = datetime.strptime(pub_date_str, "%Y-%m-%d")
                except ValueError:
                    pass

            if query.target_date is not None and pub_date.replace(tzinfo=None) > query.target_date.replace(tzinfo=None):
                continue

            abstract = (
                entry.get("abstract_en")
                or entry.get("abstract_de")
                or entry.get("abstract_fr")
                or entry.get("applicant")
                or ""
            ).strip()

            patent_id = entry.get("patent_id") or ""
            results.append(
                SearchResult(
                    title=title,
                    url=f"https://www.espacenet.com/patent/ES/{patent_id}",
                    snippet=abstract,
                    date=pub_date,
                    source="Espacenet",
                    language="EN",
                )
            )

        return results


register_provider(EspacenetProvider())
