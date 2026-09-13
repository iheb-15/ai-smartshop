"""Enrichissement des produits pour l'API (prix effectif, promo active, notes) + filtre de visibilité."""
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from .pricing import active_promotions, best_price


def visible_products_query(db: Session):
    """Produits visibles côté boutique (masque les produits retirés de la vente)."""
    return db.query(models.Product).filter(models.Product.is_available == True)  # noqa: E712


def rating_stats(db: Session, product_ids: Iterable[int]) -> dict[int, tuple[float, int]]:
    ids = list({pid for pid in product_ids if pid is not None})
    if not ids:
        return {}
    rows = (
        db.query(models.Review.product_id, func.avg(models.Review.rating), func.count(models.Review.id))
        .filter(models.Review.product_id.in_(ids))
        .group_by(models.Review.product_id)
        .all()
    )
    return {pid: (round(float(avg or 0), 2), int(cnt or 0)) for pid, avg, cnt in rows}


def enrich_products(db: Session, products: list[models.Product], now: Optional[datetime] = None) -> list[models.Product]:
    """Ajoute effective_price / active_promotion / avg_rating / reviews_count / category_name (attributs transients)."""
    if not products:
        return products
    promos = active_promotions(db, now)
    ratings = rating_stats(db, [p.id for p in products])
    for p in products:
        price, promo = best_price(p, promos)
        p.effective_price = price
        p.active_promotion = (
            {"id": promo.id, "name": promo.name, "discount_percent": promo.discount_percent} if promo else None
        )
        avg, cnt = ratings.get(p.id, (None, 0))
        p.avg_rating = avg
        p.reviews_count = cnt
        try:
            p.category_name = p.category.name if p.category else None
        except Exception:
            p.category_name = None
    return products


def enrich_product(db: Session, product: models.Product, now: Optional[datetime] = None) -> models.Product:
    enrich_products(db, [product], now)
    return product
