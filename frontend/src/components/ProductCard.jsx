import { Link } from "react-router-dom";

function displayPrice(product) {
  if (!product) return 0;
  if (product.effective_price != null) return product.effective_price;
  if (product.promo_price != null) return product.promo_price;
  return product.price;
}

export function getDisplayPrice(product) {
  return displayPrice(product);
}

export default function ProductCard({ product }) {
  const bestPrice = displayPrice(product);
  const hasPromo = bestPrice < product.price;
  const promoLabel = product.active_promotion?.name || null;

  return (
    <Link
      to={`/product/${product.id}`}
      className="group bg-white rounded-2xl overflow-hidden border border-brand-100 hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <div className="aspect-square overflow-hidden bg-brand-50 relative">
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {hasPromo && product.active_promotion && (
          <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white shadow">
            -{product.active_promotion.discount_percent}% • {promoLabel}
          </span>
        )}
        {hasPromo && !product.active_promotion && (
          <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white shadow">
            PROMO
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-ink text-sm mb-1 line-clamp-1">{product.name}</h3>
        <p className="text-xs text-ink/50 mb-2 line-clamp-2">{product.description}</p>
        <div className="flex items-baseline gap-2">
          {hasPromo ? (
            <>
              <span className="font-display text-lg text-brand-700">{bestPrice} DT</span>
              <span className="text-xs text-ink/40 line-through">{product.price} DT</span>
            </>
          ) : (
            <span className="font-display text-lg text-brand-700">{product.price} DT</span>
          )}
        </div>
        {product.stock <= 0 && (
          <span className="text-xs text-red-500 font-medium">Rupture de stock</span>
        )}
      </div>
    </Link>
  );
}
