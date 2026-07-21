import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import services.synthesis_agent as synthesis_agent


def test_run_synthesis_returns_contract_when_model_is_unavailable(monkeypatch):
    def unavailable_client():
        raise RuntimeError("No API key configured")

    monkeypatch.setattr(synthesis_agent, "_get_client", unavailable_client)

    response = synthesis_agent.run_synthesis("artificial intelligence", top_k=2)

    assert set(response) == {
        "query",
        "synthesis",
        "gaps",
        "suggested_methods",
        "suggested_datasets",
        "sources",
        "graph",
        "meta",
    }
    assert isinstance(response["sources"], list)
    assert all(1 <= int(number) <= len(response["sources"]) for number in re.findall(r"\[(\d+)\]", response["synthesis"]))
    assert response["gaps"]
    assert any(node["type"] == "gap" for node in response["graph"]["nodes"])
    assert not any(node["type"] == "query" for node in response["graph"]["nodes"])
