"""
Chatbot assistant d'achat, alimenté par l'API Claude.
On donne au modèle un extrait pertinent du catalogue (trouvé via la recherche
sémantique TF-IDF) comme contexte, pour qu'il réponde avec de vraies infos
produits plutôt que d'halluciner.
"""
from sqlalchemy.orm import Session

from .. import models
from .claude_client import get_client, MODEL
from .search import semantic_search

SYSTEM_PROMPT = """Tu es l'assistant d'achat virtuel d'une boutique en ligne.
Tu aides les clients à trouver des produits, tu réponds à leurs questions sur le
catalogue, les prix, la disponibilité, et tu peux proposer des recommandations.
Réponds toujours en te basant UNIQUEMENT sur les produits listés dans le contexte
fourni. Si aucun produit ne correspond, dis-le clairement et propose une
alternative proche. Sois concis, chaleureux et utile. Réponds dans la langue du
client."""


def _build_context(db: Session, user_message: str) -> str:
    products = semantic_search(db, user_message, top_k=8)
    if not products:
        products = db.query(models.Product).limit(8).all()

    lines = []
    for p in products:
        price = p.promo_price or p.price
        stock_status = "en stock" if p.stock > 0 else "rupture de stock"
        cat = p.category.name if p.category else "N/A"
        lines.append(
            f"- {p.name} | catégorie: {cat} | prix: {price} DT | {stock_status} | {p.description[:120]}"
        )
    return "\n".join(lines) if lines else "Le catalogue est actuellement vide."


def get_history(db: Session, session_id: str, limit: int = 10):
    msgs = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_id == session_id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )
    return msgs[-limit:]


def chat(db: Session, session_id: str, user_message: str, user_id: int | None) -> str:
    context = _build_context(db, user_message)
    history = get_history(db, session_id)

    messages = []
    for m in history:
        messages.append({"role": m.role, "content": m.content})
    messages.append(
        {
            "role": "user",
            "content": f"Contexte catalogue (produits pertinents) :\n{context}\n\nQuestion du client : {user_message}",
        }
    )

    client = get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    reply = "".join(
        block.text for block in response.content if getattr(block, "type", "") == "text"
    )

    db.add(models.ChatMessage(user_id=user_id, session_id=session_id, role="user", content=user_message))
    db.add(models.ChatMessage(user_id=user_id, session_id=session_id, role="assistant", content=reply))
    db.commit()

    return reply
