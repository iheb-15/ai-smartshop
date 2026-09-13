from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/orders", tags=["orders"])


VALID_STATUSES = [
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
]


def _active_promotions_for_product(db: Session, product: models.Product, now: datetime):
    """Retourne les promotions actives applicables à un produit (produit / catégorie / globale)."""
    query = db.query(models.Promotion).filter(models.Promotion.is_active == True)  # noqa: E712
    all_promos = query.all()
    applicable = []
    for promo in all_promos:
        if promo.starts_at and promo.starts_at > now:
            continue
        if promo.ends_at and promo.ends_at < now:
            continue
        if promo.product_id is not None:
            if promo.product_id == product.id:
                applicable.append(promo)
        elif promo.category_id is not None:
            if product.category_id is not None and promo.category_id == product.category_id:
                applicable.append(promo)
        else:
            # Promotion globale (ni produit ni catégorie) : s'applique à tout
            applicable.append(promo)
    return applicable


def resolve_unit_price(db: Session, product: models.Product, now: datetime | None = None) -> float:
    """Meilleur prix client : min(promo_price manuelle, prix après meilleure promo active)."""
    now = now or datetime.utcnow()
    base_price = product.promo_price if product.promo_price is not None else product.price
    try:
        applicable = _active_promotions_for_product(db, product, now)
    except Exception:
        return base_price
    best = base_price
    for promo in applicable:
        try:
            discounted = round(product.price * (1 - float(promo.discount_percent) / 100.0), 2)
        except Exception:
            continue
        if discounted < best:
            best = discounted
    return max(best, 0.0)


@router.post("/checkout", response_model=schemas.OrderOut)
def checkout(
    db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)
):
    cart_items = db.query(models.CartItem).filter(models.CartItem.user_id == user.id).all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # 1) Validation préalable : disponibilité + stock suffisant (pas de vente à découvert)
    for ci in cart_items:
        product = ci.product
        if product is None:
            raise HTTPException(status_code=404, detail="Un produit du panier est introuvable.")
        if product.is_available is False:
            raise HTTPException(
                status_code=400,
                detail=f"« {product.name} » n'est plus disponible à la vente.",
            )
        if product.stock < ci.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuffisant pour « {product.name} » : {product.stock} restant(s), {ci.quantity} demandé(s).",
            )

    order = models.Order(user_id=user.id, status="CONFIRMED", total=0.0)
    db.add(order)
    db.flush()

    total = 0.0
    now = datetime.utcnow()
    for ci in cart_items:
        unit_price = resolve_unit_price(db, ci.product, now)
        total += unit_price * ci.quantity
        order_item = models.OrderItem(
            order_id=order.id,
            product_id=ci.product_id,
            quantity=ci.quantity,
            unit_price=unit_price,
        )
        db.add(order_item)
        # Décrémente strict (déjà validé ci-dessus)
        ci.product.stock -= ci.quantity
        db.delete(ci)

    order.total = round(total, 2)
    db.commit()
    db.refresh(order)
    _enrich_order_items(db, order)
    return order


@router.get("/", response_model=List[schemas.OrderOut])
def my_orders(
    db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)
):
    orders = db.query(models.Order).filter(models.Order.user_id == user.id).order_by(models.Order.created_at.desc()).all()
    for o in orders:
        _enrich_order_items(db, o)
    return orders


@router.get("/all", response_model=List[schemas.OrderOut])
def all_orders(
    response: Response,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
    q: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    query = db.query(models.Order)
    if status:
        query = query.filter(models.Order.status == status.strip().upper())
    if date_from:
        query = query.filter(models.Order.created_at >= date_from)
    if date_to:
        query = query.filter(models.Order.created_at <= date_to)
    if q:
        like = f"%{q.strip()}%"
        query = query.outerjoin(models.User, models.User.id == models.Order.user_id).filter(
            (models.User.full_name.ilike(like))
            | (models.User.email.ilike(like))
            | (models.Order.id.cast(models.String).ilike(like))
        )
    total = query.count()
    orders = query.order_by(models.Order.created_at.desc()).offset(skip).limit(limit).all()
    response.headers["X-Total-Count"] = str(total)
    for o in orders:
        _enrich_order_items(db, o)
    return orders


@router.get("/{order_id}", response_model=schemas.OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée.")
    _enrich_order_items(db, order)
    return order


def _enrich_order_items(db: Session, order: models.Order) -> None:
    """Injecte les caractéristiques produit dans chaque item (nom, image, catégorie)."""
    for item in order.items or []:
        p = None
        try:
            p = item.product
        except Exception:
            p = None
        if p is None:
            p = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        if p is None:
            continue
        try:
            item.product_name = p.name
            item.product_description = p.description or ""
            item.product_image = p.image_url or ""
            cat_name = None
            try:
                cat_name = p.category.name if p.category else None
            except Exception:
                cat_name = None
            if cat_name is None and getattr(p, "category_id", None):
                cat = db.query(models.Category).filter(models.Category.id == p.category_id).first()
                cat_name = cat.name if cat else None
            item.category_name = cat_name
        except Exception:
            continue


@router.post("/{order_id}/cancel", response_model=schemas.OrderOut)
def cancel_my_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    """Annulation par le client lui-même (uniquement si encore PENDING/CONFIRMED)."""
    order = (
        db.query(models.Order)
        .filter(models.Order.id == order_id, models.Order.user_id == user.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée.")
    current = (order.status or "PENDING").upper()
    if current not in ("PENDING", "CONFIRMED"):
        raise HTTPException(
            status_code=400,
            detail=f"Annulation impossible : commande déjà {current}. Contactez le support.",
        )
    for item in order.items:
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        if product is not None:
            product.stock = (product.stock or 0) + (item.quantity or 0)
    order.status = "CANCELLED"
    db.commit()
    db.refresh(order)
    _enrich_order_items(db, order)
    return order


@router.put("/{order_id}/status", response_model=schemas.OrderOut)
def update_status(
    order_id: int,
    status: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    status_upper = status.strip().upper()
    if status_upper not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Statut invalide. Statuts acceptés : {', '.join(VALID_STATUSES)}",
        )
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée.")
    previous_status = (order.status or "PENDING").upper()
    # Restaure le stock si la commande est annulée (et ne l'était pas déjà)
    if status_upper == "CANCELLED" and previous_status != "CANCELLED":
        for item in order.items:
            product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
            if product is not None:
                product.stock = (product.stock or 0) + (item.quantity or 0)
    order.status = status_upper
    db.commit()
    db.refresh(order)
    _enrich_order_items(db, order)
    return order

