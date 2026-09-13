import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ProductGrid from "../components/ProductGrid";
import { useAuth } from "../context/AuthContext";

const CATEGORY_ICONS = { Électronique: "🎧", Mode: "👗", Maison: "🏠", Sport: "🏃", "Beauté & Santé": "💆", "Livres & Papeterie": "📚" };

export default function Home() {
  const { user } = useAuth();
  const [newest, setNewest] = useState([]);
  const [popular, setPopular] = useState([]);
  const [forMe, setForMe] = useState([]);
  const [predicted, setPredicted] = useState([]);
  const [recent, setRecent] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get("/products/", { params: { sort_by: "newest", limit: 8 } }).then((res) => setNewest(res.data)).catch(() => setNewest([]));
    api.get("/promotions/active").then((res) => setPromotions(res.data || [])).catch(() => setPromotions([]));
    api.get("/categories/").then((res) => setCategories(res.data || [])).catch(() => setCategories([]));
    api.get("/ai/recommendations/popular", { params: { top_k: 4 } }).then((res) => setPopular(res.data || [])).catch(() => setPopular([]));
  }, []);

  useEffect(() => {
    if (!user) {
      setForMe([]);
      setPredicted([]);
      setRecent([]);
      return;
    }
    api.get("/ai/recommendations/for-me", { params: { top_k: 8 } }).then((res) => setForMe(res.data || [])).catch(() => setForMe([]));
    api
      .get("/ai/predictions/for-me", { params: { top_k: 4 } })
      .then((res) => setPredicted((res.data || []).map((p) => p.product)))
      .catch(() => setPredicted([]));
    api.get("/events/recently-viewed", { params: { limit: 4 } }).then((res) => setRecent(res.data || [])).catch(() => setRecent([]));
  }, [user]);

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-50 to-white border-b border-brand-100">
        <div className="max-w-6xl mx-auto px-5 py-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600 mb-3">E-commerce intelligent</p>
          <h1 className="font-display text-4xl md:text-5xl text-brand-700 mb-4">Une boutique qui vous connaît</h1>
          <p className="text-ink/60 max-w-xl mx-auto mb-8">
            Recommandations personnalisées, prédiction de vos envies, recherche en langage naturel et un assistant d'achat IA pour trouver exactement ce qu'il vous faut.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/shop" className="inline-block bg-brand-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-brand-700 transition">
              Découvrir la boutique
            </Link>
            {!user && (
              <Link to="/register" className="inline-block border border-brand-600 text-brand-700 font-semibold px-8 py-3 rounded-full hover:bg-brand-50 transition">
                Créer un compte
              </Link>
            )}
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              {categories.map((c) => (
                <Link key={c.id} to={`/shop?category_id=${c.id}`} className="px-4 py-2 rounded-full bg-white border border-brand-100 text-sm font-medium text-ink/70 hover:border-brand-400 hover:text-brand-700">
                  {CATEGORY_ICONS[c.name] || "🛍️"} {c.name} <span className="text-ink/30">({c.product_count})</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {promotions.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pt-10">
          <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-brand-600 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/80 mb-1">Offres en cours</p>
                <h2 className="font-display text-2xl font-bold">
                  {promotions[0].name} : -{promotions[0].discount_percent}%
                </h2>
                <p className="text-white/80 text-sm mt-1">
                  {promotions[0].product_name ? `Sur ${promotions[0].product_name}` : promotions[0].category_name ? `Sur la catégorie ${promotions[0].category_name}` : "Sur tout le catalogue"}
                  {promotions.length > 1 && ` + ${promotions.length - 1} autre(s) offre(s)`}
                  {promotions[0].ends_at ? ` • jusqu'au ${new Date(promotions[0].ends_at).toLocaleDateString("fr-FR")}` : ""}
                </p>
              </div>
              <Link to="/shop?q=promo" className="self-start md:self-auto px-5 py-2.5 rounded-full bg-white text-rose-700 text-sm font-bold hover:bg-rose-50 transition">
                J'en profite →
              </Link>
            </div>
          </div>
        </section>
      )}

      {user && (
        <section className="max-w-6xl mx-auto px-5 pt-14">
          <SectionHeader
            title={`✨ Recommandé pour vous, ${user.full_name?.split(" ")[0] || ""}`}
            subtitle="Moteur hybride : similarité de contenu + filtrage collaboratif + vos catégories favorites."
          />
          {forMe.length > 0 ? <ProductGrid products={forMe} /> : <p className="text-sm text-ink/40">Parcourez quelques produits pour activer vos recommandations personnalisées.</p>}
        </section>
      )}

      {user && predicted.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pt-14">
          <SectionHeader
            title="🔮 Susceptibles de vous plaire"
            subtitle="Probabilité d'intérêt estimée par un modèle de prédiction entraîné sur les comportements d'achat."
          />
          <ProductGrid products={predicted} />
        </section>
      )}

      {user && recent.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pt-14">
          <SectionHeader title="🕒 Récemment consultés" subtitle="Reprenez là où vous vous étiez arrêté." />
          <ProductGrid products={recent} />
        </section>
      )}

      {!user && popular.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pt-14">
          <SectionHeader title="🔥 Les incontournables" subtitle="Best-sellers, promotions et coups de cœur de nos clients." />
          <ProductGrid products={popular} />
        </section>
      )}

      <section className="max-w-6xl mx-auto px-5 py-14">
        <SectionHeader title="Nouveautés" subtitle="Les derniers produits ajoutés au catalogue." />
        <ProductGrid products={newest} />
      </section>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-ink/50">{subtitle}</p>}
      </div>
      <Link to="/shop" className="text-sm font-semibold text-brand-600 hover:underline">Tout voir →</Link>
    </div>
  );
}
