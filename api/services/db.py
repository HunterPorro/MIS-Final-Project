from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

from api.config import settings


class PersistenceDisabled(RuntimeError):
    pass


def _require_db_url() -> str:
    if settings.database_url is None or not settings.database_url.strip():
        raise PersistenceDisabled("DATABASE_URL is not set; persistence is disabled.")
    return settings.database_url


@contextmanager
def db_conn() -> Iterator[psycopg.Connection[Any]]:
    url = _require_db_url()
    with psycopg.connect(url, row_factory=dict_row) as conn:
        yield conn


def create_session(*, topic: str, questions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    now = datetime.utcnow()
    with db_conn() as conn:
        row = conn.execute(
            """
            insert into public.interview_sessions (topic, questions, status, created_at)
            values (%s, %s::jsonb, %s, %s)
            returning id, topic, questions, status, created_at
            """,
            (topic, json.dumps(questions or []), "created", now),
        ).fetchone()
        if row is None:
            raise RuntimeError("Failed to create session")
        return dict(row)


def get_session(*, session_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        sess = conn.execute(
            """
            select id, topic, questions, status, created_at
            from public.interview_sessions
            where id = %s
            """,
            (session_id,),
        ).fetchone()
        if sess is None:
            return None
        responses = conn.execute(
            """
            select id, session_id, question_id, question_track, topic, transcript,
                   workspace, technical, behavioral, fit, narrative, warnings, timings_ms,
                   created_at
            from public.interview_responses
            where session_id = %s
            order by created_at asc
            """,
            (session_id,),
        ).fetchall()
        return {"session": dict(sess), "responses": [dict(r) for r in responses]}


def add_response(
    *,
    session_id: str,
    question_id: str | None,
    question_track: str | None,
    topic: str,
    transcript: str,
    workspace: dict[str, Any],
    technical: dict[str, Any],
    behavioral: dict[str, Any],
    fit: dict[str, Any],
    narrative: str,
    warnings: list[str] | None,
    timings_ms: dict[str, Any] | None,
) -> dict[str, Any]:
    now = datetime.utcnow()
    with db_conn() as conn:
        row = conn.execute(
            """
            insert into public.interview_responses
              (session_id, question_id, question_track, topic, transcript,
               workspace, technical, behavioral, fit, narrative, warnings, timings_ms, created_at)
            values
              (%s, %s, %s, %s, %s,
               %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s)
            returning id, session_id, question_id, question_track, topic, created_at
            """,
            (
                session_id,
                question_id,
                question_track,
                topic,
                transcript,
                json.dumps(workspace),
                json.dumps(technical),
                json.dumps(behavioral),
                json.dumps(fit),
                narrative,
                json.dumps(warnings or []),
                json.dumps(timings_ms or {}),
                now,
            ),
        ).fetchone()
        if row is None:
            raise RuntimeError("Failed to persist response")
        return dict(row)

