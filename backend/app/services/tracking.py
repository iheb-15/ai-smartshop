"""Journalisation des événements comportementaux (clickstream) utilisés par l'analyse client et le ML."""
from typing import Optional

from sqlalchemy.orm import Session

from .. import models

EVENT_TYPES = {
    "view",
    "search",
    "add_to_cart",
    "remove_from_cart",
    "wishlist_add",
    "wishlist_remove",
    "purchase",
    "review",
    "chat",
}


def log_event(
    db: Session,
    event_type: str,
    *,
    user_id: Optional[int] = None,
    session_id: Optional[str] = None,
    product_id: Optional[int] = None,
    query: Optional[str] = None,
    value: Optional[float] = None,
    commit: bool = False,
) -> Optional[models.Interaction]:
    if event_type not in EVENT_TYPES:
        return None
    event = models.Interaction(
        user_id=user_id,
        session_id=session_id,
        product_id=product_id,
        event_type=event_type,
        query=(query or None) and query[:300],
        value=value,
    )
    db.add(event)
    if commit:
        db.commit()
    return event
