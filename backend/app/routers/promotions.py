from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db

router = APIRouter(prefix="/promotions", tags=["promotions"])


def validate_promotion(payload: schemas.PromotionCreate):
    if payload.discount_percent <= 0 or payload.discount_percent > 100:
        raise HTTPException(status_code=400, detail="La réduction doit être comprise entre 1% et 100%.")
    if payload.starts_at and payload.ends_at and payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=400, detail="La date de fin doit être postérieure à la date de début.")
    if payload.product_id is not None and payload.category_id is not None:
        raise HTTPException(status_code=400, detail="Veuillez cibler soit un produit, soit une catégorie, mais pas les deux.")


def _serialize_promotion(p: models.Promotion) -> schemas.PromotionOut:
    return schemas.PromotionOut(
        id=p.id,
        name=p.name,
        discount_percent=p.discount_percent,
        starts_at=p.starts_at,
        ends_at=p.ends_at,
        is_active=p.is_active,
        product_id=p.product_id,
        category_id=p.category_id,
        product_name=p.product.name if p.product else None,
        category_name=p.category.name if p.category else None,
        created_at=p.created_at,
    )


@router.get("/", response_model=list[schemas.PromotionOut])
def list_promotions(
    db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin)
):
    promotions = db.query(models.Promotion).order_by(models.Promotion.created_at.desc()).all()
    return [_serialize_promotion(p) for p in promotions]


@router.get("/active", response_model=list[schemas.PromotionOut])
def list_active_promotions(db: Session = Depends(get_db)):
    """Promotions visibles boutique : actives et dans la fenêtre de dates."""
    from datetime import datetime

    now = datetime.utcnow()
    promotions = (
        db.query(models.Promotion)
        .filter(models.Promotion.is_active == True)  # noqa: E712
        .order_by(models.Promotion.created_at.desc())
        .all()
    )
    active = []
    for p in promotions:
        if p.starts_at and p.starts_at > now:
            continue
        if p.ends_at and p.ends_at < now:
            continue
        active.append(p)
    return [_serialize_promotion(p) for p in active]


@router.post("/", response_model=schemas.PromotionOut)
def create_promotion(
    payload: schemas.PromotionCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    validate_promotion(payload)
    if payload.product_id and not db.query(models.Product).filter(models.Product.id == payload.product_id).first():
        raise HTTPException(status_code=404, detail="Produit sélectionné introuvable.")
    if payload.category_id and not db.query(models.Category).filter(models.Category.id == payload.category_id).first():
        raise HTTPException(status_code=404, detail="Catégorie sélectionnée introuvable.")
    promotion = models.Promotion(**payload.model_dump())
    db.add(promotion)
    db.commit()
    db.refresh(promotion)
    return _serialize_promotion(promotion)


@router.patch("/{promotion_id}/toggle-active", response_model=schemas.PromotionOut)
def toggle_promotion(
    promotion_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    promotion = db.query(models.Promotion).filter(models.Promotion.id == promotion_id).first()
    if not promotion:
        raise HTTPException(status_code=404, detail="Promotion non trouvée.")
    promotion.is_active = not promotion.is_active
    db.commit()
    db.refresh(promotion)
    return _serialize_promotion(promotion)


@router.put("/{promotion_id}", response_model=schemas.PromotionOut)
def update_promotion(
    promotion_id: int,
    payload: schemas.PromotionCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    validate_promotion(payload)
    promotion = db.query(models.Promotion).filter(models.Promotion.id == promotion_id).first()
    if not promotion:
        raise HTTPException(status_code=404, detail="Promotion non trouvée.")
    for key, value in payload.model_dump().items():
        setattr(promotion, key, value)
    db.commit()
    db.refresh(promotion)
    return _serialize_promotion(promotion)


@router.delete("/{promotion_id}")
def delete_promotion(
    promotion_id: int,
    db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin)
):
    promotion = db.query(models.Promotion).filter(models.Promotion.id == promotion_id).first()
    if not promotion:
        raise HTTPException(status_code=404, detail="Promotion non trouvée.")
    db.delete(promotion)
    db.commit()
    return {"ok": True}

