import { useEffect, useState } from "react";
import api from "../../api/client";

const EVENT_LABEL = { view: "👁️ Vue", search: "🔎 Recherche", add_to_cart: "🛒 Ajout panier", remove_from_cart: "↩ Retrait panier", wishlist_add: "♥ Favori", wishlist_remove: "♡ Favori retiré", purchase: "✅ Achat", review: "★ Avis", chat: "💬 Chat" };
const PAY_LABEL = { PAID: "payée", UNPAID: "impayée", REFUNDED: "remboursée", FAILED: "échec" };

export default function AdminUserDetail({ userId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [activity, setActivity] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [tab, setTab] = useState("orders");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError("");
    Promise.all([
      api.get(`/auth/users/${userId}`),
      api.get(`/ai-admin/customers/${userId}/activity`, { params: { limit: 25 } }).catch(() => ({ data: null })),
      api.get(`/ai-admin/predictions/customer/${userId}`, { params: { top_k: 5 } }).catch(() => ({ data: { predictions: [] } })),
    ])
      .then(([d, a, p]) => {
        setDetail(d.data);
        setActivity(a.data);
        setPredictions(p.data.predictions || []);
      })
      .catch((err) => setError(err?.response?.data?.detail || "Fiche client introuvable."))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-bold text-ink">Fiche client 360°</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 transition">✕</button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 animate-pulse">Chargement de la fiche...</p>
        ) : error ? (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-4">{error}</p>
        ) : detail ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xl">{detail.full_name?.charAt(0) || "C"}</div>
              <div className="min-w-0">
                <p className="font-bold text-ink">{detail.full_name}</p>
                <p className="text-xs text-slate-400">{detail.email}</p>
                <p className="text-xs mt-1">
                  <span className={`px-2 py-0.5 rounded-full font-semibold border ${detail.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>{detail.is_active ? "Actif" : "Désactivé"}</span>{" "}
                  <span className="text-slate-400">{detail.is_admin ? "• Admin" : "• Client"}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                [detail.orders_count || 0, "Commandes"],
                [`${(detail.total_spent || 0).toFixed(0)} DT`, "Dépensé"],
                [detail.reviews_count || 0, "Avis"],
                [activity?.wishlist_count || 0, "Favoris"],
              ].map(([v, l]) => (
                <div key={l} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                  <p className="font-display text-base font-bold text-ink">{v}</p>
                  <p className="text-[10px] text-slate-400">{l}</p>
                </div>
              ))}
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p>Inscrit le : {detail.created_at ? new Date(detail.created_at).toLocaleDateString("fr-FR") : "—"} • Dernière commande : {detail.last_order_at ? new Date(detail.last_order_at).toLocaleDateString("fr-FR") : "Aucune"}</p>
              {(detail.phone || detail.city) && <p>📍 {detail.phone} {detail.address ? `• ${detail.address},` : ""} {detail.postal_code} {detail.city}</p>}
              {activity?.favorite_categories?.length > 0 && (
                <p className="flex flex-wrap items-center gap-1">
                  Catégories favorites :
                  {activity.favorite_categories.map((c) => (
                    <span key={c.name} className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-semibold">{c.name} {c.share}%</span>
                  ))}
                </p>
              )}
            </div>

            {predictions.length > 0 && (
              <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-4">
                <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2">🔮 Produits susceptibles de l'intéresser</p>
                <div className="space-y-2">
                  {predictions.map((p) => (
                    <div key={p.product_id} className="flex items-center gap-3 bg-white rounded-xl border border-indigo-100 p-2">
                      {p.image_url && <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{p.reasons.join(" • ")}</p>
                      </div>
                      <span className="text-sm font-bold text-indigo-700">{Math.round(p.probability * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex gap-2 mb-3">
                {[["orders", `Commandes (${(detail.orders || []).length})`], ["activity", `Activité (${activity?.events?.length || 0})`]].map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${tab === id ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                ))}
              </div>
              {tab === "orders" &&
                ((detail.orders || []).length === 0 ? (
                  <p className="text-xs text-slate-400">Aucune commande.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.orders.map((o) => (
                      <div key={o.id} className="border border-slate-200 rounded-xl p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-brand-700">#{o.id} <span className="font-normal text-slate-400">{o.created_at ? new Date(o.created_at).toLocaleDateString("fr-FR") : ""}</span></p>
                            <p className="text-slate-500">{(o.items || []).map((i) => `${i.product_name || "Produit"} ×${i.quantity}`).join(", ")}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-ink">{(o.total || 0).toFixed(2)} DT</p>
                            <p className="text-[11px] text-slate-500">{(o.status || "").toUpperCase()} • {PAY_LABEL[o.payment_status] || ""}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              {tab === "activity" &&
                (!activity || activity.events.length === 0 ? (
                  <p className="text-xs text-slate-400">Aucun évènement enregistré.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {Object.entries(activity.counts).map(([k, v]) => (
                        <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{EVENT_LABEL[k] || k} : {v}</span>
                      ))}
                    </div>
                    <ol className="relative border-l border-slate-200 ml-2 space-y-3">
                      {activity.events.map((e) => (
                        <li key={e.id} className="ml-4 text-xs">
                          <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-brand-200 border-2 border-white" />
                          <p className="font-semibold text-slate-700">
                            {EVENT_LABEL[e.event_type] || e.event_type} {e.product_name ? <span className="text-ink">{e.product_name}</span> : e.query ? <span className="italic text-ink">« {e.query} »</span> : null}
                            {e.value != null && e.event_type !== "search" ? <span className="text-slate-400"> ×{e.value}</span> : null}
                          </p>
                          <p className="text-[11px] text-slate-400">{e.created_at ? new Date(e.created_at).toLocaleString("fr-FR") : ""}</p>
                        </li>
                      ))}
                    </ol>
                  </>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
