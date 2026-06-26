# SynThesis Frontend

React/Vite frontend connected to the FastAPI backend at `http://localhost:8000` by default.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Configure backend URL

Create `.env` from `.env.example` if your backend runs somewhere else:

```bash
cp .env.example .env
```

```env
VITE_API_BASE=http://localhost:8000
```

## Backend JSON routes used

- `POST /api/brain` with `{ query, top_k, history }`
- `GET /api/catalog`
- `GET /api/map?query=...` used by the Brain tab's integrated constellation visualization
- `GET /api/reports?domain=...`
- `GET /api/health`

## Current tabs

The sidebar now shows Brain, Catalog, and Reports. The graph/constellation visualization is integrated into Brain and appears after a query is submitted. Catalog includes a Proponents / authors column with every listed author from the backend JSON.
