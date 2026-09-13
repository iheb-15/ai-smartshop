from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/products", tags=["products"])


def enrich_product(db: Session, product: models.Product, now: datetime | None = None) -> models.Product:
    """Ajoute effective_price + active_promotion sans casser ProductOut existant."""
    from .orders import resolve_unit_price, _active_promotions_for_product

    now = now or datetime.utcnow()
    try:
        applicable = _active_promotions_for_product(db, product, now)
    except Exception:
        applicable = []
    best_promo = None
    best_price = product.promo_price if product.promo_price is not None else product.price
    for promo in applicable:
        try:
            discounted = round(product.price * (1 - float(promo.discount_percent) / 100.0), 2)
        except Exception:
            continue
        if discounted < best_price:
            best_price = discounted
            best_promo = promo
    # Attributs transients lus par Pydantic (from_attributes)
    try:
        product.effective_price = max(best_price, 0.0)
    except Exception:
        pass
    try:
        product.active_promotion = (
            {"id": best_promo.id, "name": best_promo.name, "discount_percent": best_promo.discount_percent}
            if best_promo is not None
            else None
        )
    except Exception:
        pass
    return product


@router.get("/", response_model=List[schemas.ProductOut])
def list_products(
    response: Response,
    db: Session = Depends(get_db),
    q: Optional[str] = None,
    category_id: Optional[int] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    in_stock: Optional[bool] = None,
    sort_by: Optional[str] = Query(None, description="price_asc|price_desc|newest"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    query = db.query(models.Product)

    if q:
        query = query.filter(models.Product.name.ilike(f"%{q}%"))
    if category_id:
        query = query.filter(models.Product.category_id == category_id)
    if min_price is not None:
        query = query.filter(models.Product.price >= min_price)
    if max_price is not None:
        query = query.filter(models.Product.price <= max_price)
    if in_stock:
        query = query.filter(models.Product.stock > 0)

    total = query.count()

    if sort_by == "price_asc":
        query = query.order_by(models.Product.price.asc())
    elif sort_by == "price_desc":
        query = query.order_by(models.Product.price.desc())
    elif sort_by == "newest":
        query = query.order_by(models.Product.created_at.desc())
    else:
        query = query.order_by(models.Product.id.desc())

    products = query.offset(skip).limit(limit).all()
    response.headers["X-Total-Count"] = str(total)
    now = datetime.utcnow()
    return [enrich_product(db, p, now) for p in products]


@router.get("/{product_id}", response_model=schemas.ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return enrich_product(db, product)


@router.post("/", response_model=schemas.ProductOut)
def create_product(
    payload: schemas.ProductCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    if payload.price < 0 or payload.stock < 0:
        raise HTTPException(status_code=400, detail="Price and stock must be non-negative")
    if payload.promo_price is not None and payload.promo_price > payload.price:
        raise HTTPException(status_code=400, detail="Promotional price cannot exceed price")
    product = models.Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=schemas.ProductOut)
def update_product(
    product_id: int,
    payload: schemas.ProductCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    if payload.price < 0 or payload.stock < 0:
        raise HTTPException(status_code=400, detail="Price and stock must be non-negative")
    if payload.promo_price is not None and payload.promo_price > payload.price:
        raise HTTPException(status_code=400, detail="Promotional price cannot exceed price")
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for key, value in payload.model_dump().items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product


@router.patch("/{product_id}/availability", response_model=schemas.ProductOut)
def toggle_availability(
    product_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.is_available = not product.is_available
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    has_orders = db.query(models.OrderItem).filter(models.OrderItem.product_id == product_id).first()
    if has_orders:
        raise HTTPException(
            status_code=400,
            detail="Ce produit figure déjà dans des commandes enregistrées. Pour le retirer de la vente, désactivez sa disponibilité."
        )

    db.query(models.CartItem).filter(models.CartItem.product_id == product_id).delete()
    db.query(models.Promotion).filter(models.Promotion.product_id == product_id).delete()
    db.query(models.Review).filter(models.Review.product_id == product_id).delete()
    db.delete(product)
    db.commit()
    return {"ok": True}

