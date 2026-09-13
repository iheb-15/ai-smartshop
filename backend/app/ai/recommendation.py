"""
Moteur de recommandation hybride (scikit-learn / numpy, aucun appel LLM) :

  1. Content-based  : similarité cosinus TF-IDF sur nom + description + catégorie
  2. Collaboratif   : similarité item-item calculée sur la matrice implicite utilisateurs × produits
                      (vues, favoris, ajouts panier, achats, avis)
  3. Popularité     : unités vendues (repli « démarrage à froid »)
  4. Affinité       : part des interactions de l'utilisateur dans la catégorie du produit
  5. Contexte       : bonus promotion active

Chaque recommandation personnalisée est accompagnée d'une explication (« Parce que vous avez
acheté … », « Les clients ayant aimé … ont aussi choisi … », …).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Optional

import numpy as np
from sqlalchemy.orm import Session

from .. import models
from ..services.catalog import enrich_products
from ..services.pricing import active_promotions, best_price
from .data import MLData, get_data

WEIGHTS = {"cf": 0.40, "content": 0.30, "affinity": 0.15, "popularity": 0.10, "promo": 0.05}


def _minmax(v: np.ndarray) -> np.ndarray:
    if v.size == 0:
        return v
    lo, hi = float(np.min(v)), float(np.max(v))
    if hi - lo < 1e-12:
        return np.zeros_like(v)
    return (v - lo) / (hi - lo)


def _fetch_products(db: Session, ids: list[int]) -> list[models.Product]:
    if not ids:
        return []
    rows = db.query(models.Product).filter(models.Product.id.in_(ids)).all()
    by_id = {p.id: p for p in rows}
    return [by_id[i] for i in ids if i in by_id]


def _sellable_mask(data: MLData) -> np.ndarray:
    return np.array([bool(p.is_available) and (p.stock or 0) > 0 for p in data.products], dtype=bool)


def _promo_mask(db: Session, data: MLData) -> np.ndarray:
    promos = active_promotions(db)
    flags = np.zeros(data.n_products)
    for i, p in enumerate(data.products):
        price, promo = best_price(p, promos)
        if promo is not None or (p.promo_price is not None and p.promo_price < p.price):
            flags[i] = 1.0
    return flags


# --------------------------------------------------------------------------- produit -> produits
def similar_products(db: Session, product_id: int, top_k: int = 6) -> list[models.Product]:
    """Produits similaires : 60 % contenu (TF-IDF) + 40 % co-interactions (CF)."""
    data = get_data(db)
    idx = data.product_index.get(product_id)
    if idx is None or data.n_products < 2:
        return []
    content = data.content_sim[idx]
    cf = data.item_sim[idx] if data.item_sim.size else np.zeros_like(content)
    same_cat = np.array([1.0 if data.category_of[pid] == data.category_of[product_id] else 0.0 for pid in data.product_ids])
    content_n, cf_n = _minmax(content), _minmax(cf)
    score = 0.55 * content_n + 0.30 * cf_n + 0.15 * same_cat
    mask = _sellable_mask(data)
    mask[idx] = False
    score = np.where(mask & ((content > 0.02) | (cf > 0.02) | (same_cat > 0)), score, -1.0)
    order = [i for i in np.argsort(-score) if score[i] > 0][:top_k]
    products = _fetch_products(db, [data.product_ids[i] for i in order])
    enrich_products(db, products)
    for p, i in zip(products, order):
        p.recommendation_score = round(float(score[i]), 4)
        if 0.55 * content_n[i] >= 0.30 * cf_n[i]:
            p.recommendation_reason = "Caractéristiques proches"
        else:
            p.recommendation_reason = "Souvent consulté ou acheté avec ce produit"
    return products


def frequently_bought_together(db: Session, product_id: int, top_k: int = 4) -> list[models.Product]:
    """Co-occurrence dans les commandes (règles d'association simples : support + lift)."""
    rows = (
        db.query(models.OrderItem.order_id, models.OrderItem.product_id)
        .join(models.Order, models.Order.id == models.OrderItem.order_id)
        .filter(models.Order.status != "CANCELLED")
        .all()
    )
    orders_map: dict[int, set[int]] = defaultdict(set)
    for oid, pid in rows:
        orders_map[oid].add(pid)
    n_orders = len(orders_map) or 1
    support = defaultdict(int)
    for pids in orders_map.values():
        for pid in pids:
            support[pid] += 1
    co = defaultdict(int)
    for pids in orders_map.values():
        if product_id in pids:
            for pid in pids:
                if pid != product_id:
                    co[pid] += 1
    if not co:
        return []
    base = support.get(product_id, 1)
    scored = []
    for pid, cnt in co.items():
        confidence = cnt / base
        lift = confidence / (support[pid] / n_orders)
        scored.append((pid, cnt, confidence, lift))
    scored.sort(key=lambda x: (x[1], x[3]), reverse=True)
    ids = [pid for pid, *_ in scored[: top_k * 2]]
    products = [p for p in _fetch_products(db, ids) if p.is_available and (p.stock or 0) > 0][:top_k]
    enrich_products(db, products)
    stats = {pid: (cnt, conf) for pid, cnt, conf, _ in scored}
    for p in products:
        cnt, conf = stats.get(p.id, (0, 0))
        p.recommendation_score = round(float(conf), 3)
        p.recommendation_reason = f"Acheté ensemble dans {cnt} commande(s)"
    return products


# --------------------------------------------------------------------------- utilisateur -> produits
def _cold_start(db: Session, data: MLData, top_k: int, exclude: set[int]) -> list[models.Product]:
    """Nouveau client : mélange best-sellers, promotions et nouveautés."""
    mask = _sellable_mask(data)
    promo = _promo_mask(db, data)
    pop = _minmax(data.popularity)
    rating = data.avg_rating / 5.0
    recency = np.array([p.created_at.timestamp() if p.created_at else 0.0 for p in data.products])
    recency = _minmax(recency)
    score = 0.45 * pop + 0.2 * rating + 0.2 * promo + 0.15 * recency
    score = np.where(mask, score, -1.0)
    order = [i for i in np.argsort(-score) if score[i] >= 0 and data.product_ids[i] not in exclude][:top_k]
    products = _fetch_products(db, [data.product_ids[i] for i in order])
    enrich_products(db, products)
    for p, i in zip(products, order):
        p.recommendation_score = round(float(score[i]), 4)
        if promo[i] > 0:
            p.recommendation_reason = "En promotion en ce moment"
        elif pop[i] >= 0.5:
            p.recommendation_reason = "Best-seller de la boutique"
        elif rating[i] >= 0.8:
            p.recommendation_reason = "Très bien noté par nos clients"
        else:
            p.recommendation_reason = "Nouveauté"
    return products


def popular_products(db: Session, top_k: int = 8, exclude: Optional[set[int]] = None) -> list[models.Product]:
    """Sélection « démarrage à froid » (visiteurs anonymes / nouveaux clients)."""
    return _cold_start(db, get_data(db), top_k, exclude or set())


def personalized_for_user(db: Session, user_id: int, top_k: int = 8) -> list[models.Product]:
    data = get_data(db)
    if data.n_products == 0:
        return []
    w = data.user_vector(user_id)
    purchased = set(data.purchases.get(user_id, {}).keys())
    if w is None or not w.any():
        return _cold_start(db, data, top_k, purchased)

    total_w = float(w.sum()) or 1.0
    cf_raw = (w @ data.item_sim) / total_w if data.item_sim.size else np.zeros(data.n_products)
    content_raw = (w @ data.content_sim) / total_w

    # affinité catégorie
    cat_weight: dict[Optional[int], float] = defaultdict(float)
    for j, wj in enumerate(w):
        if wj > 0:
            cat_weight[data.category_of[data.product_ids[j]]] += wj
    affinity = np.array([cat_weight.get(data.category_of[pid], 0.0) / total_w for pid in data.product_ids])

    pop = _minmax(data.popularity)
    promo = _promo_mask(db, data)
    cf_n, content_n = _minmax(cf_raw), _minmax(content_raw)

    score = (
        WEIGHTS["cf"] * cf_n
        + WEIGHTS["content"] * content_n
        + WEIGHTS["affinity"] * affinity
        + WEIGHTS["popularity"] * pop
        + WEIGHTS["promo"] * promo
    )
    mask = _sellable_mask(data)
    for pid in purchased:
        mask[data.product_index[pid]] = False
    score = np.where(mask, score, -1.0)
    order = [i for i in np.argsort(-score) if score[i] > 0][:top_k]

    products = _fetch_products(db, [data.product_ids[i] for i in order])
    enrich_products(db, products)
    names = {p.id: p.name for p in data.products}
    for p, i in zip(products, order):
        p.recommendation_score = round(float(score[i]), 4)
        contributions = {
            "cf": WEIGHTS["cf"] * cf_n[i],
            "content": WEIGHTS["content"] * content_n[i],
            "affinity": WEIGHTS["affinity"] * affinity[i],
            "popularity": WEIGHTS["popularity"] * pop[i],
            "promo": WEIGHTS["promo"] * promo[i],
        }
        top = max(contributions, key=contributions.get)
        if top == "cf" and data.item_sim.size:
            j = int(np.argmax(w * data.item_sim[:, i]))
            p.recommendation_reason = f"Les clients ayant aimé « {names[data.product_ids[j]]} » ont aussi choisi ce produit"
        elif top == "content":
            j = int(np.argmax(w * data.content_sim[:, i]))
            verb = "acheté" if data.product_ids[j] in purchased else "consulté"
            p.recommendation_reason = f"Similaire à « {names[data.product_ids[j]]} » que vous avez {verb}"
        elif top == "affinity":
            p.recommendation_reason = f"Dans votre catégorie préférée : {p.category.name if p.category else 'vos favoris'}"
        elif top == "promo":
            p.recommendation_reason = "En promotion dans une catégorie que vous aimez"
        else:
            p.recommendation_reason = "Populaire auprès des clients qui vous ressemblent"
    if len(products) < top_k:
        extra = _cold_start(db, data, top_k - len(products), purchased | {p.id for p in products})
        products.extend(extra)
    return products


# --------------------------------------------------------------------------- statistiques admin
def engine_stats(db: Session) -> dict:
    data = get_data(db)
    n = data.n_products
    if n < 2:
        return {"catalog_coverage": 0.0, "total_catalog_items": n, "frequent_pairs": [], "similarity_matrix_samples": [], "cf_pairs": [], "matrix": {"users": 0, "products": n, "density": 0.0}}
    with_similar = int(np.sum((data.content_sim > 0.15).any(axis=1)))
    samples = []
    for i in np.argsort(-data.content_sim.max(axis=1))[:6]:
        j = int(np.argmax(data.content_sim[i]))
        if data.content_sim[i][j] > 0:
            samples.append({"product": data.products[i].name, "recommended": data.products[j].name, "score": round(float(data.content_sim[i][j]) * 100, 1)})
    cf_pairs = []
    if data.item_sim.any():
        flat = [(i, j, data.item_sim[i][j]) for i in range(n) for j in range(i + 1, n) if data.item_sim[i][j] > 0]
        flat.sort(key=lambda x: x[2], reverse=True)
        cf_pairs = [{"product_a": data.products[i].name, "product_b": data.products[j].name, "score": round(float(s) * 100, 1)} for i, j, s in flat[:6]]

    rows = (
        db.query(models.OrderItem.order_id, models.OrderItem.product_id)
        .join(models.Order, models.Order.id == models.OrderItem.order_id)
        .filter(models.Order.status != "CANCELLED")
        .all()
    )
    orders_map: dict[int, set[int]] = defaultdict(set)
    for oid, pid in rows:
        orders_map[oid].add(pid)
    pair_counter: dict[tuple[int, int], int] = defaultdict(int)
    for pids in orders_map.values():
        lst = sorted(pids)
        for a in range(len(lst)):
            for b in range(a + 1, len(lst)):
                pair_counter[(lst[a], lst[b])] += 1
    names = {p.id: p.name for p in data.products}
    frequent_pairs = [
        {"product_a": names.get(a, f"#{a}"), "product_b": names.get(b, f"#{b}"), "co_orders": c}
        for (a, b), c in sorted(pair_counter.items(), key=lambda x: x[1], reverse=True)[:6]
    ]
    density = float((data.matrix > 0).sum()) / float(max(1, data.matrix.size)) if data.matrix.size else 0.0
    return {
        "catalog_coverage": round(with_similar / n * 100, 1),
        "total_catalog_items": n,
        "frequent_pairs": frequent_pairs,
        "similarity_matrix_samples": samples,
        "cf_pairs": cf_pairs,
        "matrix": {"users": data.n_users, "products": n, "density": round(density * 100, 1), "interactions": int((data.matrix > 0).sum())},
        "weights": WEIGHTS,
    }
