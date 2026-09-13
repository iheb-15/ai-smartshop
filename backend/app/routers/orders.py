from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from .. import models, schemas, auth
from ..database import get_db
from ..services.pricing import resolve_unit_price, active_promotions, best_price
from ..services.payment import charge_card, refund as simulate_refund
from ..services.tracking import log_event

router = APIRouter(prefix="/orders", tags=["orders"])


VALID_STATUSES = [
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
]

PAYMENT_STATUSES = ["UNPAID", "PAID", "FAILED", "REFUNDED"]


def _enrich_order_items(db: Session, order: models.Order) -> None:
    """Injecte les caractéristiques produit dans chaque item (nom, image, catégorie)."""
    for item in order.items or []:
        p = item.product
        if p is None:
            p = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        if p is None:
            continue
        item.product_name = p.name
        item.product_description = p.description or ""
        item.product_image = p.image_url or ""
        cat_name = None
        if p.category is not None:
            cat_name = p.category.name
        elif p.category_id:
            cat = db.query(models.Category).filter(models.Category.id == p.category_id).first()
            cat_name = cat.name if cat else None
        item.category_name = cat_name


def _validate_cart(cart_items: list[models.CartItem]) -> None:
    for ci in cart_items:
        product = ci.product
        if product is None:
            raise HTTPException(status_code=404, detail="Un produit du panier est introuvable.")
        if product.is_available is False:
            raise HTTPException(status_code=400, detail=f"« {product.name} » n'est plus disponible à la vente.")
        if product.stock < ci.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuffisant pour « {product.name} » : {product.stock} restant(s), {ci.quantity} demandé(s).",
            )


@router.get("/checkout/preview")
def checkout_preview(db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    """Récapitulatif avant paiement : lignes avec prix effectifs, remises, total."""
    cart_items = db.query(models.CartItem).filter(models.CartItem.user_id == user.id).all()
    promos = active_promotions(db)
    lines = []
    subtotal = 0.0
    total = 0.0
    for ci in cart_items:
        p = ci.product
        if p is None:
            continue
        price, promo = best_price(p, promos)
        lines.append(
            {
                "product_id": p.id,
                "name": p.name,
                "image_url": p.image_url,
                "quantity": ci.quantity,
                "unit_price": p.price,
                "effective_price": price,
                "promotion": promo.name if promo else ("Prix promo" if p.promo_price is not None and price < p.price else None),
                "line_total": round(price * ci.quantity, 2),
                "stock": p.stock,
                "available": bool(p.is_available) and p.stock >= ci.quantity,
            }
        )
        subtotal += p.price * ci.quantity
        total += price * ci.quantity
    return {
        "lines": lines,
        "subtotal": round(subtotal, 2),
        "discount": round(subtotal - total, 2),
        "shipping_fee": 0.0,
        "total": round(total, 2),
        "default_shipping": {
            "full_name": user.full_name,
            "phone": user.phone or "",
            "address": user.address or "",
            "city": user.city or "",
            "postal_code": user.postal_code or "",
        },
    }


@router.post("/checkout", response_model=schemas.OrderOut)
def checkout(
    payload: schemas.CheckoutRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    """Passage de commande avec paiement simulé (carte) ou paiement à la livraison."""
    cart_items = db.query(models.CartItem).filter(models.CartItem.user_id == user.id).all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Votre panier est vide.")

    _validate_cart(cart_items)

    if payload.payment_method == "card" and payload.card is None:
        raise HTTPException(status_code=400, detail="Les informations de carte bancaire sont requises.")

    now = datetime.utcnow()
    promos = active_promotions(db, now)
    total = 0.0
    priced = []
    for ci in cart_items:
        unit_price, _ = best_price(ci.product, promos)
        total += unit_price * ci.quantity
        priced.append((ci, unit_price))
    total = round(total, 2)

    # 1) Paiement (simulation) AVANT de créer la commande : un refus ne crée aucune commande.
    charge = None
    if payload.payment_method == "card":
        card = payload.card
        charge = charge_card(total, card.number, card.holder, card.exp_month, card.exp_year, card.cvc)
        if not charge.success:
            # On journalise la tentative échouée (analyse des échecs de paiement côté admin), sans créer de commande
            db.add(
                models.Payment(
                    order_id=None,
                    user_id=user.id,
                    method="card",
                    amount=total,
                    status="FAILED",
                    transaction_ref=charge.transaction_ref,
                    card_brand=charge.card_brand,
                    card_last4=charge.card_last4,
                    failure_reason=charge.failure_reason,
                )
            )
            db.commit()
            raise HTTPException(status_code=402, detail=charge.failure_reason or "Paiement refusé.")

    # 2) Création de la commande
    order = models.Order(
        user_id=user.id,
        status="CONFIRMED",
        total=total,
        payment_method=payload.payment_method,
        payment_status="PAID" if charge else "UNPAID",
        paid_at=now if charge else None,
        shipping_name=payload.shipping.full_name,
        shipping_phone=payload.shipping.phone,
        shipping_address=payload.shipping.address,
        shipping_city=payload.shipping.city,
        shipping_postal_code=payload.shipping.postal_code,
        notes=payload.notes,
    )
    db.add(order)
    db.flush()

    for ci, unit_price in priced:
        db.add(models.OrderItem(order_id=order.id, product_id=ci.product_id, quantity=ci.quantity, unit_price=unit_price))
        ci.product.stock -= ci.quantity
        log_event(db, "purchase", user_id=user.id, product_id=ci.product_id, value=float(ci.quantity))
        db.delete(ci)

    if charge:
        db.add(
            models.Payment(
                order_id=order.id,
                user_id=user.id,
                method="card",
                amount=total,
                status="SUCCEEDED",
                transaction_ref=charge.transaction_ref,
                card_brand=charge.card_brand,
                card_last4=charge.card_last4,
            )
        )
    else:
        db.add(
            models.Payment(
                order_id=order.id,
                user_id=user.id,
                method="cash_on_delivery",
                amount=total,
                status="PENDING",
                transaction_ref=f"COD-{now.strftime('%Y%m%d')}-{order.id:05d}",
            )
        )

    # 3) Mémorise l'adresse par défaut du client
    if payload.save_address:
        user.full_name = user.full_name or payload.shipping.full_name
        user.phone = payload.shipping.phone
        user.address = payload.shipping.address
        user.city = payload.shipping.city
        user.postal_code = payload.shipping.postal_code

    db.commit()
    db.refresh(order)
    _enrich_order_items(db, order)
    return order


@router.get("/", response_model=List[schemas.OrderOut])
def my_orders(
    db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)
):
    orders = (
        db.query(models.Order)
        .filter(models.Order.user_id == user.id)
        .order_by(models.Order.created_at.desc())
        .all()
    )
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
    payment_status: Optional[str] = None,
    payment_method: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    query = db.query(models.Order)
    if status:
        query = query.filter(models.Order.status == status.strip().upper())
    if payment_status:
        query = query.filter(models.Order.payment_status == payment_status.strip().upper())
    if payment_method:
        query = query.filter(models.Order.payment_method == payment_method.strip().lower())
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
    user: models.User = Depends(auth.get_current_user),
):
    """Détail d'une commande : l'admin voit tout, le client uniquement les siennes (facture)."""
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order or (not user.is_admin and order.user_id != user.id):
        raise HTTPException(status_code=404, detail="Commande non trouvée.")
    _enrich_order_items(db, order)
    return order


@router.post("/{order_id}/pay", response_model=schemas.OrderOut)
def pay_order(
    order_id: int,
    payload: schemas.PayOrderRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    """Paiement (simulé) d'une commande encore impayée (ex. commande à la livraison réglée en ligne)."""
    order = db.query(models.Order).filter(models.Order.id == order_id, models.Order.user_id == user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée.")
    if order.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Commande annulée : paiement impossible.")
    if order.payment_status == "PAID":
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée.")
    card = payload.card
    charge = charge_card(order.total, card.number, card.holder, card.exp_month, card.exp_year, card.cvc)
    db.add(
        models.Payment(
            order_id=order.id,
            user_id=user.id,
            method="card",
            amount=order.total,
            status="SUCCEEDED" if charge.success else "FAILED",
            transaction_ref=charge.transaction_ref,
            card_brand=charge.card_brand,
            card_last4=charge.card_last4,
            failure_reason=charge.failure_reason,
        )
    )
    if not charge.success:
        db.commit()
        raise HTTPException(status_code=402, detail=charge.failure_reason or "Paiement refusé.")
    for p in order.payments:
        if p.status == "PENDING" and p.method == "cash_on_delivery":
            p.status = "CANCELLED"
            p.failure_reason = "Remplacé par un paiement en ligne."
    order.payment_method = "card"
    order.payment_status = "PAID"
    order.paid_at = datetime.utcnow()
    if order.status == "PENDING":
        order.status = "CONFIRMED"
    db.commit()
    db.refresh(order)
    _enrich_order_items(db, order)
    return order


def _restore_stock(db: Session, order: models.Order) -> None:
    for item in order.items:
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        if product is not None:
            product.stock = (product.stock or 0) + (item.quantity or 0)


def _refund_if_paid(db: Session, order: models.Order) -> None:
    if order.payment_status == "PAID":
        ref = simulate_refund(order.total)
        db.add(models.Payment(order_id=order.id, user_id=order.user_id, method=order.payment_method or "card", amount=-abs(order.total), status="REFUNDED", transaction_ref=ref))
        order.payment_status = "REFUNDED"
    elif order.payment_status == "UNPAID":
        for p in order.payments:
            if p.status == "PENDING":
                p.status = "FAILED"
                p.failure_reason = "Commande annulée avant encaissement."


@router.post("/{order_id}/cancel", response_model=schemas.OrderOut)
def cancel_my_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    """Annulation par le client lui-même (uniquement si encore PENDING/CONFIRMED). Rembourse si payé."""
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
    _restore_stock(db, order)
    _refund_if_paid(db, order)
    order.status = "CANCELLED"
    db.commit()
    db.refresh(order)
    _enrich_order_items(db, order)
    return order


@router.put("/{order_id}/status", response_model=schemas.OrderOut)
def update_status(
    order_id: int,
    status: Optional[str] = None,
    payload: Optional[schemas.OrderStatusUpdate] = None,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    new_status = (payload.status if payload else status) or ""
    status_upper = new_status.strip().upper()
    if status_upper not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Statut invalide. Statuts acceptés : {', '.join(VALID_STATUSES)}",
        )
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée.")
    previous_status = (order.status or "PENDING").upper()
    if previous_status == "CANCELLED" and status_upper != "CANCELLED":
        raise HTTPException(status_code=400, detail="Une commande annulée ne peut pas être réactivée.")
    # Restaure le stock + rembourse si la commande est annulée (et ne l'était pas déjà)
    if status_upper == "CANCELLED" and previous_status != "CANCELLED":
        _restore_stock(db, order)
        _refund_if_paid(db, order)
    # Paiement à la livraison : encaissé lors de la livraison
    if status_upper == "DELIVERED" and order.payment_method == "cash_on_delivery" and order.payment_status == "UNPAID":
        order.payment_status = "PAID"
        order.paid_at = datetime.utcnow()
        for p in order.payments:
            if p.status == "PENDING":
                p.status = "SUCCEEDED"
    order.status = status_upper
    db.commit()
    db.refresh(order)
    _enrich_order_items(db, order)
    return order


@router.put("/{order_id}/payment-status", response_model=schemas.OrderOut)
def update_payment_status(
    order_id: int,
    payment_status: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    """Admin : marquer manuellement une commande comme payée / remboursée (ex. encaissement à la livraison)."""
    ps = payment_status.strip().upper()
    if ps not in PAYMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut de paiement invalide : {', '.join(PAYMENT_STATUSES)}")
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée.")
    if ps == "PAID" and order.payment_status != "PAID":
        order.paid_at = datetime.utcnow()
        db.add(models.Payment(order_id=order.id, user_id=order.user_id, method=order.payment_method or "cash_on_delivery", amount=order.total, status="SUCCEEDED", transaction_ref=f"MAN-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{order.id}"))
        for p in order.payments:
            if p.status == "PENDING":
                p.status = "SUCCEEDED"
    elif ps == "REFUNDED" and order.payment_status == "PAID":
        db.add(models.Payment(order_id=order.id, user_id=order.user_id, method=order.payment_method or "card", amount=-abs(order.total), status="REFUNDED", transaction_ref=simulate_refund(order.total)))
    order.payment_status = ps
    db.commit()
    db.refresh(order)
    _enrich_order_items(db, order)
    return order


# Compat : anciens imports (products.py importait ces helpers depuis orders)
__all__ = ["router", "VALID_STATUSES", "resolve_unit_price", "_enrich_order_items"]
