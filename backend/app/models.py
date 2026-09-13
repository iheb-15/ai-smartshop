from sqlalchemy import (
    Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, nullable=False)
    # Profil / adresse de livraison par défaut
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    orders = relationship("Order", back_populates="user")
    cart_items = relationship("CartItem", back_populates="user")
    reviews = relationship("Review", back_populates="user")
    wishlist_items = relationship("WishlistItem", back_populates="user")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, default="")

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, default="")
    price = Column(Float, nullable=False)
    stock = Column(Integer, default=0)
    image_url = Column(String, default="")
    category_id = Column(Integer, ForeignKey("categories.id"))
    promo_price = Column(Float, nullable=True)
    is_available = Column(Boolean, default=True, nullable=False)
    # Cache du résumé IA des avis (régénéré quand le nombre d'avis change)
    review_summary = Column(Text, nullable=True)
    review_summary_count = Column(Integer, default=0)
    review_summary_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("Category", back_populates="products")
    reviews = relationship("Review", back_populates="product")


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer, default=1)

    user = relationship("User", back_populates="cart_items")
    product = relationship("Product")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    # Statut logistique : PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED
    status = Column(String, default="PENDING", nullable=False)
    total = Column(Float, default=0.0)
    # Paiement (simulation) : méthode + statut distincts du statut logistique
    payment_method = Column(String, default="card")  # card | cash_on_delivery
    payment_status = Column(String, default="UNPAID")  # UNPAID | PAID | FAILED | REFUNDED
    paid_at = Column(DateTime, nullable=True)
    # Livraison (snapshot au moment de la commande)
    shipping_name = Column(String, nullable=True)
    shipping_phone = Column(String, nullable=True)
    shipping_address = Column(String, nullable=True)
    shipping_city = Column(String, nullable=True)
    shipping_postal_code = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order")
    payments = relationship("Payment", back_populates="order", order_by="Payment.created_at")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")


class Payment(Base):
    """Transaction de paiement simulée (aucun vrai prestataire n'est appelé)."""

    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    # order_id NULL = tentative de paiement refusée avant création de la commande
    order_id = Column(Integer, ForeignKey("orders.id"), index=True, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    method = Column(String, nullable=False)  # card | cash_on_delivery
    amount = Column(Float, nullable=False)
    status = Column(String, nullable=False)  # SUCCEEDED | FAILED | PENDING | REFUNDED
    transaction_ref = Column(String, unique=True, index=True)
    card_brand = Column(String, nullable=True)
    card_last4 = Column(String, nullable=True)
    failure_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    order = relationship("Order", back_populates="payments")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    rating = Column(Integer, default=5)
    comment = Column(Text, default="")
    sentiment = Column(String, nullable=True)  # positive, neutral, negative (filled by AI)
    sentiment_score = Column(Float, nullable=True)  # -1 .. 1
    keywords = Column(Text, nullable=True)  # JSON list d'aspects / mots-clés extraits
    is_verified_purchase = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="reviews")
    user = relationship("User", back_populates="reviews")


class Promotion(Base):
    __tablename__ = "promotions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    discount_percent = Column(Float, nullable=False)
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product")
    category = relationship("Category")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    session_id = Column(String, index=True)
    role = Column(String)  # user | assistant
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class Interaction(Base):
    """Événement comportemental (clickstream) : base de l'analyse client et du ML."""

    __tablename__ = "interactions"
    __table_args__ = (
        Index("ix_interactions_user_product", "user_id", "product_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(String, nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True, index=True)
    # view | search | add_to_cart | remove_from_cart | wishlist_add | wishlist_remove | purchase | review | chat
    event_type = Column(String, nullable=False, index=True)
    query = Column(String, nullable=True)  # texte de recherche / message chat
    value = Column(Float, nullable=True)  # quantité, montant, nb résultats...
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    product = relationship("Product")
    user = relationship("User")


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="wishlist_items")
    product = relationship("Product")
