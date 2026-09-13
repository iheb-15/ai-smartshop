import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ProductGrid from "../components/ProductGrid";
import { useWishlist } from "../context/WishlistContext";

export default function Wishlist() {
  const { ids } = useWishlist();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/wishlist/")
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [ids]);

  const products = items.map((it) => it.product);

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-ink">Mes favoris</h1>
          <p className="text-sm text-ink/50">Vos coups de cœur alimentent aussi vos recommandations personnalisées.</p>
        </div>
        <Link to="/shop" className="text-sm font-semibold text-brand-600 hover:underline">Boutique →</Link>
      </div>
      {loading ? (
        <p className="text-center text-ink/40 py-10">Chargement…</p>
      ) : (
        <ProductGrid products={products} emptyLabel="Aucun favori pour le moment. Cliquez sur ♡ sur un produit pour l'ajouter." />
      )}
    </div>
  );
}
