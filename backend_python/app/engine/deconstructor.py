"""LLM-driven claim deconstructor + relevance filter.

Wraps Groq's OpenAI-compatible chat completions endpoint. Provides:
  - `deconstruct(claim, target_date_str)` — turns a free-form patent claim
    into a structured `SearchQuery`.
  - `is_relevant(...)`                    — single YES/NO prompt that
    decides whether a search-result snippet matches the claim's domain.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

import httpx

from app.search.base import SearchQuery

logger = logging.getLogger(__name__)


GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"

DECONSTRUCT_TIMEOUT = 12.0
RELEVANCE_TIMEOUT = 8.0
INFRINGEMENT_TIMEOUT = 15.0


def _build_prompt(claim: str) -> str:
    return (
        "Extract from the patent claim:\n"
        "1. Core technical keywords (EN, DE, ZH)\n"
        '2. Domain: Industry/field (e.g., "mobile payments", "wireless networking")\n'
        "3. Intent: What problem does it solve? (short phrase)\n"
        '4. Primary Domain: Main field the claim addresses (e.g., "payment systems", "wireless protocols")\n'
        '5. Technical Layer: At what level of abstraction? (e.g., "application layer", "transport protocol", "payment protocol")\n'
        "6. Core Problem: The fundamental technical problem being solved\n"
        "\n"
        "Rules:\n"
        "- Remove legal words\n"
        "- Keep only technical concepts\n"
        "- Max 6 keywords per language\n"
        "- Be VERY specific about domain and layer - this is critical for prior art relevance\n"
        "- NO explanation\n"
        "- OUTPUT ONLY JSON\n"
        "\n"
        "Format:\n"
        '{"keywords":{"EN":[],"DE":[],"ZH":[]},"domain":"...","intent":"...",'
        '"primary_domain":"...","technical_layer":"...","core_problem":"..."}\n'
        "\n"
        "Claim:\n"
        f"{claim}"
    )


def _extract_json(text: str) -> str:
    """Slice between the first `{` and the last `}` to harden against pre/post-amble."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or start >= end:
        raise ValueError("no valid JSON found")
    return text[start : end + 1]


class Deconstructor:
    def __init__(self, api_key: Optional[str] = None) -> None:
        api_key = api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("missing GROQ_API_KEY")
        self._api_key = api_key

    @property
    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def deconstruct(self, raw_claim: str, target_date_str: str = "") -> SearchQuery:
        body: Dict[str, Any] = {
            "model": GROQ_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a strict JSON generator. Output only JSON.",
                },
                {"role": "user", "content": _build_prompt(raw_claim)},
            ],
            "temperature": 0,
            "max_tokens": 200,
        }

        async with httpx.AsyncClient(timeout=DECONSTRUCT_TIMEOUT) as client:
            resp = await client.post(GROQ_URL, json=body, headers=self._headers)

        if resp.status_code != 200:
            raise RuntimeError(f"groq error: {resp.text}")

        payload = resp.json()
        choices = payload.get("choices") or []
        if not choices:
            raise RuntimeError("empty response")

        text = (choices[0].get("message", {}).get("content") or "").strip()
        try:
            clean_json = _extract_json(text)
        except ValueError as exc:
            raise RuntimeError(f"failed to extract JSON: {exc}\nRAW: {text}") from exc

        try:
            parsed = json.loads(clean_json)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"json parse error: {exc}\nCLEAN: {clean_json}\nRAW: {text}"
            ) from exc

        target_date: Optional[datetime] = None
        if target_date_str:
            try:
                target_date = datetime.strptime(target_date_str, "%Y-%m-%d")
            except ValueError as exc:
                raise RuntimeError("invalid date format") from exc

        return SearchQuery(
            keywords=parsed.get("keywords") or {},
            domain=parsed.get("domain", "") or "",
            intent=parsed.get("intent", "") or "",
            primary_domain=parsed.get("primary_domain", "") or "",
            technical_layer=parsed.get("technical_layer", "") or "",
            core_problem=parsed.get("core_problem", "") or "",
            target_date=target_date,
            max_results=20,
        )

    async def _ask_llm_question(self, question: str) -> bool:
        body: Dict[str, Any] = {
            "model": GROQ_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a strict YES/NO classifier. Answer only YES or NO.",
                },
                {"role": "user", "content": question},
            ],
            "temperature": 0,
            "max_tokens": 10,
        }

        try:
            async with httpx.AsyncClient(timeout=RELEVANCE_TIMEOUT) as client:
                resp = await client.post(GROQ_URL, json=body, headers=self._headers)
        except (httpx.HTTPError, httpx.TimeoutException):
            return False

        if resp.status_code != 200:
            return False

        try:
            payload = resp.json()
        except ValueError:
            return False

        choices = payload.get("choices") or []
        if not choices:
            return False

        content = (choices[0].get("message", {}).get("content") or "").strip().upper()
        return "YES" in content

    async def is_relevant(
        self,
        primary_domain: str,
        technical_layer: str,
        core_problem: str,
        snippet: str,
    ) -> bool:
        """Single LLM-backed YES/NO check for snippet ↔ primary_domain alignment.

        Originally a 3-question pipeline (core domain → technical layer → alignment);
        currently only Q1 runs to keep latency and API spend down while staying lenient.
        """
        if not primary_domain or not snippet:
            return True

        question = (
            "You are a patent relevance evaluator.\n\n"
            "PRIMARY DOMAIN:\n"
            f"{primary_domain}\n\n"
            "DOCUMENT SNIPPET:\n"
            f"{snippet}\n\n"
            "Question: Does this document discuss techniques, components, or principles "
            "that could be FOUNDATIONAL to or DIRECTLY USED IN the primary domain?\n\n"
            "Examples:\n"
            '- If domain is "pulse oximetry" and snippet discusses "photodetectors" -> YES (foundational)\n'
            '- If domain is "pulse oximetry" and snippet discusses "wavelength measurement" -> YES (foundational)\n'
            '- If domain is "pulse oximetry" and snippet discusses "wireless protocols" -> NO (unrelated)\n'
            '- If domain is "mobile payments" and snippet discusses "transaction security" -> YES (direct)\n'
            '- If domain is "mobile payments" and snippet discusses "802.11 standards" -> NO (not directly relevant)\n\n'
            "Answer ONLY: YES or NO"
        )

        return await self._ask_llm_question(question)

    async def analyze_infringement(self, claim_text: str, prior_art_text: str) -> dict:
        """LLM-backed element-by-element analysis: which prior art phrases disclose claim elements."""
        claim_snippet = claim_text[:900] if len(claim_text) > 900 else claim_text
        prior_snippet = prior_art_text[:700] if len(prior_art_text) > 700 else prior_art_text

        prompt = (
            "You are a patent examiner checking whether prior art discloses patent claim elements.\n\n"
            "PATENT CLAIM:\n"
            f"{claim_snippet}\n\n"
            "PRIOR ART TEXT:\n"
            f"{prior_snippet}\n\n"
            "Find phrases from the PRIOR ART TEXT that technically disclose elements of the patent claim.\n"
            "Each phrase MUST appear VERBATIM in the prior art text (copy it exactly).\n\n"
            'OUTPUT ONLY JSON:\n'
            '{"matches":[{"phrase":"verbatim phrase from prior art","element":"claim element it discloses","strength":"high|medium|low"}]}\n\n'
            "strength: high=direct technical disclosure, medium=related concept, low=tangential mention\n"
            "Return empty matches if no genuine technical overlap.\n"
            "OUTPUT ONLY JSON:"
        )

        body: Dict[str, Any] = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": "You are a strict JSON generator. Output only JSON."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0,
            "max_tokens": 500,
        }

        try:
            async with httpx.AsyncClient(timeout=INFRINGEMENT_TIMEOUT) as client:
                resp = await client.post(GROQ_URL, json=body, headers=self._headers)
        except (httpx.HTTPError, httpx.TimeoutException):
            return {"matches": []}

        if resp.status_code != 200:
            return {"matches": []}

        try:
            payload = resp.json()
            choices = payload.get("choices") or []
            if not choices:
                return {"matches": []}
            text = (choices[0].get("message", {}).get("content") or "").strip()
            clean_json = _extract_json(text)
            result = json.loads(clean_json)
            # Only keep phrases that actually appear verbatim in the prior art
            prior_lower = prior_art_text.lower()
            verified = [
                m for m in result.get("matches", [])
                if m.get("phrase") and m["phrase"].lower() in prior_lower
            ]
            return {"matches": verified}
        except (ValueError, json.JSONDecodeError, KeyError):
            return {"matches": []}

    async def is_relevant_legacy(self, intent: str, snippet: str) -> bool:
        """Legacy intent-based relevance check, preserved for backward compatibility."""
        if not intent or not snippet:
            return True

        question = (
            "You are a patent examiner.\n\n"
            "CLAIM INTENT:\n"
            f"{intent}\n\n"
            "DOCUMENT SNIPPET:\n"
            f"{snippet}\n\n"
            "Does this document address the SAME technical problem or domain?\n\n"
            "Answer ONLY:\nYES or NO"
        )

        return await self._ask_llm_question(question)
