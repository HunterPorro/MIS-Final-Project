# Launch sprint — deployment, testing, and production checklist

This app is **split by design**: **Next.js on Vercel** (UI + BFF proxy) and **FastAPI elsewhere** (GPU/CPU ML, large models, long requests). Nothing here trains models; it ships what you already built.

## Architecture (don’t fight it)

| Layer | Where | Role |
|--------|--------|------|
| Browser | Vercel | React UI, calls same-origin `/api/py/*` when `NEXT_PUBLIC_USE_PROXY=1` |
| BFF | Vercel Route Handler | `web/src/app/api/py/[...path]/route.ts` forwards to `BACKEND_URL` |
| API | Render / Railway / Fly / VM | Whisper, DistilBERT, CNN, rate limits, `/health` |

**Do not** set `BACKEND_URL` to your own Vercel URL — the proxy detects that loop and returns 500.

## Vercel (frontend)

1. **Import the Git repo** in Vercel.
2. **Root Directory:** `web` (this monorepo’s Next app).
3. **Framework:** Next.js (auto). The repo includes `web/vercel.json` so install runs from the monorepo root (`npm ci`).
4. **Environment variables** (Production + Preview as needed):

| Variable | Value | Notes |
|----------|--------|--------|
| `NEXT_PUBLIC_USE_PROXY` | `0` | Recommended for production so large WAV uploads go directly to FastAPI (avoid Vercel ~4.5MB proxy limit). |
| `NEXT_PUBLIC_API_URL` | `https://your-api.onrender.com` | Public FastAPI base URL used by the browser when `NEXT_PUBLIC_USE_PROXY=0`. |
| `BACKEND_URL` | `https://your-api.onrender.com` | **Server-only.** Used only when `NEXT_PUBLIC_USE_PROXY=1`. Must be your **FastAPI** host, not Vercel. |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` | Sitemap / OG; use the real custom domain when you have one. |

5. **Request size / duration (important)**  
   - Vercel **Serverless** routes have a **~4.5 MB** request body limit on typical plans. Your API allows **25 MB** audio; **large WAV uploads through the proxy can fail** on Vercel. Mitigations:
     - **A.** Keep interviews short and compress/export smaller WAVs client-side, **or**
     - **B.** Set `NEXT_PUBLIC_USE_PROXY=0` and `NEXT_PUBLIC_API_URL=https://your-api...` so the **browser uploads directly to FastAPI** (then set `CORS_ORIGINS` on the API to include your Vercel origin).
6. **Long runs:** ASR + NLP can exceed default function timeouts. The proxy route sets `maxDuration`; on **Hobby** plans Vercel may cap duration lower — upgrade or move heavy uploads to direct API mode (B above).

## API host (Render / Railway / Fly / Docker)

1. **Build** from repo `Dockerfile` (includes `api/` + `models/`). **You must ship `models/`** (checkpoints) in the image or mount storage — empty `models/` ⇒ `/health` **degraded** and interview fails.
2. **Start:** `uvicorn api.main:app --host 0.0.0.0 --port 8000` (already in Dockerfile `CMD`).
3. **Environment:**

| Variable | Example |
|----------|---------|
| `ENVIRONMENT` | `prod` |
| `REQUIRE_MODELS` | `true` |
| `CORS_ORIGINS` | `https://your-app.vercel.app,https://your-custom-domain.com` |
| `ENABLE_RATE_LIMIT` | `true` |
| `RATE_LIMIT_PER_MINUTE` | `60` |
| `ALLOW_TRANSCRIPT_OVERRIDE` | `false` in prod |
| `DATABASE_URL` | `postgresql://...` (optional; enables `/sessions`) |
| `OPENAI_API_KEY` | Optional — narrative polish |
| `ADMIN_KEY` | Optional — only if you enable admin-only overrides |

4. **Health:** `GET /health` — `ready: true` only when workspace + technical artifacts exist.
5. **Render:** Edit `render.yaml` `CORS_ORIGINS` and connect the repo; set secrets in the dashboard.

## Testing before you ship

From repo root (with Python deps + Node deps installed):

```bash
npm ci
npm run test:smoke
```

Optional: `SMOKE_TEST_ASR=1` loads Whisper (slow, downloads weights).

**Manual:** `npm run dev`, open `/interview`, record → Generate; open `/superday`, full flow; confirm API logs show `asr_done`, `technical_done`, `mock_interview_done`.

## Debugging common production issues

| Symptom | Likely cause |
|---------|----------------|
| UI shows API **Down** | `BACKEND_URL` wrong, API sleeping (Render free tier), or `/health` not reachable from Vercel server |
| JSON error mentioning **Vercel Security Checkpoint** | `BACKEND_URL` pointed at a **Vercel** URL or blocked bot flow — use raw API host |
| **502** from `/api/py/...` | API down, wrong URL, or request body too large for Vercel proxy |
| **CORS** in browser (direct API mode) | Add your exact Vercel origin to `CORS_ORIGINS` on FastAPI |
| **503** on interview | Models missing on API host |

## Final sprint order (suggested)

1. Deploy API with models; confirm `/health` ⇒ `ready: true`.
2. Deploy Vercel with **`NEXT_PUBLIC_USE_PROXY=0`**, **`NEXT_PUBLIC_API_URL=https://<api>`**, and API **`CORS_ORIGINS`** including your Vercel origin (recommended for large WAV uploads). Use proxy mode only if you keep interviews very short and small.
3. Open the site and use the **API status bar** (Warmup) once after deploy or cold start.
4. Run one real mock interview on the production URL; confirm timings feel acceptable.
5. If uploads still fail, reduce recording length or verify `CORS_ORIGINS` matches the exact browser origin (scheme + host, no trailing slash mismatch).
6. Set `NEXT_PUBLIC_SITE_URL` and custom domain when ready.
7. Enable rate limits and keep `ALLOW_TRANSCRIPT_OVERRIDE=false` in prod.

## Production verification checklist (speed + reliability)

| Check | Pass criteria |
|------|----------------|
| API cold start | `GET /health` returns 200 and `ready: true` within a minute of wake |
| Warmup | `POST /warmup` returns 200; repeat if first interview is slow |
| Direct mode | Browser network tab shows `mock-interview` going to **API host**, not `/api/py` |
| CORS | No browser console CORS errors on `mock-interview` |
| Interview | Short answer (~20–40s audio) completes without client abort |
| Video frames | Optional: camera on during record uploads small JPEGs; gaze section advisory only |

### API tuning (optional)

| Variable | Purpose |
|----------|---------|
| `REQUEST_TIMEOUT_S` | Upper bound for threaded ASR / technical / gaze stages (default 180) |
| `NARRATIVE_TIMEOUT_S` | LLM narrative polish timeout in seconds (default 45) |
| `MAX_ASR_SECONDS` | Cap audio fed to Whisper for responsiveness (see `api/config.py` / env `MAX_ASR_SECONDS` if exposed) |
