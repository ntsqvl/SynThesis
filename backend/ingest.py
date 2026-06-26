# Embeds every abstract and stores vectors in Qdrant.

import json, os
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
from dotenv import load_dotenv

load_dotenv()

openai  = OpenAI(api_key=os.getenv("AIMLAPI_KEY"), base_url="https://api.aimlapi.com/v1")
qdrant  = QdrantClient(host="localhost", port=6333)
COLLECTION  = "theses"
EMBED_MODEL = "text-embedding-3-small"

with open("data/synthesis_research_data.json", encoding="utf-8") as f:
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
    numeric_id = int(thesis["id"].replace("thesis_", "").replace("faculty_", ""))
    points.append(PointStruct(id=numeric_id, vector=vector, payload=thesis))

qdrant.upsert(collection_name=COLLECTION, points=points)
print(f"✓ Ingested {len(points)} theses.")
