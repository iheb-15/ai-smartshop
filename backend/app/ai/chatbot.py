"""
Assistant d'achat conversationnel.

Mode « llm » (clé ANTHROPIC_API_KEY présente) :
  Claude pilote une boucle d'appels d'outils (« function calling ») sur les vraies données :
  recherche catalogue, fiche produit, promotions, commandes du client, recommandations,
  ajout au panier. Il ne peut donc citer que des produits existants (pas d'hallucination).

Mode « fallback » (pas de clé / erreur API) :
  Un assistant à base de règles couvre les intentions principales (recherche produit,
  promotions, suivi de commande, recommandations, ajout panier, aide) en réutilisant
  les mêmes fonctions métier. Le service reste donc utilisable en démonstration.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from sqlalchemy.orm import Session

from .. import models
from ..services.catalog import enrich_products
from ..services.pricing import active_promotions, best_price
from ..services.tracking import log_event
from . import claude_client
from .recommendation import personalized_for_user
from .search import smart_search
from .text_utils import normalize

logger = logging.getLogger(__name__)

STORE_NAME = "NéoShop"
MAX_TOOL_ROUNDS = 5

SYSTEM_PROMPT = f"""Tu es l'assistant d'achat de {STORE_NAME}, une boutique en ligne (prix en dinars tunisiens, DT).
Tu aides les clients à trouver des produits, comparer, connaître les promotions, suivre leurs commandes
et ajouter des articles au panier.

Règles :
- Utilise TOUJOURS les outils pour obtenir des informations produits, prix, stock, promotions ou commandes.
  N'invente jamais un produit, un prix ou un statut de commande.
- Cite les produits avec leur nom exact et leur prix effectif (après promotion) en DT.
- Réponds de façon concise (max ~120 mots), chaleureuse, dans la langue du client (français par défaut).
- Si aucun produit ne correspond, dis-le et propose l'alternative la plus proche trouvée par l'outil.
- N'ajoute au panier que si le client le demande explicitement, et confirme ensuite.
- Si une action nécessite d'être connecté et que le client ne l'est pas, invite-le à se connecter."""

TOOLS = [
    {
        "name": "search_products",
        "description": "Recherche des produits dans le catalogue en langage naturel (gère prix max/min, catégorie, promo, tri).",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Requête de recherche, ex: 'écouteurs sans fil moins de 200 DT'"},
                "top_k": {"type": "integer", "minimum": 1, "maximum": 10},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_product_details",
        "description": "Détails complets d'un produit : description, prix, stock, note moyenne, avis, promotion.",
        "input_schema": {"type": "object", "properties": {"product_id": {"type": "integer"}}, "required": ["product_id"]},
    },
    {
        "name": "get_categories",
        "description": "Liste des catégories du catalogue avec le nombre de produits.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_active_promotions",
        "description": "Promotions en cours et produits concernés.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_my_orders",
        "description": "Dernières commandes du client connecté (statut, paiement, articles).",
        "input_schema": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 10}}},
    },
    {
        "name": "get_recommendations",
        "description": "Recommandations personnalisées pour le client connecté (ou best-sellers si anonyme).",
        "input_schema": {"type": "object", "properties": {"top_k": {"type": "integer", "minimum": 1, "maximum": 8}}},
    },
    {
        "name": "add_to_cart",
        "description": "Ajoute un produit au panier du client connecté (vérifie le stock).",
        "input_schema": {
            "type": "object",
            "properties": {"product_id": {"type": "integer"}, "quantity": {"type": "integer", "minimum": 1, "maximum": 20}},
            "required": ["product_id"],
        },
    },
]


# --------------------------------------------------------------------------- outils (fonctions métier)
class ToolContext:
    def __init__(self, db: Session, user: Optional[models.User]):
        self.db = db
        self.user = user
        self.products: dict[int, models.Product] = {}
        self.actions: list[str] = []

    def remember(self, products: list[models.Product]) -> None:
        for p in products:
            if p.id not in self.products and len(self.products) < 8:
                self.products[p.id] = p


def _product_brief(p: models.Product) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "category": p.category.name if p.category else None,
        "price": p.price,
        "effective_price": getattr(p, "effective_price", None) or p.price,
        "promotion": (getattr(p, "active_promotion", None) or {}).get("name") if getattr(p, "active_promotion", None) else None,
        "stock": p.stock,
        "in_stock": (p.stock or 0) > 0,
        "avg_rating": getattr(p, "avg_rating", None),
        "reviews_count": getattr(p, "reviews_count", None),
        "description": (p.description or "")[:160],
    }


def tool_search_products(ctx: ToolContext, query: str, top_k: int = 6) -> dict:
    result = smart_search(ctx.db, query, top_k=min(max(int(top_k or 6), 1), 10))
    ctx.remember(result["results"])
    return {
        "interpretation": result["interpretation"]["labels"],
        "fallback_suggestions": result.get("fallback", False),
        "products": [_product_brief(p) for p in result["results"]],
    }


def tool_get_product_details(ctx: ToolContext, product_id: int) -> dict:
    p = ctx.db.query(models.Product).filter(models.Product.id == int(product_id), models.Product.is_available == True).first()  # noqa: E712
    if not p:
        return {"error": "Produit introuvable."}
    enrich_products(ctx.db, [p])
    ctx.remember([p])
    reviews = ctx.db.query(models.Review).filter(models.Review.product_id == p.id).order_by(models.Review.created_at.desc()).limit(3).all()
    brief = _product_brief(p)
    brief["description"] = p.description or ""
    brief["recent_reviews"] = [{"rating": r.rating, "comment": (r.comment or "")[:140], "sentiment": r.sentiment} for r in reviews]
    return brief


def tool_get_categories(ctx: ToolContext) -> dict:
    cats = ctx.db.query(models.Category).all()
    return {"categories": [{"id": c.id, "name": c.name, "products": len([p for p in c.products if p.is_available])} for c in cats]}


def tool_get_active_promotions(ctx: ToolContext) -> dict:
    promos = active_promotions(ctx.db)
    out = []
    for promo in promos:
        target = promo.product.name if promo.product else (f"catégorie {promo.category.name}" if promo.category else "tout le catalogue")
        out.append({"name": promo.name, "discount_percent": promo.discount_percent, "applies_to": target, "ends_at": promo.ends_at.isoformat() if promo.ends_at else None})
    products = ctx.db.query(models.Product).filter(models.Product.is_available == True, models.Product.stock > 0).all()  # noqa: E712
    discounted = []
    for p in products:
        price, promo = best_price(p, promos)
        if promo is not None or (p.promo_price is not None and p.promo_price < p.price):
            discounted.append((price, p))
    discounted.sort(key=lambda x: (x[1].price - x[0]), reverse=True)
    top = [p for _, p in discounted[:6]]
    enrich_products(ctx.db, top)
    ctx.remember(top)
    return {"promotions": out, "discounted_products": [_product_brief(p) for p in top]}


def tool_get_my_orders(ctx: ToolContext, limit: int = 5) -> dict:
    if ctx.user is None:
        return {"error": "Client non connecté : demande-lui de se connecter pour consulter ses commandes."}
    orders = ctx.db.query(models.Order).filter(models.Order.user_id == ctx.user.id).order_by(models.Order.created_at.desc()).limit(min(int(limit or 5), 10)).all()
    return {
        "orders": [
            {
                "id": o.id,
                "date": o.created_at.strftime("%d/%m/%Y") if o.created_at else None,
                "status": o.status,
                "payment_status": o.payment_status,
                "payment_method": o.payment_method,
                "total": o.total,
                "items": [{"name": it.product.name if it.product else f"#{it.product_id}", "quantity": it.quantity} for it in o.items],
            }
            for o in orders
        ]
    }


def tool_get_recommendations(ctx: ToolContext, top_k: int = 5) -> dict:
    if ctx.user is None:
        from .recommendation import popular_products

        products = popular_products(ctx.db, min(int(top_k or 5), 8))
    else:
        products = personalized_for_user(ctx.db, ctx.user.id, top_k=min(int(top_k or 5), 8))
    ctx.remember(products)
    return {"products": [{**_product_brief(p), "reason": getattr(p, "recommendation_reason", None)} for p in products]}


def tool_add_to_cart(ctx: ToolContext, product_id: int, quantity: int = 1) -> dict:
    if ctx.user is None:
        return {"error": "Client non connecté : impossible d'ajouter au panier. Invite-le à se connecter."}
    qty = max(1, min(int(quantity or 1), 20))
    p = ctx.db.query(models.Product).filter(models.Product.id == int(product_id)).first()
    if not p or not p.is_available:
        return {"error": "Produit introuvable ou indisponible."}
    item = ctx.db.query(models.CartItem).filter(models.CartItem.user_id == ctx.user.id, models.CartItem.product_id == p.id).first()
    new_qty = (item.quantity if item else 0) + qty
    if new_qty > (p.stock or 0):
        return {"error": f"Stock insuffisant : {p.stock} disponible(s) pour « {p.name} »."}
    if item:
        item.quantity = new_qty
    else:
        ctx.db.add(models.CartItem(user_id=ctx.user.id, product_id=p.id, quantity=qty))
    log_event(ctx.db, "add_to_cart", user_id=ctx.user.id, product_id=p.id, value=float(qty))
    ctx.db.commit()
    enrich_products(ctx.db, [p])
    ctx.remember([p])
    ctx.actions.append("cart_updated")
    return {"ok": True, "product": p.name, "quantity_in_cart": new_qty, "unit_price": getattr(p, "effective_price", p.price)}


TOOL_IMPL = {
    "search_products": tool_search_products,
    "get_product_details": tool_get_product_details,
    "get_categories": tool_get_categories,
    "get_active_promotions": tool_get_active_promotions,
    "get_my_orders": tool_get_my_orders,
    "get_recommendations": tool_get_recommendations,
    "add_to_cart": tool_add_to_cart,
}


def execute_tool(ctx: ToolContext, name: str, arguments: dict) -> dict:
    fn = TOOL_IMPL.get(name)
    if fn is None:
        return {"error": f"Outil inconnu : {name}"}
    try:
        return fn(ctx, **(arguments or {}))
    except TypeError as exc:
        return {"error": f"Arguments invalides : {exc}"}
    except Exception as exc:  # pragma: no cover - robustesse
        logger.exception("Erreur outil %s", name)
        return {"error": str(exc)}


# --------------------------------------------------------------------------- historique
def get_history(db: Session, session_id: str, limit: int = 10) -> list[models.ChatMessage]:
    msgs = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_id == session_id)
        .order_by(models.ChatMessage.created_at.asc(), models.ChatMessage.id.asc())
        .all()
    )
    return msgs[-limit:]


def _history_as_messages(history: list[models.ChatMessage]) -> list[dict]:
    messages: list[dict] = []
    for m in history:
        role = "assistant" if m.role == "assistant" else "user"
        if not m.content:
            continue
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += "\n" + m.content
        else:
            messages.append({"role": role, "content": m.content})
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if messages and messages[-1]["role"] == "user":
        messages.pop()  # évite deux messages user consécutifs avec le nouveau
    return messages


def _persist(db: Session, session_id: str, user_id: Optional[int], user_message: str, reply: str) -> None:
    db.add(models.ChatMessage(user_id=user_id, session_id=session_id, role="user", content=user_message))
    db.add(models.ChatMessage(user_id=user_id, session_id=session_id, role="assistant", content=reply))
    log_event(db, "chat", user_id=user_id, session_id=session_id, query=user_message)
    db.commit()


def _cards(ctx: ToolContext) -> list[dict]:
    products = list(ctx.products.values())
    enrich_products(ctx.db, products)
    return [
        {"id": p.id, "name": p.name, "price": p.price, "effective_price": getattr(p, "effective_price", None), "image_url": p.image_url, "stock": p.stock}
        for p in products[:6]
    ]


# --------------------------------------------------------------------------- mode LLM
def _llm_chat(db: Session, session_id: str, user_message: str, user: Optional[models.User]) -> dict:
    ctx = ToolContext(db, user)
    user_line = f"Client connecté : {user.full_name} (id {user.id})." if user else "Client anonyme (non connecté)."
    system = SYSTEM_PROMPT + "\n\nContexte : " + user_line
    messages = _history_as_messages(get_history(db, session_id))
    messages.append({"role": "user", "content": user_message})

    response = None
    for _ in range(MAX_TOOL_ROUNDS):
        response = claude_client.create_message(max_tokens=700, system=system, messages=messages, tools=TOOLS)
        if getattr(response, "stop_reason", "") != "tool_use":
            break
        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if getattr(block, "type", "") == "tool_use":
                result = execute_tool(ctx, block.name, block.input if isinstance(block.input, dict) else {})
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result, ensure_ascii=False, default=str)})
        messages.append({"role": "user", "content": tool_results})
    reply = claude_client.extract_text(response) if response is not None else ""
    if not reply:
        reply = "Je n'ai pas réussi à formuler une réponse. Pouvez-vous reformuler votre demande ?"
    return {"reply": reply, "mode": "llm", "products": _cards(ctx), "actions": ctx.actions, "suggestions": []}


# --------------------------------------------------------------------------- mode dégradé (règles)
GREETINGS = re.compile(r"^(bonjour|bonsoir|salut|coucou|hello|hi|hey|yo)\b")
THANKS = re.compile(r"\b(merci|thanks|thank you)\b")
ORDER_RE = re.compile(r"\b(commande|commandes|colis|livraison|suivi|livre|order|orders|delivery)\b")
PROMO_RE = re.compile(r"\b(promo|promos|promotion|promotions|solde|soldes|reduction|reductions|offre|offres|remise|discount|deal)\b")
RECO_RE = re.compile(r"\b(recommand\w*|conseil\w*|sugger\w*|suggestion\w*|propose\w*|idee\w*|quoi acheter|que me proposes|cadeau)\b")
HELP_RE = re.compile(r"\b(aide|help|que peux tu|que sais tu|comment ca marche|fonctionnalites)\b")
CART_RE = re.compile(r"\b(ajoute|ajouter|mets|mettre|add)\b.*\b(panier|cart)\b")
CATEGORY_RE = re.compile(r"\b(categorie|categories|rayon|rayons)\b")
QTY_RE = re.compile(r"\b(\d{1,2})\s*(x|unites?|pieces?|exemplaires?)?\b")

DEFAULT_SUGGESTIONS = ["Quelles sont les promotions ?", "Un cadeau sport à moins de 100 DT", "Où en est ma commande ?", "Que me recommandez-vous ?"]


def _fmt_products(products: list[models.Product], with_reason: bool = False) -> str:
    lines = []
    for p in products:
        price = getattr(p, "effective_price", None) or p.price
        if getattr(p, "active_promotion", None):
            promo = f" (−{p.active_promotion['discount_percent']:g}% {p.active_promotion['name']})"
        elif price < p.price:
            promo = f" (au lieu de {p.price:g} DT)"
        else:
            promo = ""
        stock = "en stock" if (p.stock or 0) > 0 else "rupture"
        reason = f" — {p.recommendation_reason}" if with_reason and getattr(p, "recommendation_reason", None) else ""
        lines.append(f"• {p.name} : {price:g} DT{promo}, {stock}{reason}")
    return "\n".join(lines)


def fallback_reply(db: Session, user_message: str, user: Optional[models.User]) -> dict:
    ctx = ToolContext(db, user)
    text = normalize(user_message)
    suggestions = list(DEFAULT_SUGGESTIONS)

    if HELP_RE.search(text):
        reply = ("Je peux vous aider à : rechercher des produits (ex. « écouteurs à moins de 150 DT »), "
                 "consulter les promotions, suivre vos commandes, obtenir des recommandations personnalisées "
                 "et ajouter un article à votre panier (ex. « ajoute le tapis de yoga au panier »).")
        return {"reply": reply, "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}

    if GREETINGS.search(text) and len(text.split()) <= 4:
        name = f" {user.full_name.split()[0]}" if user else ""
        reply = f"Bonjour{name} ! Je suis l'assistant {STORE_NAME}. Dites-moi ce que vous cherchez (type de produit, budget, catégorie) et je vous guide."
        return {"reply": reply, "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}

    if THANKS.search(text) and len(text.split()) <= 5:
        return {"reply": "Avec plaisir ! N'hésitez pas si vous avez une autre question.", "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}

    if CART_RE.search(text):
        if user is None:
            return {"reply": "Pour ajouter un article au panier, connectez-vous d'abord à votre compte.", "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}
        cleaned = re.sub(r"\b(ajoute|ajouter|mets|mettre|add|au|dans|le|la|les|mon|ma|mes|panier|cart|stp|svp|s il te plait|s il vous plait)\b", " ", text)
        qty = 1
        m = QTY_RE.search(cleaned)
        if m:
            qty = max(1, min(int(m.group(1)), 20))
            cleaned = cleaned.replace(m.group(0), " ")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        found = smart_search(db, cleaned or user_message, top_k=1)["results"] if cleaned else []
        if not found:
            return {"reply": "Je n'ai pas identifié le produit à ajouter. Précisez son nom, par exemple « ajoute le tapis de yoga au panier ».", "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}
        result = tool_add_to_cart(ctx, found[0].id, qty)
        if "error" in result:
            reply = result["error"]
        else:
            reply = f"C'est fait : {qty} × « {result['product']} » ajouté(s) à votre panier ({result['quantity_in_cart']} au total)."
        return {"reply": reply, "mode": "fallback", "products": _cards(ctx), "actions": ctx.actions, "suggestions": ["Voir mon panier", "Que me recommandez-vous ?"]}

    if ORDER_RE.search(text) and not re.search(r"\b(cherche|veux|voudrais|acheter|prix|combien)\b", text):
        if user is None:
            return {"reply": "Connectez-vous pour consulter le suivi de vos commandes.", "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}
        data = tool_get_my_orders(ctx, 3)
        orders = data.get("orders", [])
        if not orders:
            return {"reply": "Vous n'avez pas encore de commande. Je peux vous aider à trouver un produit !", "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}
        status_fr = {"PENDING": "en attente", "CONFIRMED": "confirmée", "PROCESSING": "en préparation", "SHIPPED": "expédiée", "DELIVERED": "livrée", "CANCELLED": "annulée"}
        pay_fr = {"PAID": "payée", "UNPAID": "paiement à la livraison", "REFUNDED": "remboursée", "FAILED": "paiement échoué"}
        lines = [f"• Commande #{o['id']} du {o['date']} : {status_fr.get(o['status'], o['status'])}, {pay_fr.get(o['payment_status'], o['payment_status'])}, {o['total']:g} DT" for o in orders]
        return {"reply": "Voici vos dernières commandes :\n" + "\n".join(lines), "mode": "fallback", "products": [], "actions": [], "suggestions": ["Que me recommandez-vous ?", "Quelles sont les promotions ?"]}

    if PROMO_RE.search(text) and len(text.split()) <= 8:
        data = tool_get_active_promotions(ctx)
        if not data["promotions"]:
            return {"reply": "Aucune promotion en cours pour le moment. Voulez-vous voir nos best-sellers ?", "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}
        promo_lines = [f"• {p['name']} : −{p['discount_percent']:g}% sur {p['applies_to']}" for p in data["promotions"]]
        products = list(ctx.products.values())
        reply = "Promotions en cours :\n" + "\n".join(promo_lines)
        if products:
            reply += "\n\nQuelques produits concernés :\n" + _fmt_products(products[:4])
        return {"reply": reply, "mode": "fallback", "products": _cards(ctx), "actions": [], "suggestions": suggestions}

    if CATEGORY_RE.search(text) and len(text.split()) <= 8:
        cats = tool_get_categories(ctx)["categories"]
        reply = "Nos rayons : " + ", ".join(f"{c['name']} ({c['products']})" for c in cats) + ". Dites-moi ce qui vous intéresse !"
        return {"reply": reply, "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}

    if RECO_RE.search(text) and len(text.split()) <= 10:
        data = tool_get_recommendations(ctx, 4)
        products = list(ctx.products.values())
        if not products:
            return {"reply": "Je n'ai pas encore assez d'informations pour vous recommander des produits. Parcourez la boutique et je m'adapterai !", "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}
        intro = "Voici mes recommandations personnalisées :" if user else "Voici nos produits les plus appréciés :"
        return {"reply": intro + "\n" + _fmt_products(products, with_reason=bool(user)), "mode": "fallback", "products": _cards(ctx), "actions": [], "suggestions": ["Quelles sont les promotions ?", "Ajoute le premier au panier"]}

    # Recherche produit par défaut
    result = smart_search(db, user_message, top_k=5)
    products = result["results"]
    ctx.remember(products)
    labels = [l for l in result["interpretation"]["labels"] if not l.startswith("Mots-clés")]
    if not products:
        cats = tool_get_categories(ctx)["categories"]
        reply = ("Je n'ai trouvé aucun produit correspondant. Essayez d'autres mots-clés ou parcourez nos rayons : "
                 + ", ".join(c["name"] for c in cats) + ".")
        return {"reply": reply, "mode": "fallback", "products": [], "actions": [], "suggestions": suggestions}
    if result.get("fallback"):
        intro = "Je n'ai pas de correspondance exacte, mais voici des suggestions proches"
    else:
        intro = "Voici ce que j'ai trouvé"
    if labels:
        intro += f" ({', '.join(labels).lower()})"
    reply = intro + " :\n" + _fmt_products(products)
    reply += "\n\nCliquez sur un produit pour voir sa fiche, ou dites-moi « ajoute … au panier »."
    return {"reply": reply, "mode": "fallback", "products": _cards(ctx), "actions": [], "suggestions": ["Le moins cher", "Quelles sont les promotions ?", "Que me recommandez-vous ?"]}


# --------------------------------------------------------------------------- point d'entrée
def chat(db: Session, session_id: str, user_message: str, user: Optional[models.User] = None) -> dict:
    user_id = user.id if user else None
    result: Optional[dict] = None
    if claude_client.is_configured():
        try:
            result = _llm_chat(db, session_id, user_message, user)
        except Exception as exc:
            logger.warning("Chat LLM indisponible, bascule en mode dégradé : %s", exc)
            db.rollback()
            result = None
    if result is None:
        result = fallback_reply(db, user_message, user)
    _persist(db, session_id, user_id, user_message, result["reply"])
    return result
