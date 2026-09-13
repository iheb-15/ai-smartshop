from pydantic import BaseModel, EmailStr
from typing import Literal, Optional, List
from datetime import datetime


# ---- Auth / Users ----
class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: Literal["client", "admin"] = "client"


class UserAdminUpdate(BaseModel):
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    is_admin: bool
    is_active: bool = True
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
    promo_price: Optional[float]
    is_available: bool = True
    created_at: Optional[datetime] = None
    # Prix reel paye par le client (min promo manuelle / promos actives)
    effective_price: Optional[float] = None
    active_promotion: Optional[dict] = None

    class Config:
        from_attributes = True


# ---- Cart ----
class CartItemCreate(BaseModel):
    product_id: int
    quantity: int = 1


class CartItemOut(BaseModel):
    id: int
    product: ProductOut
    quantity: int

    class Config:
        from_attributes = True


# ---- Orders ----
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
    created_at: datetime
    items: List[OrderItemOut] = []
    user: Optional[UserOut] = None

    class Config:
        from_attributes = True


# ---- Reviews ----
class ReviewCreate(BaseModel):
    product_id: int
    rating: int
    comment: Optional[str] = ""


class ReviewOut(BaseModel):
    id: int
    product_id: int
    user_id: int
    rating: int
    comment: str
    sentiment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


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
    created_at: Optional[datetime] = None
    orders_count: Optional[int] = 0
    total_spent: float = 0.0
    reviews_count: int = 0
    last_order_at: Optional[datetime] = None
    orders: List["OrderOut"] = []

    class Config:
        from_attributes = True


# ---- AI ----
class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
