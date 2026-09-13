import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import ProductGrid from "../components/ProductGrid";
import { Stars, WishlistButton } from "../components/ProductCard";
import { trackEvent } from "../lib/tracking";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useAuth();

  const [product, setProduct] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [boughtTogether, setBoughtTogether] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState(null);
  const [newReview, setNewReview] = useState({ rating: 5, comment: "" });
  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [cartError, setCartError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [toast, setToast] = useState("");

  const load = () => {
    setNotFound(false);
    api.get(`/products/${id}`).then((res) => setProduct(res.data)).catch(() => setNotFound(true));
    api.get(`/ai/recommendations/similar/${id}`).then((res) => setSimilar(res.data)).catch(() => setSimilar([]));
    api.get(`/ai/recommendations/bought-together/${id}`).then((res) => setBoughtTogether(res.data)).catch(() => setBoughtTogether([]));
    loadReviews();
  };

  const loadReviews = () => {
    api.get(`/reviews/product/${id}`).then((res) => setReviews(res.data)).catch(() => setReviews([]));
    api.get(`/reviews/product/${id}/summary`).then((res) => setSummary(res.data)).catch(() => setSummary(null));
  };

  useEffect(() => {
    load();
    setQuantity(1);
    window.scrollTo(0, 0);
    trackEvent("view", { product_id: Number(id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAddToCart = async () => {
    if (!user) return navigate("/login", { state: { from: `/product/${id}` } });
    setCartError("");
    const qty = Math.max(1, Math.min(quantity || 1, product.stock || 1));
    setAdding(true);
    try {
      await addToCart(product.id, qty);
      setToast(`${qty} × ${product.name} ajouté(s) au panier ✓`);
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      setCartError(err?.response?.data?.detail || "Ajout impossible (stock insuffisant ?).");
    } finally {
      setAdding(false);
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) return navigate("/login", { state: { from: `/product/${id}` } });
    setReviewError("");
    try {
      await api.post("/reviews/", { product_id: Number(id), ...newReview });
      setNewReview({ rating: 5, comment: "" });
      loadReviews();
      api.get(`/products/${id}`).then((res) => setProduct(res.data));
    } catch (err) {
      const d = err?.response?.data?.detail;
      setReviewError(typeof d === "string" ? d : "Publication impossible (note entre 1 et 5, commentaire ≤ 2000 caractères).");
    }
  };

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-20 text-center">
        <p className="text-ink/60 mb-4">Ce produit n'est plus disponible.</p>
        <Link to="/shop" className="text-brand-600 font-semibold">Retour à la boutique</Link>
      </div>
    );
  }
  if (!product) return <p className="text-center py-20 text-ink/40">Chargement…</p>;

  const bestPrice = product.effective_price != null ? product.effective_price : product.promo_price != null ? product.promo_price : product.price;
  const hasPromo = bestPrice != null && bestPrice < product.price;
  const alreadyReviewed = user && reviews.some((r) => r.user_id === user.id);

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <nav className="text-xs text-ink/40 mb-6">
        <Link to="/" className="hover:text-brand-600">Accueil</Link>
        {" / "}
        <Link to="/shop" className="hover:text-brand-600">Boutique</Link>
        {product.category_name && (
          <>
            {" / "}
            <Link to={`/shop?category_id=${product.category_id}`} className="hover:text-brand-600">{product.category_name}</Link>
          </>
        )}
        {" / "}
        <span className="text-ink/70 font-medium">{product.name}</span>
      </nav>
      {toast && (
        <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
          {toast}
          <Link to="/cart" className="font-semibold underline">Voir le panier</Link>
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-10 mb-14">
        <div className="rounded-2xl overflow-hidden bg-brand-50 aspect-square relative">
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = "/favicon.svg"; }} />
          <WishlistButton productId={product.id} className="absolute top-3 right-3 w-10 h-10 text-lg" />
        </div>
        <div>
          <h1 className="font-display text-3xl text-ink mb-2">{product.name}</h1>
          <p className="text-sm text-ink/50 mb-3 flex items-center gap-2">
            {product.avg_rating ? (
              <>
                <Stars value={product.avg_rating} size="text-sm" /> <strong className="text-ink">{product.avg_rating}/5</strong> • {product.reviews_count} avis
              </>
            ) : (
              "Aucun avis pour le moment"
            )}
          </p>
          <p className="text-ink/60 mb-5">{product.description}</p>
          <div className="flex items-baseline gap-3 mb-5">
            {hasPromo ? (
              <>
                <span className="font-display text-3xl text-brand-700">{bestPrice} DT</span>
                <span className="text-lg text-ink/40 line-through">{product.price} DT</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  {product.active_promotion ? `-${product.active_promotion.discount_percent}% • ${product.active_promotion.name}` : `-${Math.round((1 - bestPrice / product.price) * 100)}%`}
                </span>
              </>
            ) : (
              <span className="font-display text-3xl text-brand-700">{product.price} DT</span>
            )}
          </div>
          <p className="text-sm mb-6">
            {product.stock > 0 ? <span className="text-brand-600 font-medium">En stock ({product.stock} disponibles)</span> : <span className="text-red-500 font-medium">Rupture de stock</span>}
            {product.stock > 0 && product.stock <= 5 && <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Plus que {product.stock} !</span>}
          </p>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-medium">Quantité :</span>
            <div className="flex items-center border border-brand-100 rounded-full overflow-hidden">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, (q || 1) - 1))} className="px-3 py-2 text-lg font-bold hover:bg-brand-50">−</button>
              <input
                type="number"
                min={1}
                max={product.stock}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value) || 1, product.stock || 1)))}
                className="w-14 text-center text-sm py-2 focus:outline-none"
              />
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, Math.min((q || 1) + 1, product.stock || 1)))} className="px-3 py-2 text-lg font-bold hover:bg-brand-50">+</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button disabled={product.stock <= 0 || adding} onClick={handleAddToCart} className="bg-brand-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-brand-700 disabled:opacity-40 transition">
              {adding ? "Ajout…" : "Ajouter au panier"}
            </button>
            <button
              disabled={product.stock <= 0 || adding}
              onClick={async () => {
                await handleAddToCart();
                navigate("/checkout");
              }}
              className="border border-brand-600 text-brand-700 font-semibold px-6 py-3 rounded-full hover:bg-brand-50 disabled:opacity-40 transition"
            >
              Acheter maintenant
            </button>
          </div>
          {cartError && <p className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{cartError}</p>}
          <ul className="mt-6 text-xs text-ink/50 space-y-1">
            <li>🚚 Livraison offerte • paiement par carte (simulation) ou à la livraison</li>
            <li>↩ Annulation possible tant que la commande n'est pas expédiée</li>
          </ul>
        </div>
      </div>

      {boughtTogether.length > 0 && (
        <section className="mb-14">
          <h2 className="font-display text-xl text-ink mb-1">Souvent achetés ensemble</h2>
          <p className="text-sm text-ink/50 mb-4">Règles d'association calculées sur les commandes réelles.</p>
          <ProductGrid products={boughtTogether} />
        </section>
      )}

      {similar.length > 0 && (
        <section className="mb-14">
          <h2 className="font-display text-xl text-ink mb-1">Produits similaires</h2>
          <p className="text-sm text-ink/50 mb-4">Similarité de contenu (TF-IDF) combinée aux co-consultations des clients.</p>
          <ProductGrid products={similar} />
        </section>
      )}

      <section>
        <h2 className="font-display text-xl text-ink mb-4">Avis clients</h2>

        {summary && summary.reviews_count > 0 && (
          <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">🤖 Synthèse IA des avis</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-indigo-100 text-indigo-700">{summary.mode === "llm" ? "rédigée par Claude" : "synthèse statistique"}</span>
            </div>
            <p className="text-sm text-ink/80 mb-3">{summary.summary}</p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {summary.pros?.length > 0 && (
                <div>
                  <p className="font-semibold text-emerald-700 mb-1">Points forts</p>
                  <ul className="space-y-0.5">{summary.pros.map((p) => <li key={p} className="text-ink/70">✓ {p}</li>)}</ul>
                </div>
              )}
              {summary.cons?.length > 0 && (
                <div>
                  <p className="font-semibold text-rose-700 mb-1">Points faibles</p>
                  <ul className="space-y-0.5">{summary.cons.map((p) => <li key={p} className="text-ink/70">✕ {p}</li>)}</ul>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3 text-[11px]">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{summary.sentiment_breakdown.positive} positifs</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{summary.sentiment_breakdown.neutral} neutres</span>
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">{summary.sentiment_breakdown.negative} négatifs</span>
            </div>
          </div>
        )}

        {!alreadyReviewed ? (
          <form onSubmit={submitReview} className="bg-white border border-brand-100 rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <label className="text-sm font-medium">Note :</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setNewReview((r) => ({ ...r, rating: n }))} className={`text-2xl leading-none ${n <= newReview.rating ? "text-amber-500" : "text-slate-300"}`} aria-label={`${n} étoiles`}>
                    ★
                  </button>
                ))}
              </div>
              <span className="text-xs text-ink/40">{newReview.rating}/5</span>
            </div>
            <textarea
              value={newReview.comment}
              onChange={(e) => setNewReview((r) => ({ ...r, comment: e.target.value }))}
              placeholder={user ? "Votre avis (le sentiment et les aspects évoqués seront analysés automatiquement)…" : "Connectez-vous pour publier un avis"}
              className="w-full border border-brand-100 rounded-xl px-3 py-2 text-sm mb-3"
              rows={2}
              maxLength={2000}
            />
            <button type="submit" className="bg-brand-600 text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-brand-700">
              {user ? "Publier l'avis" : "Se connecter pour donner mon avis"}
            </button>
            {reviewError && <p className="text-rose-500 text-sm mt-2">{reviewError}</p>}
          </form>
        ) : (
          <p className="text-xs text-ink/50 mb-6">Vous avez déjà publié un avis sur ce produit. Merci !</p>
        )}

        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-ink/40 text-sm">Aucun avis pour le moment.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="border border-brand-100 rounded-xl p-4 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-amber-500">{"★".repeat(r.rating)}<span className="text-slate-300">{"★".repeat(5 - r.rating)}</span></span>
                  <span className="text-xs text-ink/60">{r.user_name || "Client"}</span>
                  {r.is_verified_purchase && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">✓ Achat vérifié</span>}
                  <span className="text-[11px] text-ink/40">{new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
                </div>
                {r.sentiment && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.sentiment === "positive" ? "bg-green-100 text-green-700" : r.sentiment === "negative" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`} title={r.sentiment_score != null ? `score ${r.sentiment_score}` : ""}>
                    {r.sentiment === "positive" ? "Positif" : r.sentiment === "negative" ? "Négatif" : "Neutre"}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink/70">{r.comment}</p>
              {r.keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.keywords.map((k) => <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">#{k}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
