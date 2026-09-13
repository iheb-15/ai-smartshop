import { useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext";
import { getDisplayPrice } from "../components/ProductCard";
import { useAuth } from "../context/AuthContext";
import ProductGrid from "../components/ProductGrid";
import api from "../api/client";

export default function Cart() {
  const { items, updateQuantity, removeItem, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");

  const subtotal = items.reduce((s, it) => s + (it.product?.price || 0) * it.quantity, 0);
  const total = items.reduce((s, it) => s + getDisplayPrice(it.product) * it.quantity, 0);
  const discount = Math.max(0, subtotal - total);
  const blocking = items.filter((it) => it.quantity > (it.product?.stock ?? 0) || it.product?.is_available === false);

  useEffect(() => {
    if (!user || items.length === 0) {
      setSuggestions([]);
      return;
    }
    // Ventes croisées : produits souvent achetés avec le premier article du panier
    api
      .get(`/ai/recommendations/bought-together/${items[0].product.id}`, { params: { top_k: 4 } })
      .then((res) => {
        const inCart = new Set(items.map((it) => it.product.id));
        setSuggestions((res.data || []).filter((p) => !inCart.has(p.id)));
      })
      .catch(() => setSuggestions([]));
  }, [user, items]);

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
          <Link to="/shop" className="text-sm font-semibold text-brand-600 hover:underline">← Continuer mes achats</Link>
          {items.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Vider entièrement le panier ?")) clearCart();
              }}
              className="text-sm font-semibold text-rose-500 hover:text-rose-700"
            >
              Vider le panier
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-ink/50">
          Votre panier est vide. <Link to="/shop" className="text-brand-600 underline">Voir la boutique</Link>
        </p>
      ) : (
        <>
          <div className="space-y-4 mb-8">
            {items.map((item) => {
              const price = getDisplayPrice(item.product);
              const wasPromo = price < item.product.price;
              const maxStock = item.product?.stock ?? 0;
              const overStock = item.quantity > maxStock;
              return (
                <div key={item.id} className="flex items-center gap-4 bg-white border border-brand-100 rounded-2xl p-4">
                  <Link to={`/product/${item.product.id}`}>
                    <img
                      src={item.product.image_url}
                      alt=""
                      className="w-20 h-20 rounded-xl object-cover bg-brand-50"
                      onError={(e) => { e.currentTarget.src = "/favicon.svg"; }}
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/product/${item.product.id}`} className="font-semibold text-sm hover:text-brand-700 line-clamp-1">{item.product.name}</Link>
                    <p className="text-brand-700 font-display">
                      {price} DT{" "}
                      {wasPromo && <span className="text-xs text-ink/40 line-through ml-1">{item.product.price} DT</span>}
                    </p>
                    {item.product.active_promotion && (
                      <p className="text-[11px] text-rose-600 font-semibold">
                        -{item.product.active_promotion.discount_percent}% • {item.product.active_promotion.name}
                      </p>
                    )}
                    {overStock && (
                      <p className="text-[11px] text-amber-700 font-semibold">
                        ⚠ Plus que {maxStock} en stock — réduisez la quantité pour commander
                      </p>
                    )}
                  </div>
                  <div className="flex items-center border border-brand-100 rounded-full overflow-hidden">
                    <button type="button" onClick={() => item.quantity > 1 && updateQuantity(item.id, item.quantity - 1).catch(() => {})} className="px-3 py-1.5 font-bold hover:bg-brand-50">−</button>
                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity + 1).catch((e) => setError(e?.response?.data?.detail || "Stock insuffisant."))}
                      className="px-3 py-1.5 font-bold hover:bg-brand-50"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-24 text-right font-semibold text-sm">{(price * item.quantity).toFixed(2)} DT</span>
                  <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 text-sm" aria-label="Retirer">✕</button>
                </div>
              );
            })}
          </div>

          {error && <p className="mb-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{error}</p>}

          <div className="bg-brand-50 rounded-2xl p-5 space-y-2">
            <div className="flex justify-between text-sm text-ink/60"><span>Sous-total</span><span>{subtotal.toFixed(2)} DT</span></div>
            {discount > 0 && <div className="flex justify-between text-sm text-rose-600"><span>Remises appliquées</span><span>−{discount.toFixed(2)} DT</span></div>}
            <div className="flex justify-between text-sm text-ink/60"><span>Livraison</span><span className="text-emerald-600 font-semibold">Offerte</span></div>
            <div className="flex items-center justify-between pt-2 border-t border-brand-100">
              <span className="font-display text-xl">Total : {total.toFixed(2)} DT</span>
              <button
                onClick={() => navigate("/checkout")}
                disabled={blocking.length > 0}
                className="bg-brand-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-brand-700 disabled:opacity-50"
              >
                Passer au paiement →
              </button>
            </div>
            {blocking.length > 0 && <p className="text-xs text-amber-700">Ajustez les quantités signalées pour continuer.</p>}
          </div>

          {suggestions.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-xl text-ink mb-1">Souvent achetés ensemble</h2>
              <p className="text-sm text-ink/50 mb-4">Complétez votre panier avec des articles associés (règles d'association sur les commandes).</p>
              <ProductGrid products={suggestions} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
