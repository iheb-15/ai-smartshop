"""
Recherche intelligente en langage naturel.

Pipeline :
 1. Compréhension de la requête -> intention structurée (mots-clés, catégorie, fourchette de prix,
    tri souhaité, en stock, en promo).
      - mode « llm »   : Claude extrait les filtres via un appel outil (sortie JSON structurée)
      - mode « rules » : analyseur à base de règles/regex FR-EN (toujours disponible, sans clé API)
 2. Filtrage du catalogue selon l'intention.
 3. Classement sémantique TF-IDF (mots + n-grammes de caractères, tolérant aux fautes/accents)
    + bonus si un mot-clé apparaît dans le nom du produit.
 4. Repli : si aucun produit ne correspond aux mots-clés, on renvoie les produits filtrés
    triés selon l'intention (ou par popularité).
"""
from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field, asdict
from typing import Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..services.catalog import enrich_products, visible_products_query
from ..services.pricing import active_promotions, best_price
from . import claude_client
from .text_utils import FRENCH_STOPWORDS, normalize, tokenize, stem as _stem, tfidf_analyzer

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- intention
@dataclass
class SearchIntent:
    keywords: str = ""
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    sort: Optional[str] = None  # cheapest | price_desc | rating | newest | popular
    in_stock_only: bool = False
    on_promo: bool = False
    labels: list[str] = field(default_factory=list)
    source: str = "rules"

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("source", None)
        return d


NUM = r"(\d+(?:[.,]\d+)?)"
CUR = r"\s*(?:dt|dinars?|dinar|tnd|€|euros?|eur|dollars?|\$)?"

_BETWEEN = [
    rf"\bentre\s*{NUM}{CUR}\s*et\s*{NUM}{CUR}",
    rf"\bbetween\s*{NUM}{CUR}\s*and\s*{NUM}{CUR}",
    rf"\bde\s*{NUM}{CUR}\s*a\s*{NUM}{CUR}",
    rf"\b{NUM}\s*-\s*{NUM}{CUR}",
]
_AROUND = [rf"(?:autour de|environ|approximativement|aux alentours de|around|about|~)\s*{NUM}{CUR}"]
_MAX = [
    rf"(?:moins de|moins que|en dessous de|en-dessous de|sous|max(?:imum)?|jusqu a|jusqua|pas plus de|inferieur a|inferieure a|under|below|less than|at most|<=?)\s*{NUM}{CUR}",
    rf"\bbudget\s*(?:de|d|:)?\s*{NUM}{CUR}",
    rf"\b{NUM}{CUR}\s*(?:max(?:imum)?|maxi|au plus|tout au plus|grand max)",
]
_MIN = [
    rf"(?:plus de|plus que|au dessus de|au-dessus de|min(?:imum)?|a partir de|superieur a|superieure a|over|above|more than|at least|>=?)\s*{NUM}{CUR}",
    rf"\b{NUM}{CUR}\s*(?:min(?:imum)?|mini|au moins)",
]

_SORT_PHRASES: list[tuple[str, list[str]]] = [
    ("cheapest", ["pas cher", "pas chere", "pas chers", "pas cheres", "bon marche", "economique", "economiques", "abordable", "abordables", "moins cher", "moins chere", "petit prix", "petits prix", "petit budget", "low cost", "cheap", "cheapest", "budget serre"]),
    ("price_desc", ["haut de gamme", "premium", "luxe", "luxueux", "luxueuse", "le plus cher", "la plus chere", "expensive", "high end", "top qualite"]),
    ("rating", ["meilleur", "meilleurs", "meilleure", "meilleures", "mieux note", "mieux notes", "bien note", "bien notes", "bien notee", "top rated", "best rated", "recommande", "recommandes", "plebiscite", "les mieux notes", "best", "top"]),
    ("popular", ["populaire", "populaires", "plus vendu", "plus vendus", "best seller", "bestseller", "best sellers", "tendance", "tendances", "a la mode", "popular", "trending"]),
    ("newest", ["nouveau", "nouveaux", "nouvelle", "nouvelles", "nouveaute", "nouveautes", "recent", "recents", "recente", "recentes", "dernier", "derniers", "derniere", "dernieres", "new", "latest", "newest"]),
]
GIFT_WORDS = {"cadeau", "cadeaux", "offrir", "gift", "present"}
SEARCH_NOISE = {"dt", "dinar", "dinars", "tnd", "eur", "euro", "euros", "prix", "cher", "chere", "budget", "pour", "ami", "amie", "mere", "pere", "maman", "papa", "collegue", "frere", "soeur", "copain", "copine", "mari", "epouse"}
_STOCK_PHRASES = ["en stock", "disponible", "disponibles", "dispo", "available", "in stock", "livrable"]
_PROMO_PHRASES = ["promo", "promos", "promotion", "promotions", "solde", "soldes", "reduction", "reductions", "remise", "remises", "offre", "offres", "discount", "discounts", "sale", "deal", "deals", "bon plan", "bons plans", "reduit", "reduits"]

# Synonymes génériques -> détecte la catégorie même quand le client n'emploie pas son nom exact
CATEGORY_SYNONYMS: dict[str, list[str]] = {
    "electronique": ["electronique", "electro", "high tech", "hightech", "high-tech", "tech", "techno", "gadget", "gadgets", "informatique", "audio", "connecte", "connectee", "numerique", "electronics"],
    "mode": ["mode", "vetement", "vetements", "habit", "habits", "fashion", "textile", "tenue", "tenues", "pret a porter", "clothing", "clothes"],
    "maison": ["maison", "deco", "decoration", "home", "cuisine", "interieur", "menage", "menager", "domestique", "habitat"],
    "sport": ["sport", "sports", "sportif", "sportive", "sportifs", "sportives", "fitness", "gym", "running", "musculation", "yoga", "entrainement", "workout", "athletique"],
    "beaute": ["beaute", "cosmetique", "cosmetiques", "soin", "soins", "maquillage", "parfum", "parfums", "bien etre", "bien-etre", "beauty", "skincare"],
    "livre": ["livre", "livres", "lecture", "roman", "romans", "bd", "papeterie", "book", "books", "bouquin", "bouquins", "lire"],
    "jouet": ["jouet", "jouets", "enfant", "enfants", "jeu", "jeux", "bebe", "toy", "toys", "kids"],
}


def _first_number(m: re.Match, idx: int = 1) -> Optional[float]:
    try:
        return float(m.group(idx).replace(",", "."))
    except (TypeError, ValueError, IndexError):
        return None


def _remove_phrase(text: str, phrase: str) -> tuple[str, bool]:
    pattern = r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])"
    new_text, n = re.subn(pattern, " ", text)
    return (re.sub(r"\s+", " ", new_text).strip(), n > 0)


def _category_terms(cat: models.Category) -> tuple[set[str], set[str]]:
    """(termes du nom de la catégorie, synonymes génériques) — tous normalisés/stemmés."""
    name_norm = normalize(cat.name)
    name_terms = {name_norm}
    for tok in tokenize(cat.name, 3):
        if tok not in FRENCH_STOPWORDS:
            name_terms.add(_stem(tok))
    synonyms: set[str] = set()
    for key, syns in CATEGORY_SYNONYMS.items():
        if key in name_norm or any(key in t for t in name_terms):
            synonyms.update(_stem(s) if " " not in s else s for s in syns)
    return name_terms, synonyms - name_terms


def detect_category(text_norm: str, categories: list[models.Category]) -> tuple[Optional[models.Category], str]:
    """Retourne (catégorie détectée, texte sans le nom exact de la catégorie).

    Un match sur le nom même de la catégorie l'emporte toujours. Un match uniquement par synonyme
    n'est retenu que s'il est sans ambiguïté (aucune autre catégorie candidate)."""
    tokens = {_stem(t) for t in tokenize(text_norm, 3)}
    scored: list[tuple[int, bool, models.Category]] = []
    for cat in categories:
        name_terms, synonyms = _category_terms(cat)
        score, direct = 0, False
        for term in name_terms:
            if " " in term:
                if re.search(r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z0-9])", text_norm):
                    score, direct = max(score, 100 + len(term)), True
            elif term in tokens:
                score, direct = max(score, 100 + len(term)), True
        for term in synonyms:
            if " " in term:
                if re.search(r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z0-9])", text_norm):
                    score = max(score, 50 + len(term))
            elif term in tokens:
                score = max(score, 10 + len(term))
        if score:
            scored.append((score, direct, cat))
    if not scored:
        return None, text_norm
    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_direct, cat = scored[0]
    if not best_direct and len(scored) > 1:
        return None, text_norm  # ambigu (ex. « livre de cuisine ») : on laisse le classement sémantique trancher
    cleaned = text_norm
    cleaned, _ = _remove_phrase(cleaned, normalize(cat.name))
    cleaned, _ = _remove_phrase(cleaned, "categorie")
    return cat, cleaned


def parse_intent_rules(query: str, categories: list[models.Category]) -> SearchIntent:
    intent = SearchIntent(source="rules")
    text = normalize(query)
    text = re.sub(r"\bjusqu\s*a\b", "jusqu a", text)

    # 1) fourchettes de prix
    for pat in _BETWEEN:
        m = re.search(pat, text)
        if m:
            lo, hi = _first_number(m, 1), _first_number(m, 2)
            if lo is not None and hi is not None:
                intent.min_price, intent.max_price = min(lo, hi), max(lo, hi)
                text = text.replace(m.group(0), " ")
                break
    if intent.max_price is None:
        for pat in _AROUND:
            m = re.search(pat, text)
            if m:
                v = _first_number(m)
                if v is not None:
                    intent.min_price, intent.max_price = round(v * 0.75, 2), round(v * 1.25, 2)
                    text = text.replace(m.group(0), " ")
                    break
    if intent.max_price is None:
        for pat in _MAX:
            m = re.search(pat, text)
            if m:
                v = _first_number(m)
                if v is not None:
                    intent.max_price = v
                    text = text.replace(m.group(0), " ")
                    break
    if intent.min_price is None:
        for pat in _MIN:
            m = re.search(pat, text)
            if m:
                v = _first_number(m)
                if v is not None:
                    intent.min_price = v
                    text = text.replace(m.group(0), " ")
                    break

    # 2) tri / stock / promo
    for sort_key, phrases in _SORT_PHRASES:
        for phrase in phrases:
            text, found = _remove_phrase(text, phrase)
            if found and intent.sort is None:
                intent.sort = sort_key
    for phrase in _STOCK_PHRASES:
        text, found = _remove_phrase(text, phrase)
        if found:
            intent.in_stock_only = True
    for phrase in _PROMO_PHRASES:
        text, found = _remove_phrase(text, phrase)
        if found:
            intent.on_promo = True

    # 3) catégorie
    cat, text = detect_category(text, categories)
    cat_terms: set[str] = set()
    if cat:
        intent.category_id, intent.category_name = cat.id, cat.name
        name_terms, synonyms = _category_terms(cat)
        cat_terms = {t for t in (name_terms | synonyms) if " " not in t}

    # 4) mots-clés restants
    tokens = [t for t in tokenize(text, 2) if t not in FRENCH_STOPWORDS and not re.fullmatch(r"[\d.,]+", t)]
    gift = any(t in GIFT_WORDS for t in tokens)
    tokens = [t for t in tokens if t not in SEARCH_NOISE and t not in GIFT_WORDS]
    # les mots qui n'ont servi qu'à identifier la catégorie (« vêtements », « sportif ») ne sont pas des mots-clés produit
    tokens = [t for t in tokens if _stem(t) not in cat_terms]
    intent.keywords = " ".join(tokens)
    if gift and not intent.sort:
        intent.sort = "popular"  # idée cadeau : on privilégie les valeurs sûres
    return intent


# --------------------------------------------------------------------------- LLM
_SEARCH_TOOL = {
    "name": "extract_search_filters",
    "description": "Extrait les filtres structurés d'une requête de recherche e-commerce en langage naturel.",
    "input_schema": {
        "type": "object",
        "properties": {
            "keywords": {"type": "string", "description": "Mots-clés produit essentiels (sans prix, sans catégorie, sans mots vides). Chaîne vide si aucun."},
            "category": {"type": ["string", "null"], "description": "Nom exact d'une catégorie de la liste fournie, ou null."},
            "min_price": {"type": ["number", "null"]},
            "max_price": {"type": ["number", "null"]},
            "sort": {"type": ["string", "null"], "enum": ["cheapest", "price_desc", "rating", "newest", "popular", None]},
            "in_stock_only": {"type": "boolean"},
            "on_promo": {"type": "boolean"},
        },
        "required": ["keywords", "in_stock_only", "on_promo"],
    },
}


def parse_intent_llm(query: str, categories: list[models.Category]) -> Optional[SearchIntent]:
    if not claude_client.is_configured():
        return None
    cat_names = [c.name for c in categories]
    system = (
        "Tu analyses des requêtes de recherche pour une boutique en ligne (prix en dinars tunisiens, DT). "
        "Tu dois appeler l'outil extract_search_filters. Catégories disponibles : "
        + ", ".join(cat_names)
        + ". Choisis une catégorie uniquement si la requête l'implique clairement. "
        "'pas cher' => sort=cheapest ; 'meilleur / bien noté' => sort=rating ; 'nouveau' => sort=newest ; "
        "'populaire / best-seller' => sort=popular. Les mots-clés doivent être en français, au singulier si possible."
    )
    try:
        response = claude_client.create_message(
            max_tokens=300,
            system=system,
            messages=[{"role": "user", "content": query}],
            tools=[_SEARCH_TOOL],
            tool_choice={"type": "tool", "name": "extract_search_filters"},
        )
    except Exception as exc:  # clé invalide, quota, réseau...
        logger.warning("Analyse LLM de la requête impossible, repli sur les règles : %s", exc)
        return None
    data = claude_client.extract_tool_input(response, "extract_search_filters")
    if not data:
        return None
    intent = SearchIntent(source="llm")
    intent.keywords = str(data.get("keywords") or "").strip()
    cat_name = data.get("category")
    if cat_name:
        wanted = normalize(str(cat_name))
        for c in categories:
            cn = normalize(c.name)
            if cn == wanted or wanted in cn or cn in wanted:
                intent.category_id, intent.category_name = c.id, c.name
                break
    for key in ("min_price", "max_price"):
        val = data.get(key)
        try:
            setattr(intent, key, float(val) if val is not None else None)
        except (TypeError, ValueError):
            pass
    sort = data.get("sort")
    intent.sort = sort if sort in {"cheapest", "price_desc", "rating", "newest", "popular"} else None
    intent.in_stock_only = bool(data.get("in_stock_only"))
    intent.on_promo = bool(data.get("on_promo"))
    return intent


def parse_intent(query: str, categories: list[models.Category]) -> SearchIntent:
    intent = parse_intent_llm(query, categories)
    if intent is None:
        intent = parse_intent_rules(query, categories)
    intent.labels = build_labels(intent)
    return intent


def build_labels(intent: SearchIntent) -> list[str]:
    labels = []
    if intent.keywords:
        labels.append(f"Mots-clés : {intent.keywords}")
    if intent.category_name:
        labels.append(f"Catégorie : {intent.category_name}")
    if intent.min_price is not None and intent.max_price is not None:
        labels.append(f"Prix : {intent.min_price:g} – {intent.max_price:g} DT")
    elif intent.max_price is not None:
        labels.append(f"Prix ≤ {intent.max_price:g} DT")
    elif intent.min_price is not None:
        labels.append(f"Prix ≥ {intent.min_price:g} DT")
    sort_labels = {
        "cheapest": "Tri : les moins chers",
        "price_desc": "Tri : haut de gamme",
        "rating": "Tri : les mieux notés",
        "newest": "Tri : nouveautés",
        "popular": "Tri : les plus populaires",
    }
    if intent.sort in sort_labels:
        labels.append(sort_labels[intent.sort])
    if intent.in_stock_only:
        labels.append("En stock uniquement")
    if intent.on_promo:
        labels.append("En promotion")
    return labels


# --------------------------------------------------------------------------- classement TF-IDF
_index_cache: dict = {"signature": None, "ids": [], "word": None, "char": None, "word_m": None, "char_m": None, "names": []}

# Expansion légère de la requête (vocabulaire client -> vocabulaire catalogue). Utilisée pour le classement uniquement.
QUERY_SYNONYMS: dict[str, str] = {
    "course": "running", "courir": "running", "jogging": "running", "chaussure": "baskets sneakers running", "basket": "chaussures sneakers",
    "sneaker": "baskets chaussures", "ecouteur": "casque audio bluetooth", "casque": "ecouteurs audio", "oreillette": "ecouteurs",
    "pc": "ordinateur laptop clavier", "ordinateur": "laptop pc", "telephone": "smartphone", "tel": "smartphone", "portable": "smartphone",
    "bouteille": "gourde", "gourde": "bouteille isotherme", "cafe": "expresso machine", "expresso": "cafe", "aspirateur": "robot",
    "manteau": "veste", "blouson": "veste", "impermeable": "veste", "lunette": "lunettes soleil", "cahier": "carnet notes",
    "carnet": "cahier notes", "stylo": "plume", "bouquin": "livre roman", "roman": "livre", "livre": "roman guide",
    "musique": "enceinte casque audio", "yoga": "tapis", "poids": "halteres", "muscu": "halteres musculation", "musculation": "halteres",
    "velo": "appartement pliable", "smartwatch": "montre connectee", "watch": "montre", "montre": "montre connectee",
    "batterie": "externe power bank", "powerbank": "batterie externe", "chargeur": "charge usb", "lampe": "led bureau",
    "parfum": "soins coffret", "creme": "serum soin", "cheveux": "seche-cheveux", "barbe": "coffret soins", "balance": "connectee",
    "sac": "sac a dos", "voyage": "sac cabine", "cuisine": "cuisine rangement recettes", "rangement": "boites cuisine",
    "cadeau": "", "enfant": "jouet", "clavier": "mecanique", "camera": "webcam", "video": "webcam", "son": "audio enceinte casque",
}


def expand_query(keywords: str) -> str:
    extra = []
    for tok in tokenize(keywords, 2):
        syn = QUERY_SYNONYMS.get(_stem(tok)) or QUERY_SYNONYMS.get(tok)
        if syn:
            extra.append(syn)
    return (keywords + " " + " ".join(extra)).strip()


def _product_text(p: models.Product) -> str:
    cat = p.category.name if p.category else ""
    # le nom est répété pour lui donner plus de poids
    return f"{p.name} {p.name} {p.description or ''} {cat}"


def _catalog_signature(products: list[models.Product]) -> str:
    h = hashlib.md5()
    for p in products:
        h.update(f"{p.id}|{p.name}|{(p.description or '')[:200]}|{p.category_id}".encode("utf-8"))
    return h.hexdigest()


def _get_index(products: list[models.Product]):
    sig = _catalog_signature(products)
    if _index_cache["signature"] == sig:
        return _index_cache
    texts = [_product_text(p) for p in products]
    word = TfidfVectorizer(analyzer=tfidf_analyzer, sublinear_tf=True, min_df=1)
    char = TfidfVectorizer(strip_accents="unicode", lowercase=True, analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, min_df=1)
    _index_cache.update(
        {
            "signature": sig,
            "ids": [p.id for p in products],
            "word": word,
            "char": char,
            "word_m": word.fit_transform(texts),
            "char_m": char.fit_transform(texts),
            "names": [normalize(p.name) for p in products],
        }
    )
    return _index_cache


def rank_products(products: list[models.Product], keywords: str, min_score: float = 0.06) -> list[tuple[models.Product, float]]:
    """Classe les produits par pertinence sémantique vis-à-vis des mots-clés."""
    if not products or not keywords.strip():
        return []
    try:
        index = _get_index(products)
    except ValueError:  # vocabulaire vide (catalogue réduit à des mots vides)
        return []
    expanded = expand_query(keywords)
    q_word = index["word"].transform([expanded])
    q_char = index["char"].transform([keywords])
    sim_word = cosine_similarity(q_word, index["word_m"]).flatten()
    sim_char = cosine_similarity(q_char, index["char_m"]).flatten()
    # les n-grammes de caractères servent à la tolérance aux fautes : seuls, ils doivent être nettement
    # significatifs (≥ 0.3) pour éviter les faux positifs (« volante » ~ « portable »)
    char_component = np.where(sim_word > 0, sim_char, np.where(sim_char >= 0.3, sim_char, 0.0))
    scores = 0.65 * sim_word + 0.35 * char_component
    kw_tokens = [_stem(t) for t in tokenize(keywords, 3)]
    for i, name in enumerate(index["names"]):
        if kw_tokens and any(t in name for t in kw_tokens):
            scores[i] += 0.15
    ranked = [(products[i], float(scores[i])) for i in np.argsort(-scores) if scores[i] >= min_score]
    return ranked


# --------------------------------------------------------------------------- recherche complète
def _apply_filters(db: Session, products: list[models.Product], intent: SearchIntent) -> list[models.Product]:
    promos = active_promotions(db)
    out = []
    for p in products:
        if intent.category_id and p.category_id != intent.category_id:
            continue
        price, promo = best_price(p, promos)
        if intent.min_price is not None and price < intent.min_price:
            continue
        if intent.max_price is not None and price > intent.max_price:
            continue
        if intent.in_stock_only and (p.stock or 0) <= 0:
            continue
        if intent.on_promo and not (promo is not None or (p.promo_price is not None and p.promo_price < p.price)):
            continue
        out.append(p)
    return out


def _sort_products(db: Session, products: list[models.Product], sort: Optional[str]) -> list[models.Product]:
    if not products:
        return products
    if sort == "cheapest":
        return sorted(products, key=lambda p: (p.promo_price if p.promo_price is not None else p.price))
    if sort == "price_desc":
        return sorted(products, key=lambda p: (p.promo_price if p.promo_price is not None else p.price), reverse=True)
    if sort == "newest":
        return sorted(products, key=lambda p: (p.created_at or 0, p.id), reverse=True)
    ids = [p.id for p in products]
    if sort == "rating":
        rows = db.query(models.Review.product_id, func.avg(models.Review.rating), func.count(models.Review.id)).filter(models.Review.product_id.in_(ids)).group_by(models.Review.product_id).all()
        stats = {pid: (float(avg or 0), int(cnt or 0)) for pid, avg, cnt in rows}
        return sorted(products, key=lambda p: stats.get(p.id, (0.0, 0)), reverse=True)
    # popular (défaut du repli)
    rows = db.query(models.OrderItem.product_id, func.sum(models.OrderItem.quantity)).filter(models.OrderItem.product_id.in_(ids)).group_by(models.OrderItem.product_id).all()
    sold = {pid: int(q or 0) for pid, q in rows}
    return sorted(products, key=lambda p: (sold.get(p.id, 0), p.id), reverse=True)


def smart_search(db: Session, query: str, top_k: int = 12) -> dict:
    categories = db.query(models.Category).all()
    intent = parse_intent(query, categories)
    candidates = visible_products_query(db).all()
    filtered = _apply_filters(db, candidates, intent)

    ranked = rank_products(filtered, intent.keywords) if intent.keywords else []
    if ranked:
        # un tri explicite demandé par le client s'applique aux produits réellement pertinents
        # (on écarte les correspondances faibles avant de trier par prix / note / nouveauté)
        if intent.sort in {"cheapest", "price_desc", "newest", "rating", "popular"}:
            top_score = ranked[0][1]
            ranked = [(p, s) for p, s in ranked if s >= max(0.06, 0.4 * top_score)]
        results = [p for p, _ in ranked]
        scores = {p.id: round(s, 4) for p, s in ranked}
        if intent.sort in {"cheapest", "price_desc", "newest", "rating", "popular"}:
            results = _sort_products(db, results, intent.sort)
        fallback = False
    else:
        results = _sort_products(db, filtered, intent.sort or "popular")
        scores = {}
        fallback = True
        if intent.keywords:
            intent.labels.append("Aucune correspondance exacte : suggestions selon vos critères")

    # les produits en rupture restent visibles (badge côté client) mais passent en fin de liste
    results = sorted(results, key=lambda p: 0 if (p.stock or 0) > 0 else 1)
    results = results[:top_k]
    enrich_products(db, results)
    for p in results:
        p.search_score = scores.get(p.id)
    return {
        "query": query,
        "mode": intent.source,
        "interpretation": {**intent.to_dict(), "labels": intent.labels},
        "total": len(results),
        "results": results,
        "fallback": fallback,
    }


def semantic_search(db: Session, query: str, top_k: int = 10) -> list[models.Product]:
    """Compatibilité : renvoie uniquement la liste de produits (utilisé par le chatbot)."""
    return smart_search(db, query, top_k)["results"]
