from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


def _client_ip(request: Request) -> str:
    # Trust the left-most forwarded-for entry (common proxy behavior).
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Very small in-memory IP rate limit (fixed window / sliding timestamps).

    Intended for public beta protection; for serious traffic, put this at the edge/reverse-proxy.
    """

    def __init__(self, app, requests_per_minute: int = 60) -> None:
        super().__init__(app)
        self.rpm = max(1, int(requests_per_minute))
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        ip = _client_ip(request)
        now = time.time()
        q = self._hits[ip]
        cutoff = now - 60.0
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= self.rpm:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please slow down and try again."},
                headers={"retry-after": "60"},
            )
        q.append(now)
        return await call_next(request)

