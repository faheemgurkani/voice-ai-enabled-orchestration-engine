from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


StatementStatus = Literal[
    "pending_review",
    "urgent_escalation",
    "reviewed",
    "submitted",
    "incomplete",
    "archived",
]

WitnessType = Literal["eyewitness", "hearsay", "victim", "unknown"]
LanguageCode = Literal["ur", "pa", "ps", "mixed", "en"]


class InconsistencyFlag(BaseModel):
    source: str = "realtime"
    contradiction_description: str = ""
    segment_a: str = ""
    segment_b: str = ""
    contradiction_type: str = "unknown"
    category: Optional[str] = None
    hybrid_score: Optional[float] = None
    score: Optional[float] = None
    analysis: Optional[str] = None
    legal_risk: Optional[str] = None
    resolved: bool = False
    flagged_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def model_post_init(self, __context: Any) -> None:
        if self.category is None:
            self.category = self.contradiction_type
        if self.score is None and self.hybrid_score is not None:
            self.score = self.hybrid_score
        if self.analysis is None and self.contradiction_description:
            self.analysis = self.contradiction_description


class ProtectionReferral(BaseModel):
    status: str = "none"
    applicable_act: Optional[str] = None
    grounds: List[str] = Field(default_factory=list)
    province: Optional[str] = None
    referral_pdf_url: Optional[str] = None


class CoreFields(BaseModel):
    time_of_incident: Optional[str] = None
    location: Optional[str] = None
    persons_present: Optional[Any] = None
    sequence_of_events: Optional[Any] = None
    relationship_to_parties: Optional[str] = None
    relationship_to_accused: Optional[str] = None


class StatementRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    ref_code: str
    session_id: Optional[str] = None

    time_of_incident: Optional[str] = None
    location: str = ""
    persons_present: List[str] = Field(default_factory=list)
    sequence_of_events: str = ""
    relationship_to_accused: Optional[str] = None
    temporal_uncertainty: bool = False
    language_of_call: LanguageCode = "ur"

    witness_type: WitnessType = "unknown"
    corroboration_sources_mentioned: List[str] = Field(default_factory=list)

    statement_delay_days: Optional[int] = None
    statement_delay_explanation: Optional[str] = None
    delayed_statement_high_risk: bool = False

    privacy_mode: bool = False
    intimidation_flag: bool = False
    intimidation_text: Optional[str] = None
    inconsistency_flags: List[InconsistencyFlag] = Field(default_factory=list)

    offence_category: Optional[str] = None
    witness_age_under_16: bool = False
    witness_is_victim: bool = False
    protection_referral_generated: bool = False
    protection_referral_url: Optional[str] = None
    applicable_protection_act: Optional[str] = None
    preferred_contact_method: str = "phone"
    safe_contact_time: Optional[str] = None

    corrections_count: int = 0
    confirmed_by_witness: bool = False
    confirmation_audio_url: Optional[str] = None

    background_noise_flagged: bool = False
    third_party_presence_flagged: bool = False
    call_phase_at_disconnect: Optional[str] = None

    incident_cluster_id: Optional[str] = None
    corroboration_score: Optional[float] = None
    corroboration_detail: Dict[str, Any] = Field(default_factory=dict)

    status: StatementStatus = "pending_review"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewer_notes: Optional[str] = None

    readback_text: Optional[str] = None
    readback_audio_url: Optional[str] = None
    call_recording_url: Optional[str] = None
    raw_transcript: Optional[str] = None

    def to_api_detail(self) -> Dict[str, Any]:
        # Browser-safe URL (filesystem paths are not fetchable from the SPA)
        referral_url = (
            f"/api/statements/{self.ref_code}/protection-pdf"
            if self.protection_referral_generated
            else self.protection_referral_url
        )
        protection = ProtectionReferral(
            status="referral_generated" if self.protection_referral_generated else "none",
            applicable_act=self.applicable_protection_act,
            grounds=self._protection_grounds(),
            province=None,
            referral_pdf_url=referral_url,
        )
        core = CoreFields(
            time_of_incident=self.time_of_incident,
            location=self.location,
            persons_present=self.persons_present,
            sequence_of_events=self.sequence_of_events,
            relationship_to_parties=self.relationship_to_accused,
            relationship_to_accused=self.relationship_to_accused,
        )
        data = self.model_dump(mode="json")
        data["core_fields"] = core.model_dump()
        data["relationship_to_parties"] = self.relationship_to_accused
        data["protection"] = protection.model_dump()
        data["protection_referral"] = protection.model_dump()
        data["inconsistency_flags"] = [
            f.model_dump() if isinstance(f, InconsistencyFlag) else f
            for f in self.inconsistency_flags
        ]
        return data

    def _protection_grounds(self) -> List[str]:
        grounds: List[str] = []
        if self.intimidation_flag:
            grounds.append("Intimidation / threat indicated")
        if self.witness_is_victim:
            grounds.append("Witness is victim")
        if self.witness_age_under_16:
            grounds.append("Witness appears under 16")
        if self.offence_category:
            grounds.append(f"Offence category: {self.offence_category}")
        return grounds


class StatementListResponse(BaseModel):
    items: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int = 20


class ReviewPayload(BaseModel):
    reviewer_notes: str = ""
    # Deprecated and ignored: attribution is taken from the verified JWT so a
    # review cannot be attributed to someone else. Kept only so existing
    # clients posting this field do not 422.
    reviewed_by: Optional[str] = None


class SaveStatementArgs(BaseModel):
    time_of_incident: Optional[str] = None
    location: str
    persons_present: List[str] = Field(default_factory=list)
    sequence_of_events: str
    relationship_to_accused: Optional[str] = None
    temporal_uncertainty: bool = False
    language_of_call: LanguageCode = "ur"
    witness_type: WitnessType = "unknown"
    corroboration_sources_mentioned: List[str] = Field(default_factory=list)
    statement_delay_days: Optional[int] = None
    statement_delay_explanation: Optional[str] = None
    session_id: Optional[str] = None


class StructuredStatement(BaseModel):
    """LLM / heuristic extraction shape used by STT → structure pipelines."""

    incident_date: Optional[str] = None
    incident_time: Optional[str] = None
    incident_location: Optional[str] = None
    persons_involved: List[str] = Field(default_factory=list)
    sequence_of_events: Any = None
    witness_name: Optional[str] = None
    inconsistencies: List[str] = Field(default_factory=list)
