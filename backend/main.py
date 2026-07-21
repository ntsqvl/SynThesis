import json
import math
import os
import re
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field
from routers import advisers as advisers_router
from routers import methods as methods_router
from routers import synthesis as synthesis_router
from services.advisers import rank_advisers

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DATA_PATH = BASE_DIR / "data" / "synthesis_research_data.json"
EMBEDDINGS_PATH = BASE_DIR / "data" / "embeddings.json"
EMBED_MODEL = os.getenv("SYNTHESIS_EMBED_MODEL") or os.getenv("EMBED_MODEL", "text-embedding-3-small")
CHAT_MODEL = os.getenv("SYNTHESIS_CHAT_MODEL") or os.getenv("CHAT_MODEL", "gpt-4o")

app = FastAPI(title="SynThesis API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(advisers_router.router)
app.include_router(methods_router.router)
app.include_router(synthesis_router.router)

with DATA_PATH.open(encoding="utf-8") as f:
    ALL_THESES: list[dict[str, Any]] = json.load(f)

REPOSITORY_IDS = {str(record.get("id")) for record in ALL_THESES if record.get("id")}


# -- local embedding index -------------------------------------------------

def load_embedding_index() -> tuple[list[tuple[dict[str, Any], list[float]]], str | None]:
    """Load the locally built vector index produced by build_index.py.

    Returns a list pairing each research record with its stored embedding, plus
    the model the vectors were built with. Records whose id has no vector (or an
    index that is missing/corrupt) are simply skipped; semantic_search falls
    back to keyword search when the index is empty.
    """
    if not EMBEDDINGS_PATH.exists():
        return [], None
    try:
        index = json.loads(EMBEDDINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return [], None
    if not isinstance(index, dict):
        return [], None

    vectors_by_id: dict[str, list[float]] = {}
    for item in index.get("items", []):
        if not isinstance(item, dict):
            continue
        record_id = str(item.get("id") or "")
        embedding = item.get("embedding")
        if record_id and isinstance(embedding, list) and embedding:
            vectors_by_id[record_id] = [float(value) for value in embedding]

    paired: list[tuple[dict[str, Any], list[float]]] = []
    for record in ALL_THESES:
        vector = vectors_by_id.get(str(record.get("id")))
        if vector is not None:
            paired.append((record, vector))
    return paired, index.get("embedding_model")


EMBEDDING_INDEX, INDEX_EMBED_MODEL = load_embedding_index()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = norm_a = norm_b = 0.0
    for value_a, value_b in zip(a, b):
        dot += value_a * value_b
        norm_a += value_a * value_a
        norm_b += value_b * value_b
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


# -- clients ---------------------------------------------------------------

@lru_cache(maxsize=1)
def get_oai() -> OpenAI:
    """Return an OpenAI-compatible client lazily.

    Catalog, map, and reports can still run from JSON data even before an AI
    key is configured. Brain synthesis and embeddings use this client only when
    needed.
    """
    aiml_key = os.getenv("AIMLAPI_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    api_key = aiml_key or openai_key
    if not api_key:
        raise RuntimeError("Set AIMLAPI_KEY or OPENAI_API_KEY in backend/.env")

    kwargs: dict[str, Any] = {"api_key": api_key}
    if aiml_key:
        kwargs["base_url"] = os.getenv("AIMLAPI_BASE_URL", "https://api.aimlapi.com/v1")
    elif os.getenv("OPENAI_BASE_URL"):
        kwargs["base_url"] = os.getenv("OPENAI_BASE_URL")

    return OpenAI(**kwargs)


def embed(text: str) -> list[float]:
    return get_oai().embeddings.create(input=text, model=EMBED_MODEL).data[0].embedding


# -- data helpers ----------------------------------------------------------

def as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [part.strip() for part in value.replace("|", ",").replace(";", ",").split(",") if part.strip()]
    return [str(value).strip()] if str(value).strip() else []


def first_author(author: str | None) -> str:
    if not author:
        return "Unknown Faculty"
    return author.split(",")[0].strip() or "Unknown Faculty"


def record_kind(record: dict[str, Any]) -> str:
    return "Faculty research" if record.get("type") == "faculty_paper" else "Thesis"


def supervisor_name(record: dict[str, Any]) -> str:
    if record.get("type") == "thesis":
        return record.get("mentor") or record.get("adviser") or "Unknown Adviser"
    return first_author(record.get("author"))


def supervisor_label(record: dict[str, Any]) -> str:
    if record.get("type") == "thesis":
        return f"Adviser: {supervisor_name(record)}"
    return f"Faculty: {supervisor_name(record)}"


def proponent_names(record: dict[str, Any]) -> list[str]:
    """Return displayed student proponents or paper authors."""
    value = (
        record.get("proponents")
        or record.get("proponent")
        or record.get("authors")
        or record.get("author")
        or record.get("students")
        or record.get("student")
    )
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    return [text] if text else []


def public_record(record: dict[str, Any]) -> dict[str, Any]:
    """Add frontend-friendly aliases without mutating source archive records."""
    enriched = dict(record)
    proponents = proponent_names(record)
    enriched["record_kind"] = record_kind(record)
    enriched["proponents"] = proponents
    enriched["proponents_text"] = record.get("proponents_text") or record.get("proponents_display") or ", ".join(proponents)
    # Adviser/faculty always reflects the mentor. Faculty papers have no mentor,
    # so these stay empty and the UI hides the field rather than showing an author.
    mentor = record.get("mentor") or record.get("adviser")
    enriched["adviser"] = mentor
    enriched["adviser_or_faculty"] = mentor or ""
    enriched["supervisor_label"] = f"Adviser: {mentor}" if mentor else ""
    enriched["repository_verified"] = str(record.get("id")) in REPOSITORY_IDS
    return enriched


def record_text(record: dict[str, Any]) -> str:
    parts: list[str] = [
        str(record.get("title") or ""),
        str(record.get("author") or ""),
        str(record.get("mentor") or ""),
        str(record.get("adviser") or ""),
        str(record.get("abstract") or ""),
        str(record.get("domain") or ""),
        str(record.get("publication") or ""),
    ]
    parts.extend(proponent_names(record))
    parts.extend(as_list(record.get("keywords")))
    parts.extend(as_list(record.get("methodology")))
    parts.extend(as_list(record.get("datasets")))
    return " ".join(part for part in parts if part)


def query_terms(query: str) -> list[str]:
    stop_words = {
        "about", "after", "and", "are", "based", "been", "between", "can", "certain",
        "for", "from", "give", "how", "into", "like", "make", "of", "on", "or",
        "research", "show", "study", "studied", "the", "thesis", "theses", "this",
        "tools", "using", "what", "when", "with",
    }
    terms: list[str] = []
    for term in re.findall(r"[a-z0-9]+", query.lower()):
        if len(term) >= 2 and term not in stop_words and term not in terms:
            terms.append(term)
    return terms[:14]


def record_matches_query(record: dict[str, Any], terms: list[str]) -> bool:
    if not terms:
        return False
    haystack = record_text(record).lower()
    return any(term in haystack for term in terms)


def keyword_search(query: str, top_k: int = 8) -> list[dict[str, Any]]:
    """Local fallback used when the embedding index or AI key is unavailable."""
    q = query.strip().lower()
    if not q:
        return ALL_THESES[:top_k]

    terms = [term for term in re.findall(r"[a-z0-9+#.]+", q) if term]
    scored: list[tuple[int, dict[str, Any]]] = []

    for record in ALL_THESES:
        title = str(record.get("title") or "").lower()
        abstract = str(record.get("abstract") or "").lower()
        domain = str(record.get("domain") or "").lower()
        keywords = " ".join(as_list(record.get("keywords"))).lower()
        methodology = " ".join(as_list(record.get("methodology"))).lower()
        haystack = record_text(record).lower()

        score = 0
        for term in terms:
            if term in title:
                score += 6
            if term in keywords:
                score += 4
            if term in methodology:
                score += 4
            if term in domain:
                score += 3
            if term in abstract:
                score += 2
            if term in haystack:
                score += 1

        if score > 0:
            scored.append((score, record))

    scored.sort(key=lambda item: item[0], reverse=True)
    if scored:
        return [record for _, record in scored[:top_k]]
    return ALL_THESES[:top_k]


def semantic_search(query: str, top_k: int = 8) -> list[dict[str, Any]]:
    """Local embedding search over embeddings.json with a keyword fallback.

    The query is embedded with the same model the index was built with, then
    ranked against the pre-computed record vectors by cosine similarity. If the
    index is empty or embedding fails (for example, no AI key configured), it
    falls back to the JSON-safe keyword search so the endpoint still responds.
    """
    limit = max(1, min(int(top_k or 8), 30))
    if not EMBEDDING_INDEX:
        return keyword_search(query, limit)
    try:
        vector = embed(query)
    except Exception:
        return keyword_search(query, limit)

    scored = sorted(
        ((cosine_similarity(vector, record_vector), record) for record, record_vector in EMBEDDING_INDEX),
        key=lambda item: item[0],
        reverse=True,
    )
    ranked = [record for score, record in scored[:limit] if score > 0.0]
    return ranked or keyword_search(query, limit)


def build_adviser_ranking(results: list[dict[str, Any]], query: str = "") -> list[dict[str, Any]]:
    return rank_advisers(results, query)


def extract_citation_numbers(answer: str) -> set[int]:
    citation_numbers: set[int] = set()
    for block in re.findall(r"\[([0-9,\s]+)\]", answer or ""):
        for raw_number in block.split(","):
            raw_number = raw_number.strip()
            if raw_number.isdigit():
                citation_numbers.add(int(raw_number))
    return citation_numbers


def compute_repository_confidence(query: str, answer: str, results: list[dict[str, Any]]) -> dict[str, Any]:
    """Estimate how strongly the answer is grounded in repository studies.

    The score is not a model truth score. It checks three practical signals:
    returned-source membership in the repository JSON, whether cited numbers map
    to returned repository sources, and whether the returned records match the
    query terms.
    """
    if not results:
        return {
            "score": 0.0,
            "label": "No repository evidence",
            "repository_source_count": 0,
            "returned_source_count": 0,
            "cited_sources": [],
            "invalid_citations": sorted(extract_citation_numbers(answer)),
            "query_match_count": 0,
        }

    repository_flags = [str(record.get("id")) in REPOSITORY_IDS for record in results]
    repository_source_count = sum(1 for flag in repository_flags if flag)
    membership_score = repository_source_count / max(len(results), 1)

    citations = extract_citation_numbers(answer)
    valid_citations = sorted(
        number
        for number in citations
        if 1 <= number <= len(results) and repository_flags[number - 1]
    )
    invalid_citations = sorted(citations.difference(valid_citations))

    if citations:
        citation_score = len(valid_citations) / max(len(citations), 1)
    else:
        citation_score = 0.35 if repository_source_count else 0.0

    terms = query_terms(query)
    query_match_count = sum(1 for record in results if record_matches_query(record, terms)) if terms else len(results)
    query_fit_score = query_match_count / max(min(len(results), 6), 1)
    query_fit_score = max(0.0, min(query_fit_score, 1.0))

    evidence_volume_score = min(repository_source_count / 4, 1.0)
    score = membership_score * ((0.52 * citation_score) + (0.28 * query_fit_score) + (0.20 * evidence_volume_score))
    score = max(0.0, min(score, 1.0))

    if score >= 0.8:
        label = "High repository grounding"
    elif score >= 0.55:
        label = "Moderate repository grounding"
    elif score > 0:
        label = "Low repository grounding"
    else:
        label = "No repository evidence"

    return {
        "score": round(score, 3),
        "label": label,
        "repository_source_count": repository_source_count,
        "returned_source_count": len(results),
        "cited_sources": valid_citations,
        "invalid_citations": invalid_citations,
        "query_match_count": query_match_count,
        "query_terms": terms,
    }


def fallback_brain_answer(query: str, results: list[dict[str, Any]]) -> str:
    cited_titles = "; ".join(
        f"[{index}] {record.get('title', 'Untitled record')}"
        for index, record in enumerate(results[:4], start=1)
    ) or "No matching archive records were found."

    methods = sorted({method for record in results for method in as_list(record.get("methodology"))})[:8]
    domains = sorted({record.get("domain") for record in results if record.get("domain")})

    return f"""## What's Been Studied
The local archive has records related to \"{query}\" across {', '.join(domains) if domains else 'the available research domains'}. Relevant repository records include {cited_titles}.

## Gap Report
The fallback local search found repository records, but AI synthesis is unavailable until the backend AI key and embedding service are configured. Review the cited records to confirm what has not yet been evaluated locally.

## Recommended Methods & Tools
Methods and tools found in the matching repository records include {', '.join(methods) if methods else 'no explicit methodology entries in the matched records'}."""


# -- models ---------------------------------------------------------------

class Message(BaseModel):
    role: str
    content: str


class BrainRequest(BaseModel):
    query: str
    top_k: int = 8
    history: list[Message] = Field(default_factory=list)


# -- routes ---------------------------------------------------------------

@app.get("/")
def root():
    return {"status": "SynThesis API running"}


@app.get("/api/health")
def health():
    index_ready = bool(EMBEDDING_INDEX)
    model_matches = (not index_ready) or (INDEX_EMBED_MODEL == EMBED_MODEL)
    return {
        "status": "ok",
        "records": len(ALL_THESES),
        "domains": sorted({record.get("domain") for record in ALL_THESES if record.get("domain")}),
        "search": {
            "mode": "local_embeddings" if index_ready else "keyword_fallback",
            "indexed_records": len(EMBEDDING_INDEX),
            "index_model": INDEX_EMBED_MODEL,
            "query_model": EMBED_MODEL,
            "model_match": model_matches,
        },
    }


@app.post("/api/brain")
def brain(req: BrainRequest):
    results = semantic_search(req.query, req.top_k)
    adviser_ranking = build_adviser_ranking(results, req.query)

    context = "\n".join(
        f"[{index}] {record_kind(record)} | [{record.get('year') or 'n/d'}] "
        f"\"{record.get('title', 'Untitled record')}\" by {record.get('author', 'Unknown author')} "
        f"| {supervisor_label(record)} | Domain: {record.get('domain') or 'Unspecified'} "
        f"| Methods/Tools: {', '.join(as_list(record.get('methodology'))) or 'Not specified'} "
        f"| Abstract: {str(record.get('abstract') or '')[:650]}"
        for index, record in enumerate(results, start=1)
    )

    system_prompt = f"""You are SynThesis, a thesis research assistant for FEU Tech students.

STRICT RULE: Base every claim, study reference, finding, and suggestion SOLELY on the repository context provided below. Do not invent or recall studies outside of it. If the repository has no relevant information, say so honestly.

CITATION RULE: When referencing a thesis or faculty research record, cite it inline using its bracketed source number, for example [1] or [2]. Do not cite studies that are not in the repository context.

RESPONSE BEHAVIOR:
- Keep every relevant cited detail in the section where it belongs. Do not move numbered study lists into extra sections.
- Use bullet lists under each section when multiple repository records are relevant so the UI can display all cited studies cleanly.
- If this is the first question, structure your response with exactly these three sections:

  ## What's Been Studied
  Brief summary of what existing theses or faculty research have explored relevant to the question.

  ## Gap Report
  Specific angles that are underexplored or missing from the repository. Be concrete.

  ## Recommended Methods & Tools
  Methods, datasets, tools, models, or evaluation techniques from the repository that apply to the topic.

- If this is a follow-up question, respond naturally and conversationally like a research mentor. Connect your answer to what was already discussed and still cite repository records where relevant.

--- FEU Tech Repository Context for this query ---
{context}
-------------------------------------------------"""

    max_history = 20
    trimmed_history = req.history[-max_history:]
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    messages.extend({"role": msg.role, "content": msg.content} for msg in trimmed_history)
    messages.append({"role": "user", "content": req.query})

    warning = None
    try:
        response = get_oai().chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            max_tokens=1200,
        )
        answer = response.choices[0].message.content
    except Exception as exc:
        warning = f"AI synthesis fallback used: {exc.__class__.__name__}"
        answer = fallback_brain_answer(req.query, results)

    repository_confidence = compute_repository_confidence(req.query, answer, results)

    return {
        "answer": answer,
        "sources": [public_record(record) for record in results],
        "adviser_ranking": adviser_ranking,
        "repository_confidence": repository_confidence,
        "confidence": repository_confidence["score"],
        "history": [
            *[{"role": message.role, "content": message.content} for message in req.history],
            {"role": "user", "content": req.query},
            {"role": "assistant", "content": answer},
        ],
        "warning": warning,
    }


@app.get("/api/catalog")
def catalog(
    q: str = Query(default=""),
    domain: str = Query(default=""),
    year: int | None = Query(default=None),
):
    results = ALL_THESES

    if q:
        ql = q.lower()
        results = [record for record in results if ql in record_text(record).lower()]

    if domain:
        results = [record for record in results if record.get("domain", "").lower() == domain.lower()]

    if year:
        results = [record for record in results if record.get("year") == year]

    return {
        "total": len(results),
        "theses": [public_record(record) for record in results],
        "domains": sorted({record.get("domain") for record in ALL_THESES if record.get("domain")}),
        "years": sorted({record.get("year") for record in ALL_THESES if record.get("year")}, reverse=True),
    }


@app.get("/api/map")
def knowledge_map(query: str = Query(default="")):
    theses = semantic_search(query, top_k=20) if query else ALL_THESES
    terms = query_terms(query)

    clusters: dict[str, list[dict[str, Any]]] = {}
    for record in theses:
        domain = record.get("domain", "Other") or "Other"
        clusters.setdefault(domain, []).append(record)

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    for domain, records in clusters.items():
        cluster_id = f"cluster__{domain.replace(' ', '_')}"
        cluster_highlighted = bool(terms) and (
            any(term in domain.lower() for term in terms)
            or any(record_matches_query(record, terms) for record in records)
        )
        nodes.append({
            "id": cluster_id,
            "label": domain,
            "type": "cluster",
            "domain": domain,
            "count": len(records),
            "highlighted": cluster_highlighted,
        })
        for record in records:
            record_highlighted = record_matches_query(record, terms)
            nodes.append({
                "id": record.get("id"),
                "label": record.get("title"),
                "type": "thesis",
                "record_kind": record_kind(record),
                "domain": domain,
                "year": record.get("year"),
                "author": record.get("author"),
                "proponents_text": ", ".join(proponent_names(record)),
                "proponents": proponent_names(record),
                "mentor": record.get("mentor"),
                "adviser": record.get("mentor") or record.get("adviser"),
                "methodology": record.get("methodology", []),
                "keywords": record.get("keywords", []),
                "datasets": record.get("datasets", []),
                "abstract": record.get("abstract"),
                "highlighted": record_highlighted,
                "data": public_record(record),
            })
            edges.append({
                "source": cluster_id,
                "target": record.get("id"),
                "relationship": "belongs_to_domain",
                "highlighted": record_highlighted or cluster_highlighted,
                "cited": record_highlighted,
            })

    return {
        "nodes": nodes,
        "edges": edges,
        "links": edges,
        "clusters": list(clusters.keys()),
        "highlight_terms": terms,
        "query": query or None,
    }


# Reports descriptions are cached after the first request.
_TOOL_DESCRIPTIONS: dict[str, str] | None = None


def build_tool_descriptions(tools: list[str]) -> dict[str, str]:
    if not tools:
        return {}

    fallback = {
        tool: f"{tool} is used as a research method, tool, framework, or evaluation technique in the repository."
        for tool in tools
    }

    tool_list = "\n".join(f"- {tool}" for tool in tools)
    prompt = (
        "For each tool or methodology listed below, write exactly one sentence "
        "with maximum 20 words describing what it is and why researchers use it. "
        "Return only a JSON object where keys are the exact tool names and values are descriptions.\n\n"
        + tool_list
    )
    try:
        response = get_oai().chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
        )
        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return {tool: str(parsed.get(tool) or fallback[tool]) for tool in tools}
    except Exception:
        pass
    return fallback


@app.get("/api/reports")
def reports(
    domain: str = Query(default=""),
    limit: int = Query(default=10, ge=1, le=30),
):
    global _TOOL_DESCRIPTIONS

    all_tools = sorted({tool for record in ALL_THESES for tool in as_list(record.get("methodology"))})
    if _TOOL_DESCRIPTIONS is None:
        _TOOL_DESCRIPTIONS = build_tool_descriptions(all_tools)

    theses = ALL_THESES
    if domain:
        theses = [record for record in theses if record.get("domain", "").lower() == domain.lower()]

    tool_counter: Counter[str] = Counter()
    for record in theses:
        # Count a method/tool once per study so repeated labels in a record do not overstate usage.
        for tool in set(as_list(record.get("methodology"))):
            tool_counter[tool] += 1

    methodology_breakdown = [
        {
            "tool": tool,
            "count": count,
            "description": _TOOL_DESCRIPTIONS.get(tool, ""),
        }
        for tool, count in tool_counter.most_common(limit)
    ]

    adviser_ranking = build_adviser_ranking(theses)
    adviser_recommendations = [
        {
            "name": item["name"],
            "faculty": "CCSMA",
            "theses_mentored": len(item.get("relevant_theses", [])),
            "works_count": len(item.get("relevant_theses", [])),
            "alignment_score": item.get("alignment_score", 0),
            "domains": item.get("domains", []),
            "relevant_theses": item.get("relevant_theses", []),
        }
        for item in adviser_ranking
    ]

    return {
        "methodology_breakdown": methodology_breakdown,
        "adviser_rankings": adviser_ranking,
        "adviser_recommendations": adviser_recommendations,
        "domains": sorted({record.get("domain") for record in ALL_THESES if record.get("domain")}),
        "filtered_by": domain or None,
        "thesis_count": len(theses),
        "limit": limit,
    }
