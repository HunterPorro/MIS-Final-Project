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
    transcript: str
    workspace: WorkspaceResult
    technical: TechnicalResult
    fit: FitResult
    narrative: str
