from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas, auth
from ..database import get_db
from ..services.catalog import enrich_products
from ..services.tracking import log_event

router = APIRouter(prefix="/cart", tags=["cart"])


def _cart_items(db: Session, user_id: int) -> list[models.CartItem]:
    items = db.query(models.CartItem).filter(models.CartItem.user_id == user_id).all()
    enrich_products(db, [it.product for it in items if it.product is not None])
    return items


@router.get("/", response_model=List[schemas.CartItemOut])
def get_cart(
    db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)
):
    return _cart_items(db, user.id)


@router.post("/", response_model=schemas.CartItemOut)
def add_to_cart(
    payload: schemas.CartItemCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.is_available is False:
        raise HTTPException(status_code=400, detail=f"« {product.name} » n'est plus disponible à la vente.")
    qty = int(payload.quantity or 1)
    if qty < 1:
        raise HTTPException(status_code=400, detail="La quantité doit être au moins 1.")

    item = (
        db.query(models.CartItem)
        .filter(models.CartItem.user_id == user.id, models.CartItem.product_id == payload.product_id)
        .first()
    )
    new_qty = (item.quantity if item else 0) + qty
    if new_qty > (product.stock or 0):
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuffisant pour « {product.name} » : {product.stock} disponible(s), {new_qty} demandé(s).",
        )
    if item:
        item.quantity = new_qty
    else:
        item = models.CartItem(user_id=user.id, product_id=payload.product_id, quantity=qty)
        db.add(item)
    log_event(db, "add_to_cart", user_id=user.id, product_id=product.id, value=float(qty))
    db.commit()
    db.refresh(item)
    enrich_products(db, [item.product])
    return item


@router.put("/{item_id}", response_model=schemas.CartItemOut)
def update_cart_item(
    item_id: int,
    quantity: Optional[int] = None,
    payload: Optional[schemas.CartItemUpdate] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    """Quantité acceptée en query (?quantity=) ou en JSON ({"quantity": n})."""
    qty = payload.quantity if payload is not None else quantity
    if qty is None:
        raise HTTPException(status_code=400, detail="Quantité manquante.")
    item = db.query(models.CartItem).filter(
        models.CartItem.id == item_id, models.CartItem.user_id == user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if qty < 1:
        raise HTTPException(status_code=400, detail="La quantité doit être au moins 1.")
    product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
    if product is not None and qty > (product.stock or 0):
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuffisant pour « {product.name} » : {product.stock} disponible(s).",
        )
    item.quantity = qty
    db.commit()
    db.refresh(item)
    enrich_products(db, [item.product])
    return item


@router.delete("/clear", response_model=dict)
def clear_cart(
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    """Vide entièrement le panier du client connecté."""
    items = db.query(models.CartItem).filter(models.CartItem.user_id == user.id).all()
    for it in items:
        log_event(db, "remove_from_cart", user_id=user.id, product_id=it.product_id, value=float(it.quantity or 1))
        db.delete(it)
    db.commit()
    return {"ok": True}


@router.delete("/{item_id}")
def remove_from_cart(
    item_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    item = db.query(models.CartItem).filter(
        models.CartItem.id == item_id, models.CartItem.user_id == user.id
    ).first()
    if item:
        log_event(db, "remove_from_cart", user_id=user.id, product_id=item.product_id, value=float(item.quantity or 1))
        db.delete(item)
        db.commit()
    return {"ok": True}
