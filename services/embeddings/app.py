"""
Hakim embedding service.

Wraps MCINext/Hakim — a Persian-specific text embedding model that outperforms
the multilingual alternatives (multilingual-e5, BGE-m3, GTE, Jina) on the
FaMTEB Persian benchmark — behind a two-endpoint HTTP API.

Deliberately minimal. The contract is `POST /embed -> {"embeddings": [[...]]}`,
so swapping in any other embedding backend means changing EMBEDDINGS_BASE_URL
and nothing else in the application.
"""

import os
from contextlib import asynccontextmanager
from typing import Literal

import torch
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModel, AutoTokenizer

MODEL_NAME = os.environ.get("EMBEDDINGS_MODEL", "MCINext/Hakim")
MAX_LENGTH = int(os.environ.get("EMBEDDINGS_MAX_LENGTH", "512"))
BATCH_SIZE = int(os.environ.get("EMBEDDINGS_BATCH_SIZE", "16"))

# Hakim is asymmetric: queries and passages are prefixed differently, and using
# the wrong prefix measurably degrades retrieval quality.
PREFIXES = {
    "query": "query: ",
    "passage": "passage: ",
}

state: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"loading {MODEL_NAME} on {device} …", flush=True)

    state["tokenizer"] = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModel.from_pretrained(MODEL_NAME)
    model.eval().to(device)
    state["model"] = model
    state["device"] = device
    state["dim"] = int(model.config.hidden_size)

    print(f"ready — {state['dim']} dimensions", flush=True)
    yield
    state.clear()


app = FastAPI(title="Hakim embeddings", lifespan=lifespan)


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=256)
    kind: Literal["query", "passage"] = "passage"


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dim: int


@app.get("/health")
def health():
    if "model" not in state:
        raise HTTPException(status_code=503, detail="model still loading")
    return {"status": "ok", "model": MODEL_NAME, "dim": state["dim"], "device": state["device"]}


def mean_pool(hidden: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """Mean over real tokens only — including padding skews short texts badly."""
    expanded = mask.unsqueeze(-1).expand(hidden.size()).float()
    return (hidden * expanded).sum(1) / expanded.sum(1).clamp(min=1e-9)


@app.post("/embed", response_model=EmbedResponse)
@torch.inference_mode()
def embed(request: EmbedRequest):
    if "model" not in state:
        raise HTTPException(status_code=503, detail="model still loading")

    tokenizer = state["tokenizer"]
    model = state["model"]
    device = state["device"]
    prefix = PREFIXES[request.kind]

    vectors: list[list[float]] = []

    for start in range(0, len(request.texts), BATCH_SIZE):
        batch = [prefix + text for text in request.texts[start : start + BATCH_SIZE]]

        encoded = tokenizer(
            batch,
            padding=True,
            truncation=True,
            max_length=MAX_LENGTH,
            return_tensors="pt",
        ).to(device)

        output = model(**encoded)
        pooled = mean_pool(output.last_hidden_state, encoded["attention_mask"])
        # L2-normalise so cosine distance in pgvector reduces to a dot product.
        pooled = F.normalize(pooled, p=2, dim=1)

        vectors.extend(pooled.cpu().tolist())

    return EmbedResponse(embeddings=vectors, dim=state["dim"])
