import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useCart } from "../context/CartContext";
import { getDisplayPrice } from "../components/ProductCard";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";

export default function Cart() {
  const { items, updateQuantity, removeItem, clearCart, refresh } = useCart();
  const total = items.reduce(
    (sum, it) => sum + getDisplayPrice(it.product) * it.quantity,
    0
  );
  const { user } = useAuth();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const checkout = async () => {
    if (checkoutError) setCheckoutError("");
    setPlacing(true);
    try {
      await api.post("/orders/checkout");
      await refresh();
      setPlacing(false);
      navigate("/orders");
    } catch (err) {
      setPlacing(false);
      setCheckoutError(err?.response?.data?.detail || "Commande impossible (stock insuffisant ?).");
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-20 text-center">
        <p className="text-ink/60 mb-4">Connectez-vous pour voir votre panier.</p>
        <Link to="/login" className="text-brand-600 font-semibold">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl text-ink">Votre panier</h1>
        <div className="flex items-center gap-3">
          <Link to="/shop" className="text-sm font-semibold text-brand-600 hover:underline">
            ← Continuer mes achats
          </Link>
          <button
            onClick={() => {
              if (window.confirm("Vider entièrement le panier ?")) clearCart();
            }}
            className="text-sm font-semibold text-rose-500 hover:text-rose-700"
          >
            Vider le panier
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-ink/50">Votre panier est vide. <Link to="/shop" className="text-brand-600 underline">Voir la boutique</Link></p>
      ) : (
        <>
          <div className="space-y-4 mb-8">
            {items.map((item) => {
              const price = getDisplayPrice(item.product);
              const wasPromo = price < item.product.price;
              const maxStock = item.product?.stock ?? 99;
              const overStock = item.quantity > maxStock;
              return (
                <div key={item.id} className="flex items-center gap-4 bg-white border border-brand-100 rounded-2xl p-4">
                  <img
                    src={item.product.image_url}
                    alt=""
                    className="w-20 h-20 rounded-xl object-cover"
                    onError={(e) => { e.currentTarget.src = "/favicon.svg"; }}
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{item.product.name}</h3>
                    <p className="text-brand-700 font-display">
                      {price} DT{" "}
                      {wasPromo && (
                        <span className="text-xs text-ink/40 line-through ml-1">
                          {item.product.price} DT
                        </span>
                      )}
                    </p>
                    {item.product.active_promotion && (
                      <p className="text-[11px] text-rose-600 font-semibold">
                        -{item.product.active_promotion.discount_percent}% • {item.product.active_promotion.name}
                      </p>
                    )}
                    {overStock && (
                      <p className="text-[11px] text-amber-700 font-semibold">
                        ⚠ Plus que {maxStock} en stock — quantité ajustée au checkout
                      </p>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={maxStock}
                    value={item.quantity}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(Number(e.target.value) || 1, maxStock || 1));
                      updateQuantity(item.id, v).catch(() => {});
                    }}
                    className="w-16 border border-brand-100 rounded-lg px-2 py-1 text-sm text-center"
                  />
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    Retirer
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between bg-brand-50 rounded-2xl p-5">
            <span className="font-display text-xl">Total : {total.toFixed(2)} DT</span>
            <button
              onClick={checkout}
              disabled={placing}
              className="bg-brand-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-brand-700 disabled:opacity-50"
            >
              {placing ? "Traitement…" : "Passer commande (simulation)"}
            </button>
          </div>
          {checkoutError && (
            <p className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              {checkoutError}
            </p>
          )}
        </>
      )}
    </div>
  );
}
