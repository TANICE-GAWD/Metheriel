"""Search package — importing it auto-registers all bundled providers.

Mirrors the Go `init()` registration pattern: each provider module calls
`register_provider(...)` at import time.
"""

from app.search.base import SearchProvider, SearchQuery, SearchResult
from app.search.registry import (
    get_provider_names,
    get_providers,
    multi_search,
    register_provider,
)

# Side-effect imports: each module registers its provider on import.
from app.search import arxiv as _arxiv  # noqa: F401
from app.search import espacenet as _espacenet  # noqa: F401

__all__ = [
    "SearchProvider",
    "SearchQuery",
    "SearchResult",
    "get_provider_names",
    "get_providers",
    "multi_search",
    "register_provider",
]
