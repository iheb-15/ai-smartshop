"""
Prédiction des produits susceptibles d'intéresser un client.

Formulation temporelle (évite la fuite d'information entre variables et étiquette) :
  - Chaque commande historique d'un client est un « instant de prédiction » T.
  - Les variables d'une paire (client, produit) sont calculées UNIQUEMENT à partir de ce que la
    plateforme savait avant T : vues, favoris, achats précédents, affinité de catégorie, budget
    habituel, popularité du produit chez les autres clients avant T, similarité de contenu avec
    les produits déjà appréciés, score collaboratif.
  - L'étiquette vaut 1 si le produit figure dans la commande passée en T, 0 sinon.
  - En production (T = maintenant), on applique le modèle aux produits non achetés et hors panier
    du client pour obtenir une probabilité d'intérêt, accompagnée d'explications lisibles.

Modèle : GradientBoosting (données suffisantes) ou régression logistique (données modestes),
évalué par validation croisée stratifiée (AUC ROC, balanced accuracy). En dessous d'un seuil
minimal de données, un score heuristique (sigmoïde pondérée) prend le relais : le service ne
tombe jamais.
"""
from __future__ import annotations

import bisect
import logging
import math
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from .. import models
from ..services.catalog import enrich_products
from ..services.pricing import active_promotions, best_price
from .data import MLData, get_data

logger = logging.getLogger(__name__)

FEATURES = [
    "views",
    "wishlist",
    "category_affinity",
    "price_ratio",
    "popularity",
    "avg_rating",
    "content_sim",
    "cf_score",
    "recency",
]
FEATURE_LABELS = {
    "views": "Consultations du produit",
    "wishlist": "Présence dans les favoris",
    "category_affinity": "Affinité avec la catégorie",
    "price_ratio": "Rapport au budget habituel",
    "popularity": "Popularité (ventes des autres clients)",
    "avg_rating": "Note moyenne",
    "content_sim": "Similarité de contenu",
    "cf_score": "Score collaboratif",
    "recency": "Activité récente sur la catégorie",
}
# views, wishlist, affinity, price_ratio (pénalisé à part), popularity, rating, content, cf, recency
HEURISTIC_WEIGHTS = np.array([1.3, 1.2, 2.0, 0.0, 0.6, 0.4, 1.6, 1.6, 0.8])
HEURISTIC_BIAS = -2.4
VIEW_W, WISH_W, BUY_W = 1.0, 2.0, 5.0


@dataclass
class ModelBundle:
    model: Optional[Pipeline]
    mode: str  # ml | heuristic
    model_type: str
    trained_at: datetime
    n_samples: int = 0
    n_positives: int = 0
    n_users: int = 0
    n_products: int = 0
    n_orders: int = 0
    metrics: dict = field(default_factory=dict)
    feature_importances: list = field(default_factory=list)
    signature: tuple = ()
    built_at: float = 0.0


_bundle: dict[str, Optional[ModelBundle]] = {"bundle": None}


# --------------------------------------------------------------------------- événements bruts
@dataclass
class _Timeline:
    """Événements datés par client + index global des achats (pour la popularité « avant T »)."""

    views: dict[int, list[tuple[datetime, int]]]
    wishes: dict[int, list[tuple[datetime, int]]]
    purchases: dict[int, list[tuple[datetime, int, int, int]]]  # user -> [(ts, product_id, qty, order_id)]
    purchase_ts_by_product: dict[int, list[datetime]]  # product -> horodatages triés (tous clients)
    cart_products: dict[int, set[int]]  # produits actuellement dans le panier


def _load_timeline(db: Session, data: MLData) -> _Timeline:
    views: dict[int, list] = defaultdict(list)
    wishes: dict[int, list] = defaultdict(list)
    for uid, pid, etype, ts in (
        db.query(models.Interaction.user_id, models.Interaction.product_id, models.Interaction.event_type, models.Interaction.created_at)
        .filter(models.Interaction.user_id != None, models.Interaction.product_id != None)  # noqa: E711
        .filter(models.Interaction.event_type.in_(["view", "wishlist_add"]))
        .all()
    ):
        if pid not in data.product_index or ts is None:
            continue
        (views if etype == "view" else wishes)[uid].append((ts, pid))
    purchases: dict[int, list] = defaultdict(list)
    by_product: dict[int, list] = defaultdict(list)
    for uid, pid, qty, ts, oid in (
        db.query(models.Order.user_id, models.OrderItem.product_id, models.OrderItem.quantity, models.Order.created_at, models.Order.id)
        .join(models.OrderItem, models.OrderItem.order_id == models.Order.id)
        .filter(models.Order.status != "CANCELLED")
        .all()
    ):
        if uid is None or pid not in data.product_index or ts is None:
            continue
        purchases[uid].append((ts, pid, int(qty or 1), oid))
        by_product[pid].append(ts)
    for lst in list(views.values()) + list(wishes.values()) + list(purchases.values()):
        lst.sort(key=lambda x: x[0])
    for lst in by_product.values():
        lst.sort()
    carts: dict[int, set[int]] = defaultdict(set)
    for uid, pid in db.query(models.CartItem.user_id, models.CartItem.product_id).all():
        carts[uid].add(pid)
    return _Timeline(views=views, wishes=wishes, purchases=purchases, purchase_ts_by_product=by_product, cart_products=carts)


class _Snapshot:
    """État de connaissance d'un client à l'instant `cutoff` (exclu)."""

    def __init__(self, data: MLData, tl: _Timeline, user_id: int, cutoff: datetime, global_avg_price: float):
        self.user_id = user_id
        self.cutoff = cutoff
        self.views: dict[int, int] = defaultdict(int)
        self.wishlist: set[int] = set()
        self.bought: dict[int, int] = defaultdict(int)
        self.last_cat_activity: dict[Optional[int], datetime] = {}
        for ts, pid in tl.views.get(user_id, []):
            if ts < cutoff:
                self.views[pid] += 1
                self._touch(data, pid, ts)
        for ts, pid in tl.wishes.get(user_id, []):
            if ts < cutoff:
                self.wishlist.add(pid)
                self._touch(data, pid, ts)
        for ts, pid, qty, _ in tl.purchases.get(user_id, []):
            if ts < cutoff:
                self.bought[pid] += qty
                self._touch(data, pid, ts)
        # vecteur implicite « avant T » (même pondération que le moteur de recommandation)
        self.w = np.zeros(data.n_products)
        for pid, c in self.views.items():
            self.w[data.product_index[pid]] += VIEW_W * min(c, 5)
        for pid in self.wishlist:
            self.w[data.product_index[pid]] += WISH_W
        for pid, q in self.bought.items():
            self.w[data.product_index[pid]] += BUY_W * min(q, 3)
        self.total = float(self.w.sum())
        self.cat_weight: dict[Optional[int], float] = defaultdict(float)
        price_sum = 0.0
        for j in np.nonzero(self.w)[0]:
            pid = data.product_ids[int(j)]
            self.cat_weight[data.category_of[pid]] += float(self.w[j])
            price_sum += float(self.w[j]) * float(data.products[int(j)].price or 0.0)
        self.avg_price = price_sum / self.total if self.total > 0 else global_avg_price

    def _touch(self, data: MLData, pid: int, ts: datetime) -> None:
        cat = data.category_of[pid]
        if cat not in self.last_cat_activity or ts > self.last_cat_activity[cat]:
            self.last_cat_activity[cat] = ts

    def is_empty(self) -> bool:
        return self.total <= 0


def _popularity_before(tl: _Timeline, pid: int, cutoff: datetime, own: int) -> float:
    ts_list = tl.purchase_ts_by_product.get(pid, [])
    count = bisect.bisect_left(ts_list, cutoff) - own
    return math.log1p(max(0, count))


def _features(data: MLData, tl: _Timeline, snap: _Snapshot, i: int) -> np.ndarray:
    pid = data.product_ids[i]
    p = data.products[i]
    cat = data.category_of[pid]
    affinity = snap.cat_weight.get(cat, 0.0) / snap.total if snap.total > 0 else 0.0
    price_ratio = float(p.price or 0.0) / snap.avg_price if snap.avg_price > 0 else 1.0
    price_ratio = min(max(price_ratio, 0.0), 3.0)
    if snap.total > 0:
        content_sim = float(np.max(np.where(snap.w > 0, data.content_sim[i], 0.0)))
        cf_score = float(snap.w @ data.item_sim[:, i] / snap.total) if data.item_sim.size else 0.0
    else:
        content_sim, cf_score = 0.0, 0.0
    last = snap.last_cat_activity.get(cat)
    recency = math.exp(-((snap.cutoff - last).total_seconds() / 86400.0) / 14.0) if last else 0.0
    return np.array(
        [
            math.log1p(snap.views.get(pid, 0)),
            1.0 if pid in snap.wishlist else 0.0,
            affinity,
            price_ratio,
            _popularity_before(tl, pid, snap.cutoff, snap.bought.get(pid, 0)),
            float(data.avg_rating[i]) / 5.0,
            content_sim,
            cf_score,
            recency,
        ]
    )


def _global_avg_price(data: MLData) -> float:
    prices = [float(p.price or 0.0) for p in data.products if p.price]
    return float(np.mean(prices)) if prices else 1.0


def _heuristic_proba(X: np.ndarray) -> np.ndarray:
    price_penalty = 0.8 * np.abs(X[:, 3] - 1.0)
    z = X @ HEURISTIC_WEIGHTS + HEURISTIC_BIAS - price_penalty
    return 1.0 / (1.0 + np.exp(-z))


# --------------------------------------------------------------------------- entraînement
def _build_training_set(data: MLData, tl: _Timeline) -> tuple[np.ndarray, np.ndarray, int, int]:
    gap = _global_avg_price(data)
    X_rows, y_rows = [], []
    n_orders = 0
    users = set()
    for uid, purchases in tl.purchases.items():
        by_order: dict[int, tuple[datetime, set[int]]] = {}
        for ts, pid, _, oid in purchases:
            by_order.setdefault(oid, (ts, set()))[1].add(pid)
        for oid, (ts, basket) in sorted(by_order.items(), key=lambda x: x[1][0]):
            snap = _Snapshot(data, tl, uid, ts, gap)
            if snap.is_empty():
                continue  # aucune information avant la première action : pas exploitable
            n_orders += 1
            users.add(uid)
            for i in range(data.n_products):
                pid = data.product_ids[i]
                if pid in snap.bought:
                    continue  # déjà acheté avant T : hors périmètre (réachat non modélisé)
                X_rows.append(_features(data, tl, snap, i))
                y_rows.append(1 if pid in basket else 0)
    X = np.array(X_rows) if X_rows else np.zeros((0, len(FEATURES)))
    y = np.array(y_rows, dtype=int) if y_rows else np.zeros(0, dtype=int)
    return X, y, n_orders, len(users)


def train(db: Session, force: bool = False) -> ModelBundle:
    data = get_data(db, force=force)
    cached = _bundle.get("bundle")
    if not force and cached is not None and cached.signature == data.signature:
        return cached

    tl = _load_timeline(db, data)
    X, y, n_orders, n_users = _build_training_set(data, tl)
    n_pos = int(y.sum()) if y.size else 0
    n_neg = int(len(y) - n_pos)

    bundle = ModelBundle(
        model=None,
        mode="heuristic",
        model_type="Score heuristique (sigmoïde pondérée)",
        trained_at=datetime.utcnow(),
        n_samples=int(len(y)),
        n_positives=n_pos,
        n_users=n_users,
        n_products=data.n_products,
        n_orders=n_orders,
        signature=data.signature,
        built_at=time.time(),
    )

    if n_pos >= 5 and n_neg >= 5:
        use_gb = len(y) >= 300 and n_pos >= 20
        if use_gb:
            clf = GradientBoostingClassifier(n_estimators=120, max_depth=2, learning_rate=0.05, subsample=0.9, min_samples_leaf=5, random_state=42)
            model_type = "Gradient Boosting (scikit-learn)"
        else:
            clf = LogisticRegression(class_weight="balanced", C=1.0, max_iter=1000)
            model_type = "Régression logistique (scikit-learn)"
        pipeline = Pipeline([("scaler", StandardScaler()), ("clf", clf)])
        metrics: dict = {}
        try:
            n_splits = int(min(5, max(2, min(n_pos, n_neg))))
            cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
            auc = cross_val_score(pipeline, X, y, cv=cv, scoring="roc_auc")
            acc = cross_val_score(pipeline, X, y, cv=cv, scoring="balanced_accuracy")
            ap = cross_val_score(pipeline, X, y, cv=cv, scoring="average_precision")
            metrics = {
                "cv_folds": n_splits,
                "roc_auc": round(float(np.mean(auc)), 3),
                "roc_auc_std": round(float(np.std(auc)), 3),
                "balanced_accuracy": round(float(np.mean(acc)), 3),
                "average_precision": round(float(np.mean(ap)), 3),
            }
        except Exception as exc:  # trop peu de données pour la validation croisée
            logger.info("Validation croisée impossible : %s", exc)
            metrics = {"note": "Validation croisée non disponible (données insuffisantes)"}
        pipeline.fit(X, y)
        metrics["positive_rate"] = round(n_pos / len(y), 3)
        importances = []
        clf_fitted = pipeline.named_steps["clf"]
        if hasattr(clf_fitted, "feature_importances_"):
            for name, val in zip(FEATURES, clf_fitted.feature_importances_):
                importances.append({"feature": name, "label": FEATURE_LABELS[name], "importance": round(float(val), 4), "direction": "+"})
        elif hasattr(clf_fitted, "coef_"):
            coef = clf_fitted.coef_[0]
            total = float(np.sum(np.abs(coef))) or 1.0
            for name, val in zip(FEATURES, coef):
                importances.append({"feature": name, "label": FEATURE_LABELS[name], "importance": round(abs(float(val)) / total, 4), "direction": "+" if val >= 0 else "−", "coefficient": round(float(val), 4)})
        importances.sort(key=lambda d: d["importance"], reverse=True)
        bundle.model = pipeline
        bundle.mode = "ml"
        bundle.model_type = model_type
        bundle.metrics = metrics
        bundle.feature_importances = importances
    else:
        bundle.metrics = {"note": f"Modèle supervisé non entraîné : {n_pos} exemple(s) positif(s) — minimum 5. Le score heuristique est utilisé."}
        total = float(np.sum(np.abs(HEURISTIC_WEIGHTS))) or 1.0
        bundle.feature_importances = sorted(
            ({"feature": name, "label": FEATURE_LABELS[name], "importance": round(abs(float(wv)) / total, 4), "direction": "+"} for name, wv in zip(FEATURES, HEURISTIC_WEIGHTS)),
            key=lambda d: d["importance"],
            reverse=True,
        )

    _bundle["bundle"] = bundle
    return bundle


def model_info(db: Session) -> dict:
    b = train(db)
    return {
        "model_type": b.model_type,
        "mode": b.mode,
        "trained_at": b.trained_at,
        "n_samples": b.n_samples,
        "n_positives": b.n_positives,
        "n_users": b.n_users,
        "n_products": b.n_products,
        "n_orders": b.n_orders,
        "metrics": b.metrics,
        "feature_importances": b.feature_importances,
        "features": FEATURES,
        "method": "Paires (client, produit) construites à chaque commande historique T avec des variables calculées uniquement avant T ; étiquette = produit acheté en T.",
    }


# --------------------------------------------------------------------------- prédiction
def _reasons(x: np.ndarray, views: int, category_name: Optional[str], promo: bool) -> list[str]:
    reasons: list[tuple[float, str]] = []
    if x[1] > 0:
        reasons.append((2.5, "Dans vos favoris"))
    if views > 0:
        reasons.append((2.0, f"Consulté {views} fois" if views > 1 else "Récemment consulté"))
    if x[2] >= 0.25:
        reasons.append((1.8, f"{int(round(x[2] * 100))}% de votre activité concerne {category_name or 'cette catégorie'}"))
    if x[6] >= 0.2:
        reasons.append((1.5, "Proche de produits que vous appréciez"))
    if x[7] >= 0.15:
        reasons.append((1.4, "Apprécié par des clients au profil similaire"))
    if x[8] >= 0.5:
        reasons.append((1.1, "Vous vous intéressez à cette catégorie ces derniers jours"))
    if promo:
        reasons.append((1.0, "En promotion actuellement"))
    if 0.7 <= x[3] <= 1.3:
        reasons.append((0.8, "Dans votre gamme de prix habituelle"))
    if x[4] >= math.log1p(3):
        reasons.append((0.7, "Best-seller de la boutique"))
    if x[5] >= 0.8:
        reasons.append((0.6, "Très bien noté"))
    reasons.sort(key=lambda r: r[0], reverse=True)
    return [r for _, r in reasons[:3]] or ["Correspond à vos centres d'intérêt"]


def predict_for_user(db: Session, user_id: int, top_k: int = 8, exclude_purchased: bool = True) -> list[dict]:
    bundle = train(db)
    data = get_data(db)
    if data.n_products == 0:
        return []
    tl = _load_timeline(db, data)
    snap = _Snapshot(data, tl, user_id, datetime.utcnow(), _global_avg_price(data))
    in_cart = tl.cart_products.get(user_id, set())
    promos = active_promotions(db)
    candidates = []
    for i, p in enumerate(data.products):
        if not p.is_available or (p.stock or 0) <= 0:
            continue
        pid = data.product_ids[i]
        if pid in in_cart or (exclude_purchased and pid in snap.bought):
            continue
        candidates.append(i)
    if not candidates:
        return []
    X = np.array([_features(data, tl, snap, i) for i in candidates])
    proba = bundle.model.predict_proba(X)[:, 1] if bundle.model is not None else _heuristic_proba(X)
    order = np.argsort(-proba)[:top_k]
    ids = [data.product_ids[candidates[k]] for k in order]
    rows = db.query(models.Product).filter(models.Product.id.in_(ids)).all()
    by_id = {p.id: p for p in rows}
    products = [by_id[i] for i in ids if i in by_id]
    enrich_products(db, products)
    results = []
    for p, k in zip(products, order):
        pid = data.product_ids[candidates[k]]
        _, promo = best_price(p, promos)
        reasons = _reasons(X[k], snap.views.get(pid, 0), p.category.name if p.category else None, promo is not None or (p.promo_price is not None and p.promo_price < p.price))
        p.interest_probability = round(float(proba[k]), 4)
        p.interest_reasons = reasons
        results.append({"product": p, "probability": round(float(proba[k]), 4), "reasons": reasons})
    return results


def predictions_overview(db: Session, top_customers: int = 15, per_customer: int = 3) -> list[dict]:
    """Pour l'admin : « next best offer » par client actif."""
    data = get_data(db)
    activity = sorted(((float(data.matrix[data.user_index[uid]].sum()), uid) for uid in data.user_ids), reverse=True)
    result = []
    for _, uid in activity[:top_customers]:
        user = db.query(models.User).filter(models.User.id == uid).first()
        if user is None or user.is_admin:
            continue
        preds = predict_for_user(db, uid, top_k=per_customer)
        result.append(
            {
                "user_id": uid,
                "full_name": user.full_name,
                "email": user.email,
                "predictions": [
                    {"product_id": r["product"].id, "name": r["product"].name, "image_url": r["product"].image_url, "probability": r["probability"], "reasons": r["reasons"]}
                    for r in preds
                ],
            }
        )
    return result
