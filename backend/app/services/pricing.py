"""Calcul du prix client : promo manuelle vs meilleure promotion active (produit / catégorie / globale)."""
from datetime import datetime
from typing import Iterable, Optional, Tuple

from sqlalchemy.orm import Session

from .. import models


def active_promotions(db: Session, now: Optional[datetime] = None) -> list[models.Promotion]:
    now = now or datetime.utcnow()
    promos = db.query(models.Promotion).filter(models.Promotion.is_active == True).all()  # noqa: E712
    result = []
    for promo in promos:
        if promo.starts_at and promo.starts_at > now:
            continue
        if promo.ends_at and promo.ends_at < now:
            continue
        result.append(promo)
    return result


def applicable_promotions(product: models.Product, promos: Iterable[models.Promotion]) -> list[models.Promotion]:
    applicable = []
    for promo in promos:
        if promo.product_id is not None:
            if promo.product_id == product.id:
                applicable.append(promo)
        elif promo.category_id is not None:
            if product.category_id is not None and promo.category_id == product.category_id:
                applicable.append(promo)
        else:
            applicable.append(promo)  # promotion globale
    return applicable


def best_price(product: models.Product, promos: Iterable[models.Promotion]) -> Tuple[float, Optional[models.Promotion]]:
    """Retourne (prix effectif, promotion retenue ou None)."""
    base = product.promo_price if product.promo_price is not None else product.price
    best = float(base)
    best_promo = None
    for promo in applicable_promotions(product, promos):
        try:
            discounted = round(float(product.price) * (1 - float(promo.discount_percent) / 100.0), 2)
        except (TypeError, ValueError):
            continue
        if discounted < best:
            best = discounted
            best_promo = promo
    return max(best, 0.0), best_promo


def resolve_unit_price(db: Session, product: models.Product, now: Optional[datetime] = None) -> float:
    price, _ = best_price(product, active_promotions(db, now))
    return price
