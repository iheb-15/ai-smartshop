import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("all");

  const fetchStats = async (p = period) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/dashboard/stats", { params: { period: p } });
      setStats(res.data);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les statistiques du tableau de bord.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const downloadCSV = (url, filename) => {
    const token = localStorage.getItem("token");
    fetch(`${api.defaults.baseURL}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
      });
  };

  const getStatusBadge = (status) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "DELIVERED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "SHIPPED":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "PROCESSING":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "CONFIRMED":
      case "PAID":
        return "bg-cyan-50 text-cyan-700 border-cyan-200";
      case "PENDING":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "CANCELLED":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-slate-200/60 rounded-2xl w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-200/60 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 bg-slate-200/60 rounded-2xl" />
          <div className="h-80 bg-slate-200/60 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-white border border-rose-100 rounded-2xl text-rose-600">
        <p className="font-semibold mb-3">{error}</p>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const timeline = stats?.sales_timeline || [];
  const maxRevenue = Math.max(...timeline.map((t) => t.revenue), 10);

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-brand-700 via-brand-600 to-emerald-700 rounded-3xl p-6 sm:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-xs font-semibold uppercase tracking-wider mb-2">
            <span>✨</span> Espace Direction
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Bonjour, {user?.full_name || "Administrateur"} 👋
          </h1>
          <p className="text-white/80 text-sm mt-1 max-w-xl">
            Voici un aperçu en temps réel de l'activité, des commandes, des stocks et des performances de votre boutique.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-semibold focus:outline-none [&>option]:text-slate-800"
          >
            <option value="all">Toutes périodes</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">7 derniers jours</option>
            <option value="month">30 derniers jours</option>
            <option value="year">12 derniers mois</option>
          </select>
          <button
            onClick={() => downloadCSV("/dashboard/export/orders.csv", "commandes.csv")}
            className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-semibold text-sm hover:bg-white/20 transition"
          >
            ⬇ Commandes CSV
          </button>
          <button
            onClick={() => downloadCSV("/dashboard/export/products.csv", "produits.csv")}
            className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-semibold text-sm hover:bg-white/20 transition"
          >
            ⬇ Produits CSV
          </button>
          <Link
            to="/admin/products"
            className="px-4 py-2.5 rounded-xl bg-white text-brand-700 font-semibold text-sm hover:bg-brand-50 shadow-xs transition"
          >
            + Nouveau produit
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {/* Revenue */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chiffre d'affaires</p>
            <p className="font-display text-2xl sm:text-3xl text-ink font-bold mt-1">
              {(stats?.total_revenue || 0).toFixed(2)} <span className="text-sm font-sans text-brand-600 font-semibold">DT</span>
            </p>
            {stats?.revenue_trend_pct != null ? (
              <p className={`text-xs font-medium mt-1 ${stats.revenue_trend_pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {stats.revenue_trend_pct >= 0 ? "▲" : "▼"} {Math.abs(stats.revenue_trend_pct)}% vs période précédente
              </p>
            ) : (
              <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
                <span>●</span> Total cumulé encaissé
              </p>
            )}
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
            💰
          </div>
        </div>

        {/* Avg basket */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Panier moyen</p>
            <p className="font-display text-2xl sm:text-3xl text-ink font-bold mt-1">
              {(stats?.avg_basket || 0).toFixed(2)} <span className="text-sm font-sans text-brand-600 font-semibold">DT</span>
            </p>
            <p className="text-xs text-slate-400 font-medium mt-1">Par commande non annulée</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center text-xl">
            🧺
          </div>
        </div>

        {/* Orders */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Commandes totales</p>
            <p className="font-display text-2xl sm:text-3xl text-ink font-bold mt-1">
              {stats?.total_orders || 0}
            </p>
            <p className="text-xs text-brand-600 font-medium mt-1">
              Toutes périodes confondues
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center text-xl">
            🛍️
          </div>
        </div>

        {/* Users */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Clients enregistrés</p>
            <p className="font-display text-2xl sm:text-3xl text-ink font-bold mt-1">
              {stats?.total_users || 0}
            </p>
            <p className="text-xs text-blue-600 font-medium mt-1">
              Base utilisateurs active
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
            👥
          </div>
        </div>

        {/* Products */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Catalogue Produits</p>
            <p className="font-display text-2xl sm:text-3xl text-ink font-bold mt-1">
              {stats?.total_products || 0}
            </p>
            <p className="text-xs text-amber-600 font-medium mt-1">
              {stats?.out_of_stock?.length || 0} en rupture
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl">
            📦
          </div>
        </div>
      </div>

      {/* Charts & Status Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Timeline Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Évolution des ventes</h2>
              <p className="text-xs text-slate-400">
                Calendrier réel —{" "}
                {timeline.length > 0
                  ? `du ${timeline[0].full_date?.split("-").reverse().join("/")} au ${timeline[timeline.length - 1].full_date?.split("-").reverse().join("/")} (aujourd'hui ${stats?.server_today?.split("-").reverse().join("/") || ""})`
                  : "Activité récente des commandes et chiffre d'affaires"}
              </p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
              {timeline.length > 0 ? `${timeline.length} jours calendaires` : "Aucune donnée"}
            </span>
          </div>

          {timeline.length > 0 ? (
            <div className="w-full pt-4">
              <div className="h-44 w-full flex items-stretch justify-between gap-2 border-b border-slate-100 pb-2">
                {timeline.map((item, idx) => {
                  const heightPercent = item.revenue > 0 ? Math.max(8, Math.round((item.revenue / maxRevenue) * 100)) : 0;
                  const isToday = item.full_date === stats?.server_today;
                  return (
                    <div key={item.full_date || idx} className="flex-1 h-full flex flex-col items-center justify-end group relative min-w-0">
                      {/* Tooltip */}
                      <div className="absolute -top-12 bg-ink text-white text-[11px] py-1 px-2 rounded shadow-md opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
                        {item.full_date?.split("-").reverse().join("/")} : {item.revenue.toFixed(2)} DT ({item.orders} cmd)
                      </div>
                      {/* Bar */}
                      {item.revenue > 0 ? (
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full max-w-[36px] min-h-[8px] rounded-t-lg transition ${
                            isToday
                              ? "bg-gradient-to-t from-emerald-600 to-emerald-400 ring-2 ring-emerald-300"
                              : "bg-gradient-to-t from-brand-600 to-brand-400 group-hover:from-brand-500 group-hover:to-emerald-400"
                          }`}
                        />
                      ) : (
                        <div className="w-full max-w-[36px] flex flex-col items-center justify-end" style={{ height: "8%" }}>
                          <div className={`w-full h-[3px] rounded-full ${isToday ? "bg-emerald-300" : "bg-slate-200"}`} />
                        </div>
                      )}
                      <span className={`text-[10px] mt-2 truncate max-w-full font-semibold ${isToday ? "text-emerald-600" : "text-slate-400"}`}>
                        {item.date}{isToday ? " •" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Jours sans vente affichés à 0 (—) — barre verte = aujourd'hui. Survolez une barre pour la date complète + CA.
              </p>
            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-sm">
              <span className="text-2xl mb-1">📈</span>
              <span>Pas encore d'historique de ventes suffisant pour générer le graphique.</span>
            </div>
          )}
        </div>

        {/* Orders by Status */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-ink">Statuts commandes</h2>
              <Link to="/admin/orders" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Tout voir →
              </Link>
            </div>
            <p className="text-xs text-slate-400 mb-5">Répartition actuelle du cycle de traitement</p>

            <div className="space-y-3">
              {(stats?.orders_by_status || []).length > 0 ? (
                stats.orders_by_status.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(item.status)}`}>
                      {item.status}
                    </span>
                    <span className="font-semibold text-ink">{item.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">Aucune commande enregistrée.</p>
              )}
            </div>
          </div>

          {/* Customer Reviews AI Sentiment mini-widget */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avis clients (IA)</span>
              <Link to="/admin/ai" className="text-xs text-brand-600 hover:underline">Détails</Link>
            </div>
            <div className="flex gap-2">
              {(stats?.sentiment || []).map((s, i) => (
                <span
                  key={i}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium flex-1 text-center ${
                    s.label === "positive"
                      ? "bg-emerald-50 text-emerald-700"
                      : s.label === "negative"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {s.label} : {s.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stock Alerts & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Produits les plus vendus</h2>
              <p className="text-xs text-slate-400">Top 5 par volume d'unités commandées</p>
            </div>
            <span className="text-xs font-semibold text-brand-600">Performance</span>
          </div>

          {(stats?.top_products || []).length > 0 ? (
            <div className="space-y-3.5">
              {stats.top_products.map((product, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-xs font-bold text-slate-400">#{idx + 1}</span>
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xs">📦</div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{product.name}</p>
                      <p className="text-xs text-slate-400">{product.price.toFixed(2)} DT</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold whitespace-nowrap">
                    {product.quantity} vendus
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              Aucune vente n'a encore été enregistrée.
            </div>
          )}
        </div>

        {/* Stock Alerts (Out of Stock & Low Stock) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Alertes Stock</h2>
              <p className="text-xs text-slate-400">Surveillance des ruptures et stocks critiques</p>
            </div>
            <Link to="/admin/products" className="text-xs font-semibold text-brand-600 hover:underline">
              Gérer stocks →
            </Link>
          </div>

          <div className="space-y-4">
            {/* Out of stock */}
            {(stats?.out_of_stock || []).length > 0 && (
              <div>
                <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Ruptures de stock ({stats.out_of_stock.length})
                </p>
                <div className="space-y-2">
                  {stats.out_of_stock.map((p, i) => (
                    <div key={i} className="flex items-center justify-between bg-rose-50/50 border border-rose-100 rounded-xl px-3 py-2 text-xs">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="font-bold text-rose-600">0 unité</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Low stock */}
            {(stats?.low_stock || []).length > 0 ? (
              <div>
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Stock faible (≤ 5 unités)
                </p>
                <div className="space-y-2">
                  {stats.low_stock.map((p, i) => (
                    <div key={i} className="flex items-center justify-between bg-amber-50/50 border border-amber-100 rounded-xl px-3 py-2 text-xs">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="font-bold text-amber-700">{p.stock} restants</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              stats?.out_of_stock?.length === 0 && (
                <div className="py-8 text-center text-xs text-emerald-600 flex flex-col items-center gap-1">
                  <span className="text-2xl">✅</span>
                  <span className="font-semibold">Tous les niveaux de stock sont optimaux.</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Commandes récentes</h2>
            <p className="text-xs text-slate-400">Derniers achats passés sur la plateforme</p>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
          >
            Toutes les commandes →
          </Link>
        </div>

        {(stats?.recent_orders || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="pb-3 font-semibold">N° Commande</th>
                  <th className="pb-3 font-semibold">Client</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Articles</th>
                  <th className="pb-3 font-semibold">Total</th>
                  <th className="pb-3 font-semibold text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.recent_orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 font-bold text-brand-700">#{order.id}</td>
                    <td className="py-3.5">
                      <p className="font-semibold text-ink text-xs">{order.customer_name}</p>
                      <p className="text-[11px] text-slate-400">{order.customer_email}</p>
                    </td>
                    <td className="py-3.5 text-xs text-slate-500">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      }) : "N/A"}
                    </td>
                    <td className="py-3.5 text-xs text-slate-600 font-medium">
                      {order.items_count} article(s)
                    </td>
                    <td className="py-3.5 font-bold text-ink text-sm">
                      {order.total.toFixed(2)} DT
                    </td>
                    <td className="py-3.5 text-right">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            Aucune commande enregistrée pour le moment.
          </div>
        )}
      </div>

      {/* Top customers */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Meilleurs clients</h2>
            <p className="text-xs text-slate-400">Classés par montant total dépensé (hors annulées)</p>
          </div>
          <Link to="/admin/users" className="text-xs font-semibold text-brand-600 hover:underline">
            Tous les clients →
          </Link>
        </div>
        {(stats?.top_customers || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="pb-3 font-semibold">Client</th>
                  <th className="pb-3 font-semibold">Commandes</th>
                  <th className="pb-3 font-semibold text-right">Total dépensé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.top_customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3">
                      <p className="font-semibold text-ink text-xs">{c.full_name}</p>
                      <p className="text-[11px] text-slate-400">{c.email}</p>
                    </td>
                    <td className="py-3 text-xs text-slate-600 font-medium">{c.orders}</td>
                    <td className="py-3 text-right font-bold text-ink text-sm">{c.spent.toFixed(2)} DT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">Aucun client avec commandes.</div>
        )}
      </div>
    </div>
  );
}
