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
    explanation_score: float | None = Field(
        default=None,
        description="Among rubric dimensions touched, share with causal language nearby (0–100).",
    )


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
    hedge_hits: int | None = None
    subscores: dict[str, float] | None = None
    feedback: list[str]


class FitResult(BaseModel):
    fit_score: float
    environment_component: float
    technical_component: float
    weights: dict[str, float]
    delivery_component: float | None = Field(
        default=None,
        description="Transcript tone + vocal prosody composite (0–100) when enabled.",
    )


class SentimentInsight(BaseModel):
    tone: str
    dominant_emotion: str | None = None
    emotion_scores: dict[str, float] | None = None
    note: str | None = None


class ProsodyInsight(BaseModel):
    label: str
    words_per_minute: float | None = None
    pause_fraction: float | None = None
    pitch_std_hz: float | None = None
    rms_cv: float | None = None
    note: str | None = None


class GazeInsight(BaseModel):
    status: str
    pattern: str | None = None
    confidence: float | None = None
    frames_used: int | None = None
    warning: str | None = None


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
    sentiment: SentimentInsight | None = None
    prosody: ProsodyInsight | None = None
    gaze: GazeInsight | None = None
