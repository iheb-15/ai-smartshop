from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas, auth
from ..database import get_db
from ..ai import recommendation, search as ai_search, chatbot

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/search", response_model=List[schemas.ProductOut])
def smart_search(payload: schemas.SearchRequest, db: Session = Depends(get_db)):
    return ai_search.semantic_search(db, payload.query, payload.top_k)


@router.get("/recommendations/similar/{product_id}", response_model=List[schemas.ProductOut])
def similar(product_id: int, db: Session = Depends(get_db)):
    return recommendation.similar_products(db, product_id)


@router.get("/recommendations/bought-together/{product_id}", response_model=List[schemas.ProductOut])
def bought_together(product_id: int, db: Session = Depends(get_db)):
    return recommendation.frequently_bought_together(db, product_id)


@router.get("/recommendations/for-me", response_model=List[schemas.ProductOut])
def for_me(
    db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)
):
    return recommendation.personalized_for_user(db, user.id)


@router.post("/chat", response_model=schemas.ChatResponse)
def chat_endpoint(payload: schemas.ChatRequest, db: Session = Depends(get_db)):
    try:
        reply = chatbot.chat(db, payload.session_id, payload.message, None)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return schemas.ChatResponse(reply=reply)
