import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState(new Set());

  const refresh = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      return;
    }
    try {
      const res = await api.get("/wishlist/ids");
      setIds(new Set(res.data || []));
    } catch {
      setIds(new Set());
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = async (productId) => {
    const res = await api.post(`/wishlist/${productId}`);
    setIds((prev) => {
      const next = new Set(prev);
      if (res.data.in_wishlist) next.add(productId);
      else next.delete(productId);
      return next;
    });
    return res.data.in_wishlist;
  };

  return (
    <WishlistContext.Provider value={{ ids, has: (id) => ids.has(id), toggle, refresh, count: ids.size }}>
      {children}
    </WishlistContext.Provider>
  );
}

export const useWishlist = () => useContext(WishlistContext);
