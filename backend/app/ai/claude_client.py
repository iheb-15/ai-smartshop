import os
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

_client = None


def get_client() -> Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY manquante. Ajoute-la dans backend/.env"
            )
        _client = Anthropic(api_key=api_key)
    return _client


MODEL = "claude-sonnet-5"  # ajuste si besoin selon les modèles disponibles sur ta clé API
