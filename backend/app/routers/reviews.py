from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas, auth
from ..database import get_db
from ..ai.reviews_ai import analyze_sentiment

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/product/{product_id}", response_model=List[schemas.ReviewOut])
def product_reviews(product_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Review)
        .filter(models.Review.product_id == product_id)
        .order_by(models.Review.created_at.desc())
        .all()
    )


@router.get("/all", response_model=List[schemas.ReviewOut])
def all_reviews(
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    """Moderation admin : tous les avis, plus recents d'abord."""
    return db.query(models.Review).order_by(models.Review.created_at.desc()).all()


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


@router.post("/", response_model=schemas.ReviewOut)
def create_review(
    payload: schemas.ReviewCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    sentiment = analyze_sentiment(payload.comment) if payload.comment else "neutral"
    review = models.Review(
        product_id=payload.product_id,
        user_id=user.id,
        rating=payload.rating,
        comment=payload.comment,
        sentiment=sentiment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review
