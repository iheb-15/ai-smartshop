from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas, auth
from ..database import get_db
from ..services.catalog import enrich_products
from ..services.tracking import log_event

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


@router.get("/", response_model=List[schemas.WishlistItemOut])
def my_wishlist(db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    items = (
        db.query(models.WishlistItem)
        .filter(models.WishlistItem.user_id == user.id)
        .order_by(models.WishlistItem.created_at.desc())
        .all()
    )
    items = [it for it in items if it.product is not None]
    enrich_products(db, [it.product for it in items])
    return items


@router.get("/ids", response_model=List[int])
def my_wishlist_ids(db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    rows = db.query(models.WishlistItem.product_id).filter(models.WishlistItem.user_id == user.id).all()
    return [r[0] for r in rows]


@router.post("/{product_id}")
def toggle_wishlist(
    product_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    """Ajoute le produit aux favoris s'il n'y est pas, sinon le retire. Retourne l'état final."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    existing = (
        db.query(models.WishlistItem)
        .filter(models.WishlistItem.user_id == user.id, models.WishlistItem.product_id == product_id)
        .first()
    )
    if existing:
        db.delete(existing)
        log_event(db, "wishlist_remove", user_id=user.id, product_id=product_id)
        db.commit()
        return {"in_wishlist": False, "product_id": product_id}
    db.add(models.WishlistItem(user_id=user.id, product_id=product_id))
    log_event(db, "wishlist_add", user_id=user.id, product_id=product_id)
    db.commit()
    return {"in_wishlist": True, "product_id": product_id}


@router.delete("/{product_id}")
def remove_from_wishlist(
    product_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    existing = (
        db.query(models.WishlistItem)
        .filter(models.WishlistItem.user_id == user.id, models.WishlistItem.product_id == product_id)
        .first()
    )
    if existing:
        db.delete(existing)
        log_event(db, "wishlist_remove", user_id=user.id, product_id=product_id)
        db.commit()
    return {"ok": True}
