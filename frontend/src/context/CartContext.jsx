import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    const res = await api.get("/cart/");
    setItems(res.data);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addToCart = async (productId, quantity = 1) => {
    await api.post("/cart/", { product_id: productId, quantity });
    await refresh();
  };

  const updateQuantity = async (itemId, quantity) => {
    await api.put(`/cart/${itemId}`, null, { params: { quantity } });
    await refresh();
  };

  const removeItem = async (itemId) => {
    await api.delete(`/cart/${itemId}`);
    await refresh();
  };

  const total = items.reduce(
    (sum, it) => {
      const p = it.product || {};
      const unit = p.effective_price != null ? p.effective_price : p.promo_price != null ? p.promo_price : p.price;
      return sum + unit * it.quantity;
    },
    0
  );

  const clearCart = async () => {
    await api.delete("/cart/clear");
    await refresh();
  };

  return (
    <CartContext.Provider
      value={{ items, addToCart, updateQuantity, removeItem, clearCart, refresh, total }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
