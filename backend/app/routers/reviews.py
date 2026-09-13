import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas, auth
from ..database import get_db
from ..ai.reviews_ai import analyze_review, summarize_product_reviews
from ..services.tracking import log_event

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _review_out(r: models.Review) -> schemas.ReviewOut:
    keywords: Optional[list[str]] = None
    if r.keywords:
        try:
            keywords = json.loads(r.keywords)
        except (TypeError, ValueError):
            keywords = None
    return schemas.ReviewOut(
        id=r.id,
        product_id=r.product_id,
        user_id=r.user_id,
        user_name=r.user.full_name if r.user else None,
        rating=r.rating,
        comment=r.comment or "",
        sentiment=r.sentiment,
        sentiment_score=r.sentiment_score,
        keywords=keywords,
        is_verified_purchase=bool(r.is_verified_purchase),
        created_at=r.created_at,
    )


@router.get("/product/{product_id}", response_model=List[schemas.ReviewOut])
def product_reviews(product_id: int, db: Session = Depends(get_db)):
    reviews = (
        db.query(models.Review)
        .filter(models.Review.product_id == product_id)
        .order_by(models.Review.created_at.desc())
        .all()
    )
    return [_review_out(r) for r in reviews]


@router.get("/product/{product_id}/summary", response_model=schemas.ReviewSummaryOut)
def product_review_summary(product_id: int, db: Session = Depends(get_db), refresh: bool = False):
    """Synthèse IA des avis (résumé, points forts / faibles) — mise en cache par produit."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    return summarize_product_reviews(db, product, force=refresh)


@router.get("/all", response_model=List[schemas.ReviewOut])
def all_reviews(
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
    sentiment: Optional[str] = None,
    limit: int = Query(200, ge=1, le=1000),
):
    """Moderation admin : tous les avis, plus recents d'abord."""
    query = db.query(models.Review)
    if sentiment:
        query = query.filter(models.Review.sentiment == sentiment)
    return [_review_out(r) for r in query.order_by(models.Review.created_at.desc()).limit(limit).all()]


@router.delete("/{review_id}")
def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    """Moderation admin : supprimer un avis inapproprie / spam."""
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    db.delete(review)
    db.commit()
    return {"ok": True}


@router.post("/reanalyze")
def reanalyze_reviews(
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
    only_missing: bool = True,
):
    """Admin : (re)lance l'analyse de sentiment sur les avis (utile après ajout de la clé API)."""
    query = db.query(models.Review)
    if only_missing:
        query = query.filter((models.Review.sentiment_score == None) | (models.Review.sentiment == None))  # noqa: E711
    reviews = query.all()
    for r in reviews:
        result = analyze_review(r.comment or "", r.rating)
        r.sentiment = result["sentiment"]
        r.sentiment_score = result["score"]
        r.keywords = json.dumps(result["aspects"], ensure_ascii=False)
    db.commit()
    return {"updated": len(reviews)}


@router.post("/", response_model=schemas.ReviewOut)
def create_review(
    payload: schemas.ReviewCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    existing = (
        db.query(models.Review)
        .filter(models.Review.product_id == payload.product_id, models.Review.user_id == user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Vous avez déjà publié un avis sur ce produit.")

    purchased = (
        db.query(models.OrderItem.id)
        .join(models.Order, models.Order.id == models.OrderItem.order_id)
        .filter(models.Order.user_id == user.id, models.OrderItem.product_id == payload.product_id, models.Order.status != "CANCELLED")
        .first()
        is not None
    )
    analysis = analyze_review(payload.comment or "", payload.rating)
    review = models.Review(
        product_id=payload.product_id,
        user_id=user.id,
        rating=payload.rating,
        comment=(payload.comment or "").strip(),
        sentiment=analysis["sentiment"],
        sentiment_score=analysis["score"],
        keywords=json.dumps(analysis["aspects"], ensure_ascii=False),
        is_verified_purchase=purchased,
    )
    db.add(review)
    log_event(db, "review", user_id=user.id, product_id=payload.product_id, value=float(payload.rating))
    db.commit()
    db.refresh(review)
    return _review_out(review)
