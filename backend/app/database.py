import os
from pathlib import Path
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "shop.db"
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# Colonnes ajoutées après la première version du prototype.
# (table, colonne, définition SQL) — appliquées uniquement si absentes : aucune perte de données.
ADDITIVE_COLUMNS = [
    ("users", "is_active", "BOOLEAN NOT NULL DEFAULT 1"),
    ("users", "phone", "VARCHAR"),
    ("users", "address", "VARCHAR"),
    ("users", "city", "VARCHAR"),
    ("users", "postal_code", "VARCHAR"),
    ("products", "is_available", "BOOLEAN NOT NULL DEFAULT 1"),
    ("products", "review_summary", "TEXT"),
    ("products", "review_summary_count", "INTEGER DEFAULT 0"),
    ("products", "review_summary_at", "DATETIME"),
    ("orders", "payment_method", "VARCHAR DEFAULT 'card'"),
    ("orders", "payment_status", "VARCHAR DEFAULT 'UNPAID'"),
    ("orders", "paid_at", "DATETIME"),
    ("orders", "shipping_name", "VARCHAR"),
    ("orders", "shipping_phone", "VARCHAR"),
    ("orders", "shipping_address", "VARCHAR"),
    ("orders", "shipping_city", "VARCHAR"),
    ("orders", "shipping_postal_code", "VARCHAR"),
    ("orders", "notes", "TEXT"),
    ("reviews", "sentiment_score", "FLOAT"),
    ("reviews", "keywords", "TEXT"),
    ("reviews", "is_verified_purchase", "BOOLEAN DEFAULT 0"),
]


def migrate_schema():
    """Apply additive schema changes without deleting existing data."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table, column, ddl in ADDITIVE_COLUMNS:
            if table not in existing_tables:
                continue
            columns = {c["name"] for c in inspector.get_columns(table)}
            if column not in columns:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                # refresh column cache for this table
                inspector = inspect(engine)
        # Les commandes existantes créées avant le module paiement sont considérées payées par carte
        if "orders" in existing_tables:
            connection.execute(
                text(
                    "UPDATE orders SET payment_status = 'PAID', payment_method = COALESCE(payment_method, 'card') "
                    "WHERE payment_status IS NULL AND status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED')"
                )
            )
            connection.execute(
                text("UPDATE orders SET payment_status = 'UNPAID' WHERE payment_status IS NULL")
            )
            connection.execute(
                text("UPDATE orders SET payment_method = 'card' WHERE payment_method IS NULL")
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
