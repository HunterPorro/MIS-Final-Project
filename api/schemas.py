from pydantic import BaseModel, Field


class AssessRequest(BaseModel):
    topic: str = Field(
        ...,
        description="One of: M&A, LBO, Valuation",
        examples=["M&A"],
    )
    answer_text: str = Field(..., min_length=10, max_length=12000)


class WorkspaceResult(BaseModel):
    label: str
    confidence: float
    class_index: int


class TechnicalResult(BaseModel):
    expertise_level: int
    expertise_label: str
    level_confidence: float
    topic: str
    skills_identified: list[str]
    concepts_missed: list[str]
    summary: str
    coverage: dict[str, bool] | None = None
    explained: dict[str, bool] | None = None
    coverage_score: float | None = None


class BehavioralResult(BaseModel):
    score: float
    star_coverage: dict[str, bool]
    filler_words: dict[str, int]
    filler_total: int
    word_count: int
    speaking_rate_wpm: float | None = None
    has_numbers: bool
    filler_per_100: float | None = None
    has_time_or_scale: bool | None = None
    has_outcome_number: bool | None = None
    star_hits: int | None = None
    subscores: dict[str, float] | None = None
    feedback: list[str]


class FitResult(BaseModel):
    fit_score: float
    environment_component: float
    technical_component: float
    weights: dict[str, float]


class AssessResponse(BaseModel):
    workspace: WorkspaceResult
    technical: TechnicalResult
    fit: FitResult
    narrative: str


class MockInterviewResponse(BaseModel):
    question_id: str | None = None
    question_track: str | None = None
    transcript: str
    workspace: WorkspaceResult
    technical: TechnicalResult
    behavioral: BehavioralResult
    fit: FitResult
    narrative: str
