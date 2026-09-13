"""
Analyse des avis clients.

  - analyze_review()       : sentiment (positive / neutral / negative), score continu [-1, 1],
                             aspects évoqués (prix, qualité, livraison, ...).
        mode « llm »   : Claude, sortie structurée via appel d'outil
        mode « rules » : lexique FR/EN avec gestion de la négation et des intensifieurs,
                         combiné à la note (étoiles) comme a priori.
  - summarize_product_reviews() : synthèse par produit (résumé + points forts + points faibles),
                             mise en cache dans la table products tant que le nombre d'avis ne change pas.
"""
from __future__ import annotations

import json
import logging
import math
from collections import Counter
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from .. import models
from . import claude_client
from .text_utils import normalize, tokenize

logger = logging.getLogger(__name__)

POSITIVE_WORDS = {
    "excellent", "excellente", "excellents", "parfait", "parfaite", "parfaitement", "super", "genial", "geniale",
    "top", "bien", "tres bien", "bon", "bonne", "bons", "bonnes", "satisfait", "satisfaite", "satisfaisant", "ravi",
    "ravie", "recommande", "recommander", "conforme", "rapide", "rapidement", "solide", "robuste", "confortable",
    "agreable", "joli", "jolie", "beau", "belle", "magnifique", "efficace", "pratique", "facile", "fiable",
    "qualite", "impeccable", "nickel", "bluffant", "bluffante", "incroyable", "formidable", "adore", "aime",
    "content", "contente", "heureux", "heureuse", "merci", "bravo", "puissant", "puissante", "leger", "legere",
    "elegant", "elegante", "durable", "precis", "precise", "fluide", "silencieux", "silencieuse", "abordable",
    "great", "good", "perfect", "amazing", "awesome", "love", "excellent", "nice", "best",
    "fantastic", "wonderful", "happy", "recommend", "fast", "quality", "comfortable", "sturdy",
}
NEGATIVE_WORDS = {
    "mauvais", "mauvaise", "nul", "nulle", "horrible", "decevant", "decevante", "decu", "decue", "deception",
    "fragile", "casse", "cassee", "defectueux", "defectueuse", "panne", "probleme", "problemes", "bug", "bugs",
    "lent", "lente", "retard", "bloque", "bloquee", "arnaque", "cher", "chere", "trop cher", "inutile",
    "insuffisant", "insuffisante", "faible", "moche", "laid", "inconfortable", "douloureux", "bruyant",
    "bruyante", "scintille", "chauffe", "surchauffe", "mediocre", "moyen", "moyenne", "bof", "dommage",
    "malheureusement", "regrette", "rembourse", "remboursement", "retour", "renvoye", "abime", "abimee",
    "rayure", "rayures", "manque", "manquant", "incomplet", "faux", "contrefacon", "jamais", "pire",
    "catastrophe", "catastrophique", "impossible", "difficile", "complique", "pas", "aucun", "aucune",
    "bad", "poor", "terrible", "awful", "broken", "defective", "disappointed", "disappointing", "slow", "late",
    "cheap", "useless", "waste", "worst", "problem", "issue", "refund", "noisy", "uncomfortable",
    "eleve", "elevee", "excessif", "excessive", "couteux", "couteuse", "hors de prix", "instable", "gresille", "floue", "flou",
    "deregle", "incoherent", "incoherentes", "incoherents", "lourd", "lourde", "juste", "limite", "tarde", "attendre",
}
WEAK_POSITIVE_WORDS = {"correct", "correcte", "ok", "convenable", "acceptable", "honnete", "raisonnable", "satisfaisante", "sympa", "fine", "decent"}
# mots qui ne comptent pas seuls (gérés par la négation)
NEUTRAL_MARKERS = {"pas", "aucun", "aucune", "jamais", "ne", "ni", "non", "sans", "not", "no", "never"}
NEGATIONS = {"pas", "ne", "n", "jamais", "aucun", "aucune", "ni", "non", "sans", "not", "no", "never", "dont", "doesnt", "isnt"}
INTENSIFIERS = {"tres": 1.5, "vraiment": 1.5, "trop": 1.3, "super": 1.4, "extremement": 1.8, "hyper": 1.5, "totalement": 1.4, "absolument": 1.6, "really": 1.5, "very": 1.5, "so": 1.2, "extremely": 1.8}

ASPECTS: dict[str, set[str]] = {
    "qualité": {"qualite", "solide", "robuste", "fragile", "casse", "cassee", "materiau", "materiaux", "finition", "finitions", "durable", "resistant", "resistante", "quality", "sturdy", "broken"},
    "prix": {"prix", "cher", "chere", "abordable", "economique", "cout", "budget", "tarif", "rapport", "price", "expensive", "cheap", "value"},
    "livraison": {"livraison", "livre", "livree", "delai", "delais", "colis", "retard", "expedition", "emballage", "reception", "recu", "delivery", "shipping", "package", "late"},
    "confort": {"confortable", "confort", "agreable", "doux", "douce", "leger", "legere", "lourd", "lourde", "ergonomique", "comfortable", "comfort"},
    "taille": {"taille", "grand", "grande", "petit", "petite", "dimension", "dimensions", "ajuste", "ajustee", "serre", "large", "size", "fit"},
    "autonomie": {"autonomie", "batterie", "charge", "recharge", "chargeur", "battery", "charging"},
    "son": {"son", "audio", "basses", "sonore", "bruit", "reduction", "volume", "sound", "bass", "noise"},
    "design": {"design", "joli", "jolie", "beau", "belle", "elegant", "elegante", "moche", "couleur", "couleurs", "style", "look", "esthetique", "beautiful", "ugly"},
    "utilisation": {"facile", "pratique", "simple", "complique", "difficile", "installation", "notice", "utilisation", "utiliser", "intuitif", "easy", "setup", "use"},
    "service client": {"service", "client", "sav", "support", "remboursement", "retour", "echange", "vendeur", "refund", "return", "customer"},
    "fiabilité": {"panne", "bug", "bugs", "defectueux", "defectueuse", "fonctionne", "marche", "scintille", "chauffe", "surchauffe", "probleme", "problemes", "fiable", "reliable", "defective", "works", "problem"},
}

RATING_PRIOR = {1: -0.7, 2: -0.4, 3: 0.0, 4: 0.35, 5: 0.65}


def _label_from_score(score: float) -> str:
    if score > 0.15:
        return "positive"
    if score < -0.15:
        return "negative"
    return "neutral"


def extract_aspects(comment: str) -> list[str]:
    tokens = set(tokenize(comment, 2))
    found = []
    for aspect, words in ASPECTS.items():
        if tokens & words:
            found.append(aspect)
    return found[:5]


def lexicon_sentiment(comment: str, rating: Optional[int] = None) -> tuple[str, float]:
    tokens = tokenize(comment, 1)
    score = 0.0
    matched = 0
    for idx, tok in enumerate(tokens):
        polarity = 0.0
        if tok in POSITIVE_WORDS and tok not in NEUTRAL_MARKERS:
            polarity = 1.0
        elif tok in WEAK_POSITIVE_WORDS:
            polarity = 0.4
        elif tok in NEGATIVE_WORDS and tok not in NEUTRAL_MARKERS:
            polarity = -1.0
        if polarity == 0.0:
            continue
        window = tokens[max(0, idx - 3): idx]
        if any(w in NEGATIONS for w in window):
            polarity *= -0.8  # « pas mal », « pas cher »
        for w in window:
            if w in INTENSIFIERS:
                polarity *= INTENSIFIERS[w]
        score += polarity
        matched += 1
    lexical = math.tanh(score / math.sqrt(matched)) if matched else 0.0
    prior = RATING_PRIOR.get(int(rating), 0.0) if rating else 0.0
    if matched and rating:
        final = 0.6 * lexical + 0.4 * prior
    elif matched:
        final = lexical
    else:
        final = prior
    final = max(-1.0, min(1.0, final))
    return _label_from_score(final), round(final, 3)


_REVIEW_TOOL = {
    "name": "analyze_review",
    "description": "Analyse un avis client e-commerce.",
    "input_schema": {
        "type": "object",
        "properties": {
            "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]},
            "score": {"type": "number", "description": "Polarité de -1 (très négatif) à 1 (très positif)."},
            "aspects": {"type": "array", "items": {"type": "string"}, "description": "Aspects évoqués (ex: prix, qualité, livraison, confort, autonomie, design, service client). 0 à 4 éléments, en français, minuscules."},
        },
        "required": ["sentiment", "score", "aspects"],
    },
}


def analyze_review(comment: str, rating: Optional[int] = None) -> dict:
    """Retourne {sentiment, score, aspects, mode}. Ne lève jamais : repli lexical automatique."""
    comment = (comment or "").strip()
    if not comment:
        prior = RATING_PRIOR.get(int(rating), 0.0) if rating else 0.0
        return {"sentiment": _label_from_score(prior), "score": prior, "aspects": [], "mode": "rules"}
    if claude_client.is_configured():
        try:
            response = claude_client.create_message(
                max_tokens=200,
                system="Tu es un analyste d'avis clients pour une boutique en ligne. Appelle l'outil analyze_review.",
                messages=[{"role": "user", "content": f"Note attribuée : {rating or 'inconnue'}/5\nAvis : {comment}"}],
                tools=[_REVIEW_TOOL],
                tool_choice={"type": "tool", "name": "analyze_review"},
            )
            data = claude_client.extract_tool_input(response, "analyze_review")
            if data and data.get("sentiment") in {"positive", "neutral", "negative"}:
                try:
                    score = max(-1.0, min(1.0, float(data.get("score", 0.0))))
                except (TypeError, ValueError):
                    score = {"positive": 0.6, "neutral": 0.0, "negative": -0.6}[data["sentiment"]]
                aspects = [str(a).strip().lower() for a in (data.get("aspects") or []) if str(a).strip()][:5]
                return {"sentiment": data["sentiment"], "score": round(score, 3), "aspects": aspects, "mode": "llm"}
        except Exception as exc:
            logger.warning("Analyse LLM de l'avis impossible, repli lexical : %s", exc)
    label, score = lexicon_sentiment(comment, rating)
    return {"sentiment": label, "score": score, "aspects": extract_aspects(comment), "mode": "rules"}


def analyze_sentiment(comment: str) -> str:
    """Compatibilité avec l'ancien code : uniquement l'étiquette."""
    return analyze_review(comment)["sentiment"]


# --------------------------------------------------------------------------- synthèse produit
_SUMMARY_TOOL = {
    "name": "write_review_summary",
    "description": "Rédige une synthèse des avis clients d'un produit.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "2 à 3 phrases en français, neutres et factuelles."},
            "pros": {"type": "array", "items": {"type": "string"}, "description": "Points forts (max 4, courts)."},
            "cons": {"type": "array", "items": {"type": "string"}, "description": "Points faibles (max 4, courts)."},
        },
        "required": ["summary", "pros", "cons"],
    },
}


def _aspect_counts(reviews: list[models.Review], sentiment: str) -> list[str]:
    counter: Counter = Counter()
    for r in reviews:
        if (r.sentiment or "neutral") != sentiment:
            continue
        aspects = []
        if r.keywords:
            try:
                aspects = json.loads(r.keywords)
            except (TypeError, ValueError):
                aspects = []
        if not aspects:
            aspects = extract_aspects(r.comment or "")
        counter.update(aspects)
    return [a for a, _ in counter.most_common(4)]


def _rules_summary(reviews: list[models.Review], avg: float, breakdown: dict[str, int]) -> dict:
    n = len(reviews)
    pos_pct = round(breakdown["positive"] / n * 100) if n else 0
    neg_pct = round(breakdown["negative"] / n * 100) if n else 0
    pros = _aspect_counts(reviews, "positive")
    cons = _aspect_counts(reviews, "negative")
    if pos_pct >= 70:
        verdict = "Les clients sont majoritairement satisfaits."
    elif neg_pct >= 40:
        verdict = "Les retours sont mitigés, plusieurs clients signalent des problèmes."
    else:
        verdict = "Les avis sont globalement corrects avec quelques réserves."
    parts = [f"Sur {n} avis, la note moyenne est de {avg:.1f}/5 ({pos_pct}% positifs, {neg_pct}% négatifs). {verdict}"]
    if pros:
        parts.append("Points appréciés : " + ", ".join(pros) + ".")
    if cons:
        parts.append("Points à améliorer : " + ", ".join(cons) + ".")
    return {"summary": " ".join(parts), "pros": pros, "cons": cons, "mode": "rules"}


def summarize_product_reviews(db: Session, product: models.Product, force: bool = False) -> dict:
    reviews = db.query(models.Review).filter(models.Review.product_id == product.id).order_by(models.Review.created_at.desc()).all()
    n = len(reviews)
    breakdown = {"positive": 0, "neutral": 0, "negative": 0}
    for r in reviews:
        breakdown[r.sentiment if r.sentiment in breakdown else "neutral"] += 1
    avg = round(sum(r.rating or 0 for r in reviews) / n, 2) if n else 0.0
    base = {"product_id": product.id, "reviews_count": n, "average_rating": avg, "sentiment_breakdown": breakdown}
    if n == 0:
        return {**base, "summary": "Aucun avis pour le moment : soyez le premier à donner votre opinion.", "pros": [], "cons": [], "mode": "rules", "generated_at": None}

    if not force and product.review_summary and product.review_summary_count == n:
        try:
            cached = json.loads(product.review_summary)
            if cached.get("summary"):
                return {**base, **cached, "generated_at": product.review_summary_at}
        except (TypeError, ValueError):
            pass

    result: Optional[dict] = None
    if claude_client.is_configured():
        try:
            listing = "\n".join(f"- ({r.rating}/5) {r.comment}" for r in reviews[:30] if r.comment)
            response = claude_client.create_message(
                max_tokens=500,
                system="Tu synthétises des avis clients pour une fiche produit e-commerce. Appelle l'outil write_review_summary. Reste factuel, en français.",
                messages=[{"role": "user", "content": f"Produit : {product.name}\nNote moyenne : {avg}/5 sur {n} avis\nAvis :\n{listing}"}],
                tools=[_SUMMARY_TOOL],
                tool_choice={"type": "tool", "name": "write_review_summary"},
            )
            data = claude_client.extract_tool_input(response, "write_review_summary")
            if data and data.get("summary"):
                result = {
                    "summary": str(data["summary"]).strip(),
                    "pros": [str(x) for x in (data.get("pros") or [])][:4],
                    "cons": [str(x) for x in (data.get("cons") or [])][:4],
                    "mode": "llm",
                }
        except Exception as exc:
            logger.warning("Synthèse LLM impossible, repli sur la synthèse statistique : %s", exc)
    if result is None:
        result = _rules_summary(reviews, avg, breakdown)

    product.review_summary = json.dumps(result, ensure_ascii=False)
    product.review_summary_count = n
    product.review_summary_at = datetime.utcnow()
    db.commit()
    return {**base, **result, "generated_at": product.review_summary_at}
