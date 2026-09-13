"""Utilitaires texte partagés par les modules IA (normalisation, stopwords, tokenisation)."""
import re
import unicodedata

FRENCH_STOPWORDS = {
    "le", "la", "les", "un", "une", "des", "du", "de", "d", "l", "en", "et", "a", "au", "aux", "est", "ce", "cet",
    "cette", "ces", "pour", "par", "sur", "dans", "avec", "sans", "qui", "que", "quoi", "dont", "ou", "mais",
    "tres", "trop", "ne", "pas", "plus", "mon", "ma", "mes", "son", "sa", "ses", "notre", "nos", "votre", "vos",
    "leur", "leurs", "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "y", "se", "me", "te", "moi",
    "toi", "lui", "eux", "c", "s", "n", "j", "m", "t", "qu", "si", "comme", "aussi", "bien", "tout", "tous",
    "toute", "toutes", "meme", "encore", "deja", "donc", "car", "ni", "or", "chez", "vers", "entre", "sous",
    "cherche", "recherche", "veux", "voudrais", "souhaite", "aimerais", "besoin", "faut", "trouver", "acheter",
    "montrez", "moi", "svp", "stp", "merci", "bonjour", "salut", "quelque", "chose", "quelques",
    "produit", "produits", "article", "articles", "truc", "trucs", "idee", "idees", "avez", "avoir", "avez-vous",
    "est-ce", "il", "y", "the", "and", "for", "with", "some", "any", "want", "need", "looking", "show", "find",
    "please", "i", "me", "my", "to", "of", "in", "on", "an", "is", "are", "do", "you", "have", "something",
}


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text or "") if not unicodedata.combining(c))


def normalize(text: str) -> str:
    """minuscule + sans accents + ponctuation remplacée par des espaces (garde les chiffres et le point décimal)."""
    text = strip_accents((text or "").lower())
    text = text.replace("'", " ").replace("’", " ")
    text = re.sub(r"[^a-z0-9.,<>€~-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokenize(text: str, min_len: int = 2) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", normalize(text)) if len(t) >= min_len]


def content_tokens(text: str, min_len: int = 3) -> list[str]:
    return [t for t in tokenize(text, min_len) if t not in FRENCH_STOPWORDS and not t.isdigit()]


def stem(token: str) -> str:
    """Radical grossier FR : retire la marque du pluriel (« livres » -> « livre », « chevaux » -> « chevau »)."""
    if len(token) > 3 and token.endswith(("s", "x")):
        return token[:-1]
    return token


def tfidf_analyzer(text: str) -> list[str]:
    """Analyseur partagé (recherche + similarité de contenu) : sans mots vides, stemming léger,
    unigrammes + bigrammes. Les chiffres isolés sont conservés (ex. « 65w », « 40l »)."""
    toks = [stem(t) for t in tokenize(text, 2) if t not in FRENCH_STOPWORDS]
    return toks + [f"{a} {b}" for a, b in zip(toks, toks[1:])]
