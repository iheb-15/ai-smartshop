"""
Passerelle de paiement SIMULÉE.
Aucun prestataire réel n'est appelé : on valide la carte (algorithme de Luhn, date d'expiration,
CVC) puis on applique des règles déterministes pour reproduire les cas réels d'un PSP :
  - 4242 4242 4242 4242 : paiement accepté (carte de test classique)
  - toute carte se terminant par 0002 : refusée (fonds insuffisants)
  - toute carte se terminant par 0069 : refusée (carte expirée côté banque)
  - toute autre carte valide au sens de Luhn : acceptée
"""
import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class ChargeResult:
    success: bool
    transaction_ref: str
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None
    failure_reason: Optional[str] = None


def normalize_card_number(number: str) -> str:
    return "".join(ch for ch in (number or "") if ch.isdigit())


def luhn_valid(number: str) -> bool:
    digits = [int(d) for d in number]
    if len(digits) < 12:
        return False
    checksum = 0
    parity = len(digits) % 2
    for i, d in enumerate(digits):
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def detect_brand(number: str) -> str:
    if number.startswith("4"):
        return "Visa"
    if number[:2] in {"51", "52", "53", "54", "55"} or (number[:4].isdigit() and 2221 <= int(number[:4]) <= 2720):
        return "Mastercard"
    if number[:2] in {"34", "37"}:
        return "American Express"
    if number.startswith("6"):
        return "Discover"
    return "Carte bancaire"


def _new_ref(prefix: str = "SIM") -> str:
    return f"{prefix}-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"


def validate_card(number: str, exp_month: int, exp_year: int, cvc: str) -> Optional[str]:
    """Retourne un message d'erreur (français) ou None si la carte est formellement valide."""
    digits = normalize_card_number(number)
    if not digits.isdigit() or not (12 <= len(digits) <= 19):
        return "Numéro de carte invalide."
    if not luhn_valid(digits):
        return "Numéro de carte invalide (échec du contrôle de Luhn)."
    now = datetime.utcnow()
    if exp_year < now.year or (exp_year == now.year and exp_month < now.month):
        return "Carte expirée."
    if not cvc or not cvc.isdigit() or len(cvc) not in (3, 4):
        return "Code de sécurité (CVC) invalide."
    return None


def charge_card(amount: float, number: str, holder: str, exp_month: int, exp_year: int, cvc: str) -> ChargeResult:
    digits = normalize_card_number(number)
    error = validate_card(digits, exp_month, exp_year, cvc)
    brand = detect_brand(digits) if digits else None
    last4 = digits[-4:] if len(digits) >= 4 else None
    if error:
        return ChargeResult(False, _new_ref("ERR"), brand, last4, error)
    if amount <= 0:
        return ChargeResult(False, _new_ref("ERR"), brand, last4, "Montant invalide.")
    if digits.endswith("0002"):
        return ChargeResult(False, _new_ref("DECL"), brand, last4, "Paiement refusé par la banque : fonds insuffisants.")
    if digits.endswith("0069"):
        return ChargeResult(False, _new_ref("DECL"), brand, last4, "Paiement refusé : carte expirée selon l'émetteur.")
    if digits.endswith("0119"):
        return ChargeResult(False, _new_ref("DECL"), brand, last4, "Paiement refusé : erreur de traitement, réessayez.")
    return ChargeResult(True, _new_ref("PAY"), brand, last4, None)


def refund(amount: float) -> str:
    """Remboursement simulé : retourne une référence de transaction."""
    return _new_ref("RFD")
