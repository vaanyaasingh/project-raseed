"""Knowledge base stub — ChromaDB removed for Cloud Run compatibility."""


def query_knowledge_base(question: str, n_results: int = 3) -> list[str]:
    return []


def add_documents(texts: list[str], ids: list[str], metadatas=None) -> None:
    pass
