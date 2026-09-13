"""
Couche de données partagée par le moteur de recommandation et le modèle de prédiction d'intérêt.

Construit (et met en cache quelques secondes) :
  - la liste des produits + leur texte TF-IDF (similarité de contenu)
  - la matrice implicite utilisateurs × produits pondérée par type d'événement
      view = 1, wishlist = 2, ajout panier = 3, achat = 5, avis (note ≥ 4 : +2, note ≤ 2 : −2)
  - la similarité item-item (filtrage collaboratif) issue de cette matrice
  - la popularité (unités vendues), la note moyenne, les achats par utilisateur
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from .text_utils import tfidf_analyzer

EVENT_WEIGHTS = {"view": 1.0, "wishlist_add": 2.0, "add_to_cart": 3.0}
PURCHASE_WEIGHT = 5.0
CACHE_TTL_SECONDS = 30


@dataclass
class MLData:
    products: list[models.Product]
    product_ids: list[int]
    product_index: dict[int, int]
    user_ids: list[int]
    user_index: dict[int, int]
    matrix: np.ndarray  # users × products (poids implicites)
    content_sim: np.ndarray  # products × products
    item_sim: np.ndarray  # products × products (CF)
    popularity: np.ndarray  # unités vendues par produit
    avg_rating: np.ndarray
    n_reviews: np.ndarray
    purchases: dict[int, dict[int, int]]  # user_id -> {product_id: qty}
    views: dict[int, dict[int, int]] = field(default_factory=dict)
    cart_adds: dict[int, dict[int, int]] = field(default_factory=dict)
    wishlist: dict[int, set[int]] = field(default_factory=dict)
    category_of: dict[int, Optional[int]] = field(default_factory=dict)
    built_at: float = 0.0
    signature: tuple = ()

    @property
    def n_users(self) -> int:
        return len(self.user_ids)

    @property
    def n_products(self) -> int:
        return len(self.product_ids)

    def user_vector(self, user_id: int) -> Optional[np.ndarray]:
        idx = self.user_index.get(user_id)
        if idx is None:
            return None
        return self.matrix[idx]


_cache: dict[str, Optional[MLData]] = {"data": None}


def _signature(db: Session) -> tuple:
    return (
        db.query(func.count(models.Product.id)).scalar() or 0,
        db.query(func.max(models.Product.id)).scalar() or 0,
        db.query(func.count(models.Interaction.id)).scalar() or 0,
        db.query(func.count(models.OrderItem.id)).scalar() or 0,
        db.query(func.count(models.Review.id)).scalar() or 0,
        db.query(func.count(models.WishlistItem.id)).scalar() or 0,
    )


def invalidate() -> None:
    _cache["data"] = None


def product_text(p: models.Product) -> str:
    cat = p.category.name if p.category else ""
    return f"{p.name} {p.name} {p.description or ''} {cat}"


def build(db: Session) -> MLData:
    products = db.query(models.Product).order_by(models.Product.id.asc()).all()
    product_ids = [p.id for p in products]
    product_index = {pid: i for i, pid in enumerate(product_ids)}
    n_products = len(products)

    # --- contenu
    if n_products >= 1:
        vec = TfidfVectorizer(analyzer=tfidf_analyzer, sublinear_tf=True)
        tfidf = vec.fit_transform([product_text(p) for p in products])
        content_sim = cosine_similarity(tfidf, tfidf)
        np.fill_diagonal(content_sim, 0.0)
    else:
        content_sim = np.zeros((0, 0))

    # --- achats (commandes non annulées)
    purchases: dict[int, dict[int, int]] = {}
    rows = (
        db.query(models.Order.user_id, models.OrderItem.product_id, func.sum(models.OrderItem.quantity))
        .join(models.OrderItem, models.OrderItem.order_id == models.Order.id)
        .filter(models.Order.status != "CANCELLED")
        .group_by(models.Order.user_id, models.OrderItem.product_id)
        .all()
    )
    for uid, pid, qty in rows:
        if uid is None or pid not in product_index:
            continue
        purchases.setdefault(uid, {})[pid] = int(qty or 0)

    # --- événements
    views: dict[int, dict[int, int]] = {}
    cart_adds: dict[int, dict[int, int]] = {}
    wishlist: dict[int, set[int]] = {}
    ev_rows = (
        db.query(models.Interaction.user_id, models.Interaction.product_id, models.Interaction.event_type, func.count(models.Interaction.id))
        .filter(models.Interaction.user_id != None, models.Interaction.product_id != None)  # noqa: E711
        .filter(models.Interaction.event_type.in_(list(EVENT_WEIGHTS.keys())))
        .group_by(models.Interaction.user_id, models.Interaction.product_id, models.Interaction.event_type)
        .all()
    )
    for uid, pid, etype, cnt in ev_rows:
        if pid not in product_index:
            continue
        if etype == "view":
            views.setdefault(uid, {})[pid] = int(cnt)
        elif etype == "add_to_cart":
            cart_adds.setdefault(uid, {})[pid] = int(cnt)
        elif etype == "wishlist_add":
            wishlist.setdefault(uid, set()).add(pid)
    for uid, pid in db.query(models.WishlistItem.user_id, models.WishlistItem.product_id).all():
        if pid in product_index:
            wishlist.setdefault(uid, set()).add(pid)

    # --- avis
    review_rows = db.query(models.Review.user_id, models.Review.product_id, models.Review.rating).all()
    agg = db.query(models.Review.product_id, func.avg(models.Review.rating), func.count(models.Review.id)).group_by(models.Review.product_id).all()
    avg_rating = np.zeros(n_products)
    n_reviews = np.zeros(n_products)
    for pid, avg, cnt in agg:
        if pid in product_index:
            avg_rating[product_index[pid]] = float(avg or 0)
            n_reviews[product_index[pid]] = int(cnt or 0)

    # --- matrice implicite
    user_ids = sorted(set(purchases) | set(views) | set(cart_adds) | set(wishlist) | {uid for uid, _, _ in review_rows if uid is not None})
    user_index = {uid: i for i, uid in enumerate(user_ids)}
    matrix = np.zeros((len(user_ids), n_products))
    for uid, items in purchases.items():
        for pid, qty in items.items():
            matrix[user_index[uid], product_index[pid]] += PURCHASE_WEIGHT * min(qty, 3)
    for uid, items in views.items():
        for pid, cnt in items.items():
            matrix[user_index[uid], product_index[pid]] += EVENT_WEIGHTS["view"] * min(cnt, 5)
    for uid, items in cart_adds.items():
        for pid, cnt in items.items():
            matrix[user_index[uid], product_index[pid]] += EVENT_WEIGHTS["add_to_cart"] * min(cnt, 3)
    for uid, pids in wishlist.items():
        for pid in pids:
            matrix[user_index[uid], product_index[pid]] += EVENT_WEIGHTS["wishlist_add"]
    for uid, pid, rating in review_rows:
        if uid in user_index and pid in product_index:
            if (rating or 0) >= 4:
                matrix[user_index[uid], product_index[pid]] += 2.0
            elif (rating or 0) <= 2:
                matrix[user_index[uid], product_index[pid]] = max(0.0, matrix[user_index[uid], product_index[pid]] - 2.0)

    # --- similarité item-item (CF) avec rétrécissement : une similarité portée par un seul client
    #     est atténuée (support / (support + 2)) pour limiter le bruit sur de petits volumes
    if matrix.shape[0] >= 1 and n_products >= 2 and matrix.any():
        item_sim = cosine_similarity(matrix.T)
        binary = (matrix > 0).astype(float)
        support = binary.T @ binary  # nb de clients ayant interagi avec les deux produits
        item_sim = item_sim * (support / (support + 2.0))
        np.fill_diagonal(item_sim, 0.0)
    else:
        item_sim = np.zeros((n_products, n_products))

    # --- popularité
    popularity = np.zeros(n_products)
    for items in purchases.values():
        for pid, qty in items.items():
            popularity[product_index[pid]] += qty

    data = MLData(
        products=products,
        product_ids=product_ids,
        product_index=product_index,
        user_ids=user_ids,
        user_index=user_index,
        matrix=matrix,
        content_sim=content_sim,
        item_sim=item_sim,
        popularity=popularity,
        avg_rating=avg_rating,
        n_reviews=n_reviews,
        purchases=purchases,
        views=views,
        cart_adds=cart_adds,
        wishlist=wishlist,
        category_of={p.id: p.category_id for p in products},
        built_at=time.time(),
        signature=_signature(db),
    )
    return data


def get_data(db: Session, force: bool = False) -> MLData:
    cached = _cache.get("data")
    if not force and cached is not None and (time.time() - cached.built_at) < CACHE_TTL_SECONDS:
        return cached
    if not force and cached is not None and cached.signature == _signature(db):
        cached.built_at = time.time()
        return cached
    data = build(db)
    _cache["data"] = data
    return data
