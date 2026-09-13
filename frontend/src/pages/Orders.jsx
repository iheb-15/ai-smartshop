import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .get("/orders/")
      .then((res) => setOrders(res.data || []))
      .catch((err) => {
        console.error(err);
        setError(err?.response?.data?.detail || "Impossible de charger vos commandes.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const cancelOrder = async (id) => {
    if (!window.confirm("Annuler cette commande ? Le stock sera restauré.")) return;
    setCancelling(id);
    try {
      await api.post(`/orders/${id}/cancel`);
      await load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Annulation impossible.");
    } finally {
      setCancelling(null);
    }
  };

  if (loading) {
    return <p className="text-center py-20 text-ink/40">Chargement de vos commandes…</p>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10 text-center">
        <p className="text-rose-600 font-semibold mb-4">{error}</p>
        <Link to="/shop" className="text-brand-600 font-semibold underline">
          Retour à la boutique
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-10">
      <h1 className="font-display text-3xl text-ink mb-8">Mes commandes</h1>
      {orders.length === 0 && <p className="text-ink/50">Aucune commande pour le moment.</p>}
      <div className="space-y-4">
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} expanded={expanded} setExpanded={setExpanded} cancelling={cancelling} onCancel={cancelOrder} />
        ))}
      </div>
    </div>
  );
}

function OrderCard({ order: o, expanded, setExpanded, cancelling, onCancel }) {
  const items = o.items || [];
  const units = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const isOpen = expanded === o.id;
  const canCancel = ["PENDING", "CONFIRMED"].includes((o.status || "").toUpperCase());
  return (
    <div className="bg-white border border-brand-100 rounded-2xl p-5">
      <div className="flex justify-between items-center mb-3">
        <span className="font-semibold">Commande #{o.id}</span>
        <span className="text-xs px-3 py-1 rounded-full bg-brand-50 text-brand-700 font-medium">
          {o.status}
        </span>
      </div>
      <p className="text-sm text-ink/50 mb-2">
        {o.created_at ? new Date(o.created_at).toLocaleString("fr-FR") : ""}
      </p>
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-3 overflow-x-auto">
          {items.slice(0, 4).map((it, idx) => (
            <OrderThumb key={idx} item={it} />
          ))}
          {items.length > 4 && (
            <span className="text-xs text-brand-600 font-semibold">+{items.length - 4}</span>
          )}
        </div>
      )}
      <p className="text-sm text-ink/70">{items.length} référence(s) • {units} unité(s)</p>
      <p className="font-display text-lg text-brand-700 mt-2">{(o.total || 0).toFixed(2)} DT</p>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={() => setExpanded(isOpen ? null : o.id)}
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          {isOpen ? "Masquer le détail ▲" : "Voir le détail ▼"}
        </button>
        {canCancel && (
          <button
            onClick={() => onCancel(o.id)}
            disabled={cancelling === o.id}
            className="text-sm font-semibold text-rose-600 hover:underline disabled:opacity-50"
          >
            {cancelling === o.id ? "Annulation…" : "Annuler la commande"}
          </button>
        )}
        <button
          onClick={() => window.print()}
          className="text-sm font-semibold text-ink/50 hover:text-ink underline"
        >
          🖨 Facture
        </button>
      </div>
      {isOpen && <OrderDetail order={o} />}
    </div>
  );
}

function OrderThumb({ item: it }) {
  const img = it.product_image || it.product?.image_url || "";
  const name = it.product_name || it.product?.name || `Produit #${it.product_id}`;
  return (
    <div className="flex items-center gap-1.5 shrink-0" title={`${name} x${it.quantity}`}>
      {img ? (
        <img src={img} alt="" className="w-9 h-9 rounded-lg object-cover border border-brand-100" />
      ) : (
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center text-xs">📦</div>
      )}
      <span className="text-xs text-ink/60 max-w-[90px] truncate">
        {name} <strong>x{it.quantity}</strong>
      </span>
    </div>
  );
}

function OrderDetail({ order: o }) {
  const steps = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
  const orderIdx = steps.indexOf((o.status || "PENDING").toUpperCase());
  return (
    <div className="mt-4 pt-4 border-t border-brand-50 space-y-3">
      <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`px-2 py-0.5 rounded-full ${o.status !== "CANCELLED" && i <= orderIdx ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"}`}>
              {s}
            </span>
            {i < steps.length - 1 && <span className="text-slate-300">→</span>}
          </span>
        ))}
        {o.status === "CANCELLED" && (
          <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white">CANCELLED</span>
        )}
      </div>
      {(o.items || []).map((it, idx) => (
        <OrderLine key={idx} item={it} />
      ))}
    </div>
  );
}

function OrderLine({ item: it }) {
  const name = it.product_name || it.product?.name || `Produit #${it.product_id}`;
  const img = it.product_image || it.product?.image_url || "";
  const cat = it.category_name || "";
  const unit = Number(it.unit_price || 0);
  return (
    <div className="flex items-center gap-3">
      {img ? (
        <img src={img} alt="" className="w-12 h-12 rounded-xl object-cover border border-brand-100" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">📦</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{name}</p>
        <p className="text-xs text-ink/50">
          {cat ? `${cat} • ` : ""}{unit.toFixed(2)} DT / u • x{it.quantity}
        </p>
      </div>
      <span className="text-sm font-bold">{(unit * (it.quantity || 0)).toFixed(2)} DT</span>
    </div>
  );
}
