import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";

function displayPrice(product) {
  if (!product) return 0;
  if (product.effective_price != null) return product.effective_price;
  if (product.promo_price != null) return product.promo_price;
  return product.price;
}

export function getDisplayPrice(product) {
  return displayPrice(product);
}

export function Stars({ value, count, size = "text-[11px]" }) {
  if (!value) return null;
  const rounded = Math.round(value);
  return (
    <span className={`${size} text-amber-500 font-semibold`} title={`${value}/5`}>
      {"★".repeat(rounded)}
      <span className="text-slate-300">{"★".repeat(5 - rounded)}</span>
      {count != null && <span className="text-ink/40 font-normal ml-1">({count})</span>}
    </span>
  );
}

export function WishlistButton({ productId, className = "" }) {
  const { user } = useAuth();
  const wishlist = useWishlist();
  const navigate = useNavigate();
  const active = wishlist?.has(productId);
  return (
    <button
      type="button"
      aria-label={active ? "Retirer des favoris" : "Ajouter aux favoris"}
      title={active ? "Retirer des favoris" : "Ajouter aux favoris"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) return navigate("/login");
        wishlist.toggle(productId).catch(() => {});
      }}
      className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition ${
        active ? "bg-rose-500 text-white" : "bg-white/90 text-rose-500 hover:bg-white"
      } ${className}`}
    >
      {active ? "♥" : "♡"}
    </button>
  );
}

export default function ProductCard({ product, showReason = true }) {
  const bestPrice = displayPrice(product);
  const hasPromo = bestPrice < product.price;
  const promoLabel = product.active_promotion?.name || null;
  const probability = product.interest_probability;
  const reason = product.recommendation_reason || (product.interest_reasons && product.interest_reasons[0]);

  return (
    <Link
      to={`/product/${product.id}`}
      className="group bg-white rounded-2xl overflow-hidden border border-brand-100 hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col"
    >
      <div className="aspect-square overflow-hidden bg-brand-50 relative">
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            e.currentTarget.src = "/favicon.svg";
          }}
        />
        {hasPromo && (
          <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white shadow">
            {product.active_promotion ? `-${product.active_promotion.discount_percent}% • ${promoLabel}` : "PROMO"}
          </span>
        )}
        {probability != null && (
          <span
            className="absolute bottom-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-600/95 text-white shadow"
            title="Probabilité d'intérêt estimée par le modèle de prédiction"
          >
            {Math.round(probability * 100)}% pour vous
          </span>
        )}
        <WishlistButton productId={product.id} className="absolute top-2 right-2" />
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-ink text-sm mb-1 line-clamp-1">{product.name}</h3>
        <div className="flex items-center justify-between mb-1">
          <Stars value={product.avg_rating} count={product.reviews_count} />
          {product.category_name && <span className="text-[10px] text-ink/40 uppercase tracking-wide">{product.category_name}</span>}
        </div>
        <p className="text-xs text-ink/50 mb-2 line-clamp-2">{product.description}</p>
        <div className="flex items-baseline gap-2 mt-auto">
          {hasPromo ? (
            <>
              <span className="font-display text-lg text-brand-700">{bestPrice} DT</span>
              <span className="text-xs text-ink/40 line-through">{product.price} DT</span>
            </>
          ) : (
            <span className="font-display text-lg text-brand-700">{product.price} DT</span>
          )}
        </div>
        {product.stock <= 0 ? (
          <span className="text-xs text-red-500 font-medium">Rupture de stock</span>
        ) : product.stock <= 5 ? (
          <span className="text-[11px] text-amber-600 font-medium">Plus que {product.stock} en stock</span>
        ) : null}
        {showReason && reason && (
          <p className="mt-2 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 line-clamp-2">
            ✨ {reason}
          </p>
        )}
      </div>
    </Link>
  );
}
