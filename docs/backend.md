# SynThesis backend

The backend is a FastAPI service for a repository-grounded thesis-research assistant. It loads the local research corpus and a prebuilt embedding index, retrieves relevant records, and exposes the APIs used by the Brain, Catalog, Reports, and repository-map screens.

The current implementation uses local JSON files and in-memory cosine similarity. It does not require Qdrant, Docker, or a separate vector database.

## Backend structure

```text
backend/
+-- data/
|   +-- synthesis_research_data.json   # Source-of-truth research corpus
|   +-- embeddings.json                # Generated vector for each research record
|   `-- index_manifest.json            # Index model, count, hashes, and build metadata
+-- routers/
|   +-- advisers.py                    # POST /api/advisers
|   +-- methods.py                     # POST /api/methods
|   `-- synthesis.py                   # POST /api/synthesis compatibility endpoint
+-- services/
|   +-- advisers.py                    # Adviser/faculty ranking and explanations
|   +-- methods.py                     # Method, tool, and dataset recommendations
|   `-- synthesis_agent.py             # Structured synthesis compatibility workflow
+-- tests/
|   `-- test_synthesis_agent.py        # Fallback-contract test
+-- build_index.py                     # Validates records and builds/reuses embeddings
+-- main.py                            # FastAPI app and active application endpoints
+-- requirements.txt                   # Python dependencies
`-- .env.example                       # Safe environment-variable template
```

`test.py` is a local diagnostic file and should not be used in deployment because it can print an environment variable value.

## Runtime data flow

```text
Research corpus JSON
        |
        +-- build_index.py -> embeddings.json + index_manifest.json
        |
        `-- main.py loads both files at startup
                         |
Browser request -> FastAPI endpoint -> semantic search / keyword fallback
                         |
                         `-- repository-grounded JSON response
```

Semantic search embeds the query with the configured embedding model and compares it against the local vectors. If an index is missing or the embedding request fails, the service falls back to keyword ranking so repository views can continue to return records.

## Active endpoints

| Endpoint | Purpose | Used by the current frontend |
|---|---|---|
| `GET /api/health` | Deployment and index health check | Yes |
| `POST /api/brain` | Repository-grounded answer, citations, sources, confidence, and adviser ranking | Yes |
| `GET /api/catalog` | Filterable research-record list | Yes |
| `GET /api/map` | Repository nodes and query-related connections | Yes |
| `GET /api/reports` | Methodology and adviser reporting data | Yes |
| `POST /api/methods` | Focused method/tool/dataset recommendation endpoint | Available for integrations |
| `POST /api/advisers` | Focused adviser ranking endpoint | Available for integrations |
| `POST /api/synthesis` | Structured synthesis compatibility endpoint | Available for integrations |

The Brain view uses `/api/brain` and loads `/api/map` for its integrated constellation. It does not use the standalone compatibility endpoints during the normal interface flow.

## Run locally

### 1. Prerequisites

Install Python 3.10 or newer. From the repository root, confirm it is available:

```powershell
python --version
```

### 2. Create and activate a virtual environment

```powershell
Set-Location backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation for the current terminal only, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 4. Create local environment settings

```powershell
Copy-Item .env.example .env
```

For OpenAI, set the following in `backend/.env`:

```env
OPENAI_API_KEY=your_secret_key
SYNTHESIS_EMBED_MODEL=text-embedding-3-small
SYNTHESIS_CHAT_MODEL=gpt-4o
CORS_ORIGINS=http://127.0.0.1:5173
```

Alternatively, use an OpenAI-compatible AIMLAPI provider:

```env
AIMLAPI_KEY=your_secret_key
AIMLAPI_BASE_URL=https://api.aimlapi.com/v1
SYNTHESIS_EMBED_MODEL=text-embedding-3-small
SYNTHESIS_CHAT_MODEL=gpt-4o
CORS_ORIGINS=http://127.0.0.1:5173
```

Use either `OPENAI_API_KEY` or `AIMLAPI_KEY`; never commit `.env`. The exact variable name is `AIMLAPI_KEY`.

### 5. Start FastAPI

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Verify the service in a second terminal or browser:

```text
http://127.0.0.1:8000/api/health
```

The response should include `"status": "ok"`, the record count, the available domains, and index-model information.

### 6. Optional: run the compatibility test

The existing test verifies that the synthesis fallback still returns a valid response contract when the model client is unavailable.

```powershell
python -m pip install pytest
python -m pytest tests
```

## Maintain the embedding index

The repository includes a prebuilt `data/embeddings.json`, so a normal local run does not need an indexing step. Rebuild only after changing `data/synthesis_research_data.json` or changing the embedding model/retrieval-text logic.

```powershell
Set-Location backend
python build_index.py --dry-run
python build_index.py
```

Use `python build_index.py --force` only when every record needs a new vector, such as after changing the embedding model. See [Build the embedding index](build-embedding.md) for the data conventions and complete indexing handoff.

## Deployment notes

- The production command must bind to the host-provided port, for example `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Deploy `data/synthesis_research_data.json`, `data/embeddings.json`, and `data/index_manifest.json` with the backend.
- Set `CORS_ORIGINS` to the exact deployed frontend URL, with no trailing slash. A comma-separated list is supported.
- Keep API keys in the host's secret manager or environment settings, never in browser code or Git.
- `GET /api/health` is the first endpoint to check after deployment; `GET /api/map?query=machine%20learning` verifies the map data path.

## Troubleshooting

| Symptom | Check |
|---|---|
| `Network Error` in the frontend | Confirm `/api/health` works, `VITE_API_BASE` points to this backend, and `CORS_ORIGINS` contains the exact frontend origin. |
| `model_match: false` from `/api/health` | Rebuild `embeddings.json` with the same `SYNTHESIS_EMBED_MODEL` used at runtime. |
| Brain response uses a fallback warning | Confirm the API key and provider URL, then inspect backend logs. Catalog and map data can still load from local JSON. |
| Map has no related studies | Submit a Brain query first, then verify `/api/map?query=...` returns `nodes` and `links`. |
