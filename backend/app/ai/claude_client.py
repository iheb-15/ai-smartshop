"""
Client Anthropic partagé.

- La clé est lue dans ANTHROPIC_API_KEY (backend/.env). Sans clé, `is_configured()` renvoie False et
  chaque fonctionnalité IA bascule sur son mode dégradé (règles / ML local) au lieu d'échouer.
- Le modèle est configurable via ANTHROPIC_MODEL. Si le modèle demandé n'existe pas pour la clé,
  on essaie automatiquement les modèles de repli de MODEL_CANDIDATES.
"""
import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_client = None
_working_model: Optional[str] = None

DEFAULT_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
MODEL_CANDIDATES = [
    DEFAULT_MODEL,
    "claude-sonnet-4-5",
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-latest",
    "claude-3-5-haiku-latest",
]
# Alias conservé pour compatibilité avec l'ancien code
MODEL = DEFAULT_MODEL


def api_key() -> Optional[str]:
    key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not key or key.lower().startswith("your_") or key in {"changeme", "xxx"}:
        return None
    return key


def is_configured() -> bool:
    return api_key() is not None


def get_client():
    global _client
    if _client is None:
        key = api_key()
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY manquante. Ajoute-la dans backend/.env")
        from anthropic import Anthropic

        _client = Anthropic(api_key=key)
    return _client


def reset_client() -> None:
    """Utilisé par les tests / après changement de clé."""
    global _client, _working_model
    _client = None
    _working_model = None


def _is_model_not_found(exc: Exception) -> bool:
    text = str(exc).lower()
    status = getattr(exc, "status_code", None)
    return ("model" in text and ("not_found" in text or "not found" in text or "does not exist" in text)) or status == 404


def create_message(**kwargs: Any):
    """messages.create avec repli automatique de modèle. Lève l'exception si tout échoue."""
    global _working_model
    client = get_client()
    candidates = [_working_model] if _working_model else []
    for m in MODEL_CANDIDATES:
        if m and m not in candidates:
            candidates.append(m)
    last_exc: Optional[Exception] = None
    for model in candidates:
        try:
            response = client.messages.create(model=model, **kwargs)
            _working_model = model
            return response
        except Exception as exc:  # anthropic.NotFoundError, BadRequestError...
            last_exc = exc
            if _is_model_not_found(exc):
                logger.warning("Modèle %s indisponible, essai du suivant (%s)", model, exc)
                continue
            raise
    raise last_exc if last_exc else RuntimeError("Aucun modèle Claude disponible.")


def extract_text(response) -> str:
    return "".join(
        getattr(block, "text", "") for block in getattr(response, "content", []) if getattr(block, "type", "") == "text"
    ).strip()


def extract_tool_input(response, tool_name: Optional[str] = None) -> Optional[dict]:
    for block in getattr(response, "content", []):
        if getattr(block, "type", "") == "tool_use" and (tool_name is None or getattr(block, "name", "") == tool_name):
            data = getattr(block, "input", None)
            if isinstance(data, dict):
                return data
    return None
