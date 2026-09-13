"""
Recherche intelligente en langage naturel.
Approche : TF-IDF + similarité cosinus sur le catalogue (rapide, pas de coût API).
Fonctionne bien pour des requêtes comme "petit sac noir pas cher pour voyager".
"""
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session

from .. import models


def semantic_search(db: Session, query: str, top_k: int = 10):
    products = db.query(models.Product).all()
    if not products:
        return []

    texts = [
        f"{p.name} {p.description} {p.category.name if p.category else ''}"
        for p in products
    ]
    vectorizer = TfidfVectorizer(stop_words=None)
    matrix = vectorizer.fit_transform(texts + [query])

    query_vec = matrix[-1]
    product_matrix = matrix[:-1]
    sims = cosine_similarity(query_vec, product_matrix).flatten()

    ranked = sorted(
        [(i, score) for i, score in enumerate(sims) if score > 0],
        key=lambda x: x[1],
        reverse=True,
    )
    return [products[i] for i, _ in ranked[:top_k]]
