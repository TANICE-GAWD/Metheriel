"""ArXiv academic-paper search provider.

Hits the public ArXiv Atom-XML query endpoint. No API key required.
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List
from urllib.parse import quote

import httpx

from app.search.base import SearchProvider, SearchQuery, SearchResult
from app.search.registry import register_provider

logger = logging.getLogger(__name__)

ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}


def _build_arxiv_query(keywords: List[str]) -> str:
    """First two keywords with AND (core), remainder with OR (broader recall).

    Matches the Go `buildArxivQuery` exactly: 4-keyword cap, `all:` prefix,
    URL-encoded values, and literal `+AND+` / `+OR+` separators.
    """
    keywords = [k.strip() for k in keywords if k.strip()][:4]
    parts = [f"all:{quote(kw)}" for kw in keywords]

    if len(parts) <= 2:
        return "+AND+".join(parts)

    core = "+AND+".join(parts[:2])
    rest = "+OR+".join(parts[2:])
    return f"{core}+AND+({rest})"


def _parse_published(value: str) -> datetime | None:
    if not value:
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _as_naive_utc(dt: datetime) -> datetime:
    """Strip timezone info so naive/aware comparisons don't raise TypeError."""
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


class ArxivProvider(SearchProvider):
    BASE_URL = "https://export.arxiv.org/api/query"

    def name(self) -> str:
        return "arxiv"

    async def search(self, query: SearchQuery) -> List[SearchResult]:
        en_keywords = query.keywords.get("EN") or []
        if not en_keywords:
            raise RuntimeError("no EN keywords provided for ArXiv search")

        search_query = _build_arxiv_query(en_keywords)
        # Build URL manually so the literal `+AND+` / `+OR+` separators aren't
        # double-encoded by httpx's params handling.
        url = (
            f"{self.BASE_URL}"
            f"?search_query={search_query}"
            f"&start=0"
            f"&max_results={query.max_results}"
        )

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)

        if resp.status_code != 200:
            raise RuntimeError(f"arxiv API error: {resp.status_code} {resp.reason_phrase}")

        try:
            root = ET.fromstring(resp.content)
        except ET.ParseError as exc:
            raise RuntimeError(f"failed to parse ArXiv XML: {exc}") from exc

        results: List[SearchResult] = []
        for entry in root.findall("atom:entry", ATOM_NS):
            published_raw = (entry.findtext("atom:published", default="", namespaces=ATOM_NS) or "").strip()
            pub_date = _parse_published(published_raw)
            if pub_date is None:
                continue

            if query.target_date is not None and _as_naive_utc(pub_date) > _as_naive_utc(query.target_date):
                continue

            title = (entry.findtext("atom:title", default="", namespaces=ATOM_NS) or "").strip()
            summary = (entry.findtext("atom:summary", default="", namespaces=ATOM_NS) or "").strip()
            entry_id = (entry.findtext("atom:id", default="", namespaces=ATOM_NS) or "").strip()

            results.append(
                SearchResult(
                    title=title,
                    url=entry_id,
                    snippet=summary,
                    date=pub_date,
                    source="ArXiv",
                    language="EN",
                )
            )

        return results


register_provider(ArxivProvider())
