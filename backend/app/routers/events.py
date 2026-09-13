"""Tracking comportemental côté client (vues produit, recherches...) + historique personnel."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas, auth
from ..database import get_db
from ..services.catalog import enrich_products
from ..services.tracking import log_event

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/", status_code=201)
def track_event(
    payload: schemas.EventCreate,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(auth.get_optional_user),
):
    if payload.product_id is not None:
        exists = db.query(models.Product.id).filter(models.Product.id == payload.product_id).first()
        if not exists:
            return {"ok": False, "reason": "unknown_product"}
    log_event(
        db,
        payload.event_type,
        user_id=user.id if user else None,
        session_id=payload.session_id,
        product_id=payload.product_id,
        query=payload.query,
        value=payload.value,
        commit=True,
    )
    return {"ok": True}


@router.get("/recently-viewed", response_model=List[schemas.ProductOut])
def recently_viewed(
    limit: int = 8,
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
):
    """Derniers produits consultés par le client connecté (dédoublonnés, plus récents d'abord)."""
    rows = (
        db.query(models.Interaction.product_id)
        .filter(models.Interaction.user_id == user.id, models.Interaction.event_type == "view")
        .filter(models.Interaction.product_id != None)  # noqa: E711
        .order_by(models.Interaction.created_at.desc())
        .limit(60)
        .all()
    )
    seen: list[int] = []
    for (pid,) in rows:
        if pid not in seen:
            seen.append(pid)
        if len(seen) >= max(1, min(limit, 24)):
            break
    if not seen:
        return []
    products = (
        db.query(models.Product)
        .filter(models.Product.id.in_(seen), models.Product.is_available == True)  # noqa: E712
        .all()
    )
    by_id = {p.id: p for p in products}
    ordered = [by_id[pid] for pid in seen if pid in by_id]
    return enrich_products(db, ordered)
