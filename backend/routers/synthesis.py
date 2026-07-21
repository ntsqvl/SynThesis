from fastapi import APIRouter
from pydantic import BaseModel

from services.synthesis_agent import run_synthesis


router = APIRouter(prefix="/api")


class SynthesisRequest(BaseModel):
    query: str
    top_k: int = 8


@router.post("/synthesis")
def synthesize(request: SynthesisRequest) -> dict:
    return run_synthesis(request.query, request.top_k)
