from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.schemas import SessionCreateRequest, SessionCreateResponse, SessionDetailResponse
from api.services.db import PersistenceDisabled, create_session, get_session

router = APIRouter(tags=["sessions"])


@router.post("/sessions", response_model=SessionCreateResponse)
def create_session_route(body: SessionCreateRequest):
    try:
        row = create_session(topic=body.topic, questions=body.questions)
    except PersistenceDisabled as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return SessionCreateResponse(
        id=str(row["id"]),
        topic=str(row["topic"]),
        questions=row.get("questions") or [],
        status=str(row["status"]),
        created_at=str(row["created_at"]),
    )


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session_route(session_id: str):
    try:
        data = get_session(session_id=session_id)
    except PersistenceDisabled as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    if data is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionDetailResponse(session=data["session"], responses=data["responses"])

