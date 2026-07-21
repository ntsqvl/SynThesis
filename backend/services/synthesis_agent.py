"""Repository-grounded synthesis agent."""

import json
import os
import re
from pathlib import Path
from typing import Any

from openai import OpenAI

try:
    from services.retrieval import search
except Exception:
    search = None


# DEV FALLBACK — P2's services.retrieval.search takes over automatically once merged.
def _fallback_search(query: str, k: int) -> list[dict]:
    """Return local records with simple case-insensitive keyword ranking."""
    data_path = Path(__file__).resolve().parent.parent / "data" / "synthesis_research_data.json"
    try:
        with data_path.open(encoding="utf-8") as data_file:
            records = json.load(data_file)
    except (OSError, json.JSONDecodeError):
        return []

    query_terms = [term for term in query.casefold().split() if term]

    def score(record: dict) -> int:
        fields = ("title", "abstract", "keywords", "methodology", "domain")
        searchable_text = " ".join(
            " ".join(str(item) for item in value)
            if isinstance(value := record.get(field, ""), list)
            else str(value or "")
            for field in fields
        ).casefold()
        return sum(searchable_text.count(term) for term in query_terms)

    return sorted(records, key=score, reverse=True)[: max(k, 0)]


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None and str(item)]
    return [str(value)] if str(value) else []


def _clean_value(value: Any) -> Any:
    """Keep API responses JSON-safe and avoid null values in the contract."""
    if value is None:
        return ""
    if isinstance(value, list):
        return [_clean_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _clean_value(item) for key, item in value.items()}
    return value


def _cluster_by_domain(records: list[dict]) -> dict[str, list[dict]]:
    clusters: dict[str, list[dict]] = {}
    for record in records:
        domain = str(record.get("domain") or "Unspecified")
        clusters.setdefault(domain, []).append(record)
    return clusters


def _build_context(records: list[dict]) -> str:
    return "\n\n".join(
        "\n".join(
            [
                f"[{index}] Record ID: {record.get('id') or f'record-{index}'}",
                f"Title: {record.get('title') or ''}",
                f"Year: {record.get('year') or ''}",
                f"Type: {record.get('type') or ''}",
                f"Adviser/Mentor: {record.get('adviser') or record.get('mentor') or ''}",
                f"Domain: {record.get('domain') or ''}",
                f"Methodology: {', '.join(_as_list(record.get('methodology')))}",
                f"Abstract: {str(record.get('abstract') or '')[:700]}",
            ]
        )
        for index, record in enumerate(records, start=1)
    )


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Set OPENAI_API_KEY in backend/.env")
    kwargs: dict[str, str] = {"api_key": api_key}
    if base_url := os.getenv("OPENAI_BASE_URL"):
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


def _fallback_result(records: list[dict]) -> dict[str, Any]:
    evidence = [str(record.get("id") or f"record-{index}") for index, record in enumerate(records, start=1)]
    citations = " ".join(f"[{index}]" for index in range(1, min(len(records), 2) + 1))
    synthesis = "## Repository synthesis\n\n"
    synthesis += "AI synthesis is unavailable; review the retrieved repository records directly."
    if citations:
        synthesis += f" {citations}"
    return {
        "synthesis": synthesis,
        "gaps": [{"title": "Coverage requires review", "detail": "The repository context needs manual synthesis.", "evidence": evidence}],
        "suggested_methods": [],
        "suggested_datasets": [],
    }


def _deterministic_gap(records: list[dict]) -> dict[str, Any]:
    """Create a data-grounded gap when the model supplies none."""
    evidence = [str(record.get("id") or f"record-{index}") for index, record in enumerate(records, start=1)]
    if not records:
        return {
            "title": "No retrieved repository evidence",
            "detail": "No repository record matched the query, so the topic needs further coverage.",
            "evidence": [],
        }

    domain_counts = _cluster_by_domain(records)
    primary_domain = next(iter(domain_counts))
    methods = [method for record in records for method in _as_list(record.get("methodology"))]
    if methods:
        most_common_method = max(sorted(set(methods)), key=methods.count)
        detail = f"Retrieved {primary_domain} studies most often use {most_common_method}; alternative methods are not represented in this result set."
    else:
        detail = f"Retrieved {primary_domain} studies do not report a methodology, leaving methodological coverage unclear."
    return {
        "title": "Methodological coverage gap",
        "detail": detail,
        "evidence": evidence,
    }


def _ensure_gaps(gaps: Any, records: list[dict]) -> list[dict]:
    valid_gaps = []
    if isinstance(gaps, list):
        for gap in gaps:
            if isinstance(gap, dict):
                valid_gaps.append(
                    {
                        "title": str(gap.get("title") or ""),
                        "detail": str(gap.get("detail") or ""),
                        "evidence": _as_list(gap.get("evidence")),
                    }
                )
    return valid_gaps or [_deterministic_gap(records)]


def _structured_result(query: str, context: str, model: str) -> dict[str, Any]:
    system_prompt = """You are a repository-grounded research synthesis agent.

Base every claim ONLY on the numbered repository context below. Do not use outside
knowledge or invent studies, findings, methods, or datasets. Cite every factual
claim inline using its matching source number, such as [1] or [2]. Return only a
JSON object with exactly these keys:
- synthesis: Markdown prose with inline [n] citations.
- gaps: an array with at least one object containing title, detail, and evidence
  (an array of repository record IDs).
- suggested_methods: an array of objects containing name, reason, and evidence.
- suggested_datasets: an array of objects containing name, reason, and evidence.

Use only record IDs that appear in the context for every evidence array. If the
context does not support a recommendation, return an empty array for that field.

--- Numbered repository context ---
""" + (context or "No records were retrieved.")

    response = _get_client().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Synthesize this query: " + query},
        ],
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


def _normalise_result(result: Any, records: list[dict]) -> dict[str, Any]:
    fallback = _fallback_result(records)
    if not isinstance(result, dict):
        return fallback
    return {
        "synthesis": str(result.get("synthesis") or fallback["synthesis"]),
        "gaps": _clean_value(result.get("gaps") if isinstance(result.get("gaps"), list) else []),
        "suggested_methods": _clean_value(result.get("suggested_methods") if isinstance(result.get("suggested_methods"), list) else []),
        "suggested_datasets": _clean_value(result.get("suggested_datasets") if isinstance(result.get("suggested_datasets"), list) else []),
    }


def _build_graph(
    query: str,
    records: list[dict],
    clusters: dict[str, list[dict]],
    gaps: list[dict],
    cited_source_indices: set[int],
) -> dict:
    nodes = []
    links = []
    domain_ids = {domain: f"domain-{index}" for index, domain in enumerate(clusters, start=1)}
    record_domains: dict[str, str] = {}
    for domain, domain_id in domain_ids.items():
        nodes.append({"id": domain_id, "label": domain, "type": "cluster", "highlight": False})
    for index, record in enumerate(records, start=1):
        record_id = str(record.get("id") or f"record-{index}")
        domain = str(record.get("domain") or "Unspecified")
        record_domains[record_id] = domain
        nodes.append(
            {
                "id": record_id,
                "label": str(record.get("title") or record_id),
                "type": "thesis",
                "highlight": index - 1 in cited_source_indices,
            }
        )
        links.append({"source": record_id, "target": domain_ids[domain], "type": "belongs_to_domain"})

    method_records: dict[str, list[str]] = {}
    for index, record in enumerate(records, start=1):
        record_id = str(record.get("id") or f"record-{index}")
        for method in _as_list(record.get("methodology")):
            method_records.setdefault(method, []).append(record_id)
    for index, method in enumerate(sorted(method_records), start=1):
        method_id = f"method-{index}"
        nodes.append({"id": method_id, "label": method, "type": "method", "highlight": False})
        for record_id in method_records[method]:
            links.append({"source": record_id, "target": method_id, "type": "uses_method"})

    for index, gap in enumerate(gaps, start=1):
        gap_id = f"gap-{index}"
        nodes.append({"id": gap_id, "label": str(gap.get("title") or gap_id), "type": "gap", "highlight": True})
        evidence = _as_list(gap.get("evidence"))
        relevant_domain = next((record_domains[record_id] for record_id in evidence if record_id in record_domains), None)
        if relevant_domain is None and domain_ids:
            relevant_domain = next(iter(domain_ids))
        if relevant_domain is not None:
            links.append({"source": domain_ids[relevant_domain], "target": gap_id, "type": "has_gap"})
    return {"nodes": nodes, "links": links}


def run_synthesis(query: str, top_k: int = 8) -> dict:
    """Retrieve, cluster, synthesize once with GPT, and assemble the API contract."""
    # Step 1: retrieve repository records in their citation/source order.
    records = (search or _fallback_search)(query, top_k)
    # Step 2: cluster deterministically for the response graph.
    clusters = _cluster_by_domain(records)
    # Step 3: build one numbered context block for model citations.
    context = _build_context(records)
    model = os.getenv("SYNTHESIS_CHAT_MODEL", "gpt-5.6")

    # Step 4: make one structured model call, with a contract-valid fallback.
    try:
        result = _structured_result(query, context, model)
        warning = ""
    except Exception as exc:
        result = _fallback_result(records)
        warning = f"AI synthesis fallback used: {exc.__class__.__name__}"
    result = _normalise_result(result, records)

    # Deterministic post-processing: citation validation and gap guarantees.
    sources = [_clean_value(record) for record in records]
    cited_numbers = {int(number) for number in re.findall(r"\[(\d+)\]", result["synthesis"])}
    invalid_citations = sorted(number for number in cited_numbers if not 1 <= number <= len(sources))
    if invalid_citations:
        citation_warning = "Invalid citation numbers: " + ", ".join(f"[{number}]" for number in invalid_citations)
        warning = f"{warning}; {citation_warning}" if warning else citation_warning
        result["synthesis"] = re.sub(
            r"\[(\d+)\]",
            lambda match: "" if int(match.group(1)) in invalid_citations else match.group(0),
            result["synthesis"],
        )
    cited_source_indices = {number - 1 for number in cited_numbers if 1 <= number <= len(sources)}
    result["gaps"] = _ensure_gaps(result["gaps"], records)

    # Step 5: assemble sources, graph, and model metadata.
    return {
        "query": query,
        "synthesis": result["synthesis"],
        "gaps": result["gaps"],
        "suggested_methods": result["suggested_methods"],
        "suggested_datasets": result["suggested_datasets"],
        "sources": sources,
        "graph": _build_graph(query, records, clusters, result["gaps"], cited_source_indices),
        "meta": {"model": model, "retrieved": len(records), "warning": warning},
    }
