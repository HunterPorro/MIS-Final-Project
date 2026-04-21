# Final Round — HireVue-style mock interview + Superday report

End-to-end demo that runs a **one-shot mock interview**:

- **Audio (WAV)** → local ASR (Whisper tiny) transcript
- **Transcript** → technical semantic analysis + behavioral coaching
- **Optional webcam still** → proprietary workspace classifier
- Everything fuses into a **Fit Score** + narrative report (optional OpenAI polish)

The web UI supports both **single-question** analysis and a short **multi-question Superday session** with an aggregated report.

## Repository layout

- `api/` — FastAPI service (`POST /mock-interview`, `GET /health`; legacy `POST /assess`)
- `training/` — dataset builders + training scripts for both models
- `models/` — generated checkpoints (gitignored except `.gitkeep`)
- `web/` — Next.js UI (record answer → generate report; Superday session)
- `docker-compose.yml` — optional API + dev UI

## Quick start (local)

### 1. Python environment

```bash
cd "/path/to/MIS Final Project"
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Train or refresh models

```bash
./scripts/train_all.sh
```

Notes:

- `training/generate_workspace_patterns.py` creates **synthetic** professional vs unprofessional images so the pipeline runs offline. Replace `training/data/workspace/` with your own `ImageFolder` for real webcams.
- If ImageNet weights fail to download (SSL), run `python training/train_workspace_cnn.py ... --no-pretrained`.
- `training/build_technical_jsonl.py` emits combinatorial finance text; expand or replace with your own labeled answers.

### 3. Run API and web together (recommended)

**Option A — npm (cross-platform)**  
Activate your Python venv first so `python` resolves to the environment with FastAPI/torch (`source .venv/bin/activate` on macOS/Linux). Then from the repo root:

```bash
npm install   # installs root tools and the web workspace
npm run dev
```

This runs the API on port **8000** and the Next.js app on **3000** with `NEXT_PUBLIC_USE_PROXY=1` and `BACKEND_URL=http://127.0.0.1:8000` for the server-side proxy.

**Option B — shell script (macOS/Linux)**

```bash
chmod +x scripts/dev.sh   # once
./scripts/dev.sh
```

### 4. Run API and web separately

**API**

```bash
export PYTHONPATH=.
uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

**Web**

If you already ran `npm install` at the repo root, workspace dependencies include `web/`. Otherwise run `npm install` once inside `web/`.

```bash
cd web
cp .env.local.example .env.local
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`, capture or upload an image, paste a technical paragraph, submit.

### Next.js proxy (same-origin, optional)

To avoid browser CORS and keep a single public origin in production:

- Set in `web/.env.local`:
  - `NEXT_PUBLIC_USE_PROXY=1`
  - `BACKEND_URL=http://127.0.0.1:8000` (server-side only; where the Next Route Handler forwards `/api/py/*`)

The UI will call `/api/py/health` and `/api/py/assess` instead of a cross-origin API URL. `./scripts/dev.sh` sets these for you.

Direct mode (no proxy): `NEXT_PUBLIC_USE_PROXY=0` and `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` (FastAPI must list your web origin in `CORS_ORIGINS`).

### Deployment (typical)

- **Frontend (Vercel):** deploy the `web/` app. Set `NEXT_PUBLIC_USE_PROXY=1`, `BACKEND_URL` to your hosted API URL (HTTPS), and build.
- **API (Render, Railway, Fly.io, VM):** run `uvicorn api.main:app --host 0.0.0.0 --port 8000` with `models/` available and `CORS_ORIGINS` including your Vercel domain if clients call the API directly.

`docker compose` builds the API image; mount or bake `models/` into the container. For the `web` service in compose, set `BACKEND_URL=http://api:8000` and `NEXT_PUBLIC_USE_PROXY=1` so the Next dev server proxies to the API container.

### Optional: narrative polish

Set `OPENAI_API_KEY` in the API environment (same shell as `uvicorn`) to rewrite the narrative with `gpt-4o-mini`. Without it, the API uses the template narrative.

### Docker

```bash
docker compose up --build
```

Ensure `models/` contains trained checkpoints before building the API image.

## Fit score

Default fusion: `0.35 × environment + 0.65 × technical`, where technical maps the 4-level classifier to 0–100. Adjust in `api/services/fit.py`.

## Evaluation scripts

See [training/README.md](training/README.md) for `eval_workspace.py` and `eval_technical.py` (confusion matrix and classification report).

## Ethics

This is a screening **assist** prototype. Disclose camera use, avoid storing media in production, and document dataset bias when presenting academically.
