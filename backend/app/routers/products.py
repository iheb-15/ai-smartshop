from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from .. import models, schemas, auth
from ..database import get_db
from ..services.catalog import enrich_product, enrich_products, visible_products_query
from ..services.tracking import log_event

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/", response_model=List[schemas.ProductOut])
def list_products(
    response: Response,
    db: Session = Depends(get_db),
    q: Optional[str] = None,
    category_id: Optional[int] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    in_stock: Optional[bool] = None,
    include_hidden: bool = Query(False, description="Admin : inclure les produits retirés de la vente"),
    sort_by: Optional[str] = Query(None, description="price_asc|price_desc|newest|rating|popular"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    session_id: Optional[str] = None,
    user: Optional[models.User] = Depends(auth.get_optional_user),
):
    if include_hidden and user is not None and user.is_admin:
        query = db.query(models.Product)
    else:
        query = visible_products_query(db)

    if q:
        like = f"%{q.strip()}%"
        query = query.filter((models.Product.name.ilike(like)) | (models.Product.description.ilike(like)))
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
        query = query.order_by(models.Product.created_at.desc(), models.Product.id.desc())
    elif sort_by == "rating":
        avg_sub = (
            db.query(models.Review.product_id, func.avg(models.Review.rating).label("avg_rating"))
            .group_by(models.Review.product_id)
            .subquery()
        )
        query = query.outerjoin(avg_sub, avg_sub.c.product_id == models.Product.id).order_by(
            func.coalesce(avg_sub.c.avg_rating, 0).desc(), models.Product.id.desc()
        )
    elif sort_by == "popular":
        sold_sub = (
            db.query(models.OrderItem.product_id, func.sum(models.OrderItem.quantity).label("sold"))
            .group_by(models.OrderItem.product_id)
            .subquery()
        )
        query = query.outerjoin(sold_sub, sold_sub.c.product_id == models.Product.id).order_by(
            func.coalesce(sold_sub.c.sold, 0).desc(), models.Product.id.desc()
        )
    else:
        query = query.order_by(models.Product.id.desc())

    products = query.offset(skip).limit(limit).all()
    response.headers["X-Total-Count"] = str(total)

    # Tracking des recherches texte classiques (≥ 3 caractères, première page uniquement)
    if q and len(q.strip()) >= 3 and skip == 0:
        log_event(
            db,
            "search",
            user_id=user.id if user else None,
            session_id=session_id,
            query=q.strip(),
            value=float(total),
            commit=True,
        )

    return enrich_products(db, products, datetime.utcnow())


@router.get("/{product_id}", response_model=schemas.ProductOut)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(auth.get_optional_user),
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.is_available and not (user and user.is_admin):
        raise HTTPException(status_code=404, detail="Ce produit n'est plus disponible.")
    return enrich_product(db, product)


def _validate_payload(payload: schemas.ProductCreate, db: Session):
    if payload.price < 0 or payload.stock < 0:
        raise HTTPException(status_code=400, detail="Price and stock must be non-negative")
    if payload.promo_price is not None and payload.promo_price > payload.price:
        raise HTTPException(status_code=400, detail="Promotional price cannot exceed price")
    if payload.category_id is not None:
        if not db.query(models.Category).filter(models.Category.id == payload.category_id).first():
            raise HTTPException(status_code=404, detail="Catégorie introuvable.")


@router.post("/", response_model=schemas.ProductOut)
def create_product(
    payload: schemas.ProductCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    _validate_payload(payload, db)
    product = models.Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return enrich_product(db, product)


@router.put("/{product_id}", response_model=schemas.ProductOut)
def update_product(
    product_id: int,
    payload: schemas.ProductCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    _validate_payload(payload, db)
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for key, value in payload.model_dump().items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return enrich_product(db, product)


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
    return enrich_product(db, product)


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
    db.query(models.WishlistItem).filter(models.WishlistItem.product_id == product_id).delete()
    db.query(models.Promotion).filter(models.Promotion.product_id == product_id).delete()
    db.query(models.Review).filter(models.Review.product_id == product_id).delete()
    db.query(models.Interaction).filter(models.Interaction.product_id == product_id).delete()
    db.delete(product)
    db.commit()
    return {"ok": True}
