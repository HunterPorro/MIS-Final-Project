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
| `NEXT_PUBLIC_USE_PROXY` | `1` | Browser uses `/api/py/...` (same origin). |
| `BACKEND_URL` | `https://your-api.onrender.com` | **Server-only.** Must be your **FastAPI** host, not Vercel. |
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
| `CORS_ORIGINS` | `https://your-app.vercel.app,https://your-custom-domain.com` |
| `ENABLE_RATE_LIMIT` | `true` |
| `RATE_LIMIT_PER_MINUTE` | `60` |
| `ALLOW_TRANSCRIPT_OVERRIDE` | `false` in prod |
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
2. Deploy Vercel with `NEXT_PUBLIC_USE_PROXY=1` and `BACKEND_URL` set.
3. Run one real mock interview on production URL.
4. If uploads fail, switch to direct API + CORS or reduce audio size.
5. Set `NEXT_PUBLIC_SITE_URL` and custom domain when ready.
6. Enable rate limits and keep `ALLOW_TRANSCRIPT_OVERRIDE=false` in prod.
