from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=List[schemas.CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(models.Category).all()
    return [
        schemas.CategoryOut(
            id=c.id,
            name=c.name,
            description=c.description or "",
            product_count=len(c.products),
        )
        for c in categories
    ]


@router.post("/", response_model=schemas.CategoryOut)
def create_category(
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    name_clean = payload.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Le nom de la catégorie est requis.")
    existing = db.query(models.Category).filter(models.Category.name.ilike(name_clean)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Une catégorie portant ce nom existe déjà.")

    category = models.Category(name=name_clean, description=payload.description or "")
    db.add(category)
    db.commit()
    db.refresh(category)
    return schemas.CategoryOut(
        id=category.id,
        name=category.name,
        description=category.description,
        product_count=0,
    )


@router.put("/{category_id}", response_model=schemas.CategoryOut)
def update_category(
    category_id: int,
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    name_clean = payload.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Le nom de la catégorie est requis.")
    dup = (
        db.query(models.Category)
        .filter(models.Category.name.ilike(name_clean), models.Category.id != category_id)
        .first()
    )
    if dup:
        raise HTTPException(status_code=400, detail="Une autre catégorie porte déjà ce nom.")

    category.name = name_clean
    category.description = payload.description or ""
    db.commit()
    db.refresh(category)
    return schemas.CategoryOut(
        id=category.id,
        name=category.name,
        description=category.description,
        product_count=len(category.products),
    )


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.get_current_admin),
):
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.products:
        raise HTTPException(
            status_code=409,
            detail=f"Impossible de supprimer : cette catégorie contient encore {len(category.products)} produit(s). Veuillez d'abord les réassigner ou les supprimer.",
        )
    db.query(models.Promotion).filter(models.Promotion.category_id == category_id).delete()
    db.delete(category)
    db.commit()
    return {"ok": True}

