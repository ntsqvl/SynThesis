import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

CHAT_MODEL = os.getenv("SYNTHESIS_CHAT_MODEL") or os.getenv("CHAT_MODEL", "gpt-4o")


@lru_cache(maxsize=1)
def get_oai() -> OpenAI:
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


def as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [part.strip() for part in value.replace("|", ",").replace(";", ",").split(",") if part.strip()]
    return [str(value).strip()] if str(value).strip() else []


def query_terms(query: str) -> list[str]:
    stop_words = {
        "about", "after", "and", "are", "based", "been", "between", "can", "certain",
        "for", "from", "give", "how", "into", "like", "make", "of", "on", "or",
        "research", "show", "study", "studied", "the", "thesis", "theses", "this",
        "tools", "using", "what", "when", "with",
    }
    terms: list[str] = []
    for term in re.findall(r"[a-z0-9+#.]+", str(query or "").lower()):
        if len(term) >= 2 and term not in stop_words and term not in terms:
            terms.append(term)
    return terms[:14]


def normalize_name(value: Any) -> str:
    return str(value or "").strip()


def normalized_record_id(record: dict[str, Any]) -> str:
    return str(record.get("id") or "").strip()


def normalized_title(record: dict[str, Any]) -> str:
    return str(record.get("title") or "Untitled record").strip() or "Untitled record"


def weighted_term_score(record: dict[str, Any], terms: list[str]) -> float:
    if not terms:
        return 0.0

    title = str(record.get("title") or "").lower()
    domain = str(record.get("domain") or "").lower()
    keywords = " ".join(as_list(record.get("keywords"))).lower()
    methodology = " ".join(as_list(record.get("methodology"))).lower()
    tools = " ".join(as_list(record.get("tools"))).lower()
    datasets = " ".join(as_list(record.get("datasets"))).lower()
    abstract = str(record.get("abstract") or "").lower()

    score = 0.0
    for term in terms:
        if term in title:
            score += 4.0
        if term in keywords:
            score += 3.0
        if term in methodology:
            score += 3.0
        if term in tools:
            score += 2.0
        if term in datasets:
            score += 2.0
        if term in domain:
            score += 2.0
        if term in abstract:
            score += 1.0

    return min(score / max(len(terms), 1), 8.0)


def adviser_signals(record: dict[str, Any]) -> list[tuple[str, float]]:
    record_type = str(record.get("type") or "")
    if record_type == "student_paper":
        mentor = normalize_name(record.get("mentor"))
        return [(mentor, 2.4)] if mentor else []
    if record_type == "faculty_paper":
        authors = as_list(record.get("author"))
        return [(author, 2.0 if index == 0 else 1.15) for index, author in enumerate(authors)]
    return []


def record_rank_weight(index: int) -> float:
    return max(0.45, 1.0 - (index * 0.035))


def adviser_record_score(record: dict[str, Any], terms: list[str], index: int, signal_weight: float) -> float:
    return (signal_weight * record_rank_weight(index)) + weighted_term_score(record, terms)


def append_unique(values: list[str], value: str) -> None:
    if value and value not in values:
        values.append(value)


def fallback_reasoning(name: str, item: dict[str, Any], query: str) -> str:
    titles = item.get("relevant_theses", [])
    domains = item.get("domains", [])
    topic = str(query or "").strip() or "this topic"

    if titles and domains:
        return (
            f"{name} aligns with {topic} through retrieved work in {', '.join(domains[:3])}, "
            f"including {titles[0]}."
        )
    if titles:
        return f"{name} aligns with {topic} through retrieved work including {titles[0]}."
    if domains:
        return f"{name} aligns with {topic} through retrieved work in {', '.join(domains[:3])}."
    return ""


def parse_reasoning_json(raw: str, names: list[str]) -> dict[str, str]:
    cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        return {}
    return {
        name: str(parsed.get(name) or "").strip()
        for name in names
        if str(parsed.get(name) or "").strip()
    }


def build_ai_reasonings(items: list[dict[str, Any]], query: str) -> dict[str, str]:
    if not items:
        return {}

    names = [str(item.get("name") or "") for item in items if item.get("name")]
    evidence = [
        {
            "name": item["name"],
            "domains": item.get("domains", []),
            "titles": item.get("relevant_theses", [])[:4],
            "record_ids": item.get("evidence", []),
        }
        for item in items
    ]
    prompt = (
        "Write 1-2 concise sentences explaining why each adviser fits the query. "
        "Use only the provided titles, domains, and record ids. Do not add outside studies. "
        "Return only a JSON object keyed by the exact adviser name, with string values.\n\n"
        f"Query: {query or ''}\n"
        f"Advisers: {json.dumps(evidence, ensure_ascii=True)}"
    )

    try:
        response = get_oai().chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=900,
        )
        raw = response.choices[0].message.content or ""
        return parse_reasoning_json(raw, names)
    except Exception:
        return {}


def rank_advisers(records: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    terms = query_terms(query)
    profiles: dict[str, dict[str, Any]] = {}

    for index, record in enumerate(records or []):
        if not isinstance(record, dict):
            continue

        for name, signal_weight in adviser_signals(record):
            clean_name = normalize_name(name)
            if not clean_name:
                continue

            profile = profiles.setdefault(
                clean_name,
                {
                    "score": 0.0,
                    "evidence": [],
                    "domains": [],
                    "relevant_theses": [],
                },
            )
            profile["score"] += adviser_record_score(record, terms, index, signal_weight)
            append_unique(profile["evidence"], normalized_record_id(record))
            append_unique(profile["relevant_theses"], normalized_title(record))

            domain = normalize_name(record.get("domain"))
            append_unique(profile["domains"], domain)

    ranked = sorted(
        profiles.items(),
        key=lambda item: (-float(item[1]["score"]), item[0].lower()),
    )
    response_items = [
        {
            "name": name,
            "alignment_score": round(float(profile["score"]), 3),
            "reasoning": "",
            "evidence": profile["evidence"],
            "domains": sorted(profile["domains"]),
            "relevant_theses": sorted(profile["relevant_theses"]),
        }
        for name, profile in ranked
    ]

    ai_reasonings = build_ai_reasonings(response_items, query)
    for item in response_items:
        name = item["name"]
        item["reasoning"] = ai_reasonings.get(name) or fallback_reasoning(name, item, query)

    return response_items
