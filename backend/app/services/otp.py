"""Envoi du code OTP de réinitialisation.

- Si SMTP_* est configuré dans backend/.env, le code est envoyé par email.
- Sinon (démo locale) : le code est loggé côté serveur + renvoyé dans la réponse
  API en mode démo (DEV_OTP_ECHO) pour permettre de tester sans serveur mail.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.text import MIMEText

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER"))


def dev_echo_enabled() -> bool:
    return (os.getenv("DEV_OTP_ECHO", "true").lower() not in {"0", "false", "no"})


def send_otp_email(to_email: str, code: str) -> bool:
    """Retourne True si l'email a été envoyé, False sinon (mode démo)."""
    if not smtp_configured():
        logger.warning("[OTP démo] Code pour %s : %s (SMTP non configuré)", to_email, code)
        return False
    try:
        host = os.getenv("SMTP_HOST")
        port = int(os.getenv("SMTP_PORT", "587"))
        user = os.getenv("SMTP_USER")
        password = os.getenv("SMTP_PASSWORD", "")
        sender = os.getenv("SMTP_FROM") or user
        msg = MIMEText(
            f"Bonjour,\n\nVotre code de réinitialisation NéoShop est : {code}\n\n"
            "Il expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n"
        )
        msg["Subject"] = "NéoShop — Code de réinitialisation"
        msg["From"] = sender
        msg["To"] = to_email
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(sender, [to_email], msg.as_string())
        return True
    except Exception as exc:  # noqa: BLE001 — on ne casse jamais le flux reset
        logger.warning("Envoi OTP impossible (%s) — bascule mode démo", exc)
        return False
