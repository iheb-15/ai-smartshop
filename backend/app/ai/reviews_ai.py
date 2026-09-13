"""Analyse de sentiment des avis clients via l'API Claude."""
from .claude_client import get_client, MODEL

SYSTEM_PROMPT = """Tu analyses le sentiment d'un avis client e-commerce.
Réponds UNIQUEMENT par un seul mot parmi : positive, neutral, negative."""


def analyze_sentiment(comment: str) -> str:
    if not comment or not comment.strip():
        return "neutral"

    client = get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=10,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": comment}],
    )
    text = "".join(
        block.text for block in response.content if getattr(block, "type", "") == "text"
    ).strip().lower()

    for label in ("positive", "neutral", "negative"):
        if label in text:
            return label
    return "neutral"
