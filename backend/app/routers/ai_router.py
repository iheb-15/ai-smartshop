from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas, auth
from ..database import get_db
from ..ai import recommendation, search as ai_search, chatbot, interest_prediction, claude_client
from ..services.tracking import log_event

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status")
def ai_status():
    """Indique quelles briques IA tournent en mode LLM ou en mode dégradé (règles / ML local)."""
    llm = claude_client.is_configured()
    return {
        "llm_configured": llm,
        "model": claude_client.DEFAULT_MODEL if llm else None,
        "features": {
            "chatbot": "llm" if llm else "fallback",
            "search": "llm" if llm else "rules",
            "reviews": "llm" if llm else "rules",
            "recommendations": "ml",
            "predictions": "ml",
        },
    }


@router.post("/search", response_model=schemas.SearchResponse)
def smart_search(
    payload: schemas.SearchRequest,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(auth.get_optional_user),
):
    result = ai_search.smart_search(db, payload.query, payload.top_k)
    # value = nombre de correspondances réelles (0 si l'on n'a renvoyé que des suggestions de repli)
    log_event(
        db,
        "search",
        user_id=user.id if user else None,
        session_id=payload.session_id,
        query=payload.query,
        value=0.0 if result.get("fallback") else float(result["total"]),
        commit=True,
    )
    return result


@router.get("/recommendations/similar/{product_id}", response_model=List[schemas.ProductOut])
def similar(product_id: int, db: Session = Depends(get_db), top_k: int = Query(6, ge=1, le=12)):
    return recommendation.similar_products(db, product_id, top_k)


@router.get("/recommendations/bought-together/{product_id}", response_model=List[schemas.ProductOut])
def bought_together(product_id: int, db: Session = Depends(get_db), top_k: int = Query(4, ge=1, le=8)):
    return recommendation.frequently_bought_together(db, product_id, top_k)


@router.get("/recommendations/for-me", response_model=List[schemas.ProductOut])
def for_me(
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
    top_k: int = Query(8, ge=1, le=24),
):
    return recommendation.personalized_for_user(db, user.id, top_k)


@router.get("/recommendations/popular", response_model=List[schemas.ProductOut])
def popular(db: Session = Depends(get_db), top_k: int = Query(8, ge=1, le=24)):
    """Sélection « démarrage à froid » pour les visiteurs anonymes."""
    return recommendation.popular_products(db, top_k)


@router.get("/predictions/for-me", response_model=List[schemas.PredictionOut])
def predictions_for_me(
    db: Session = Depends(get_db),
    user: models.User = Depends(auth.get_current_user),
    top_k: int = Query(8, ge=1, le=24),
):
    """Produits susceptibles d'intéresser le client avec probabilité et explications."""
    return interest_prediction.predict_for_user(db, user.id, top_k)


@router.post("/chat", response_model=schemas.ChatResponse)
def chat_endpoint(
    payload: schemas.ChatRequest,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(auth.get_optional_user),
):
    return chatbot.chat(db, payload.session_id, payload.message, user)


@router.get("/chat/history")
def chat_history(session_id: str, db: Session = Depends(get_db), limit: int = Query(30, ge=1, le=100)):
    msgs = chatbot.get_history(db, session_id, limit)
    return [{"role": m.role, "content": m.content, "created_at": m.created_at} for m in msgs]
