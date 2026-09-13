import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ProductGrid from "../components/ProductGrid";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [forMe, setForMe] = useState([]);
  const [promotions, setPromotions] = useState([]);

  useEffect(() => {
    api
      .get("/products/", { params: { sort_by: "newest", limit: 8 } })
      .then((res) => setProducts(res.data))
      .catch(() => setProducts([]));
    // Promotions réellement actives (fenêtre de dates respectée côté backend)
    api
      .get("/promotions/active")
      .then((res) => setPromotions(res.data || []))
      .catch(() => setPromotions([]));
  }, []);

  // Recommandations IA personnalisées : visibles uniquement si connecté
  useEffect(() => {
    if (!user) {
      setForMe([]);
      return;
    }
    api
      .get("/ai/recommendations/for-me")
      .then((res) => setForMe(res.data || []))
      .catch(() => setForMe([]));
  }, [user]);

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-50 to-white border-b border-brand-100">
        <div className="max-w-6xl mx-auto px-5 py-20 text-center">
          <h1 className="font-display text-4xl md:text-5xl text-brand-700 mb-4">
            Une boutique qui vous connaît
          </h1>
          <p className="text-ink/60 max-w-xl mx-auto mb-8">
            Recommandations personnalisées, recherche en langage naturel et un
            assistant d'achat IA pour trouver exactement ce qu'il vous faut.
          </p>
          <Link
            to="/shop"
            className="inline-block bg-brand-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-brand-700 transition"
          >
            Découvrir la boutique
          </Link>
        </div>
      </section>

      {/* Bandeau promotions actives : rend les promos admin visibles côté boutique */}
      {promotions.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pt-10">
          <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-brand-600 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/80 mb-1">
                  Offres en cours
                </p>
                <h2 className="font-display text-2xl font-bold">
                  {promotions[0].name} : -{promotions[0].discount_percent}%
                </h2>
                <p className="text-white/80 text-sm mt-1">
                  {promotions[0].product_name
                    ? `Sur ${promotions[0].product_name}`
                    : promotions[0].category_name
                    ? `Sur la catégorie ${promotions[0].category_name}`
                    : "Sur tout le catalogue"}
                  {promotions.length > 1 &&
                    ` + ${promotions.length - 1} autre(s) offre(s)`}
                  {promotions[0].ends_at
                    ? ` • jusqu'au ${new Date(promotions[0].ends_at).toLocaleDateString("fr-FR")}`
                    : ""}
                </p>
              </div>
              <Link
                to="/shop"
                className="self-start md:self-auto px-5 py-2.5 rounded-full bg-white text-rose-700 text-sm font-bold hover:bg-rose-50 transition"
              >
                J'en profite →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Recommandations IA : le cœur personnalisé devient visible côté client */}
      {user && (
        <section className="max-w-6xl mx-auto px-5 pt-14">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl text-ink">
                ✨ Recommandé pour vous, {user.full_name?.split(" ")[0] || ""}
              </h2>
              <p className="text-sm text-ink/50">
                Basé sur vos catégories déjà achetées (ML, sans surcoût IA).
              </p>
            </div>
            <Link to="/shop" className="text-sm font-semibold text-brand-600 hover:underline">
              Tout voir →
            </Link>
          </div>
          {forMe.length > 0 ? (
            <ProductGrid products={forMe} emptyLabel="Aucune recommandation pour le moment." />
          ) : (
            <p className="text-sm text-ink/40">
              Commandez un premier article pour activer vos recommandations personnalisées.
            </p>
          )}
        </section>
      )}

      <section className="max-w-6xl mx-auto px-5 py-14">
        <h2 className="font-display text-2xl text-ink mb-6">Nouveautés</h2>
        <ProductGrid products={products} />
      </section>
    </div>
  );
}

