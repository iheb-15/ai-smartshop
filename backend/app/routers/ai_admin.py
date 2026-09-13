"""Hub IA côté administrateur : analyse des avis, comportement client, moteur de recommandation, prédictions."""
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, auth
from ..database import get_db
from ..ai import recommendation, interest_prediction, claude_client
from ..ai.reviews_ai import extract_aspects
from ..ai.text_utils import content_tokens

router = APIRouter(prefix="/ai-admin", tags=["ai-admin"])


# --------------------------------------------------------------------------- A. Avis
@router.get("/reviews-analytics")
def reviews_analytics(
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    reviews = db.query(models.Review).order_by(models.Review.created_at.desc()).all()
    total_reviews = len(reviews)
    avg_rating = round(float(db.query(func.avg(models.Review.rating)).scalar() or 0.0), 2) if total_reviews else 0.0

    sentiment_counts = Counter(r.sentiment or "neutral" for r in reviews)
    pos, neu, neg = sentiment_counts.get("positive", 0), sentiment_counts.get("neutral", 0), sentiment_counts.get("negative", 0)

    def aspects_of(r: models.Review) -> list[str]:
        if r.keywords:
            try:
                data = json.loads(r.keywords)
                if isinstance(data, list) and data:
                    return [str(a) for a in data]
            except (TypeError, ValueError):
                pass
        return extract_aspects(r.comment or "")

    pos_aspects: Counter = Counter()
    neg_aspects: Counter = Counter()
    neg_words: Counter = Counter()
    for r in reviews:
        s = r.sentiment or "neutral"
        if s == "positive":
            pos_aspects.update(aspects_of(r))
        elif s == "negative":
            neg_aspects.update(aspects_of(r))
            neg_words.update(content_tokens(r.comment or "", 4))

    # Par produit : note, % positifs, nb avis, score moyen
    per_product: dict[int, dict] = {}
    for r in reviews:
        d = per_product.setdefault(r.product_id, {"product_id": r.product_id, "product_name": r.product.name if r.product else "Produit", "image_url": r.product.image_url if r.product else None, "count": 0, "rating_sum": 0, "positive": 0, "negative": 0, "score_sum": 0.0})
        d["count"] += 1
        d["rating_sum"] += r.rating or 0
        d["positive"] += 1 if (r.sentiment == "positive") else 0
        d["negative"] += 1 if (r.sentiment == "negative") else 0
        d["score_sum"] += float(r.sentiment_score or 0.0)
    products_table = []
    for d in per_product.values():
        products_table.append(
            {
                "product_id": d["product_id"],
                "product_name": d["product_name"],
                "image_url": d["image_url"],
                "reviews": d["count"],
                "avg_rating": round(d["rating_sum"] / d["count"], 2),
                "positive_rate": round(d["positive"] / d["count"] * 100, 1),
                "negative_rate": round(d["negative"] / d["count"] * 100, 1),
                "avg_sentiment": round(d["score_sum"] / d["count"], 2),
            }
        )
    products_table.sort(key=lambda x: (x["avg_sentiment"], x["avg_rating"]))
    watchlist = [p for p in products_table if p["negative_rate"] >= 40 or p["avg_rating"] < 3][:5]

    # Tendance hebdomadaire (8 semaines)
    now = datetime.utcnow()
    trend = []
    for back in range(7, -1, -1):
        start = (now - timedelta(weeks=back)).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=(now - timedelta(weeks=back)).weekday())
        end = start + timedelta(days=7)
        bucket = [r for r in reviews if r.created_at and start <= r.created_at < end]
        trend.append(
            {
                "week": start.strftime("%d/%m"),
                "count": len(bucket),
                "positive": sum(1 for r in bucket if r.sentiment == "positive"),
                "negative": sum(1 for r in bucket if r.sentiment == "negative"),
                "avg_rating": round(sum(r.rating or 0 for r in bucket) / len(bucket), 2) if bucket else None,
            }
        )

    reviews_list = [
        {
            "id": r.id,
            "product_id": r.product_id,
            "product_name": r.product.name if r.product else "Produit",
            "product_image": r.product.image_url if r.product else None,
            "user_name": r.user.full_name if r.user else "Client",
            "rating": r.rating,
            "comment": r.comment,
            "sentiment": r.sentiment or "neutral",
            "sentiment_score": r.sentiment_score,
            "aspects": aspects_of(r),
            "is_verified_purchase": bool(r.is_verified_purchase),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reviews[:30]
    ]

    return {
        "mode": "llm" if claude_client.is_configured() else "rules",
        "total_reviews": total_reviews,
        "average_rating": avg_rating,
        "satisfaction_rate": round((pos / total_reviews) * 100, 1) if total_reviews else 100.0,
        "verified_rate": round(sum(1 for r in reviews if r.is_verified_purchase) / total_reviews * 100, 1) if total_reviews else 0.0,
        "sentiment_breakdown": {"positive": pos, "neutral": neu, "negative": neg},
        "problem_keywords": [{"keyword": w, "occurrences": c} for w, c in neg_words.most_common(8)],
        "positive_aspects": [{"aspect": a, "count": c} for a, c in pos_aspects.most_common(6)],
        "negative_aspects": [{"aspect": a, "count": c} for a, c in neg_aspects.most_common(6)],
        "products": products_table,
        "watchlist": watchlist,
        "trend": trend,
        "reviews": reviews_list,
    }


# --------------------------------------------------------------------------- B. Comportement
def _rfm_segments(db: Session) -> dict:
    now = datetime.utcnow()
    customers = db.query(models.User).filter(models.User.is_admin == False).all()  # noqa: E712
    rows = []
    for u in customers:
        orders = [o for o in u.orders if (o.status or "").upper() != "CANCELLED"]
        if not orders:
            continue
        last = max(o.created_at for o in orders if o.created_at)
        rows.append({"user_id": u.id, "full_name": u.full_name, "email": u.email, "recency_days": (now - last).days, "frequency": len(orders), "monetary": round(sum(o.total or 0 for o in orders), 2)})
    prospects = len(customers) - len(rows)
    if not rows:
        return {"segments": [], "customers": [], "prospects": prospects}

    def score(values, reverse=False):
        arr = np.array(values, dtype=float)
        q = np.percentile(arr, [25, 50, 75])
        out = []
        for v in arr:
            s = 1 + int(v > q[0]) + int(v > q[1]) + int(v > q[2])
            out.append(5 - s if reverse else s)
        return out

    r_scores = score([r["recency_days"] for r in rows], reverse=True)
    f_scores = score([r["frequency"] for r in rows])
    m_scores = score([r["monetary"] for r in rows])
    segments_def = {
        "Champions": "Clients récents, fréquents et à forte valeur : à récompenser (programme VIP, avant-premières).",
        "Fidèles": "Achètent régulièrement : proposer des ventes croisées et des offres de fidélité.",
        "Prometteurs": "Clients récents à bon potentiel : encourager le second achat.",
        "Nouveaux": "Premier achat récent : soigner l'onboarding et le suivi de livraison.",
        "À risque": "Bons clients qui ne sont pas revenus : campagne de réactivation ciblée.",
        "Endormis": "Inactifs depuis longtemps : offre de reconquête ou désabonnement.",
        "Occasionnels": "Achats sporadiques : relancer avec des promotions sur leurs catégories.",
    }
    for row, r, f, m in zip(rows, r_scores, f_scores, m_scores):
        row.update({"r": r, "f": f, "m": m})
        if r >= 3 and f >= 3 and m >= 3:
            seg = "Champions"
        elif f >= 3:
            seg = "Fidèles"
        elif r >= 3 and m >= 3:
            seg = "Prometteurs"
        elif r >= 3 and f <= 2:
            seg = "Nouveaux"
        elif r <= 2 and (f >= 2 or m >= 3):
            seg = "À risque"
        elif r == 1:
            seg = "Endormis"
        else:
            seg = "Occasionnels"
        row["segment"] = seg
    segments = []
    for name, desc in segments_def.items():
        members = [r for r in rows if r["segment"] == name]
        if not members:
            continue
        segments.append({"name": name, "description": desc, "count": len(members), "avg_monetary": round(sum(m["monetary"] for m in members) / len(members), 2), "avg_frequency": round(sum(m["frequency"] for m in members) / len(members), 1)})
    segments.sort(key=lambda s: s["count"], reverse=True)
    rows.sort(key=lambda r: (r["monetary"]), reverse=True)
    return {"segments": segments, "customers": rows, "prospects": prospects}


@router.get("/customer-behavior")
def customer_behavior(
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
    days: int = Query(30, ge=7, le=365),
):
    since = datetime.utcnow() - timedelta(days=days)

    # Top produits vendus
    top_sold = (
        db.query(models.Product.id, models.Product.name, models.Product.image_url, models.Product.price, func.sum(models.OrderItem.quantity).label("units_sold"), func.sum(models.OrderItem.quantity * models.OrderItem.unit_price).label("revenue"))
        .join(models.OrderItem, models.OrderItem.product_id == models.Product.id)
        .join(models.Order, models.Order.id == models.OrderItem.order_id)
        .filter(models.Order.status != "CANCELLED")
        .group_by(models.Product.id)
        .order_by(func.sum(models.OrderItem.quantity).desc())
        .limit(6)
        .all()
    )
    cart_intent = (
        db.query(models.Product.name, func.sum(models.CartItem.quantity).label("in_carts"))
        .join(models.CartItem, models.CartItem.product_id == models.Product.id)
        .group_by(models.Product.id)
        .order_by(func.sum(models.CartItem.quantity).desc())
        .limit(5)
        .all()
    )
    cat_perf = (
        db.query(models.Category.name, func.coalesce(func.sum(models.OrderItem.quantity), 0).label("units"), func.coalesce(func.sum(models.OrderItem.quantity * models.OrderItem.unit_price), 0.0).label("revenue"))
        .join(models.Product, models.Product.category_id == models.Category.id)
        .join(models.OrderItem, models.OrderItem.product_id == models.Product.id, isouter=True)
        .group_by(models.Category.id)
        .order_by(func.sum(models.OrderItem.quantity).desc())
        .all()
    )
    valid_orders = db.query(models.Order).filter(models.Order.status != "CANCELLED")
    total_orders = valid_orders.count()
    total_revenue = valid_orders.with_entities(func.sum(models.Order.total)).scalar() or 0.0
    aov = round(total_revenue / total_orders, 2) if total_orders else 0.0

    # Événements (période)
    events = db.query(models.Interaction).filter(models.Interaction.created_at >= since).all()
    by_type = Counter(e.event_type for e in events)

    def actors(etype: str) -> int:
        return len({(e.user_id or f"s:{e.session_id or e.id}") for e in events if e.event_type == etype})

    funnel_actors = {"view": actors("view"), "add_to_cart": actors("add_to_cart"), "purchase": actors("purchase")}
    funnel = [
        {"step": "Vues produit", "events": by_type.get("view", 0), "actors": funnel_actors["view"]},
        {"step": "Ajouts au panier", "events": by_type.get("add_to_cart", 0), "actors": funnel_actors["add_to_cart"]},
        {"step": "Achats", "events": by_type.get("purchase", 0), "actors": funnel_actors["purchase"]},
    ]
    conv_view_cart = round(funnel_actors["add_to_cart"] / funnel_actors["view"] * 100, 1) if funnel_actors["view"] else 0.0
    conv_cart_purchase = round(funnel_actors["purchase"] / funnel_actors["add_to_cart"] * 100, 1) if funnel_actors["add_to_cart"] else 0.0
    conv_global = round(funnel_actors["purchase"] / funnel_actors["view"] * 100, 1) if funnel_actors["view"] else 0.0

    # Produits les plus consultés + conversion par produit
    views_per_product: Counter = Counter()
    carts_per_product: Counter = Counter()
    buys_per_product: Counter = Counter()
    for e in events:
        if e.product_id is None:
            continue
        if e.event_type == "view":
            views_per_product[e.product_id] += 1
        elif e.event_type == "add_to_cart":
            carts_per_product[e.product_id] += 1
        elif e.event_type == "purchase":
            buys_per_product[e.product_id] += 1
    product_names = {p.id: (p.name, p.image_url) for p in db.query(models.Product).all()}
    most_viewed = []
    for pid, v in views_per_product.most_common(8):
        name, img = product_names.get(pid, (f"#{pid}", None))
        most_viewed.append({"product_id": pid, "name": name, "image_url": img, "views": v, "cart_adds": carts_per_product.get(pid, 0), "purchases": buys_per_product.get(pid, 0), "conversion": round(buys_per_product.get(pid, 0) / v * 100, 1) if v else 0.0})
    # Vus mais jamais achetés (opportunités)
    viewed_not_bought = [m for m in most_viewed if m["purchases"] == 0 and m["views"] >= 2][:5]

    # Recherches
    search_counter: Counter = Counter()
    zero_counter: Counter = Counter()
    for e in events:
        if e.event_type == "search" and e.query:
            key = e.query.strip().lower()
            search_counter[key] += 1
            if (e.value or 0) == 0:
                zero_counter[key] += 1
    top_searches = [{"query": q, "count": c, "zero_results": zero_counter.get(q, 0)} for q, c in search_counter.most_common(10)]
    zero_result_searches = [{"query": q, "count": c} for q, c in zero_counter.most_common(8)]

    # Timeline 14 jours
    timeline = []
    today = datetime.utcnow().date()
    per_day: dict[str, Counter] = defaultdict(Counter)
    for e in events:
        if e.created_at:
            per_day[e.created_at.strftime("%Y-%m-%d")][e.event_type] += 1
    for back in range(13, -1, -1):
        day = today - timedelta(days=back)
        key = day.strftime("%Y-%m-%d")
        c = per_day.get(key, Counter())
        timeline.append({"date": day.strftime("%d/%m"), "views": c.get("view", 0), "cart": c.get("add_to_cart", 0), "purchases": c.get("purchase", 0), "searches": c.get("search", 0), "chats": c.get("chat", 0)})

    # Chatbot : sujets fréquents
    chat_queries = db.query(models.ChatMessage.content).filter(models.ChatMessage.role == "user").order_by(models.ChatMessage.created_at.desc()).limit(100).all()
    tokens: list[str] = []
    for (q,) in chat_queries:
        tokens.extend(content_tokens(q or "", 4))
    top_inquiries = [{"query": w, "count": c} for w, c in Counter(tokens).most_common(8)]
    chat_sessions = db.query(func.count(func.distinct(models.ChatMessage.session_id))).scalar() or 0

    hour_counter = Counter(e.created_at.hour for e in events if e.created_at)
    peak_hours = [{"hour": h, "events": c} for h, c in sorted(hour_counter.items())]

    return {
        "period_days": days,
        "average_order_value": aov,
        "total_orders": total_orders,
        "events_total": len(events),
        "events_by_type": dict(by_type),
        "funnel": funnel,
        "conversion": {"view_to_cart": conv_view_cart, "cart_to_purchase": conv_cart_purchase, "global": conv_global},
        "most_viewed": most_viewed,
        "viewed_not_bought": viewed_not_bought,
        "top_searches": top_searches,
        "zero_result_searches": zero_result_searches,
        "timeline": timeline,
        "peak_hours": peak_hours,
        "rfm": _rfm_segments(db),
        "chat_sessions": chat_sessions,
        "top_sold_products": [{"id": p[0], "name": p[1], "image_url": p[2], "price": p[3], "units_sold": int(p[4]), "revenue": round(float(p[5]), 2)} for p in top_sold],
        "cart_intentions": [{"name": p[0], "count": int(p[1])} for p in cart_intent],
        "category_performance": [{"name": c[0], "units": int(c[1] or 0), "revenue": round(float(c[2] or 0.0), 2)} for c in cat_perf],
        "top_chatbot_inquiries": top_inquiries,
    }


@router.get("/customers/{user_id}/activity")
def customer_activity(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
    limit: int = Query(30, ge=1, le=200),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé.")
    events = db.query(models.Interaction).filter(models.Interaction.user_id == user_id).order_by(models.Interaction.created_at.desc()).limit(limit).all()
    counts = Counter(e.event_type for e in db.query(models.Interaction).filter(models.Interaction.user_id == user_id).all())
    cat_counter: Counter = Counter()
    for e in db.query(models.Interaction).filter(models.Interaction.user_id == user_id, models.Interaction.product_id != None).all():  # noqa: E711
        if e.product and e.product.category:
            cat_counter[e.product.category.name] += 1
    total_cat = sum(cat_counter.values()) or 1
    return {
        "user_id": user_id,
        "counts": dict(counts),
        "favorite_categories": [{"name": n, "share": round(c / total_cat * 100, 1)} for n, c in cat_counter.most_common(4)],
        "wishlist_count": db.query(models.WishlistItem).filter(models.WishlistItem.user_id == user_id).count(),
        "events": [
            {"id": e.id, "event_type": e.event_type, "product_id": e.product_id, "product_name": e.product.name if e.product else None, "query": e.query, "value": e.value, "created_at": e.created_at.isoformat() if e.created_at else None}
            for e in events
        ],
    }


# --------------------------------------------------------------------------- C. Recommandation
@router.get("/recommendations-stats")
def recommendations_stats(
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    return recommendation.engine_stats(db)


# --------------------------------------------------------------------------- D. Prédictions
@router.get("/predictions")
def predictive_insights(
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    """Prévision de rupture de stock (vélocité des ventes) + insights actionnables."""
    products = db.query(models.Product).filter(models.Product.is_available == True).all()  # noqa: E712
    orders = db.query(models.Order).filter(models.Order.status != "CANCELLED").order_by(models.Order.created_at.asc()).all()

    days_active = 30
    if orders and orders[0].created_at:
        days_active = max(1, (datetime.utcnow() - orders[0].created_at).days)

    item_sales = Counter()
    for o in orders:
        for oi in o.items:
            item_sales[oi.product_id] += oi.quantity or 0

    stock_forecasts, urgent_restock = [], []
    for p in products:
        sold_qty = item_sales.get(p.id, 0)
        daily_velocity = round(sold_qty / days_active, 3)
        days_left = round(p.stock / daily_velocity, 1) if daily_velocity > 0 else None
        status = "Rupture imminente" if (p.stock <= 5 or (days_left is not None and days_left <= 7)) else ("À surveiller" if days_left is not None and days_left <= 21 else "Stock optimal")
        forecast = {"id": p.id, "name": p.name, "stock": p.stock, "sold": sold_qty, "daily_velocity": daily_velocity, "days_left": days_left, "status": status, "suggested_restock": int(max(0, round(daily_velocity * 30 - p.stock))) if daily_velocity > 0 else 0}
        stock_forecasts.append(forecast)
        if status == "Rupture imminente":
            urgent_restock.append(forecast)
    stock_forecasts.sort(key=lambda x: (x["days_left"] if x["days_left"] is not None else 9999, x["stock"]))
    urgent_restock.sort(key=lambda x: x["stock"])

    insights = []
    if urgent_restock:
        top_urgent = urgent_restock[0]
        insights.append({"type": "warning", "title": "Réapprovisionnement immédiat", "description": f"« {top_urgent['name']} » : {top_urgent['stock']} unité(s) restante(s) pour une vélocité de {top_urgent['daily_velocity']} u/j. Commander environ {max(top_urgent['suggested_restock'], 10)} unités."})
    abandoned = (
        db.query(models.Product.name, func.sum(models.CartItem.quantity))
        .join(models.CartItem, models.CartItem.product_id == models.Product.id)
        .group_by(models.Product.id)
        .order_by(func.sum(models.CartItem.quantity).desc())
        .first()
    )
    if abandoned:
        insights.append({"type": "opportunity", "title": "Conversion des paniers", "description": f"« {abandoned[0]} » est présent dans des paniers non validés ({int(abandoned[1])} unité(s)). Une relance ou une remise ciblée peut déclencher l'achat."})
    slow = [f for f in stock_forecasts if f["sold"] == 0 and f["stock"] >= 20]
    if slow:
        insights.append({"type": "info", "title": "Stock dormant", "description": f"{len(slow)} produit(s) avec un stock important et aucune vente (ex. « {slow[0]['name']} ») : envisager une promotion ou une mise en avant."})
    bundle = interest_prediction.train(db)
    insights.append({"type": "info", "title": "Modèle de prédiction d'intérêt", "description": f"{bundle.model_type} — {bundle.n_samples} paires client/produit, {bundle.n_positives} achats positifs" + (f", AUC {bundle.metrics.get('roc_auc')}" if bundle.metrics.get("roc_auc") is not None else "") + "."})

    return {
        "days_history_analyzed": days_active,
        "stock_forecasts": stock_forecasts[:15],
        "urgent_restock": urgent_restock[:5],
        "actionable_insights": insights,
    }


@router.get("/predictions/model")
def prediction_model_info(db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin)):
    return interest_prediction.model_info(db)


@router.post("/predictions/retrain")
def prediction_retrain(db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin)):
    interest_prediction.train(db, force=True)
    return interest_prediction.model_info(db)


@router.get("/predictions/overview")
def prediction_overview(db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin)):
    return {"customers": interest_prediction.predictions_overview(db)}


@router.get("/predictions/customer/{user_id}")
def prediction_for_customer(user_id: int, db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin), top_k: int = Query(6, ge=1, le=20)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé.")
    preds = interest_prediction.predict_for_user(db, user_id, top_k=top_k)
    return {
        "user_id": user_id,
        "predictions": [
            {"product_id": r["product"].id, "name": r["product"].name, "image_url": r["product"].image_url, "price": r["product"].price, "effective_price": r["product"].effective_price, "probability": r["probability"], "reasons": r["reasons"]}
            for r in preds
        ],
    }
