from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .database import engine, migrate_schema
from .routers import auth, products, categories, cart, orders, ai_router, reviews, dashboard, promotions, ai_admin

models.Base.metadata.create_all(bind=engine)
migrate_schema()

app = FastAPI(title="E-commerce IA API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(products.router)
app.include_router(cart.router)
app.include_router(orders.router)
app.include_router(ai_router.router)
app.include_router(reviews.router)
app.include_router(dashboard.router)
app.include_router(promotions.router)
app.include_router(ai_admin.router)



@app.get("/")
def root():
    return {"status": "ok", "message": "E-commerce IA API is running"}
