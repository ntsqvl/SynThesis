# SynThesis Connected Build

This package connects the React/Vite frontend to the Python FastAPI backend.

## What is connected

Frontend API calls in `frontend/src/api/index.js` now point to the real backend routes:

- `POST /api/brain`
- `GET /api/catalog`
- `GET /api/map`
- `GET /api/reports`
- `GET /api/health`

The backend returns JSON for all app routes. The frontend normalizes the backend's current record fields, including `mentor`, `proponents`, `faculty_paper`, `methodology`, `datasets`, `edges`, `links`, `adviser_recommendations`, and `methodology_breakdown`.

## Important setup note

Do not commit real API keys. This package includes `backend/.env.example`; copy it to `backend/.env` and add your own key there.

## 1. Install required software

Install these first:

- Python 3.10 or newer
- Node.js LTS, which includes `npm`
- Docker Desktop, for Qdrant

If Windows says `npm is not recognized`, install Node.js LTS and reopen Command Prompt, PowerShell, or VS Code.

## 2. Start Qdrant

Open a terminal and run:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

Leave that terminal open.

## 3. Set up the backend

Open a second terminal:

```bash
cd backend
python -m venv venv
```

On Windows:

```bash
venv\Scripts\activate
```

On macOS/Linux:

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create your environment file:

```bash
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Edit `.env` and add your `AIMLAPI_KEY` or `OPENAI_API_KEY`.

Ingest the records into Qdrant:

```bash
python ingest.py
```

Start FastAPI:

```bash
python -m uvicorn main:app --reload --port 8000
```

Check the backend:

```text
http://localhost:8000/api/health
```

## 4. Set up the frontend

Open a third terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Windows helper scripts

From the project root, you can also run:

```bat
start-backend.bat
start-frontend.bat
```

Run `python backend\ingest.py` once before the first Brain search, after Qdrant is running.

## Changes made for integration

- Backend data paths now work even when the server is launched from the `backend` folder.
- Backend accepts either `AIMLAPI_KEY` or `OPENAI_API_KEY`.
- Qdrant point IDs now use deterministic UUIDs, avoiding collisions between IDs like `faculty_001` and `thesis_001`.
- Brain answers include bracketed citation numbers such as `[1]`, which the frontend renders as clickable citation chips.
- Brain now accepts and returns `history`, so the frontend can send follow-up questions with context.
- Reports now treats faculty paper authors as faculty recommendations and thesis `mentor` values as adviser recommendations.
- The separate Map tab has been removed from the sidebar. Its constellation visualization now appears inside the Brain tab after a query.
- Brain graph nodes and links highlight when the submitted keywords match titles, domains, authors/proponents, advisers, methods, tools, datasets, keywords, or abstracts.
- Catalog now shows all paper proponents/authors in a dedicated column while keeping the main adviser/faculty column.
- Catalog and Brain graph views display backend fields such as `mentor`, `proponents`, `methodology`, `datasets`, faculty papers, and nested node `data`.
