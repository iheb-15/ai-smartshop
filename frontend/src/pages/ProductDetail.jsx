import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import ProductGrid from "../components/ProductGrid";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useAuth();

  const [product, setProduct] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [boughtTogether, setBoughtTogether] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [newReview, setNewReview] = useState({ rating: 5, comment: "" });
  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [cartError, setCartError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [toast, setToast] = useState("");

  const load = () => {
    api.get(`/products/${id}`).then((res) => setProduct(res.data));
    api.get(`/ai/recommendations/similar/${id}`).then((res) => setSimilar(res.data));
    api.get(`/ai/recommendations/bought-together/${id}`).then((res) => setBoughtTogether(res.data));
    api.get(`/reviews/product/${id}`).then((res) => setReviews(res.data));
  };

  useEffect(() => {
    load();
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAddToCart = async () => {
    if (!user) return navigate("/login");
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
    if (!user) return navigate("/login");
    setReviewError("");
    try {
      await api.post("/reviews/", { product_id: Number(id), ...newReview });
      setNewReview({ rating: 5, comment: "" });
      load();
    } catch (err) {
      setReviewError(err?.response?.data?.detail || "Publication impossible.");
    }
  };

  if (!product) return <p className="text-center py-20 text-ink/40">Chargement…</p>;

  const bestPrice =
    product.effective_price != null
      ? product.effective_price
      : product.promo_price != null
        ? product.promo_price
        : product.price;
  const hasPromo = bestPrice != null && bestPrice < product.price;
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : null;

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      {/* Fil d'Ariane */}
      <nav className="text-xs text-ink/40 mb-6">
        <Link to="/" className="hover:text-brand-600">Accueil</Link>
        {" / "}
        <Link to="/shop" className="hover:text-brand-600">Boutique</Link>
        {" / "}
        <span className="text-ink/70 font-medium">{product.name}</span>
      </nav>
      {toast && (
        <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          {toast}
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-10 mb-14">
        <div className="rounded-2xl overflow-hidden bg-brand-50 aspect-square">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.src = "/favicon.svg"; }}
          />
        </div>
        <div>
          <h1 className="font-display text-3xl text-ink mb-2">{product.name}</h1>
          {/* Note moyenne + nombre d'avis */}
          <p className="text-sm text-ink/50 mb-3">
            {avgRating ? (
              <>{"★".repeat(Math.round(Number(avgRating)))} <strong className="text-ink">{avgRating}/5</strong> • {reviews.length} avis</>
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
                {product.active_promotion && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                    -{product.active_promotion.discount_percent}% • {product.active_promotion.name}
                  </span>
                )}
              </>
            ) : (
              <span className="font-display text-3xl text-brand-700">{product.price} DT</span>
            )}
          </div>
          <p className="text-sm mb-6">
            {product.stock > 0 ? (
              <span className="text-brand-600 font-medium">En stock ({product.stock} disponibles)</span>
            ) : (
              <span className="text-red-500 font-medium">Rupture de stock</span>
            )}
            {product.stock > 0 && product.stock <= 5 && (
              <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Plus que {product.stock} !
              </span>
            )}
          </p>
          {/* Sélecteur quantité (plafonné au stock) */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-medium">Quantité :</span>
            <div className="flex items-center border border-brand-100 rounded-full overflow-hidden">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, (q || 1) - 1))}
                className="px-3 py-2 text-lg font-bold hover:bg-brand-50"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={product.stock}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value) || 1, product.stock || 1)))}
                className="w-14 text-center text-sm py-2 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, Math.min((q || 1) + 1, product.stock || 1)))}
                className="px-3 py-2 text-lg font-bold hover:bg-brand-50"
              >
                +
              </button>
            </div>
          </div>
          <button
            disabled={product.stock <= 0 || adding}
            onClick={handleAddToCart}
            className="bg-brand-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-brand-700 disabled:opacity-40 transition"
          >
            {adding ? "Ajout…" : "Ajouter au panier"}
          </button>
          {cartError && (
            <p className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">
              {cartError}
            </p>
          )}
        </div>
      </div>

      {boughtTogether.length > 0 && (
        <section className="mb-14">
          <h2 className="font-display text-xl text-ink mb-4">Souvent achetés ensemble</h2>
          <ProductGrid products={boughtTogether} />
        </section>
      )}

      {similar.length > 0 && (
        <section className="mb-14">
          <h2 className="font-display text-xl text-ink mb-4">Produits similaires</h2>
          <ProductGrid products={similar} />
        </section>
      )}

      <section>
        <h2 className="font-display text-xl text-ink mb-4">Avis clients</h2>
        <form onSubmit={submitReview} className="bg-white border border-brand-100 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm font-medium">Note :</label>
            <select
              value={newReview.rating}
              onChange={(e) => setNewReview((r) => ({ ...r, rating: Number(e.target.value) }))}
              className="border border-brand-100 rounded-lg px-2 py-1 text-sm"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} ★</option>
              ))}
            </select>
          </div>
          <textarea
            value={newReview.comment}
            onChange={(e) => setNewReview((r) => ({ ...r, comment: e.target.value }))}
            placeholder="Votre avis…"
            className="w-full border border-brand-100 rounded-xl px-3 py-2 text-sm mb-3"
            rows={2}
          />
          <button
            type="submit"
            className="bg-brand-600 text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-brand-700"
          >
            Publier l'avis
          </button>
          {reviewError && <p className="text-rose-500 text-sm mt-2">{reviewError}</p>}
        </form>

        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-ink/40 text-sm">Aucun avis pour le moment.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="border border-brand-100 rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                {r.sentiment && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      r.sentiment === "positive"
                        ? "bg-green-100 text-green-700"
                        : r.sentiment === "negative"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {r.sentiment}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink/70">{r.comment}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
