from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from typing import Optional

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.Token)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Sécurité : inscription publique toujours en compte client.
    # La promotion admin se fait uniquement via le panel admin (PATCH /auth/users/{id}).
    user = models.User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Ce compte a été désactivé. Veuillez contacter un administrateur.",
        )

    token = auth.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


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
    return [
        schemas.UserOut(
            id=u.id,
            full_name=u.full_name,
            email=u.email,
            is_admin=u.is_admin,
            is_active=u.is_active,
            created_at=u.created_at,
            orders_count=len(u.orders),
        )
        for u in users
    ]


@router.get("/users/{user_id}", response_model=schemas.UserDetailOut)
def user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    """Fiche client : profil + commandes + total depense + avis."""
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
    return schemas.UserOut(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        orders_count=len(user.orders),
    )



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
    db.query(models.ChatMessage).filter(models.ChatMessage.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}
