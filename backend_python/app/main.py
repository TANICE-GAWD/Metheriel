"""FastAPI app exposing the Metheriel prior-art analysis API.

Routes:
  POST /v1/analyze            full pipeline: deconstruct -> search -> filter
  POST /v1/analyze-detailed   word-overlap conflict scoring (no LLM)
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import List

from dotenv import load_dotenv

# Load env BEFORE we import anything that reads env vars at import time.
load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.engine import Deconstructor
from app.models import (
    AnalyzeByPatentRequest,
    AnalyzeRequest,
    AnalyzeResponse,
    Conflict,
    DetailedAnalysisRequest,
    DetailedAnalysisResponse,
)
from app.patents.google_patents import fetch_claim_text, normalize_patent_input
from app.search import (
    SearchResult,
    get_provider_names,
    multi_search,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("metheriel")


ANALYZE_DEADLINE_SECONDS = 25.0


app = FastAPI(
    title="Metheriel API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info("[%s] %s took %.2fms", request.method, request.url.path, elapsed_ms)
    return response


_deconstructor: Deconstructor | None = None


def get_deconstructor() -> Deconstructor:
    global _deconstructor
    if _deconstructor is None:
        _deconstructor = Deconstructor()
    return _deconstructor


@app.on_event("startup")
async def _startup() -> None:
    # Eagerly construct the deconstructor so a missing GROQ_API_KEY fails fast.
    get_deconstructor()
    logger.info("Metheriel API ready on :8080")
    logger.info("Registered search providers: %s", get_provider_names())


# ---------------------------------------------------------------------------
# /v1/analyze
# ---------------------------------------------------------------------------


async def _analyze_pipeline(
    claim_text: str, target_date: str = "", echo_claim: bool = False
) -> AnalyzeResponse:
    decon = get_deconstructor()

    try:
        query = await decon.deconstruct(claim_text, target_date)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"failed to deconstruct claim: {exc}",
        ) from exc

    logger.info("Starting search with providers: %s", get_provider_names())
    try:
        results: List[SearchResult] = await multi_search(query)
    except Exception as exc:
        logger.warning("search warning: %s", exc)
        results = []
    logger.info("Search completed: found %d results", len(results))

    # Per-result relevance filtering. Run concurrently — the LLM calls are
    # independent and order is preserved by asyncio.gather.
    if query.primary_domain and results:
        verdicts = await asyncio.gather(
            *(
                decon.is_relevant(
                    query.primary_domain,
                    query.technical_layer,
                    query.core_problem,
                    r.snippet,
                )
                for r in results
            ),
            return_exceptions=False,
        )
        filtered = [r for r, ok in zip(results, verdicts) if ok]
    else:
        filtered = list(results)

    # Fallback: if the relevance filter nuked everything, return the top 5
    # unfiltered results so the client never sees an empty "no prior art" UX.
    if not filtered and results:
        logger.info(
            "Filter removed all %d results, falling back to top 5 unfiltered",
            len(results),
        )
        filtered = results[:5]

    return AnalyzeResponse(
        keywords=query.keywords,
        results=filtered,
        claim_text=claim_text if echo_claim else None,
    )


@app.post("/v1/analyze", response_model=AnalyzeResponse, response_model_exclude_none=True)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    if not req.claim_text:
        raise HTTPException(status_code=400, detail="claim_text is required")

    try:
        return await asyncio.wait_for(
            _analyze_pipeline(req.claim_text, req.target_date or ""),
            timeout=ANALYZE_DEADLINE_SECONDS,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="analyze deadline exceeded")


@app.post(
    "/v1/analyze-by-patent",
    response_model=AnalyzeResponse,
    response_model_exclude_none=True,
)
async def analyze_by_patent(req: AnalyzeByPatentRequest) -> AnalyzeResponse:
    """Accept a Google Patents ID (e.g. US7123456B2) or a full patents.google.com URL,
    scrape Claim 1 from the page, then run the full analysis pipeline."""
    patent_id = normalize_patent_input(req.patent_id)

    # fetch_claim_text raises HTTPException on failure, so no try/except needed.
    claim_text, scraped_pub_date = await fetch_claim_text(patent_id)
    logger.info("Extracted claim text (%d chars) from %s", len(claim_text), patent_id)

    # Use scraper-derived pub_date as fallback target_date when caller omits it.
    target_date = req.target_date or scraped_pub_date or ""

    try:
        return await asyncio.wait_for(
            _analyze_pipeline(claim_text, target_date, echo_claim=True),
            timeout=ANALYZE_DEADLINE_SECONDS,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="analyze deadline exceeded")


# ---------------------------------------------------------------------------
# /v1/analyze-detailed
# ---------------------------------------------------------------------------


def _extract_phrases(text: str) -> List[str]:
    """Split on `.` and keep phrases longer than 5 chars (matches Go behavior)."""
    return [p.strip() for p in text.split(".") if len(p.strip()) > 5]


def _find_conflicts(claim_phrases: List[str], prior_phrases: List[str]) -> List[Conflict]:
    """Word-overlap (Jaccard-style) conflict scoring, threshold 0.3."""
    conflicts: List[Conflict] = []
    for claim_phrase in claim_phrases:
        claim_words = claim_phrase.lower().split()
        if not claim_words:
            continue

        for prior_phrase in prior_phrases:
            prior_words = prior_phrase.lower().split()
            if not prior_words:
                continue

            overlap = sum(1 for cw in claim_words if cw in prior_words)
            if overlap == 0:
                continue

            denom = len(claim_words) + len(prior_words) - overlap
            if denom <= 0:
                continue

            similarity = overlap / denom
            if similarity > 0.3:
                conflicts.append(
                    Conflict(
                        claim=claim_phrase,
                        prior=prior_phrase,
                        similarity=similarity,
                    )
                )
    return conflicts


def _calculate_confidence(conflicts: List[Conflict], total_claims: int) -> float:
    if not conflicts:
        return 0.0

    total_similarity = sum(c.similarity for c in conflicts)
    avg_similarity = total_similarity / len(conflicts)
    confidence = avg_similarity * len(conflicts) / (total_claims + 1)
    return min(confidence, 1.0)


@app.post(
    "/v1/analyze-detailed",
    response_model=DetailedAnalysisResponse,
)
async def analyze_detailed(req: DetailedAnalysisRequest) -> DetailedAnalysisResponse:
    if not req.claim_text or not req.prior_text:
        raise HTTPException(
            status_code=400, detail="claim_text and prior_text are required"
        )

    claim_phrases = _extract_phrases(req.claim_text)
    prior_phrases = _extract_phrases(req.prior_text)

    conflicts = _find_conflicts(claim_phrases, prior_phrases)
    confidence = _calculate_confidence(conflicts, len(claim_phrases))

    return DetailedAnalysisResponse(conflicts=conflicts, confidence=confidence)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


@app.exception_handler(ValueError)
async def _value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})
