"""Request and response models for the public HTTP API."""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict

from app.search.base import SearchResult


class AnalyzeRequest(BaseModel):
    claim_text: str
    target_date: Optional[str] = None


class AnalyzeByPatentRequest(BaseModel):
    patent_id: str
    target_date: Optional[str] = None


class AnalyzeResponse(BaseModel):
    keywords: Dict[str, List[str]]
    results: List[SearchResult]
    claim_text: Optional[str] = None


class DetailedAnalysisRequest(BaseModel):
    claim_text: str
    prior_text: str


class Conflict(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    claim: str
    prior: str
    similarity: float


class DetailedAnalysisResponse(BaseModel):
    conflicts: List[Conflict]
    confidence: float


class ClaimElement(BaseModel):
    num: int
    element: str
    disclosure: str
    confidence: int
    status: str  # "disclosed" | "partial" | "absent"


class ClaimChartRequest(BaseModel):
    claim_text: str
    prior_text: str
    source_title: Optional[str] = None
    source_url: Optional[str] = None


class ClaimChartResponse(BaseModel):
    elements: List[ClaimElement]
    overall_confidence: int
    verdict: str  # "strong" | "moderate" | "weak" | "none"
    source_title: Optional[str] = None
    source_url: Optional[str] = None


class InfringementMatch(BaseModel):
    phrase: str
    element: str
    strength: str  # "high" | "medium" | "low"


class InfringementCheckRequest(BaseModel):
    claim_text: str
    prior_text: str


class InfringementCheckResponse(BaseModel):
    matches: List[InfringementMatch]
