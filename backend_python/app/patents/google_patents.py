"""Google Patents scraper: normalize patent ID, fetch page, extract claims.

Uses `google_patent_scraper` for the HTTP fetch + initial HTML parse,
then applies custom BeautifulSoup selectors to pull Claim 1 text — the
built-in library does not expose claims.

DOM structure confirmed against patents.google.com (May 2026):
  <section itemprop="claims">
    <div itemprop="content">
      <div class="claim" id="CLM-00001" num="00001">
        <div class="claim-text"> ... </div>  ← nested, recursive
      </div>
      <div class="claim" id="CLM-00002" ...> ... </div>
      ...
    </div>
  </section>
"""

from __future__ import annotations

import asyncio
import logging
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from fastapi import HTTPException

logger = logging.getLogger(__name__)

_PATENT_ID_RE = re.compile(r"^[A-Z]{2}\d+[A-Z0-9]*$", re.IGNORECASE)


def normalize_patent_input(raw: str) -> str:
    """Normalize free-form patent input to a bare ID like US7123456B2.

    Accepts:
      - bare IDs:  US7123456B2
      - Google Patents URLs: https://patents.google.com/patent/US7123456B2/en
    """
    raw = raw.strip()

    # If it looks like a URL, extract the path segment after /patent/
    if raw.startswith("http"):
        parsed = urlparse(raw)
        # path: /patent/US7123456B2 or /patent/US7123456B2/en
        parts = [p for p in parsed.path.split("/") if p]
        if "patent" in parts:
            idx = parts.index("patent")
            if idx + 1 < len(parts):
                raw = parts[idx + 1]
            else:
                raise HTTPException(status_code=400, detail="could not parse patent ID from URL")
        else:
            raise HTTPException(status_code=400, detail="URL does not look like a Google Patents link")

    # Remove surrounding whitespace / trailing /en etc. that might sneak through
    raw = raw.split("/")[0].strip().upper()

    if not raw:
        raise HTTPException(status_code=400, detail="patent_id is required")

    return raw


def _extract_claim_one(soup: BeautifulSoup) -> str | None:
    """Extract independent Claim 1 from a Google Patents HTML soup.

    Strategy (in priority order):
      1. `div[id='CLM-00001']`   — most reliable; matches the real id attr
      2. `div[num='00001']`      — same element, different attr
      3. First `div.claim` inside the claims section
      4. Full text of the `section[itemprop='claims']` block (fallback)
    """
    claims_section = soup.find(attrs={"itemprop": "claims"})
    if not claims_section:
        return None

    # Strategy 1: id="CLM-00001"
    claim1 = claims_section.find("div", id="CLM-00001")
    if claim1:
        return _clean_claim_text(claim1.get_text())

    # Strategy 2: num="00001"
    claim1 = claims_section.find("div", attrs={"num": "00001"})
    if claim1:
        return _clean_claim_text(claim1.get_text())

    # Strategy 3: first div.claim
    claim1 = claims_section.find("div", class_="claim")
    if claim1:
        return _clean_claim_text(claim1.get_text())

    # Strategy 4: full claims section as last resort
    full = claims_section.get_text()
    if len(full.strip()) > 20:
        return _clean_claim_text(full)

    return None


def _extract_abstract(soup: BeautifulSoup) -> str | None:
    """Fallback: pull the patent abstract if claims aren't parseable."""
    meta = soup.find("meta", attrs={"name": "DC.description"})
    if meta and meta.get("content"):
        return meta["content"].strip()
    abstract_el = soup.find(attrs={"itemprop": "abstract"})
    if abstract_el:
        return abstract_el.get_text().strip()
    return None


def _clean_claim_text(text: str) -> str:
    """Normalise whitespace; keep newlines for readability."""
    lines = [line.strip() for line in text.splitlines()]
    lines = [l for l in lines if l]
    return " ".join(lines)


def _scrape_sync(patent_id: str) -> tuple[str, dict, BeautifulSoup]:
    """Blocking scrape call — always run via asyncio.to_thread."""
    # Import here to avoid module-level side-effects from the library.
    from google_patent_scraper import scraper_class  # noqa: PLC0415

    scraper = scraper_class(return_abstract=True)
    err, soup, url = scraper.request_single_patent(patent_id)
    if err != "Success":
        raise RuntimeError(f"scrape failed with status: {err}")
    parsed = scraper.get_scraped_data(soup, patent_id, url)
    return url, parsed, soup


async def fetch_claim_text(patent_id: str) -> tuple[str, str | None]:
    """Fetch a Google Patents page and return (claim_text, pub_date_str).

    Runs the synchronous `google_patent_scraper` call in a thread so the
    FastAPI event loop stays unblocked.

    Raises HTTPException on scrape or parse failure.
    """
    logger.info("Fetching Google Patents page for: %s", patent_id)
    try:
        url, parsed, soup = await asyncio.to_thread(_scrape_sync, patent_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"could not fetch patent {patent_id}: {exc}",
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error scraping %s", patent_id)
        raise HTTPException(
            status_code=502,
            detail=f"unexpected error fetching patent: {exc}",
        ) from exc

    logger.info("Fetched %s — extracting claims", url)

    claim_text = _extract_claim_one(soup)
    if not claim_text:
        # Graceful fallback: use abstract so the pipeline can still run
        claim_text = _extract_abstract(soup)
        if claim_text:
            logger.warning(
                "Could not extract Claim 1 for %s — falling back to abstract", patent_id
            )
        else:
            raise HTTPException(
                status_code=422,
                detail=f"could not extract claim text from patent {patent_id}",
            )

    pub_date_str: str | None = parsed.get("pub_date") or None

    return claim_text, pub_date_str
