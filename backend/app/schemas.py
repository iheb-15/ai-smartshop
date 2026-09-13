from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Literal, Optional, List, Any, Dict
from datetime import datetime


# ---- Auth / Users ----
class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["client", "admin"] = "client"  # ignoré côté serveur (sécurité), conservé pour compat


class UserAdminUpdate(BaseModel):
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=30)
    address: Optional[str] = Field(default=None, max_length=200)
    city: Optional[str] = Field(default=None, max_length=80)
    postal_code: Optional[str] = Field(default=None, max_length=20)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    is_admin: bool
    is_active: bool = True
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    created_at: Optional[datetime] = None
    orders_count: Optional[int] = 0

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- Categories ----
class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class CategoryOut(BaseModel):
    id: int
    name: str
    description: str
    product_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ---- Products ----
class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    price: float
    stock: int = 0
    image_url: Optional[str] = ""
    category_id: Optional[int] = None
    promo_price: Optional[float] = None
    is_available: bool = True

    class Config:
        from_attributes = True


class PromotionCreate(BaseModel):
    name: str
    discount_percent: float
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool = True
    product_id: Optional[int] = None
    category_id: Optional[int] = None


class PromotionOut(PromotionCreate):
    id: int
    product_name: Optional[str] = None
    category_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProductOut(BaseModel):
    id: int
    name: str
    description: str
    price: float
    stock: int
    image_url: str
    category_id: Optional[int]
    category_name: Optional[str] = None
    promo_price: Optional[float]
    is_available: bool = True
    created_at: Optional[datetime] = None
    # Prix reel paye par le client (min promo manuelle / promos actives)
    effective_price: Optional[float] = None
    active_promotion: Optional[dict] = None
    # Notes agrégées
    avg_rating: Optional[float] = None
    reviews_count: Optional[int] = None
    # Attributs IA transients (recommandation / prédiction / recherche)
    recommendation_score: Optional[float] = None
    recommendation_reason: Optional[str] = None
    interest_probability: Optional[float] = None
    interest_reasons: Optional[List[str]] = None
    search_score: Optional[float] = None

    class Config:
        from_attributes = True


# ---- Cart ----
class CartItemCreate(BaseModel):
    product_id: int
    quantity: int = 1


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1)


class CartItemOut(BaseModel):
    id: int
    product: ProductOut
    quantity: int

    class Config:
        from_attributes = True


# ---- Wishlist ----
class WishlistItemOut(BaseModel):
    id: int
    product: ProductOut
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- Orders / Payment ----
class CardDetails(BaseModel):
    number: str = Field(min_length=12, max_length=23)
    holder: str = Field(min_length=2, max_length=80)
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=2000, le=2100)
    cvc: str = Field(min_length=3, max_length=4)

    @field_validator("cvc")
    @classmethod
    def cvc_digits(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("Le CVC doit contenir uniquement des chiffres.")
        return v


class ShippingDetails(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=6, max_length=30)
    address: str = Field(min_length=5, max_length=200)
    city: str = Field(min_length=2, max_length=80)
    postal_code: Optional[str] = Field(default="", max_length=20)


class CheckoutRequest(BaseModel):
    payment_method: Literal["card", "cash_on_delivery"] = "card"
    card: Optional[CardDetails] = None
    shipping: ShippingDetails
    notes: Optional[str] = Field(default=None, max_length=500)
    save_address: bool = True


class PayOrderRequest(BaseModel):
    card: CardDetails


class PaymentOut(BaseModel):
    id: int
    method: str
    amount: float
    status: str
    transaction_ref: Optional[str] = None
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None
    failure_reason: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrderItemOut(BaseModel):
    id: Optional[int] = None
    product_id: int
    quantity: int
    unit_price: float
    product: Optional[ProductOut] = None
    # Caractéristiques produit au moment de la commande (dénormalisé pour l'admin)
    product_name: Optional[str] = None
    product_description: Optional[str] = None
    product_image: Optional[str] = None
    category_name: Optional[str] = None

    class Config:
        from_attributes = True


class OrderOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    status: str
    total: float
    payment_method: Optional[str] = "card"
    payment_status: Optional[str] = "UNPAID"
    paid_at: Optional[datetime] = None
    shipping_name: Optional[str] = None
    shipping_phone: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_postal_code: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    items: List[OrderItemOut] = []
    payments: List[PaymentOut] = []
    user: Optional[UserOut] = None

    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: str


# ---- Reviews ----
class ReviewCreate(BaseModel):
    product_id: int
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default="", max_length=2000)


class ReviewOut(BaseModel):
    id: int
    product_id: int
    user_id: int
    user_name: Optional[str] = None
    rating: int
    comment: str
    sentiment: Optional[str]
    sentiment_score: Optional[float] = None
    keywords: Optional[List[str]] = None
    is_verified_purchase: Optional[bool] = False
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewSummaryOut(BaseModel):
    product_id: int
    reviews_count: int
    average_rating: float
    sentiment_breakdown: Dict[str, int]
    summary: str
    pros: List[str] = []
    cons: List[str] = []
    mode: str  # llm | rules
    generated_at: Optional[datetime] = None


# ---- Admin : pagination / exports / fiche client ----
class PaginatedMeta(BaseModel):
    total: int
    skip: int
    limit: int


class UserDetailOut(BaseModel):
    id: int
    full_name: str
    email: str
    is_admin: bool
    is_active: bool = True
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    created_at: Optional[datetime] = None
    orders_count: Optional[int] = 0
    total_spent: float = 0.0
    reviews_count: int = 0
    last_order_at: Optional[datetime] = None
    orders: List["OrderOut"] = []

    class Config:
        from_attributes = True


# ---- Events (tracking comportemental) ----
class EventCreate(BaseModel):
    event_type: Literal["view", "search", "add_to_cart", "remove_from_cart", "wishlist_add", "wishlist_remove", "chat"]
    product_id: Optional[int] = None
    session_id: Optional[str] = None
    query: Optional[str] = Field(default=None, max_length=300)
    value: Optional[float] = None


# ---- AI ----
class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(min_length=1, max_length=2000)


class ChatProductCard(BaseModel):
    id: int
    name: str
    price: float
    effective_price: Optional[float] = None
    image_url: Optional[str] = ""
    stock: int = 0


class ChatResponse(BaseModel):
    reply: str
    mode: str = "llm"  # llm | fallback
    products: List[ChatProductCard] = []
    actions: List[str] = []  # ex: "cart_updated"
    suggestions: List[str] = []


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=300)
    top_k: int = Field(default=12, ge=1, le=50)
    session_id: Optional[str] = None


class SearchInterpretation(BaseModel):
    keywords: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    sort: Optional[str] = None
    in_stock_only: bool = False
    on_promo: bool = False
    labels: List[str] = []


class SearchResponse(BaseModel):
    query: str
    mode: str  # llm | rules
    interpretation: SearchInterpretation
    total: int
    results: List[ProductOut]


class PredictionOut(BaseModel):
    product: ProductOut
    probability: float
    reasons: List[str] = []


class ModelInfoOut(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_type: str
    mode: str  # ml | heuristic
    trained_at: Optional[datetime] = None
    n_samples: int = 0
    n_positives: int = 0
    n_users: int = 0
    n_products: int = 0
    metrics: Dict[str, Any] = {}
    feature_importances: List[Dict[str, Any]] = []
    features: List[str] = []
