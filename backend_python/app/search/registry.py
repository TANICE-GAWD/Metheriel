"""Provider registry and parallel multi_search orchestrator.

Equivalent to Go's `RegisterProvider` / `MultiSearch`. Each provider runs
in its own task with a 10s timeout. Failures are logged and dropped, so
the caller always sees the union of whatever did succeed.
"""

from __future__ import annotations

import asyncio
import logging
from threading import RLock
from typing import Dict, List

from app.search.base import SearchProvider, SearchQuery, SearchResult

logger = logging.getLogger(__name__)

_PROVIDERS: Dict[str, SearchProvider] = {}
_PROVIDERS_LOCK = RLock()

PROVIDER_TIMEOUT_SECONDS = 10.0


def register_provider(provider: SearchProvider) -> None:
    with _PROVIDERS_LOCK:
        _PROVIDERS[provider.name()] = provider


def get_providers() -> List[SearchProvider]:
    with _PROVIDERS_LOCK:
        return list(_PROVIDERS.values())


def get_provider_names() -> List[str]:
    with _PROVIDERS_LOCK:
        return list(_PROVIDERS.keys())


async def _run_provider(
    provider: SearchProvider, query: SearchQuery
) -> List[SearchResult]:
    name = provider.name()
    logger.info("Starting search provider: %s", name)
    try:
        results = await asyncio.wait_for(
            provider.search(query), timeout=PROVIDER_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        logger.warning("Provider %s timed out after %.0fs", name, PROVIDER_TIMEOUT_SECONDS)
        return []
    except Exception as exc:
        logger.warning("Provider %s error: %s", name, exc)
        return []

    logger.info("Provider %s returned %d results", name, len(results))
    return results


async def multi_search(query: SearchQuery) -> List[SearchResult]:
    providers = get_providers()
    if not providers:
        raise RuntimeError("no search providers registered")

    logger.info("Running %d search providers", len(providers))

    tasks = [_run_provider(p, query) for p in providers]
    batches = await asyncio.gather(*tasks, return_exceptions=False)

    merged: List[SearchResult] = []
    for batch in batches:
        merged.extend(batch)
    return merged
