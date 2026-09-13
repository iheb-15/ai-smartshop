import { useEffect, useState } from "react";
import api from "../../api/client";

export default function AdminAIPage() {
  const [activeTab, setActiveTab] = useState("reviews"); // reviews, behavior, recommendations, predictions
  const [loading, setLoading] = useState(true);

  // Data states for 4 AI pillars
  const [reviewsData, setReviewsData] = useState(null);
  const [behaviorData, setBehaviorData] = useState(null);
  const [recomData, setRecomData] = useState(null);
  const [predData, setPredData] = useState(null);

  const loadAllAIData = async () => {
    setLoading(true);
    try {
      const [revRes, behRes, recRes, predRes] = await Promise.all([
        api.get("/ai-admin/reviews-analytics"),
        api.get("/ai-admin/customer-behavior"),
        api.get("/ai-admin/recommendations-stats"),
        api.get("/ai-admin/predictions"),
      ]);
      setReviewsData(revRes.data);
      setBehaviorData(behRes.data);
      setRecomData(recRes.data);
      setPredData(predRes.data);
    } catch (err) {
      console.error("Erreur lors du chargement des analyses IA:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAIData();
  }, []);

  const tabs = [
    { id: "reviews", label: "A. Avis & Sentiment", icon: "💬" },
    { id: "behavior", label: "B. Comportement Client", icon: "🛒" },
    { id: "recommendations", label: "C. Recommandations ML", icon: "🎯" },
    { id: "predictions", label: "D. Prédictions & Stocks", icon: "📈" },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-brand-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-xs font-semibold uppercase tracking-wider mb-2">
            <span>🤖</span> Intelligence Artificielle & ML
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Hub Analytics & Décisionnel IA
          </h1>
          <p className="text-white/75 text-sm mt-1 max-w-2xl">
            Exploitez la puissance des algorithmes de NLP, de Similarité Cosinus TF-IDF et de modélisation prédictive des flux d'achat.
          </p>
        </div>

        <button
          onClick={loadAllAIData}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold transition flex items-center gap-2"
        >
          <span>🔄</span> Actualiser les calculs
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-28 bg-slate-200/60 rounded-2xl w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-44 bg-slate-200/60 rounded-2xl" />
            <div className="h-44 bg-slate-200/60 rounded-2xl" />
            <div className="h-44 bg-slate-200/60 rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {/* TAB A: REVIEWS & SENTIMENT */}
          {activeTab === "reviews" && reviewsData && (
            <div className="space-y-6">
              {/* KPI metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Taux de Satisfaction</span>
                  <p className="font-display text-3xl font-bold text-emerald-600 mt-1">
                    {reviewsData.satisfaction_rate}%
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Avis classés positifs par l'IA</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Note Moyenne</span>
                  <p className="font-display text-3xl font-bold text-ink mt-1">
                    ★ {reviewsData.average_rating} <span className="text-sm font-sans text-slate-400">/ 5</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Sur {reviewsData.total_reviews} avis vérifiés</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs sm:col-span-2 flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase mb-2">Ventilation des Sentiments</span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                      <span className="block text-xs font-bold text-emerald-700">Positifs</span>
                      <span className="font-display text-xl font-bold text-emerald-800">
                        {reviewsData.sentiment_breakdown.positive}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="block text-xs font-bold text-slate-600">Neutres</span>
                      <span className="font-display text-xl font-bold text-slate-800">
                        {reviewsData.sentiment_breakdown.neutral}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-rose-50 border border-rose-100">
                      <span className="block text-xs font-bold text-rose-700">Négatifs</span>
                      <span className="font-display text-xl font-bold text-rose-800">
                        {reviewsData.sentiment_breakdown.negative}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recurring Issues Detection */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🔍</span>
                  <h2 className="font-display text-lg font-bold text-ink">
                    Problèmes fréquents identifiés par le NLP
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Extraction sémantique des termes récurrents apparaissant dans les avis clients négatifs ou mitigés.
                </p>

                {reviewsData.problem_keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-2.5">
                    {reviewsData.problem_keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold"
                      >
                        <span>« {kw.keyword} »</span>
                        <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-900 flex items-center justify-center text-[10px]">
                          {kw.occurrences}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-emerald-600 bg-emerald-50/50 rounded-xl border border-emerald-100">
                    ✅ Aucun problème récurrent significatif n'a été détecté dans les avis négatifs.
                  </div>
                )}
              </div>

              {/* Detailed Reviews List + moderation */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg font-bold text-ink">
                    Derniers avis clients avec analyse de sentiment
                  </h2>
                  <span className="text-[11px] text-slate-400">Modération : suppression possible</span>
                </div>
                {reviewsData.reviews.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">Aucun avis client pour le moment.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {reviewsData.reviews.map((rev) => (
                      <div key={rev.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-amber-500 text-xs">{"★".repeat(rev.rating)}</span>
                            <span className="text-xs font-semibold text-ink">{rev.product_name}</span>
                            <span className="text-[11px] text-slate-400">par {rev.user_name}</span>
                          </div>
                          <p className="text-xs text-slate-600 italic">"{rev.comment}"</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                              rev.sentiment === "positive"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : rev.sentiment === "negative"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {rev.sentiment === "positive"
                              ? "✓ Positif"
                              : rev.sentiment === "negative"
                              ? "✕ Négatif"
                              : "— Neutre"}
                          </span>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Supprimer l'avis de ${rev.user_name} sur « ${rev.product_name} » ?`)) return;
                              try {
                                await api.delete(`/reviews/${rev.id}`);
                                loadAllAIData();
                              } catch (e) {
                                alert(e?.response?.data?.detail || "Suppression impossible.");
                              }
                            }}
                            title="Supprimer cet avis (modération)"
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB B: CUSTOMER BEHAVIOR */}
          {activeTab === "behavior" && behaviorData && (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Panier Moyen</span>
                  <p className="font-display text-3xl font-bold text-brand-700 mt-1">
                    {behaviorData.average_order_value.toFixed(2)} <span className="text-sm font-sans">DT</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Dépense moyenne par commande</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Volume Commandes</span>
                  <p className="font-display text-3xl font-bold text-ink mt-1">
                    {behaviorData.total_orders}
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">Total des transactions validées</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Intentions Paniers Actifs</span>
                  <p className="font-display text-3xl font-bold text-indigo-600 mt-1">
                    {behaviorData.cart_intentions.reduce((acc, c) => acc + c.count, 0)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Articles en attente dans les paniers</p>
                </div>
              </div>

              {/* Best-sellers and Cart Intentions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Sold Products */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <h2 className="font-display text-lg font-bold text-ink mb-1">
                    Produits les plus achetés
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">Volume total d'unités et chiffre d'affaires généré</p>

                  <div className="space-y-3">
                    {behaviorData.top_sold_products.length > 0 ? (
                      behaviorData.top_sold_products.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-400 text-xs w-4">#{idx + 1}</span>
                            <div>
                              <p className="text-xs font-semibold text-ink">{p.name}</p>
                              <p className="text-[11px] text-slate-400">{p.units_sold} unités vendues</p>
                            </div>
                          </div>
                          <span className="font-bold text-brand-700 text-xs">{p.revenue.toFixed(2)} DT</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 py-6 text-center">Pas encore de ventes.</p>
                    )}
                  </div>
                </div>

                {/* Intentions d'achat (Paniers) & Chatbot Queries */}
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <h2 className="font-display text-lg font-bold text-ink mb-1">
                      Articles les plus mis au panier
                    </h2>
                    <p className="text-xs text-slate-400 mb-4">Fort signal d'intérêt client en attente de commande</p>

                    <div className="space-y-2">
                      {behaviorData.cart_intentions.length > 0 ? (
                        behaviorData.cart_intentions.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                            <span className="font-medium text-slate-700">{item.name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                              {item.count} en panier
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 py-4 text-center">Aucun panier actif.</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <h2 className="font-display text-lg font-bold text-ink mb-1">
                      Recherches fréquentes au Chatbot IA
                    </h2>
                    <p className="text-xs text-slate-400 mb-4">Sujets et mots-clés les plus formulés par les clients</p>
                    <div className="flex flex-wrap gap-2">
                      {behaviorData.top_chatbot_inquiries.length > 0 ? (
                        behaviorData.top_chatbot_inquiries.map((q, idx) => (
                          <span key={idx} className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">
                            💬 {q.query} ({q.count})
                          </span>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 py-2">Aucune conversation récente.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB C: RECOMMENDATION ENGINE */}
          {activeTab === "recommendations" && recomData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Couverture Catalogue</span>
                  <p className="font-display text-3xl font-bold text-brand-700 mt-1">
                    {recomData.catalog_coverage}%
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Produits avec suggestions similaires</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Modèle de Recommandation</span>
                  <p className="font-display text-lg font-bold text-ink mt-1">
                    TF-IDF + Cosine Sim.
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">Scikit-Learn (Pas de coût API)</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Catalogue Actif</span>
                  <p className="font-display text-3xl font-bold text-ink mt-1">
                    {recomData.total_catalog_items}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Articles indexés dans la matrice</p>
                </div>
              </div>

              {/* Co-Purchase Association Mining & Similarity Matrix */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Frequently Bought Together (Co-occurrence) */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <h2 className="font-display text-lg font-bold text-ink mb-1">
                    Paires de co-achats fortes
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">Articles fréquemment commandés ensemble dans le même panier</p>

                  <div className="space-y-3">
                    {recomData.frequent_pairs.length > 0 ? (
                      recomData.frequent_pairs.map((pair, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-slate-800">{pair.product_a}</span>
                            <span className="text-slate-400 mx-2">+</span>
                            <span className="font-semibold text-slate-800">{pair.product_b}</span>
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-brand-100 text-brand-800 font-bold shrink-0">
                            {pair.co_orders} co-achat(s)
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 py-6 text-center">
                        En attente de davantage de commandes multi-articles pour dériver des règles de co-achats.
                      </p>
                    )}
                  </div>
                </div>

                {/* Similarity Matrix Preview */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <h2 className="font-display text-lg font-bold text-ink mb-1">
                    Échantillon de Similarité Vectorielle
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">Corrélations sémantiques les plus fortes détectées par l'IA</p>

                  <div className="space-y-3">
                    {recomData.similarity_matrix_samples.map((item, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between text-xs">
                        <div className="truncate mr-2">
                          <span className="font-medium text-slate-700">{item.product}</span>
                          <span className="text-slate-400 mx-1.5">➔</span>
                          <span className="font-semibold text-brand-700">{item.recommended}</span>
                        </div>
                        <span className="font-bold text-emerald-600 shrink-0">
                          {item.score}% similarité
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB D: PREDICTIVE INSIGHTS & INVENTORY FORECAST */}
          {activeTab === "predictions" && predData && (
            <div className="space-y-6">
              {/* Actionable Insights Cards */}
              <div className="space-y-3">
                <h2 className="font-display text-lg font-bold text-ink">
                  💡 Insights Commerciaux & Recommandations d'Action
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {predData.actionable_insights.map((insight, idx) => (
                    <div
                      key={idx}
                      className={`p-5 rounded-2xl border ${
                        insight.type === "warning"
                          ? "bg-rose-50/70 border-rose-200 text-rose-900"
                          : insight.type === "opportunity"
                          ? "bg-amber-50/70 border-amber-200 text-amber-900"
                          : "bg-blue-50/70 border-blue-200 text-blue-900"
                      }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider block mb-1">
                        {insight.title}
                      </span>
                      <p className="text-xs leading-relaxed opacity-90">{insight.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stock Forecast Table */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-ink">
                      Prévisions de rupture de stock (Vélocité réelle)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Modèle prédictif calculant la vitesse de rotation des stocks sur les {predData.days_history_analyzed} derniers jours
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-semibold">
                    Modèle prédictif actif
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">Produit</th>
                        <th className="py-2.5 px-3">Stock Actuel</th>
                        <th className="py-2.5 px-3">Vélocité (unités/jour)</th>
                        <th className="py-2.5 px-3">Jours de stock restants</th>
                        <th className="py-2.5 px-3 text-right">Diagnostic Prédictif</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {predData.stock_forecasts.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-3 font-semibold text-slate-800">{item.name}</td>
                          <td className="py-3 px-3 font-bold">{item.stock} unités</td>
                          <td className="py-3 px-3 text-slate-500">{item.daily_velocity} / j</td>
                          <td className="py-3 px-3">
                            {item.days_left !== null ? (
                              <span className={item.days_left <= 7 ? "font-bold text-rose-600" : "text-slate-600"}>
                                ~{item.days_left} jours
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Vente lente</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                item.status === "Rupture imminente"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
