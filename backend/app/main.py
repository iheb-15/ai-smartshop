import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .database import engine, migrate_schema
from .routers import (
    auth,
    products,
    categories,
    cart,
    orders,
    ai_router,
    reviews,
    dashboard,
    promotions,
    ai_admin,
    wishlist,
    events,
)

models.Base.metadata.create_all(bind=engine)
migrate_schema()

app = FastAPI(
    title="NéoShop — E-commerce IA API",
    version="2.0.0",
    description=(
        "Plateforme e-commerce intelligente : catalogue, panier, paiement simulé, commandes, promotions, "
        "tableau de bord, et briques IA (recommandation hybride, prédiction d'intérêt, recherche en langage "
        "naturel, chatbot LLM avec outils, analyse des avis, analyse comportementale)."
    ),
)

_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:3000,http://localhost"
allowed_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(products.router)
app.include_router(cart.router)
app.include_router(wishlist.router)
app.include_router(orders.router)
app.include_router(ai_router.router)
app.include_router(reviews.router)
app.include_router(dashboard.router)
app.include_router(promotions.router)
app.include_router(ai_admin.router)
app.include_router(events.router)


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "message": "E-commerce IA API is running", "version": app.version}


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
