# SynThesis — Backend Guide
> 24-hour build · Tabs in scope: **Brain**, **Catalog**, **Map**, **Reports**

---

## Architecture at a Glance

```
React Frontend (Vite)
        │
        ▼
  FastAPI  :8000
        │
   ┌────┴────────┐
   │             │
Qdrant        theses.json
(vector DB)   (flat-file DB)
  :6333
```

**Why this stack for a hackathon:**
- FastAPI spins up in seconds, auto-docs at `/docs`
- Qdrant runs in one `docker run` command, no account needed
- `theses.json` is your "database" — no ORM, no migrations, no setup
- OpenAI SDK does embeddings + GPT-4o in ~15 lines

---

## ⚠️ Step 0 — Seed Data First (2 hrs, do before anything else)

Nothing is demoable without data. Build `data/theses.json` before writing a single API route.

### Record Schema

```json
{
  "id": "thesis_001",
  "title": "CNN-Based Crop Disease Detection Using Leaf Images",
  "author": "Juan Dela Cruz",
  "year": 2023,
  "adviser": "Dr. Maria Concepcion P. Yazon",
  "program": "BSCS",
  "abstract": "This study proposes a convolutional neural network model trained on the PlantVillage dataset to classify crop leaf diseases with 94% accuracy.",
  "keywords": ["CNN", "image classification", "crop disease", "deep learning"],
  "methodology": ["Python", "TensorFlow", "PlantVillage Dataset"],
  "domain": "Computer Vision"
}
```

### Fastest way to generate 25 records

Paste this into ChatGPT and copy the output:

```
Generate 25 thesis records as a JSON array for FEU Tech BSCS/BSIT students (2020–2024).
Each object must have exactly these keys:
  id (e.g. "thesis_001"), title, author, year, adviser, program,
  abstract (2–3 realistic sentences), keywords (array of 4–6 strings),
  methodology (array of tools/methods used), domain.

Spread domains across: Computer Vision, NLP, IoT, Web Systems, Data Analytics.
Make advisers consistent — reuse 5 faculty names across records.
Return ONLY a valid JSON array. No markdown, no commentary.
```

Save the result as `data/theses.json`.

---

## Step 1 — Project Setup (15 min)

```bash
mkdir synthesis-backend && cd synthesis-backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install fastapi uvicorn openai qdrant-client python-dotenv
```

**Folder structure:**

```
synthesis-backend/
├── main.py
├── ingest.py
├── data/
│   └── theses.json
├── .env
└── requirements.txt
```

**`.env`**

```
OPENAI_API_KEY=sk-...
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

---

## Step 2 — Run Qdrant (5 min)

```bash
docker run -p 6333:6333 qdrant/qdrant
```

Leave this terminal open. Dashboard: `http://localhost:6333/dashboard`

---

## Step 3 — Ingest Script `ingest.py` (run once)

Embeds every abstract and stores vectors in Qdrant.

```python
import json, os
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
from dotenv import load_dotenv

load_dotenv()

openai  = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
qdrant  = QdrantClient(host="localhost", port=6333)
COLLECTION  = "theses"
EMBED_MODEL = "text-embedding-3-small"

with open("data/theses.json") as f:
    theses = json.load(f)

# Create collection (safe to re-run)
try:
    qdrant.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
    )
except Exception:
    pass

points = []
for thesis in theses:
    text     = f"{thesis['title']}. {thesis['abstract']}"
    response = openai.embeddings.create(input=text, model=EMBED_MODEL)
    vector   = response.data[0].embedding
    numeric_id = int(thesis["id"].replace("thesis_", ""))
    points.append(PointStruct(id=numeric_id, vector=vector, payload=thesis))

qdrant.upsert(collection_name=COLLECTION, points=points)
print(f"✓ Ingested {len(points)} theses.")
```

```bash
python ingest.py
```

---

## Step 4 — API Server `main.py`

```python
import os, json
from collections import Counter, defaultdict
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from qdrant_client import QdrantClient
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="SynThesis API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

oai    = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
qdrant = QdrantClient(host="localhost", port=6333)
COLLECTION  = "theses"
EMBED_MODEL = "text-embedding-3-small"

with open("data/theses.json") as f:
    ALL_THESES = json.load(f)

# ── helpers ──────────────────────────────────────────────

def embed(text: str) -> list[float]:
    return oai.embeddings.create(input=text, model=EMBED_MODEL).data[0].embedding

def semantic_search(query: str, top_k: int = 8) -> list[dict]:
    hits = qdrant.search(
        collection_name=COLLECTION,
        query_vector=embed(query),
        limit=top_k,
        with_payload=True,
    )
    return [h.payload for h in hits]

# ── models ───────────────────────────────────────────────

class BrainRequest(BaseModel):
    query: str
    top_k: int = 8

# ── routes ───────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "SynThesis API running"}


# BRAIN — semantic search + GPT gap report
@app.post("/api/brain")
def brain(req: BrainRequest):
    results = semantic_search(req.query, req.top_k)

    context = "\n".join(
        f"- [{t['year']}] \"{t['title']}\" by {t['author']} "
        f"| Adviser: {t['adviser']} | Methods: {', '.join(t.get('methodology', []))}"
        for t in results
    )

    prompt = f"""You are SynThesis, a thesis research assistant for FEU Tech students.

Student query: "{req.query}"

Relevant theses from the FEU Tech archive:
{context}

Write a response with exactly these four sections:

## What's Been Studied
Brief summary of what existing theses have explored in this area.

## Gap Report
Specific angles that are underexplored or missing from the archive. Be concrete.

## Suggested Thesis Directions
2–3 actionable thesis directions the student could pursue.

## Recommended Methods & Tools
Tools and methods from past theses that would apply to these directions.

Keep each section concise and direct. Avoid filler."""

    response = oai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=700,
    )

    return {
        "answer":  response.choices[0].message.content,
        "sources": results,
    }


# CATALOG — full list with keyword, domain, year filters
@app.get("/api/catalog")
def catalog(
    q:      str = Query(default=""),
    domain: str = Query(default=""),
    year:   int = Query(default=None),
):
    results = ALL_THESES

    if q:
        ql = q.lower()
        results = [
            t for t in results
            if ql in t["title"].lower()
            or ql in t["abstract"].lower()
            or any(ql in kw.lower() for kw in t.get("keywords", []))
        ]

    if domain:
        results = [t for t in results if t.get("domain", "").lower() == domain.lower()]

    if year:
        results = [t for t in results if t.get("year") == year]

    return {"total": len(results), "theses": results}


# MAP — node/edge graph grouped by domain
@app.get("/api/map")
def knowledge_map(query: str = Query(default="")):
    theses = semantic_search(query, top_k=20) if query else ALL_THESES

    clusters: dict[str, list] = {}
    for t in theses:
        domain = t.get("domain", "Other")
        clusters.setdefault(domain, []).append(t)

    nodes, edges = [], []

    for domain, items in clusters.items():
        cid = f"cluster__{domain.replace(' ', '_')}"
        nodes.append({"id": cid, "label": domain, "type": "cluster", "count": len(items)})
        for t in items:
            nodes.append({
                "id":    t["id"],
                "label": t["title"],
                "type":  "thesis",
                "data":  t,
            })
            edges.append({"source": cid, "target": t["id"]})

    return {
        "nodes":    nodes,
        "edges":    edges,
        "clusters": list(clusters.keys()),
    }


# ── REPORTS ──────────────────────────────────────────────
#
# GET /api/reports
#
# Returns two sections shown in the Reports tab:
#
# 1. methodology_breakdown — every distinct tool/method across all theses,
#    with a frequency count and a one-line description generated by GPT-4o.
#    GPT descriptions are generated once at startup and cached in memory
#    so repeated page loads cost nothing.
#
# 2. adviser_recommendations — every adviser ranked by number of theses
#    mentored, with the set of domains they cover.
#
# Optional query param:
#   ?domain=  — filters both sections to theses in that domain only.

# Build descriptions once at startup (no per-request GPT cost).
def _build_tool_descriptions(tools: list[str]) -> dict[str, str]:
    """Ask GPT-4o for a one-sentence description of each tool/method."""
    if not tools:
        return {}

    tool_list = "\n".join(f"- {t}" for t in tools)
    prompt = (
        "For each tool or methodology listed below, write exactly one sentence "
        "(max 20 words) describing what it is and why researchers use it. "
        "Return ONLY a JSON object where keys are the tool names and values are the descriptions. "
        "No markdown, no commentary.\n\n" + tool_list
    )
    try:
        resp = oai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
        )
        raw = resp.choices[0].message.content.strip()
        # Strip ```json fences if present
        raw = raw.replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception:
        return {t: "" for t in tools}

# Gather all unique tools from the full dataset at startup
_ALL_TOOLS: list[str] = sorted({
    tool
    for thesis in ALL_THESES
    for tool in thesis.get("methodology", [])
})
_TOOL_DESCRIPTIONS: dict[str, str] = _build_tool_descriptions(_ALL_TOOLS)


@app.get("/api/reports")
def reports(domain: str = Query(default="")):
    theses = ALL_THESES

    # Optional domain filter
    if domain:
        theses = [t for t in theses if t.get("domain", "").lower() == domain.lower()]

    # ── 1. Methodology & Tools Breakdown ─────────────────
    tool_counter: Counter = Counter()
    for t in theses:
        for tool in t.get("methodology", []):
            tool_counter[tool] += 1

    methodology_breakdown = [
        {
            "tool":        tool,
            "count":       count,
            "description": _TOOL_DESCRIPTIONS.get(tool, ""),
        }
        for tool, count in tool_counter.most_common()
    ]

    # ── 2. Adviser Recommendations ────────────────────────
    adviser_data: dict[str, dict] = defaultdict(lambda: {"count": 0, "domains": set(), "faculty": "CCSMA"})
    for t in theses:
        adviser = t.get("adviser", "Unknown")
        adviser_data[adviser]["count"] += 1
        if t.get("domain"):
            adviser_data[adviser]["domains"].add(t["domain"])

    adviser_recommendations = sorted(
        [
            {
                "name":             adviser,
                "faculty":          info["faculty"],
                "theses_mentored":  info["count"],
                "domains":          sorted(info["domains"]),
            }
            for adviser, info in adviser_data.items()
        ],
        key=lambda x: x["theses_mentored"],
        reverse=True,
    )

    # ── Available domain list (for filter dropdown) ───────
    all_domains = sorted({t.get("domain", "") for t in ALL_THESES if t.get("domain")})

    return {
        "methodology_breakdown":    methodology_breakdown,
        "adviser_recommendations":  adviser_recommendations,
        "domains":                  all_domains,
        "filtered_by":              domain or None,
        "thesis_count":             len(theses),
    }
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

Interactive docs at `http://localhost:8000/docs`

> **Note on startup time:** The Reports endpoint calls GPT-4o once at boot to generate
> tool descriptions. Expect a 3–5 second delay on first `uvicorn` start. All subsequent
> requests are instant since descriptions are cached in `_TOOL_DESCRIPTIONS`.

---

## API Reference

| Endpoint | Method | Tab | Purpose |
|---|---|---|---|
| `GET /api/catalog` | GET | Catalog | Full list; filter by `q`, `domain`, `year` |
| `POST /api/brain` | POST | Brain | Semantic search + GPT synthesis |
| `GET /api/map` | GET | Map | Node-edge cluster graph data |
| `GET /api/reports` | GET | Reports | Methodology breakdown + adviser rankings |

### `GET /api/reports` — response shape

```json
{
  "methodology_breakdown": [
    {
      "tool": "Python",
      "count": 18,
      "description": "A versatile language used for data analysis, ML, and automation."
    }
  ],
  "adviser_recommendations": [
    {
      "name": "Dr. Maria Concepcion P. Yazon",
      "faculty": "CCSMA",
      "theses_mentored": 18,
      "domains": ["Computer Vision", "NLP"]
    }
  ],
  "domains": ["Computer Vision", "Data Analytics", "IoT", "NLP", "Web Systems"],
  "filtered_by": null,
  "thesis_count": 25
}
```

Pass `?domain=Computer+Vision` to scope both tables to a single domain.

---

## Cost Estimate

| Operation | Model | Cost |
|---|---|---|
| Ingesting 25 theses | `text-embedding-3-small` | ~$0.001 |
| One Brain query | `gpt-4o` + embedding | ~$0.01–0.03 |
| Reports startup (tool descriptions) | `gpt-4o` | ~$0.005 |
| Full demo session (~20 queries) | — | ~$0.30–0.50 |

Comfortably within any free-tier OpenAI credits.

---

## Pre-Demo Checklist

- [ ] `theses.json` has 20+ records across 3+ domains
- [ ] `python ingest.py` completed without errors
- [ ] Qdrant dashboard shows records at `localhost:6333/dashboard`
- [ ] `GET /api/catalog` returns data
- [ ] `GET /api/map` returns nodes and edges
- [ ] `POST /api/brain` `{"query": "machine learning crop disease"}` returns a structured GPT response
- [ ] `GET /api/reports` returns `methodology_breakdown` and `adviser_recommendations`
- [ ] `GET /api/reports?domain=Computer+Vision` returns filtered results
- [ ] CORS is open (frontend on `localhost:5173` can call backend)
