"""ChromaDB helpers for embedding storage and semantic retrieval."""

import os

import chromadb
from dotenv import load_dotenv

load_dotenv()

_CHROMA_PATH = os.getenv("CHROMADB_PATH", "./chroma_store")
_COLLECTION_NAME = "gst_regulations"

_client = None


def _get_collection() -> chromadb.Collection:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=_CHROMA_PATH)
    return _client.get_or_create_collection(
        name=_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def query_knowledge_base(question: str, n_results: int = 3) -> list[str]:
    """
    Return up to n_results relevant GST regulation snippets for the question.
    Returns an empty list if the collection is empty (not yet seeded).
    """
    try:
        collection = _get_collection()
        count = collection.count()
        if count == 0:
            return []
        results = collection.query(
            query_texts=[question],
            n_results=min(n_results, count),
        )
        docs = results.get("documents", [[]])
        return docs[0] if docs else []
    except Exception:
        return []


def add_documents(texts: list[str], ids: list[str], metadatas=None) -> None:
    """Add regulation snippets to the knowledge base."""
    collection = _get_collection()
    collection.upsert(
        documents=texts,
        ids=ids,
        metadatas=metadatas or [{} for _ in texts],
    )
