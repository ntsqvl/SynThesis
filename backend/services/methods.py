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


def normalized_record_id(record: dict[str, Any]) -> str:
    return str(record.get("id") or "").strip()


def normalized_title(record: dict[str, Any]) -> str:
    return str(record.get("title") or "Untitled record").strip() or "Untitled record"


def normalized_domain(record: dict[str, Any]) -> str:
    return str(record.get("domain") or "").strip()


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


def item_term_score(name: str, terms: list[str]) -> float:
    if not terms:
        return 0.0

    lowered = name.lower()
    score = 0.0
    for term in terms:
        if term == lowered:
            score += 4.0
        elif term in lowered:
            score += 3.0
    return min(score / max(len(terms), 1), 5.0)


def record_rank_weight(index: int) -> float:
    return max(0.45, 1.0 - (index * 0.035))


def append_unique(values: list[str], value: str) -> None:
    if value and value not in values:
        values.append(value)


def distinct_items(value: Any) -> list[str]:
    items: dict[str, str] = {}
    for item in as_list(value):
        key = item.lower()
        if key not in items:
            items[key] = item
    return sorted(items.values(), key=lambda item: item.lower())


def item_record_score(name: str, record: dict[str, Any], terms: list[str], index: int) -> float:
    return (
        0.9 * record_rank_weight(index)
        + 0.55 * weighted_term_score(record, terms)
        + 2.4 * item_term_score(name, terms)
    )


def collect_category(records: list[dict[str, Any]], field: str, terms: list[str]) -> list[dict[str, Any]]:
    profiles: dict[str, dict[str, Any]] = {}

    for index, record in enumerate(records or []):
        if not isinstance(record, dict):
            continue

        for item in distinct_items(record.get(field)):
            key = item.lower()
            profile = profiles.setdefault(
                key,
                {
                    "name": item,
                    "frequency": 0,
                    "score": 0.0,
                    "evidence": [],
                    "titles": [],
                    "domains": [],
                },
            )
            profile["frequency"] += 1
            profile["score"] += item_record_score(item, record, terms, index)
            append_unique(profile["evidence"], normalized_record_id(record))
            append_unique(profile["titles"], normalized_title(record))
            append_unique(profile["domains"], normalized_domain(record))

    ranked = sorted(
        profiles.values(),
        key=lambda item: (-float(item["score"]), str(item["name"]).lower()),
    )
    return [
        {
            "name": str(item["name"]),
            "frequency": int(item["frequency"]),
            "reasoning": "",
            "evidence": item["evidence"],
            "_titles": sorted(item["titles"]),
            "_domains": sorted(item["domains"]),
        }
        for item in ranked
    ]


def fallback_reasoning(item: dict[str, Any], query: str, category: str) -> str:
    name = str(item.get("name") or "")
    titles = item.get("_titles", [])
    domains = item.get("_domains", [])
    topic = str(query or "").strip() or "this topic"

    if titles and domains:
        return (
            f"{name} fits {topic} because retrieved {category} evidence in {', '.join(domains[:3])} "
            f"used it, including {titles[0]}."
        )
    if titles:
        return f"{name} fits {topic} because retrieved work used it, including {titles[0]}."
    if domains:
        return f"{name} fits {topic} because retrieved work in {', '.join(domains[:3])} used it."
    return ""


def parse_reasoning_json(raw: str, keys: list[str]) -> dict[str, str]:
    cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        return {}
    return {
        key: str(parsed.get(key) or "").strip()
        for key in keys
        if str(parsed.get(key) or "").strip()
    }


def reasoning_key(category: str, name: str) -> str:
    return f"{category}:{name}"


def build_ai_reasonings(categories: dict[str, list[dict[str, Any]]], query: str) -> dict[str, str]:
    evidence: list[dict[str, Any]] = []
    keys: list[str] = []
    for category, items in categories.items():
        for item in items:
            key = reasoning_key(category, str(item.get("name") or ""))
            keys.append(key)
            evidence.append({
                "key": key,
                "category": category,
                "name": item.get("name", ""),
                "frequency": item.get("frequency", 0),
                "titles": item.get("_titles", [])[:4],
                "domains": item.get("_domains", []),
                "record_ids": item.get("evidence", []),
            })

    if not evidence:
        return {}

    prompt = (
        "Write 1-2 concise sentences explaining why each recommendation fits the query. "
        "Use only the provided titles, domains, and record ids. Do not add outside studies or items. "
        "Return only a JSON object keyed by each exact key value, with string values.\n\n"
        f"Query: {query or ''}\n"
        f"Recommendations: {json.dumps(evidence, ensure_ascii=True)}"
    )

    try:
        response = get_oai().chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
        )
        raw = response.choices[0].message.content or ""
        return parse_reasoning_json(raw, keys)
    except Exception:
        return {}


def public_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "name": item.get("name", ""),
            "frequency": item.get("frequency", 0),
            "reasoning": item.get("reasoning", ""),
            "evidence": item.get("evidence", []),
        }
        for item in items
    ]


def recommend_methods(records: list[dict[str, Any]], query: str) -> dict[str, list[dict[str, Any]]]:
    terms = query_terms(query)
    categories = {
        "methodology": collect_category(records, "methodology", terms),
        "tools": collect_category(records, "tools", terms),
        "datasets": collect_category(records, "datasets", terms),
    }

    ai_reasonings = build_ai_reasonings(categories, query)
    for category, items in categories.items():
        for item in items:
            name = str(item.get("name") or "")
            key = reasoning_key(category, name)
            item["reasoning"] = ai_reasonings.get(key) or fallback_reasoning(item, query, category)

    return {
        "methodology": public_items(categories["methodology"]),
        "tools": public_items(categories["tools"]),
        "datasets": public_items(categories["datasets"]),
    }
