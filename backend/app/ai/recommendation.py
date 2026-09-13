"""
Moteur de recommandation :
1. Content-based : similarité cosinus sur TF-IDF (nom + description + catégorie)
2. Collaborative-ish : produits fréquemment achetés ensemble (co-occurrence dans les commandes)
Pas d'appel LLM ici : c'est un vrai algorithme de ML classique (scikit-learn),
rapide et adapté à un catalogue de taille modeste.
"""
from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session

from .. import models


def _product_corpus(products):
    texts = []
    for p in products:
        cat_name = p.category.name if p.category else ""
        texts.append(f"{p.name} {p.description} {cat_name}")
    return texts


def similar_products(db: Session, product_id: int, top_k: int = 6):
    products = db.query(models.Product).all()
    if len(products) < 2:
        return []

    texts = _product_corpus(products)
    vectorizer = TfidfVectorizer(stop_words=None)
    matrix = vectorizer.fit_transform(texts)

    ids = [p.id for p in products]
    if product_id not in ids:
        return []
    idx = ids.index(product_id)

    sims = cosine_similarity(matrix[idx], matrix).flatten()
    ranked = sorted(
        [(i, score) for i, score in enumerate(sims) if ids[i] != product_id],
        key=lambda x: x[1],
        reverse=True,
    )
    return [products[i] for i, _ in ranked[:top_k]]


def frequently_bought_together(db: Session, product_id: int, top_k: int = 4):
    order_items = db.query(models.OrderItem).all()
    orders_map = defaultdict(set)
    for oi in order_items:
        orders_map[oi.order_id].add(oi.product_id)

    co_occurrence = defaultdict(int)
    for products_in_order in orders_map.values():
        if product_id in products_in_order:
            for pid in products_in_order:
                if pid != product_id:
                    co_occurrence[pid] += 1

    ranked_ids = sorted(co_occurrence.items(), key=lambda x: x[1], reverse=True)[:top_k]
    if not ranked_ids:
        return []

    ids = [pid for pid, _ in ranked_ids]
    products = db.query(models.Product).filter(models.Product.id.in_(ids)).all()
    products_by_id = {p.id: p for p in products}
    return [products_by_id[i] for i in ids if i in products_by_id]


def personalized_for_user(db: Session, user_id: int, top_k: int = 8):
    """Recommandations basées sur les catégories déjà achetées par l'utilisateur."""
    bought_product_ids = [
        oi.product_id
        for o in db.query(models.Order).filter(models.Order.user_id == user_id).all()
        for oi in o.items
    ]
    if not bought_product_ids:
        # fallback : produits les plus récents
        return db.query(models.Product).order_by(models.Product.created_at.desc()).limit(top_k).all()

    bought_products = db.query(models.Product).filter(models.Product.id.in_(bought_product_ids)).all()
    category_ids = {p.category_id for p in bought_products if p.category_id}

    candidates = (
        db.query(models.Product)
        .filter(models.Product.category_id.in_(category_ids))
        .filter(models.Product.id.notin_(bought_product_ids))
        .limit(top_k)
        .all()
    )
    return candidates
