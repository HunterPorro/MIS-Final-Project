# Deployment Guide

Split architecture: **FastAPI on Render** (ML, ASR, scoring) + **Next.js on Vercel** (UI).

## Architecture

| Layer | Platform | Role |
|-------|----------|------|
| Browser | Vercel | React UI, calls FastAPI directly (recommended) or via `/api/py` proxy |
| BFF proxy | Vercel route handler | `web/src/app/api/py/[...path]/route.ts` — only used when `NEXT_PUBLIC_USE_PROXY=1` |
| API | Render (Docker) | Whisper ASR, DistilBERT, CNN, rate limits, `/health` |

**Recommended production mode:** `NEXT_PUBLIC_USE_PROXY=0` + `NEXT_PUBLIC_API_URL=<render-url>`. The browser uploads directly to FastAPI, bypassing Vercel's ~4.5 MB proxy limit. You must then set `CORS_ORIGINS` on the API to include your Vercel domain.

---

## Environment variable reference

### Backend (Render)

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `CORS_ORIGINS` | **Yes** | `http://localhost:3000` | Comma-separated allowed origins. Must include your Vercel URL. |
| `ENVIRONMENT` | Yes | `dev` | Set to `prod` on Render. |
| `GOOGLE_API_KEY` | No | — | Gemini recommendations. Set as secret in dashboard. |
| `OPENAI_API_KEY` | No | — | GPT narrative polish. Set as secret in dashboard. |
| `DATABASE_URL` | No | — | Postgres (Supabase) — enables `/sessions`. Set as secret in dashboard. |
| `ADMIN_KEY` | No | — | Enables deterministic transcript overrides (testing only). |
| `REQUIRE_MODELS` | No | `false` | Set `true` to hard-fail if ML artifacts are missing. |
| `PRELOAD_ASR` | No | `true` | Set `false` on free tier to avoid OOM at cold start. |
| `ASR_MODEL` | No | `openai/whisper-tiny` | Use `openai/whisper-base` for higher accuracy. |
| `ENABLE_RATE_LIMIT` | No | `true` | Keep `true` in production. |
| `RATE_LIMIT_PER_MINUTE` | No | `60` | Requests per IP per minute. |
| `ALLOW_TRANSCRIPT_OVERRIDE` | No | `false` | Keep `false` in production. |
| `REQUEST_TIMEOUT_S` | No | `180` | Pipeline timeout in seconds. |
| `NARRATIVE_TIMEOUT_S` | No | `45` | LLM narrative timeout. |
| `ENABLE_DELIVERY_INSIGHTS` | No | `false` | Enable tone/prosody/gaze analysis. |

### Frontend (Vercel)

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://final-round-api.onrender.com` | Public FastAPI URL. Set after Render deploys. |
| `NEXT_PUBLIC_USE_PROXY` | **Yes** | `0` | Use `0` (direct) for production. `1` routes through Vercel proxy. |
| `BACKEND_URL` | If proxy=1 | `https://final-round-api.onrender.com` | Server-side FastAPI URL. Must NOT be a Vercel URL. |
| `NEXT_PUBLIC_SITE_URL` | No | `https://your-app.vercel.app` | Used for sitemap and OG tags. |

---

## Step 1 — Deploy to Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub repo.
3. **Name:** `final-round-api` (or whatever you prefer).
4. **Branch:** `main`.
5. **Environment:** Docker (Render auto-detects the `Dockerfile`).
6. **Plan:** Free (or Starter for always-on).
7. Click **Create Web Service** — Render will start the first build. While it builds, proceed to step 8.
8. Go to your service → **Environment** tab → **Add Environment Variable** and paste these one by one:

   **Non-secret defaults (already set via `render.yaml` — verify they're correct):**
   | Key | Value |
   |-----|-------|
   | `ENVIRONMENT` | `prod` |
   | `PRELOAD_ASR` | `false` |
   | `REQUIRE_MODELS` | `false` |
   | `ALLOW_TRANSCRIPT_OVERRIDE` | `false` |
   | `ENABLE_RATE_LIMIT` | `true` |
   | `CORS_ORIGINS` | `https://YOUR-VERCEL-DOMAIN.vercel.app` ← **update this once Vercel gives you a URL** |

   **Secrets (paste values, mark as secret):**
   | Key | Where to get the value |
   |-----|------------------------|
   | `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) — needed for recommendations |
   | `OPENAI_API_KEY` | [OpenAI platform](https://platform.openai.com/api-keys) — optional, for narrative polish |
   | `DATABASE_URL` | Supabase project → Settings → Database → Connection string (URI format) — optional |
   | `ADMIN_KEY` | Any random secret string — optional, only for testing |

9. Click **Save Changes** → Render will redeploy with the new vars.
10. Wait for the build to finish. Visit `https://<your-service>.onrender.com/health`.
    - You should see `{"ok": true, "ready": true, ...}`.
    - If `ready: false`, models may be missing — check the Render logs.
11. **Copy your Render URL** (e.g. `https://final-round-api.onrender.com`). You'll need it for Vercel.

---

## Step 2 — Update CORS with your Vercel URL (after Vercel deploy)

> Do this **after** you get a Vercel URL in Step 3.

1. Render → your service → **Environment** → find `CORS_ORIGINS`.
2. Replace the placeholder with your real Vercel URL:
   ```
   https://your-app.vercel.app
   ```
   If you have a custom domain too:
   ```
   https://your-app.vercel.app,https://your-custom-domain.com
   ```
3. **Save** → Render redeploys automatically (takes ~2–3 min on free tier).

---

## Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo.
2. **Framework Preset:** Next.js (auto-detected).
3. **Root Directory:** Click **Edit** and set it to `web`.
4. **Build & Output Settings:** Leave as defaults — `web/vercel.json` handles them.
5. **Environment Variables:** Add these before clicking Deploy:

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_USE_PROXY` | `0` |
   | `NEXT_PUBLIC_API_URL` | `https://your-api.onrender.com` ← your Render URL from Step 1 |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` ← Vercel will show you this URL after first deploy; update it if needed |

   > If you want proxy mode instead (only for short/small recordings): set `NEXT_PUBLIC_USE_PROXY=1` and add `BACKEND_URL=https://your-api.onrender.com`. Note the Vercel Hobby plan has a ~4.5 MB request body limit on serverless routes.

6. Click **Deploy**. Vercel builds and gives you a URL (e.g. `https://final-round-xyz.vercel.app`).
7. Copy that URL and go back to Render to update `CORS_ORIGINS` (Step 2 above).

---

## Step 4 — Verify end-to-end

1. Open your Vercel URL.
2. The **API status bar** at the top of the page should show **Ready** (green) within a few seconds.
   - If it shows **Down**, check: Is the Render service awake? Does `NEXT_PUBLIC_API_URL` match exactly?
   - Free tier Render services sleep after 15 min of inactivity — click **Warmup** to wake it.
3. Click **Warmup** once to pre-load ASR/ML models. Wait for the ms counter to appear.
4. Run a short mock interview (~20–40s recording). Confirm the results page loads with scores.
5. Check browser DevTools → Network tab → the `mock-interview` request should go to your **Render URL** (not `/api/py`).
6. Check browser console — no CORS errors.

---

## Debugging

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| API status bar shows **Down** | Render service sleeping or `NEXT_PUBLIC_API_URL` wrong | Click Warmup; verify env var exact match |
| CORS error in browser console | `CORS_ORIGINS` on API doesn't include Vercel origin | Update `CORS_ORIGINS` on Render and redeploy |
| `502` from `/api/py` | Proxy enabled but `BACKEND_URL` wrong, or request too large | Switch to direct mode (`NEXT_PUBLIC_USE_PROXY=0`) |
| Vercel Security Checkpoint JSON | `BACKEND_URL` points at a Vercel URL | Set `BACKEND_URL` to the Render URL |
| `ready: false` at `/health` | Models missing in Docker image | Check Render logs; `models/` must be in the image |
| Interview hangs / 503 | Models loading slowly (first request) | Click Warmup first; upgrade Render plan for always-on |
| Upload fails for long recordings | Vercel proxy body limit (~4.5 MB) | Use direct mode (`NEXT_PUBLIC_USE_PROXY=0`) |

---

## Local development

```bash
# Install all deps (root + web)
npm ci

# Start API + web in parallel with hot-reload
npm run dev

# Smoke test (no Whisper load)
npm run test:smoke

# Smoke test with ASR (downloads weights, slow first run)
SMOKE_TEST_ASR=1 npm run test:smoke
```

The dev setup runs the proxy (`NEXT_PUBLIC_USE_PROXY=1`) automatically, so no CORS config is needed locally.
