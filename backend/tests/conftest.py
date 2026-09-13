"""Fixtures pytest : base SQLite temporaire isolée + client HTTP + comptes de test."""
import os
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_tmp = tempfile.mkdtemp(prefix="neoshop-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["ANTHROPIC_API_KEY"] = ""  # force les modes dégradés (règles / ML local)
os.environ["JWT_SECRET"] = "test-secret"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.database import SessionLocal, engine, Base  # noqa: E402
from app import models  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.ai import data as ml_data  # noqa: E402


def _seed_minimal(db):
    admin = models.User(full_name="Admin", email="admin@test.com", hashed_password=hash_password("admin12345"), is_admin=True)
    client = models.User(full_name="Client Test", email="client@test.com", hashed_password=hash_password("client12345"))
    other = models.User(full_name="Autre Client", email="other@test.com", hashed_password=hash_password("other12345"))
    db.add_all([admin, client, other])
    db.flush()
    electro = models.Category(name="Électronique", description="High-tech")
    sport = models.Category(name="Sport", description="Fitness")
    livres = models.Category(name="Livres & Papeterie", description="Lecture")
    db.add_all([electro, sport, livres])
    db.flush()
    products = [
        models.Product(name="Écouteurs sans fil Pro", description="Écouteurs bluetooth avec réduction de bruit active, autonomie 24h", price=189.0, stock=10, category_id=electro.id, image_url="x"),
        models.Product(name="Enceinte bluetooth portable", description="Enceinte compacte étanche avec basses puissantes", price=79.0, stock=8, category_id=electro.id, image_url="x"),
        models.Product(name="Casque audio studio", description="Casque fermé haute fidélité", price=159.0, stock=5, category_id=electro.id, image_url="x"),
        models.Product(name="Tapis de yoga", description="Tapis antidérapant épais pour yoga et fitness", price=45.0, stock=20, category_id=sport.id, image_url="x"),
        models.Product(name="Baskets running", description="Chaussures de running légères, amorti confortable", price=139.0, stock=6, category_id=sport.id, image_url="x"),
        models.Product(name="Gourde isotherme", description="Gourde inox double paroi pour le sport", price=35.0, stock=30, category_id=sport.id, image_url="x"),
        models.Product(name="Roman Les Vents du Sud", description="Roman contemporain 384 pages", price=28.0, stock=15, category_id=livres.id, image_url="x"),
        models.Product(name="Produit retiré", description="Ne doit pas apparaître", price=10.0, stock=3, category_id=livres.id, image_url="x", is_available=False),
        models.Product(name="Produit épuisé", description="Casque sans stock", price=50.0, stock=0, category_id=electro.id, image_url="x"),
    ]
    db.add_all(products)
    db.flush()
    now = datetime.utcnow()
    db.add(models.Promotion(name="Flash Tech", discount_percent=10.0, starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=5), is_active=True, category_id=electro.id))
    db.add(models.Promotion(name="Future", discount_percent=50.0, starts_at=now + timedelta(days=3), ends_at=now + timedelta(days=9), is_active=True, category_id=sport.id))
    # historique : « other » a acheté écouteurs + enceinte, « client » a acheté un tapis de yoga
    o1 = models.Order(user_id=other.id, status="DELIVERED", total=268.0, payment_method="card", payment_status="PAID", created_at=now - timedelta(days=10))
    o2 = models.Order(user_id=client.id, status="DELIVERED", total=45.0, payment_method="card", payment_status="PAID", created_at=now - timedelta(days=5))
    db.add_all([o1, o2])
    db.flush()
    db.add_all(
        [
            models.OrderItem(order_id=o1.id, product_id=products[0].id, quantity=1, unit_price=189.0),
            models.OrderItem(order_id=o1.id, product_id=products[1].id, quantity=1, unit_price=79.0),
            models.OrderItem(order_id=o2.id, product_id=products[3].id, quantity=1, unit_price=45.0),
        ]
    )
    db.add(models.Interaction(user_id=client.id, product_id=products[4].id, event_type="view", created_at=now - timedelta(days=2)))
    db.add(models.Interaction(user_id=client.id, product_id=products[4].id, event_type="view", created_at=now - timedelta(days=1)))
    db.add(models.Interaction(user_id=other.id, product_id=products[2].id, event_type="view", created_at=now - timedelta(days=3)))
    db.add(models.Review(product_id=products[0].id, user_id=other.id, rating=5, comment="Excellent son, très confortable", sentiment="positive", sentiment_score=0.8, is_verified_purchase=True))
    db.commit()


@pytest.fixture(scope="session", autouse=True)
def _database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        _seed_minimal(db)
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _invalidate_ml_cache():
    ml_data.invalidate()
    yield


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def _login(client, email, password):
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    return _login(client, "admin@test.com", "admin12345")


@pytest.fixture(scope="session")
def client_headers(client):
    return _login(client, "client@test.com", "client12345")


@pytest.fixture(scope="session")
def other_headers(client):
    return _login(client, "other@test.com", "other12345")


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


SHIPPING = {"full_name": "Client Test", "phone": "+216 20 000 000", "address": "12 rue de Marseille", "city": "Tunis", "postal_code": "1000"}
CARD_OK = {"number": "4242 4242 4242 4242", "holder": "CLIENT TEST", "exp_month": 12, "exp_year": 2030, "cvc": "123"}
CARD_DECLINED = {"number": "4000 0000 0000 0002", "holder": "CLIENT TEST", "exp_month": 12, "exp_year": 2030, "cvc": "123"}
