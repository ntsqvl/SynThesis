"""Build SynThesis's local semantic-search index.

The source-of-truth remains data/synthesis_research_data.json. This script
embeds a deterministic, retrieval-focused representation of every record and
writes two generated artifacts:

* data/embeddings.json     - one embedding vector per research record
* data/index_manifest.json - build metadata and integrity hashes

Run from the backend directory:
    python build_index.py

Use --dry-run to see what would be embedded without calling an embedding API.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DEFAULT_DATA_PATH = DATA_DIR / "synthesis_research_data.json"
DEFAULT_INDEX_PATH = DATA_DIR / "embeddings.json"
DEFAULT_MANIFEST_PATH = DATA_DIR / "index_manifest.json"

INDEX_SCHEMA_VERSION = 1
RETRIEVAL_TEXT_VERSION = 1
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the local SynThesis embedding index.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH, help="Research-record JSON file.")
    parser.add_argument("--output", type=Path, default=DEFAULT_INDEX_PATH, help="Output embeddings JSON file.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH, help="Output manifest JSON file.")
    parser.add_argument(
        "--model",
        default=os.getenv("SYNTHESIS_EMBED_MODEL") or os.getenv("EMBED_MODEL") or DEFAULT_EMBEDDING_MODEL,
        help="Embedding model name.",
    )
    parser.add_argument("--batch-size", type=int, default=32, help="Records per embedding request (1-128).")
    parser.add_argument("--force", action="store_true", help="Re-embed every record instead of reusing unchanged vectors.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report the build plan without calling the API or writing files.")
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 128:
        parser.error("--batch-size must be between 1 and 128")
    return args


def canonical_json(value: Any) -> str:
    """Return a stable JSON representation for integrity hashing."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256(value: str | bytes) -> str:
    payload = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(payload).hexdigest()


def normalise_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [part.strip() for part in value.replace("|", ",").replace(";", ",").split(",") if part.strip()]
    text = str(value).strip()
    return [text] if text else []


def format_field(label: str, value: Any) -> str | None:
    if value is None or value == "":
        return None
    values = normalise_list(value)
    if not values:
        return None
    return f"{label}: {', '.join(values)}"


def retrieval_text(record: dict[str, Any]) -> str:
    """Create the exact text whose embedding represents one research record.

    The text includes discovery metadata but intentionally excludes source IDs,
    citations, and verification data because they do not describe topic meaning.
    """
    fields = (
        ("Record type", record.get("type")),
        ("Title", record.get("title")),
        ("Authors", record.get("author")),
        ("Mentor", record.get("mentor") or record.get("adviser")),
        ("Program", record.get("program")),
        ("Department", record.get("department")),
        ("Domain", record.get("domain")),
        ("Keywords", record.get("keywords")),
        ("Methodology", record.get("methodology")),
        ("Tools", record.get("tools")),
        ("Datasets", record.get("datasets")),
        ("Abstract", record.get("abstract")),
        ("Publication", record.get("publication")),
    )
    lines = [line for label, value in fields if (line := format_field(label, value))]
    return "\n".join(lines)


def load_records(path: Path) -> list[dict[str, Any]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"Research data file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Research data is not valid JSON: {exc}") from exc

    if not isinstance(raw, list) or not raw:
        raise ValueError("Research data must be a non-empty JSON array.")

    ids: set[str] = set()
    records: list[dict[str, Any]] = []
    for index, record in enumerate(raw, start=1):
        if not isinstance(record, dict):
            raise ValueError(f"Record {index} must be a JSON object.")
        record_id = str(record.get("id") or "").strip()
        title = str(record.get("title") or "").strip()
        abstract = str(record.get("abstract") or "").strip()
        if not record_id:
            raise ValueError(f"Record {index} has no id.")
        if record_id in ids:
            raise ValueError(f"Duplicate research id: {record_id}")
        if not title:
            raise ValueError(f"Record {record_id} has no title.")
        if not abstract:
            raise ValueError(f"Record {record_id} has no abstract to embed.")
        ids.add(record_id)
        records.append(record)
    return records


def load_reusable_vectors(path: Path, model: str) -> dict[str, dict[str, Any]]:
    """Load unchanged vectors from a compatible existing index, if available."""
    if not path.exists():
        return {}
    try:
        index = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(index, dict) or index.get("embedding_model") != model:
        return {}
    items = index.get("items")
    if not isinstance(items, list):
        return {}

    reusable: dict[str, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        record_id = str(item.get("id") or "")
        text_hash = item.get("text_hash")
        embedding = item.get("embedding")
        if record_id and isinstance(text_hash, str) and isinstance(embedding, list) and embedding:
            reusable[record_id] = item
    return reusable


def get_client() -> OpenAI:
    aiml_key = os.getenv("AIMLAPI_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    api_key = aiml_key or openai_key
    if not api_key:
        raise RuntimeError("Set AIMLAPI_KEY or OPENAI_API_KEY in backend/.env before building embeddings.")

    kwargs: dict[str, Any] = {"api_key": api_key}
    if aiml_key:
        kwargs["base_url"] = os.getenv("AIMLAPI_BASE_URL", "https://api.aimlapi.com/v1")
    elif os.getenv("OPENAI_BASE_URL"):
        kwargs["base_url"] = os.getenv("OPENAI_BASE_URL")
    return OpenAI(**kwargs)


def embed_batch(client: OpenAI, model: str, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=model, input=texts)
    ordered = sorted(response.data, key=lambda item: item.index)
    if len(ordered) != len(texts):
        raise RuntimeError(f"Embedding API returned {len(ordered)} vectors for {len(texts)} records.")
    return [[float(value) for value in item.embedding] for item in ordered]


def write_json_atomically(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.tmp")
    temporary_path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(path)


def chunks(items: list[dict[str, str]], batch_size: int) -> list[list[dict[str, str]]]:
    return [items[start : start + batch_size] for start in range(0, len(items), batch_size)]


def main() -> int:
    load_dotenv(BASE_DIR / ".env")
    args = parse_args()

    records = load_records(args.data)
    source_hash = sha256(canonical_json(records))
    reusable = {} if args.force else load_reusable_vectors(args.output, args.model)

    planned_items = [
        {
            "id": str(record["id"]),
            "text": retrieval_text(record),
        }
        for record in records
    ]
    for item in planned_items:
        item["text_hash"] = sha256(item["text"])

    reused: dict[str, list[float]] = {}
    pending: list[dict[str, str]] = []
    for item in planned_items:
        existing = reusable.get(item["id"])
        if existing and existing.get("text_hash") == item["text_hash"]:
            reused[item["id"]] = [float(value) for value in existing["embedding"]]
        else:
            pending.append(item)

    print(f"Records: {len(records)} | unchanged vectors reused: {len(reused)} | vectors to create: {len(pending)}")
    if args.dry_run:
        print("Dry run complete. No embedding API call or file write was made.")
        return 0

    created: dict[str, list[float]] = {}
    if pending:
        client = get_client()
        for batch_number, batch in enumerate(chunks(pending, args.batch_size), start=1):
            print(f"Embedding batch {batch_number} ({len(batch)} records)...")
            vectors = embed_batch(client, args.model, [item["text"] for item in batch])
            created.update({item["id"]: vector for item, vector in zip(batch, vectors, strict=True)})

    vectors = {**reused, **created}
    dimensions = {len(vector) for vector in vectors.values()}
    if len(vectors) != len(records):
        raise RuntimeError("Index build did not produce one vector for every research record.")
    if len(dimensions) != 1:
        raise RuntimeError("Embedding vectors have inconsistent dimensions.")

    dimension = dimensions.pop()
    index = {
        "schema_version": INDEX_SCHEMA_VERSION,
        "embedding_model": args.model,
        "embedding_dimensions": dimension,
        "retrieval_text_version": RETRIEVAL_TEXT_VERSION,
        "source_data_sha256": source_hash,
        "items": [
            {
                "id": item["id"],
                "text_hash": item["text_hash"],
                "embedding": vectors[item["id"]],
            }
            for item in planned_items
        ],
    }
    index_hash = sha256(canonical_json(index))
    manifest = {
        "schema_version": INDEX_SCHEMA_VERSION,
        "built_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "source_data": {
            "path": args.data.name,
            "sha256": source_hash,
            "record_count": len(records),
        },
        "embedding_index": {
            "path": args.output.name,
            "sha256": index_hash,
            "embedding_model": args.model,
            "dimensions": dimension,
            "retrieval_text_version": RETRIEVAL_TEXT_VERSION,
            "reused_vector_count": len(reused),
            "created_vector_count": len(created),
        },
    }

    write_json_atomically(args.output, index)
    write_json_atomically(args.manifest, manifest)
    print(f"Created {args.output} and {args.manifest}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError) as exc:
        print(f"Index build failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
