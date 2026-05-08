

from __future__ import annotations

import logging
from datetime import datetime
from typing import List

import httpx

from app.search.base import SearchProvider, SearchQuery, SearchResult
from app.search.registry import register_provider

logger = logging.getLogger(__name__)

OPENALEX_EMAIL = "2006princesharma@gmail.com"


def _reconstruct_abstract(inverted_index: dict) -> str:
    """Reconstruct readable text from OpenAlex inverted-index abstract format."""
    if not inverted_index:
        return ""
    positions: dict[int, str] = {}
    for word, idxs in inverted_index.items():
        for idx in idxs:
            positions[idx] = word
    return " ".join(positions[i] for i in sorted(positions))


def _build_openalex_query(keywords: List[str]) -> str:
    return " ".join(k.strip() for k in keywords if k.strip())[:200]


class OpenAlexProvider(SearchProvider):
    BASE_URL = "https://api.openalex.org/works"

    def name(self) -> str:
        return "openalex"

    async def search(self, query: SearchQuery) -> List[SearchResult]:
        en_keywords = query.keywords.get("EN") or []
        if not en_keywords:
            raise RuntimeError("no EN keywords for OpenAlex search")

        search_query = _build_openalex_query(en_keywords)

        params = {
            "search": search_query,
            "per-page": str(query.max_results),
            "select": "title,publication_year,primary_location,abstract_inverted_index",
            "mailto": OPENALEX_EMAIL,
        }
        if query.target_date is not None:
            params["filter"] = f"publication_year:<{query.target_date.year + 1}"

        headers = {"User-Agent": f"Metheriel/1.0 (mailto:{OPENALEX_EMAIL})"}

        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            resp = await client.get(self.BASE_URL, params=params)

        if resp.status_code != 200:
            raise RuntimeError(
                f"OpenAlex API error: {resp.status_code} {resp.text[:200]}"
            )

        payload = resp.json()
        results: List[SearchResult] = []

        for work in payload.get("results") or []:
            title = (work.get("title") or "").strip()
            if not title:
                continue

            year = work.get("publication_year")
            pub_date = datetime(year, 1, 1) if year else datetime.utcnow()

            if (
                query.target_date is not None
                and pub_date.replace(tzinfo=None) > query.target_date.replace(tzinfo=None)
            ):
                continue

            loc = work.get("primary_location") or {}
            url = loc.get("landing_page_url") or loc.get("pdf_url") or ""

            abstract = _reconstruct_abstract(work.get("abstract_inverted_index") or {})

            if not abstract and not url:
                continue

            results.append(
                SearchResult(
                    title=title,
                    url=url,
                    snippet=abstract[:600] if abstract else title,
                    date=pub_date,
                    source="OpenAlex",
                    language="EN",
                )
            )

        return results


register_provider(OpenAlexProvider())
