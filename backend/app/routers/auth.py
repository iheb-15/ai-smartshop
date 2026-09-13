from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Optional

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(u: models.User) -> schemas.UserOut:
    return schemas.UserOut(
        id=u.id,
        full_name=u.full_name,
        email=u.email,
        is_admin=u.is_admin,
        is_active=u.is_active,
        phone=u.phone,
        address=u.address,
        city=u.city,
        postal_code=u.postal_code,
        created_at=u.created_at,
        orders_count=len(u.orders),
    )


@router.post("/register", response_model=schemas.Token)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")

    # Sécurité : inscription publique toujours en compte client.
    # La promotion admin se fait uniquement via le panel admin (PATCH /auth/users/{id}).
    user = models.User(
        full_name=payload.full_name.strip(),
        email=email,
        hashed_password=auth.hash_password(payload.password),
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=_user_out(user))


def _authenticate(db: Session, email: str, password: str) -> models.User:
    user = db.query(models.User).filter(models.User.email == email.lower().strip()).first()
    if not user or not auth.verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Ce compte a été désactivé. Veuillez contacter un administrateur.",
        )
    return user


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = _authenticate(db, payload.email, payload.password)
    token = auth.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=_user_out(user))


@router.post("/token", response_model=schemas.Token, include_in_schema=True)
def login_form(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Variante OAuth2 (formulaire) utilisée par le bouton « Authorize » de Swagger UI."""
    user = _authenticate(db, form.username, form.password)
    token = auth.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=_user_out(user))


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(auth.get_current_user)):
    return _user_out(current_user)


@router.put("/me", response_model=schemas.UserOut)
def update_me(
    payload: schemas.UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Mise à jour du profil (nom, téléphone, adresse de livraison par défaut)."""
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            value = value.strip()
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return _user_out(current_user)


@router.put("/me/password")
def change_password(
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not auth.verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent de l'actuel.")
    current_user.hashed_password = auth.hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ mot de passe oublié (OTP)
OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_SECONDS = 60


def _hash_otp(code: str) -> str:
    import hashlib

    return hashlib.sha256(code.encode()).hexdigest()


def _latest_valid_reset(db: Session, user_id: int):
    from datetime import datetime

    return (
        db.query(models.PasswordReset)
        .filter(
            models.PasswordReset.user_id == user_id,
            models.PasswordReset.used == False,  # noqa: E712
            models.PasswordReset.expires_at > datetime.utcnow(),
        )
        .order_by(models.PasswordReset.created_at.desc())
        .first()
    )


@router.post("/forgot-password")
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Demande un code OTP. Réponse générique anti-énumération (même si l'email n'existe pas)."""
    import secrets
    from datetime import datetime, timedelta

    from ..services.otp import dev_echo_enabled, send_otp_email

    email = payload.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()
    demo_code = None
    if user is not None:
        # Anti-spam : refuse un nouveau code si le précédent a moins de 60 s
        latest = (
            db.query(models.PasswordReset)
            .filter(models.PasswordReset.user_id == user.id)
            .order_by(models.PasswordReset.created_at.desc())
            .first()
        )
        if latest is not None and latest.created_at is not None:
            elapsed = (datetime.utcnow() - latest.created_at).total_seconds()
            if elapsed < OTP_RESEND_SECONDS:
                raise HTTPException(
                    status_code=429,
                    detail=f"Un code vient d'être envoyé. Réessayez dans {int(OTP_RESEND_SECONDS - elapsed)} s.",
                )
        # Invalide les anciens codes encore actifs
        db.query(models.PasswordReset).filter(
            models.PasswordReset.user_id == user.id,
            models.PasswordReset.used == False,  # noqa: E712
        ).update({"used": True})
        code = f"{secrets.randbelow(1_000_000):06d}"
        reset = models.PasswordReset(
            user_id=user.id,
            code_hash=_hash_otp(code),
            expires_at=datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
            attempts=0,
            used=False,
        )
        db.add(reset)
        db.commit()
        sent = send_otp_email(email, code)
        if not sent and dev_echo_enabled():
            demo_code = code  # mode démo : affiché côté frontend pour tester sans SMTP
    response = {"ok": True, "message": "Si ce compte existe, un code à 6 chiffres a été envoyé."}
    if demo_code:
        response["demo_code"] = demo_code
    return response


@router.post("/verify-otp")
def verify_otp(payload: schemas.VerifyOtpRequest, db: Session = Depends(get_db)):
    """Vérifie le code sans le consommer (l'étape reset le consomme)."""
    email = payload.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")
    reset = _latest_valid_reset(db, user.id)
    if reset is None:
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")
    if reset.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")
    reset.attempts += 1
    if reset.code_hash != _hash_otp(payload.code):
        db.commit()
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")
    db.commit()
    return {"ok": True, "message": "Code vérifié. Choisissez un nouveau mot de passe."}


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    """Réinitialise le mot de passe et consomme le code (usage unique)."""
    email = payload.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")
    reset = _latest_valid_reset(db, user.id)
    if reset is None:
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")
    if reset.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")
    reset.attempts += 1
    if reset.code_hash != _hash_otp(payload.code):
        db.commit()
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")
    reset.used = True
    user.hashed_password = auth.hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Mot de passe réinitialisé. Connectez-vous."}


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(
    response: Response,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
    q: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    query = db.query(models.User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (models.User.full_name.ilike(like)) | (models.User.email.ilike(like))
        )
    if role == "admin":
        query = query.filter(models.User.is_admin == True)  # noqa: E712
    elif role == "client":
        query = query.filter(models.User.is_admin == False)  # noqa: E712
    if is_active is not None:
        query = query.filter(models.User.is_active == is_active)
    total = query.count()
    users = query.order_by(models.User.created_at.desc()).offset(skip).limit(limit).all()
    response.headers["X-Total-Count"] = str(total)
    return [_user_out(u) for u in users]


@router.get("/users/{user_id}", response_model=schemas.UserDetailOut)
def user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    """Fiche client : profil + commandes + total depense + avis."""
    from .orders import _enrich_order_items

    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé.")
    orders = (
        db.query(models.Order)
        .filter(models.Order.user_id == u.id)
        .order_by(models.Order.created_at.desc())
        .limit(20)
        .all()
    )
    for o in orders:
        _enrich_order_items(db, o)
    total_spent = round(
        sum((o.total or 0.0) for o in u.orders if (o.status or "").upper() != "CANCELLED"),
        2,
    )
    reviews_count = db.query(models.Review).filter(models.Review.user_id == u.id).count()
    last_order_at = max((o.created_at for o in u.orders if o.created_at), default=None)
    return schemas.UserDetailOut(
        id=u.id,
        full_name=u.full_name,
        email=u.email,
        is_admin=u.is_admin,
        is_active=u.is_active,
        phone=u.phone,
        address=u.address,
        city=u.city,
        postal_code=u.postal_code,
        created_at=u.created_at,
        orders_count=len(u.orders),
        total_spent=total_spent,
        reviews_count=reviews_count,
        last_order_at=last_order_at,
        orders=orders,
    )


@router.patch("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserAdminUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé.")
    if user.id == admin.id and payload.is_admin is False:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas révoquer vos propres privilèges d'administrateur.")
    if user.id == admin.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte administrateur.")
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.orders:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer un utilisateur ayant des commandes. Vous pouvez désactiver son compte."
        )
    db.query(models.CartItem).filter(models.CartItem.user_id == user_id).delete()
    db.query(models.WishlistItem).filter(models.WishlistItem.user_id == user_id).delete()
    db.query(models.Review).filter(models.Review.user_id == user_id).delete()
    db.query(models.Interaction).filter(models.Interaction.user_id == user_id).delete()
    db.query(models.ChatMessage).filter(models.ChatMessage.user_id == user_id).delete()
    db.query(models.Payment).filter(models.Payment.user_id == user_id, models.Payment.order_id == None).delete()  # noqa: E711
    db.delete(user)
    db.commit()
    return {"ok": True}
