"""Provider contract and shared search DTOs.

Mirrors the Go `internal/search/provider.go` types so the JSON wire format
on the HTTP boundary stays identical.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SearchResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = ""
    url: str = ""
    snippet: str = ""
    date: Optional[datetime] = None
    source: str = ""
    language: str = ""
    score: Optional[float] = Field(default=None)


class SearchQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    keywords: Dict[str, List[str]] = Field(default_factory=dict)
    domain: str = ""
    intent: str = ""
    primary_domain: str = ""
    technical_layer: str = ""
    core_problem: str = ""
    target_date: Optional[datetime] = None
    max_results: int = 20


class SearchProvider(ABC):
    """Each backend (ArXiv, Espacenet, ...) implements this interface."""

    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def search(self, query: SearchQuery) -> List[SearchResult]: ...
