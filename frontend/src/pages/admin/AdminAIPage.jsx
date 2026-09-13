import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { SimpleBarChart, SimpleLineChart, DonutChart, FunnelBars, PALETTE } from "../../components/admin/Charts";

const TABS = [
  { id: "reviews", label: "Avis & Sentiment", icon: "💬" },
  { id: "behavior", label: "Comportement client", icon: "🛒" },
  { id: "recommendations", label: "Recommandations", icon: "🎯" },
  { id: "predictions", label: "Prédictions", icon: "🔮" },
];

function Card({ title, subtitle, children, action, className = "" }) {
  return (
    <div className={`bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h2 className="font-display text-lg font-bold text-ink">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({ label, value, hint, tone = "text-ink" }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
      <span className="text-[11px] font-bold text-slate-400 uppercase">{label}</span>
      <p className={`font-display text-3xl font-bold mt-1 ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const SENT_BADGE = { positive: "bg-emerald-50 text-emerald-700 border-emerald-200", negative: "bg-rose-50 text-rose-700 border-rose-200", neutral: "bg-slate-100 text-slate-600 border-slate-200" };
const SENT_LABEL = { positive: "✓ Positif", negative: "✕ Négatif", neutral: "— Neutre" };

export default function AdminAIPage() {
  const [activeTab, setActiveTab] = useState("reviews");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [reviewsData, setReviewsData] = useState(null);
  const [behaviorData, setBehaviorData] = useState(null);
  const [recomData, setRecomData] = useState(null);
  const [predData, setPredData] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [overview, setOverview] = useState([]);
  const [retraining, setRetraining] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [days, setDays] = useState(30);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [st, rev, beh, rec, pred, model, ov] = await Promise.all([
        api.get("/ai/status"),
        api.get("/ai-admin/reviews-analytics"),
        api.get("/ai-admin/customer-behavior", { params: { days } }),
        api.get("/ai-admin/recommendations-stats"),
        api.get("/ai-admin/predictions"),
        api.get("/ai-admin/predictions/model"),
        api.get("/ai-admin/predictions/overview"),
      ]);
      setStatus(st.data);
      setReviewsData(rev.data);
      setBehaviorData(beh.data);
      setRecomData(rec.data);
      setPredData(pred.data);
      setModelInfo(model.data);
      setOverview(ov.data.customers || []);
    } catch (err) {
      console.error("Erreur lors du chargement des analyses IA:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const retrain = async () => {
    setRetraining(true);
    try {
      const res = await api.post("/ai-admin/predictions/retrain");
      setModelInfo(res.data);
      const ov = await api.get("/ai-admin/predictions/overview");
      setOverview(ov.data.customers || []);
    } finally {
      setRetraining(false);
    }
  };

  const reanalyze = async () => {
    if (!window.confirm("Relancer l'analyse de sentiment sur tous les avis ? (utile après configuration de la clé API)")) return;
    setReanalyzing(true);
    try {
      await api.post("/reviews/reanalyze", null, { params: { only_missing: false } });
      const rev = await api.get("/ai-admin/reviews-analytics");
      setReviewsData(rev.data);
    } finally {
      setReanalyzing(false);
    }
  };

  const llm = status?.llm_configured;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-brand-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>🤖</span> Intelligence Artificielle & Machine Learning
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Hub Analytics & Décisionnel IA</h1>
          <p className="text-white/75 text-sm mt-1 max-w-2xl">
            Analyse des avis (NLP), analyse comportementale (clickstream, entonnoir, segmentation RFM), moteur de recommandation hybride et modèle de prédiction d'intérêt.
          </p>
          {status && (
            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
              {Object.entries(status.features).map(([k, v]) => (
                <span key={k} className={`px-2 py-0.5 rounded-full border ${v === "llm" ? "border-emerald-300/60 bg-emerald-500/20" : v === "ml" ? "border-indigo-300/60 bg-indigo-500/20" : "border-amber-300/60 bg-amber-500/20"}`}>
                  {k} : {v === "llm" ? "LLM Claude" : v === "ml" ? "ML local" : "mode dégradé (règles)"}
                </span>
              ))}
              {!llm && <span className="px-2 py-0.5 rounded-full border border-white/30 text-white/80">Ajoutez ANTHROPIC_API_KEY dans backend/.env pour activer le LLM</span>}
            </div>
          )}
        </div>
        <button onClick={loadAll} disabled={loading} className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold transition flex items-center gap-2">
          <span>🔄</span> Actualiser les calculs
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${activeTab === tab.id ? "bg-brand-600 text-white shadow-xs" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

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
          {/* ------------------------------------------------------------ A. AVIS */}
          {activeTab === "reviews" && reviewsData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Taux de satisfaction" value={`${reviewsData.satisfaction_rate}%`} hint="Avis classés positifs" tone="text-emerald-600" />
                <Kpi label="Note moyenne" value={`★ ${reviewsData.average_rating}`} hint={`Sur ${reviewsData.total_reviews} avis`} />
                <Kpi label="Achats vérifiés" value={`${reviewsData.verified_rate}%`} hint="Avis liés à une commande" tone="text-indigo-600" />
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Ventilation</span>
                  <div className="grid grid-cols-3 gap-2 text-center mt-2">
                    <div className="p-2 rounded-xl bg-emerald-50"><span className="block text-[10px] font-bold text-emerald-700">Positifs</span><span className="font-display text-lg font-bold text-emerald-800">{reviewsData.sentiment_breakdown.positive}</span></div>
                    <div className="p-2 rounded-xl bg-slate-100"><span className="block text-[10px] font-bold text-slate-600">Neutres</span><span className="font-display text-lg font-bold text-slate-800">{reviewsData.sentiment_breakdown.neutral}</span></div>
                    <div className="p-2 rounded-xl bg-rose-50"><span className="block text-[10px] font-bold text-rose-700">Négatifs</span><span className="font-display text-lg font-bold text-rose-800">{reviewsData.sentiment_breakdown.negative}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card title="Tendance hebdomadaire" subtitle="Volume d'avis positifs / négatifs sur 8 semaines" className="lg:col-span-2">
                  <SimpleBarChart data={reviewsData.trend} xKey="week" bars={[{ key: "positive", label: "Positifs", color: "#10b981" }, { key: "negative", label: "Négatifs", color: "#ef4444" }]} stacked height={220} />
                </Card>
                <Card title="Aspects évoqués" subtitle="Extraction des thèmes (prix, qualité, livraison…)">
                  <p className="text-[11px] font-bold text-emerald-700 uppercase mb-1">Dans les avis positifs</p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {reviewsData.positive_aspects.length ? reviewsData.positive_aspects.map((a) => <span key={a.aspect} className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold">{a.aspect} <span className="text-emerald-600">×{a.count}</span></span>) : <span className="text-xs text-slate-400">—</span>}
                  </div>
                  <p className="text-[11px] font-bold text-rose-700 uppercase mb-1">Dans les avis négatifs</p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {reviewsData.negative_aspects.length ? reviewsData.negative_aspects.map((a) => <span key={a.aspect} className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-800 text-xs font-semibold">{a.aspect} <span className="text-rose-600">×{a.count}</span></span>) : <span className="text-xs text-slate-400">—</span>}
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Mots récurrents (négatifs)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {reviewsData.problem_keywords.map((kw) => <span key={kw.keyword} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px]">{kw.keyword} ({kw.occurrences})</span>)}
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card title="Produits à surveiller" subtitle="Note < 3 ou ≥ 40 % d'avis négatifs" className="lg:col-span-1">
                  {reviewsData.watchlist.length === 0 ? (
                    <p className="text-xs text-emerald-600 py-4 text-center">✅ Aucun produit en alerte.</p>
                  ) : (
                    <div className="space-y-2">
                      {reviewsData.watchlist.map((p) => (
                        <Link key={p.product_id} to={`/product/${p.product_id}`} className="flex items-center gap-3 p-2 rounded-xl bg-rose-50/60 border border-rose-100 hover:bg-rose-50">
                          {p.image_url && <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-ink truncate">{p.product_name}</p>
                            <p className="text-[11px] text-rose-700">★ {p.avg_rating} • {p.negative_rate}% négatifs • {p.reviews} avis</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Sentiment par produit" subtitle="Score moyen de polarité (−1 à +1) et taux de positifs" className="lg:col-span-2">
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 sticky top-0">
                        <tr><th className="py-2 px-3">Produit</th><th className="py-2 px-3">Avis</th><th className="py-2 px-3">Note</th><th className="py-2 px-3">Positifs</th><th className="py-2 px-3">Polarité</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reviewsData.products.map((p) => (
                          <tr key={p.product_id} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 font-semibold text-slate-800">{p.product_name}</td>
                            <td className="py-2 px-3">{p.reviews}</td>
                            <td className="py-2 px-3">★ {p.avg_rating}</td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${p.positive_rate}%` }} /></div>
                                <span>{p.positive_rate}%</span>
                              </div>
                            </td>
                            <td className={`py-2 px-3 font-bold ${p.avg_sentiment > 0.15 ? "text-emerald-600" : p.avg_sentiment < -0.15 ? "text-rose-600" : "text-slate-500"}`}>{p.avg_sentiment > 0 ? "+" : ""}{p.avg_sentiment}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              <Card
                title="Derniers avis avec analyse"
                subtitle={`Analyse ${reviewsData.mode === "llm" ? "par LLM (Claude)" : "lexicale (règles) — passez en LLM en configurant la clé API"}`}
                action={
                  <div className="flex gap-2">
                    <button onClick={reanalyze} disabled={reanalyzing} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{reanalyzing ? "Analyse…" : "↻ Ré-analyser tous les avis"}</button>
                  </div>
                }
              >
                <div className="divide-y divide-slate-100">
                  {reviewsData.reviews.map((rev) => (
                    <div key={rev.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-amber-500 text-xs">{"★".repeat(rev.rating)}</span>
                          <span className="text-xs font-semibold text-ink">{rev.product_name}</span>
                          <span className="text-[11px] text-slate-400">par {rev.user_name}</span>
                          {rev.is_verified_purchase && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">achat vérifié</span>}
                          {rev.aspects?.map((a) => <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">#{a}</span>)}
                        </div>
                        <p className="text-xs text-slate-600 italic">"{rev.comment}"</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${SENT_BADGE[rev.sentiment] || SENT_BADGE.neutral}`} title={rev.sentiment_score != null ? `score ${rev.sentiment_score}` : ""}>
                          {SENT_LABEL[rev.sentiment] || SENT_LABEL.neutral}{rev.sentiment_score != null && <span className="font-normal opacity-70"> {rev.sentiment_score > 0 ? "+" : ""}{rev.sentiment_score}</span>}
                        </span>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Supprimer l'avis de ${rev.user_name} sur « ${rev.product_name} » ?`)) return;
                            try {
                              await api.delete(`/reviews/${rev.id}`);
                              loadAll();
                            } catch (e) {
                              alert(e?.response?.data?.detail || "Suppression impossible.");
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ------------------------------------------------------------ B. COMPORTEMENT */}
          {activeTab === "behavior" && behaviorData && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Période analysée : {behaviorData.period_days} jours • {behaviorData.events_total} évènements journalisés</p>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5">
                  <option value={7}>7 jours</option>
                  <option value={30}>30 jours</option>
                  <option value={90}>90 jours</option>
                  <option value={365}>1 an</option>
                </select>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Panier moyen" value={`${behaviorData.average_order_value.toFixed(0)} DT`} hint="Commandes non annulées" tone="text-brand-700" />
                <Kpi label="Vue → panier" value={`${behaviorData.conversion.view_to_cart}%`} hint="Visiteurs ayant ajouté au panier" tone="text-indigo-600" />
                <Kpi label="Panier → achat" value={`${behaviorData.conversion.cart_to_purchase}%`} hint="Visiteurs ayant finalisé" tone="text-emerald-600" />
                <Kpi label="Conversion globale" value={`${behaviorData.conversion.global}%`} hint="Vue → achat" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card title="Entonnoir de conversion" subtitle="Visiteurs uniques (connectés ou sessions anonymes)">
                  <FunnelBars steps={behaviorData.funnel} />
                </Card>
                <Card title="Activité quotidienne" subtitle="14 derniers jours" className="lg:col-span-2">
                  <SimpleLineChart data={behaviorData.timeline} xKey="date" lines={[{ key: "views", label: "Vues" }, { key: "cart", label: "Paniers" }, { key: "purchases", label: "Achats" }, { key: "searches", label: "Recherches" }, { key: "chats", label: "Chat" }]} height={230} />
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Segmentation RFM des clients" subtitle="Récence, Fréquence, Montant → segments marketing actionnables">
                  {behaviorData.rfm.segments.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">Pas assez de commandes.</p>
                  ) : (
                    <>
                      <DonutChart data={behaviorData.rfm.segments.map((s) => ({ name: s.name, value: s.count }))} height={180} />
                      <div className="mt-4 space-y-2">
                        {behaviorData.rfm.segments.map((s, i) => (
                          <div key={s.name} className="text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                            <div className="flex items-center justify-between">
                              <span className="font-bold" style={{ color: PALETTE[i % PALETTE.length] }}>{s.name} · {s.count} client(s)</span>
                              <span className="text-slate-500">≈ {s.avg_monetary} DT • {s.avg_frequency} cmd</span>
                            </div>
                            <p className="text-slate-500 mt-0.5">{s.description}</p>
                          </div>
                        ))}
                        <p className="text-[11px] text-slate-400">+ {behaviorData.rfm.prospects} prospect(s) inscrits sans achat.</p>
                      </div>
                    </>
                  )}
                </Card>
                <div className="space-y-6">
                  <Card title="Produits les plus consultés" subtitle="Vues → ajouts panier → achats (taux de conversion produit)">
                    <div className="space-y-2">
                      {behaviorData.most_viewed.map((m) => (
                        <div key={m.product_id} className="flex items-center gap-3 text-xs">
                          {m.image_url && <img src={m.image_url} alt="" className="w-8 h-8 rounded-lg object-cover" />}
                          <span className="flex-1 font-semibold text-slate-700 truncate">{m.name}</span>
                          <span className="text-slate-500">{m.views} 👁️ • {m.cart_adds} 🛒 • {m.purchases} ✅</span>
                          <span className={`font-bold w-12 text-right ${m.conversion >= 20 ? "text-emerald-600" : m.conversion > 0 ? "text-amber-600" : "text-rose-600"}`}>{m.conversion}%</span>
                        </div>
                      ))}
                      {behaviorData.most_viewed.length === 0 && <p className="text-xs text-slate-400">Aucune vue enregistrée.</p>}
                    </div>
                    {behaviorData.viewed_not_bought.length > 0 && (
                      <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                        💡 Très consultés mais jamais achetés : {behaviorData.viewed_not_bought.map((m) => m.name).join(", ")} — vérifier prix / fiche produit.
                      </p>
                    )}
                  </Card>
                  <Card title="Recherches des clients" subtitle="Requêtes fréquentes et requêtes sans résultat (lacunes du catalogue)">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="font-bold text-slate-500 uppercase text-[10px] mb-1">Top recherches</p>
                        {behaviorData.top_searches.map((s) => (
                          <div key={s.query} className="flex justify-between py-1 border-b border-slate-100"><span className="truncate">« {s.query} »</span><span className="font-semibold">{s.count}</span></div>
                        ))}
                      </div>
                      <div>
                        <p className="font-bold text-rose-500 uppercase text-[10px] mb-1">Sans résultat</p>
                        {behaviorData.zero_result_searches.length === 0 && <p className="text-slate-400">Aucune.</p>}
                        {behaviorData.zero_result_searches.map((s) => (
                          <div key={s.query} className="flex justify-between py-1 border-b border-slate-100 text-rose-700"><span className="truncate">« {s.query} »</span><span className="font-semibold">{s.count}</span></div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card title="Produits les plus achetés" subtitle="Unités vendues et CA généré">
                  <div className="space-y-2">
                    {behaviorData.top_sold_products.map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded-xl hover:bg-slate-50">
                        <span className="flex items-center gap-2"><span className="font-bold text-slate-400 w-4">#{idx + 1}</span><span className="font-semibold text-ink">{p.name}</span></span>
                        <span className="text-slate-500">{p.units_sold} u • <span className="font-bold text-brand-700">{p.revenue.toFixed(0)} DT</span></span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Performance des catégories" subtitle="Unités vendues par catégorie">
                  <SimpleBarChart data={behaviorData.category_performance} xKey="name" bars={[{ key: "units", label: "Unités" }]} height={200} />
                </Card>
                <Card title="Assistant conversationnel" subtitle={`${behaviorData.chat_sessions} session(s) de chat • sujets récurrents`}>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {behaviorData.top_chatbot_inquiries.map((q) => <span key={q.query} className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">💬 {q.query} ({q.count})</span>)}
                    {behaviorData.top_chatbot_inquiries.length === 0 && <p className="text-xs text-slate-400">Aucune conversation.</p>}
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Paniers en attente</p>
                  {behaviorData.cart_intentions.map((c) => <div key={c.name} className="flex justify-between text-xs py-1 border-b border-slate-100"><span>{c.name}</span><span className="font-bold text-indigo-700">{c.count}</span></div>)}
                </Card>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ C. RECOMMANDATIONS */}
          {activeTab === "recommendations" && recomData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Couverture contenu" value={`${recomData.catalog_coverage}%`} hint="Produits avec un similaire (TF-IDF > 0.15)" tone="text-brand-700" />
                <Kpi label="Matrice implicite" value={`${recomData.matrix.users}×${recomData.matrix.products}`} hint={`${recomData.matrix.interactions} interactions • densité ${recomData.matrix.density}%`} />
                <Kpi label="Catalogue indexé" value={recomData.total_catalog_items} hint="Articles vectorisés" />
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Pondération hybride</span>
                  <div className="mt-2 space-y-1">
                    {Object.entries(recomData.weights || {}).map(([k, v], i) => (
                      <div key={k} className="flex items-center gap-2 text-[11px]">
                        <span className="w-20 text-slate-500">{{ cf: "Collaboratif", content: "Contenu", affinity: "Affinité", popularity: "Popularité", promo: "Promotion" }[k] || k}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full" style={{ width: `${v * 100}%`, background: PALETTE[i] }} /></div>
                        <span className="font-bold w-8 text-right">{Math.round(v * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <Card title="Architecture du moteur" subtitle="Comment sont produites les recommandations « Pour vous », « Similaires » et « Souvent achetés ensemble »">
                <div className="grid md:grid-cols-4 gap-3 text-xs">
                  {[
                    ["1. Contenu", "Vectorisation TF-IDF (nom + description + catégorie, stemming FR, bigrammes) puis similarité cosinus."],
                    ["2. Collaboratif", "Matrice implicite clients × produits (vue = 1, favori = 2, panier = 3, achat = 5, avis ±2) → similarité item-item avec rétrécissement."],
                    ["3. Contexte", "Affinité de catégorie du client, popularité (ventes), promotions actives, exclusion des produits déjà achetés / en rupture."],
                    ["4. Explication", "Chaque recommandation expose la composante dominante : « Parce que vous avez acheté… », « Les clients ayant aimé… »."],
                  ].map(([t, d]) => (
                    <div key={t} className="p-3 rounded-xl bg-slate-50 border border-slate-200/70"><p className="font-bold text-ink mb-1">{t}</p><p className="text-slate-500">{d}</p></div>
                  ))}
                </div>
              </Card>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card title="Co-achats (règles d'association)" subtitle="Paires commandées ensemble">
                  {recomData.frequent_pairs.length ? recomData.frequent_pairs.map((pair, i) => (
                    <div key={i} className="p-2.5 mb-2 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between text-xs">
                      <span><span className="font-semibold">{pair.product_a}</span> <span className="text-slate-400">+</span> <span className="font-semibold">{pair.product_b}</span></span>
                      <span className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 font-bold shrink-0">{pair.co_orders}×</span>
                    </div>
                  )) : <p className="text-xs text-slate-400 py-4 text-center">En attente de commandes multi-articles.</p>}
                </Card>
                <Card title="Similarité de contenu" subtitle="Voisins les plus proches (TF-IDF)">
                  {recomData.similarity_matrix_samples.map((it, i) => (
                    <div key={i} className="p-2.5 mb-2 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between text-xs">
                      <span className="truncate mr-2">{it.product} <span className="text-slate-400">➔</span> <span className="font-semibold text-brand-700">{it.recommended}</span></span>
                      <span className="font-bold text-emerald-600 shrink-0">{it.score}%</span>
                    </div>
                  ))}
                </Card>
                <Card title="Similarité collaborative" subtitle="Produits co-appréciés par les mêmes clients">
                  {recomData.cf_pairs.length ? recomData.cf_pairs.map((it, i) => (
                    <div key={i} className="p-2.5 mb-2 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between text-xs">
                      <span className="truncate mr-2">{it.product_a} <span className="text-slate-400">↔</span> <span className="font-semibold text-indigo-700">{it.product_b}</span></span>
                      <span className="font-bold text-indigo-600 shrink-0">{it.score}%</span>
                    </div>
                  )) : <p className="text-xs text-slate-400 py-4 text-center">Pas encore assez d'interactions.</p>}
                </Card>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ D. PRÉDICTIONS */}
          {activeTab === "predictions" && predData && modelInfo && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card
                  title="Modèle de prédiction d'intérêt"
                  subtitle="Probabilité qu'un client achète un produit qu'il n'a pas encore acheté"
                  className="lg:col-span-2"
                  action={<button onClick={retrain} disabled={retraining} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{retraining ? "Entraînement…" : "↻ Ré-entraîner"}</button>}
                >
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-slate-500">Algorithme</span><span className="font-bold text-ink text-right">{modelInfo.model_type}</span></div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-slate-500">Mode</span><span className={`font-bold ${modelInfo.mode === "ml" ? "text-emerald-600" : "text-amber-600"}`}>{modelInfo.mode === "ml" ? "Supervisé (entraîné)" : "Heuristique (données insuffisantes)"}</span></div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-slate-500">Exemples d'entraînement</span><span className="font-bold">{modelInfo.n_samples} paires ({modelInfo.n_positives} achats)</span></div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-slate-500">Instants de prédiction</span><span className="font-bold">{modelInfo.n_orders} commandes • {modelInfo.n_users} clients</span></div>
                      {modelInfo.metrics.roc_auc != null && (
                        <>
                          <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-slate-500">AUC ROC (CV {modelInfo.metrics.cv_folds} plis)</span><span className="font-bold text-indigo-700">{modelInfo.metrics.roc_auc} ± {modelInfo.metrics.roc_auc_std}</span></div>
                          <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-slate-500">Balanced accuracy</span><span className="font-bold">{modelInfo.metrics.balanced_accuracy}</span></div>
                          <div className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-slate-500">Average precision</span><span className="font-bold">{modelInfo.metrics.average_precision}</span></div>
                        </>
                      )}
                      {modelInfo.metrics.note && <p className="text-amber-700 bg-amber-50 rounded-lg p-2">{modelInfo.metrics.note}</p>}
                      <p className="text-[11px] text-slate-400 pt-1">{modelInfo.method}</p>
                      <p className="text-[11px] text-slate-400">Entraîné le {modelInfo.trained_at ? new Date(modelInfo.trained_at).toLocaleString("fr-FR") : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Importance des variables</p>
                      <SimpleBarChart data={modelInfo.feature_importances.map((f) => ({ name: f.label, importance: Math.round(f.importance * 1000) / 10 }))} xKey="name" bars={[{ key: "importance", label: "Importance (%)", color: "#6366f1" }]} height={230} />
                    </div>
                  </div>
                </Card>
                <Card title="Insights actionnables" subtitle="Générés à partir des données réelles">
                  <div className="space-y-3">
                    {predData.actionable_insights.map((insight, idx) => (
                      <div key={idx} className={`p-3 rounded-xl border text-xs ${insight.type === "warning" ? "bg-rose-50/70 border-rose-200 text-rose-900" : insight.type === "opportunity" ? "bg-amber-50/70 border-amber-200 text-amber-900" : "bg-blue-50/70 border-blue-200 text-blue-900"}`}>
                        <span className="font-bold uppercase tracking-wider block mb-1 text-[10px]">{insight.title}</span>
                        <p className="leading-relaxed opacity-90">{insight.description}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card title="Next best offer par client" subtitle="Top 3 des produits susceptibles d'intéresser chaque client actif (avec explications) — base pour des campagnes ciblées">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400">
                      <tr><th className="py-2 px-3">Client</th><th className="py-2 px-3">Produits prédits</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview.map((c) => (
                        <tr key={c.user_id} className="hover:bg-slate-50/60 align-top">
                          <td className="py-3 px-3 whitespace-nowrap"><p className="font-semibold text-ink">{c.full_name}</p><p className="text-slate-400">{c.email}</p></td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-2">
                              {c.predictions.map((p) => (
                                <div key={p.product_id} className="flex items-center gap-2 bg-slate-50 border border-slate-200/70 rounded-xl p-2 min-w-[220px] max-w-[280px]" title={p.reasons.join(" • ")}>
                                  {p.image_url && <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover" />}
                                  <div className="min-w-0">
                                    <p className="font-semibold text-ink truncate">{p.name}</p>
                                    <p className="text-[11px]"><span className="font-bold text-indigo-700">{Math.round(p.probability * 100)}%</span> <span className="text-slate-400">— {p.reasons[0]}</span></p>
                                  </div>
                                </div>
                              ))}
                              {c.predictions.length === 0 && <span className="text-slate-400">—</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="Prévision de rupture de stock" subtitle={`Vélocité des ventes sur ${predData.days_history_analyzed} jours → jours de stock restants et quantité de réassort suggérée (30 j)`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400">
                      <tr><th className="py-2.5 px-3">Produit</th><th className="py-2.5 px-3">Stock</th><th className="py-2.5 px-3">Vendus</th><th className="py-2.5 px-3">Vélocité</th><th className="py-2.5 px-3">Jours restants</th><th className="py-2.5 px-3">Réassort</th><th className="py-2.5 px-3 text-right">Diagnostic</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {predData.stock_forecasts.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
                          <td className="py-2.5 px-3 font-bold">{item.stock}</td>
                          <td className="py-2.5 px-3 text-slate-500">{item.sold}</td>
                          <td className="py-2.5 px-3 text-slate-500">{item.daily_velocity} u/j</td>
                          <td className="py-2.5 px-3">{item.days_left !== null ? <span className={item.days_left <= 7 ? "font-bold text-rose-600" : item.days_left <= 21 ? "font-bold text-amber-600" : "text-slate-600"}>~{item.days_left} j</span> : <span className="text-slate-400 italic">pas de vente</span>}</td>
                          <td className="py-2.5 px-3">{item.suggested_restock > 0 ? <span className="font-semibold text-indigo-700">+{item.suggested_restock}</span> : "—"}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${item.status === "Rupture imminente" ? "bg-rose-50 text-rose-700 border-rose-200" : item.status === "À surveiller" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>{item.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
