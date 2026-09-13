import { useEffect, useState } from "react";
import api from "../../api/client";

export default function AdminUserDetail({ userId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError("");
    api
      .get(`/auth/users/${userId}`)
      .then((res) => setDetail(res.data))
      .catch((err) => {
        console.error(err);
        setError(err?.response?.data?.detail || "Fiche client introuvable.");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-bold text-ink">Fiche client</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 animate-pulse">Chargement de la fiche...</p>
        ) : error ? (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-4">{error}</p>
        ) : detail ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xl">
                {detail.full_name?.charAt(0) || "C"}
              </div>
              <div>
                <p className="font-bold text-ink">{detail.full_name}</p>
                <p className="text-xs text-slate-400">{detail.email}</p>
                <p className="text-xs mt-1">
                  <span className={`px-2 py-0.5 rounded-full font-semibold border ${detail.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                    {detail.is_active ? "Actif" : "Désactivé"}
                  </span>{" "}
                  <span className="text-slate-400">{detail.is_admin ? "• Admin" : "• Client"}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <p className="font-display text-lg font-bold text-ink">{detail.orders_count || 0}</p>
                <p className="text-[11px] text-slate-400">Commandes</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <p className="font-display text-lg font-bold text-ink">{(detail.total_spent || 0).toFixed(0)} DT</p>
                <p className="text-[11px] text-slate-400">Dépensé</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <p className="font-display text-lg font-bold text-ink">{detail.reviews_count || 0}</p>
                <p className="text-[11px] text-slate-400">Avis</p>
              </div>
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p>Inscrit le : {detail.created_at ? new Date(detail.created_at).toLocaleDateString("fr-FR") : "—"}</p>
              <p>Dernière commande : {detail.last_order_at ? new Date(detail.last_order_at).toLocaleDateString("fr-FR") : "Aucune"}</p>
            </div>

            <div>
              <h3 className="font-bold text-sm text-ink mb-3">Dernières commandes (20 max)</h3>
              {(detail.orders || []).length === 0 ? (
                <p className="text-xs text-slate-400">Aucune commande.</p>
              ) : (
                <div className="space-y-2">
                  {detail.orders.map((o) => (
                    <div key={o.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-brand-700">#{o.id}</p>
                        <p className="text-slate-400">
                          {o.created_at ? new Date(o.created_at).toLocaleDateString("fr-FR") : ""} • {(o.items || []).reduce((s, i) => s + (i.quantity || 0), 0)} article(s)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-ink">{(o.total || 0).toFixed(2)} DT</p>
                        <p className="text-[11px] text-slate-500">{(o.status || "").toUpperCase()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
