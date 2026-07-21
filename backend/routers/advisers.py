from typing import Any, Callable

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.advisers import rank_advisers

try:
    from services.retrieval import search as retrieval_search
except ImportError:
    retrieval_search = None


router = APIRouter()


class AdviserRequest(BaseModel):
    query: str
    top_k: int | None = Field(default=8, ge=1, le=30)


def normalized_limit(value: int | None) -> int:
    return max(1, min(int(value or 8), 30))


def get_records(query: str, top_k: int) -> list[dict[str, Any]]:
    search: Callable[[str, int], list[dict[str, Any]]] | None = retrieval_search
    if search is not None:
        try:
            return search(query, top_k)
        except Exception:
            return []

    try:
        # Temporary bridge until P2's services.retrieval.search() is mounted.
        from main import semantic_search

        return semantic_search(query, top_k)
    except Exception:
        return []


@router.post("/api/advisers")
def advisers(req: AdviserRequest):
    query = str(req.query or "").strip()
    if not query:
        return {
            "query": query,
            "count": 0,
            "advisers": [],
        }

    records = get_records(query, normalized_limit(req.top_k))
    ranked = rank_advisers(records, query)

    return {
        "query": query,
        "count": len(ranked),
        "advisers": ranked,
    }
