import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import CardForm, { EMPTY_CARD, validateCard } from "../components/CardForm";

const STATUS_LABEL = { PENDING: "En attente", CONFIRMED: "Confirmée", PROCESSING: "En préparation", SHIPPED: "Expédiée", DELIVERED: "Livrée", CANCELLED: "Annulée" };
const PAY_BADGE = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UNPAID: "bg-amber-50 text-amber-700 border-amber-200",
  REFUNDED: "bg-slate-100 text-slate-600 border-slate-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
};
const PAY_LABEL = { PAID: "Payée", UNPAID: "À payer", REFUNDED: "Remboursée", FAILED: "Échec" };

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [paying, setPaying] = useState(null); // order to pay
  const [filter, setFilter] = useState("all");

  const load = () => {
    setLoading(true);
    setError("");
    api
      .get("/orders/")
      .then((res) => setOrders(res.data || []))
      .catch((err) => setError(err?.response?.data?.detail || "Impossible de charger vos commandes."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const cancelOrder = async (id) => {
    if (!window.confirm("Annuler cette commande ? Le stock sera restauré et le paiement remboursé le cas échéant.")) return;
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

  if (loading) return <p className="text-center py-20 text-ink/40">Chargement de vos commandes…</p>;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10 text-center">
        <p className="text-rose-600 font-semibold mb-4">{error}</p>
        <Link to="/shop" className="text-brand-600 font-semibold underline">Retour à la boutique</Link>
      </div>
    );
  }

  const visible = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "active") return !["DELIVERED", "CANCELLED"].includes(o.status);
    if (filter === "unpaid") return o.payment_status === "UNPAID" && o.status !== "CANCELLED";
    return o.status === filter;
  });

  return (
    <div className="max-w-3xl mx-auto px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display text-3xl text-ink">Mes commandes</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="text-sm border border-brand-100 rounded-lg px-3 py-2">
          <option value="all">Toutes ({orders.length})</option>
          <option value="active">En cours</option>
          <option value="unpaid">À payer</option>
          <option value="DELIVERED">Livrées</option>
          <option value="CANCELLED">Annulées</option>
        </select>
      </div>
      {visible.length === 0 && <p className="text-ink/50">Aucune commande pour le moment.</p>}
      <div className="space-y-4">
        {visible.map((o) => (
          <OrderCard key={o.id} order={o} expanded={expanded} setExpanded={setExpanded} cancelling={cancelling} onCancel={cancelOrder} onPay={() => setPaying(o)} />
        ))}
      </div>
      {paying && <PayModal order={paying} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); load(); }} />}
    </div>
  );
}

function OrderCard({ order: o, expanded, setExpanded, cancelling, onCancel, onPay }) {
  const items = o.items || [];
  const units = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const isOpen = expanded === o.id;
  const canCancel = ["PENDING", "CONFIRMED"].includes((o.status || "").toUpperCase());
  const canPay = o.payment_status === "UNPAID" && o.status !== "CANCELLED";
  return (
    <div className="bg-white border border-brand-100 rounded-2xl p-5">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <span className="font-semibold">Commande #{o.id}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${PAY_BADGE[o.payment_status] || PAY_BADGE.UNPAID}`}>
            {o.payment_method === "card" ? "💳" : "🚚"} {PAY_LABEL[o.payment_status] || o.payment_status}
          </span>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${o.status === "CANCELLED" ? "bg-rose-50 text-rose-700" : "bg-brand-50 text-brand-700"}`}>
            {STATUS_LABEL[o.status] || o.status}
          </span>
        </div>
      </div>
      <p className="text-sm text-ink/50 mb-2">{o.created_at ? new Date(o.created_at).toLocaleString("fr-FR") : ""}</p>
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-3 overflow-x-auto">
          {items.slice(0, 4).map((it, idx) => (
            <OrderThumb key={idx} item={it} />
          ))}
          {items.length > 4 && <span className="text-xs text-brand-600 font-semibold">+{items.length - 4}</span>}
        </div>
      )}
      <p className="text-sm text-ink/70">{items.length} référence(s) • {units} unité(s)</p>
      <p className="font-display text-lg text-brand-700 mt-2">{(o.total || 0).toFixed(2)} DT</p>
      <div className="flex flex-wrap items-center gap-4 mt-3">
        <button onClick={() => setExpanded(isOpen ? null : o.id)} className="text-sm font-semibold text-brand-600 hover:underline">
          {isOpen ? "Masquer le détail ▲" : "Voir le détail ▼"}
        </button>
        {canPay && (
          <button onClick={onPay} className="text-sm font-semibold px-3 py-1 rounded-full bg-amber-500 text-white hover:bg-amber-600">
            Payer maintenant
          </button>
        )}
        {canCancel && (
          <button onClick={() => onCancel(o.id)} disabled={cancelling === o.id} className="text-sm font-semibold text-rose-600 hover:underline disabled:opacity-50">
            {cancelling === o.id ? "Annulation…" : "Annuler la commande"}
          </button>
        )}
        <Link to={`/orders/${o.id}/invoice`} className="text-sm font-semibold text-ink/50 hover:text-ink underline">🧾 Facture</Link>
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
      {img ? <img src={img} alt="" className="w-9 h-9 rounded-lg object-cover border border-brand-100" /> : <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center text-xs">📦</div>}
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
            <span className={`px-2 py-0.5 rounded-full ${o.status !== "CANCELLED" && i <= orderIdx ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"}`}>{STATUS_LABEL[s]}</span>
            {i < steps.length - 1 && <span className="text-slate-300">→</span>}
          </span>
        ))}
        {o.status === "CANCELLED" && <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white">Annulée</span>}
      </div>
      {(o.shipping_address || o.shipping_city) && (
        <p className="text-xs text-ink/60">
          Livraison : {o.shipping_name} — {o.shipping_address}, {o.shipping_postal_code} {o.shipping_city} ({o.shipping_phone})
        </p>
      )}
      {(o.items || []).map((it, idx) => (
        <OrderLine key={idx} item={it} />
      ))}
      {(o.payments || []).length > 0 && (
        <div className="text-[11px] text-ink/50 space-y-0.5 pt-2 border-t border-brand-50">
          {o.payments.map((p) => (
            <p key={p.id}>
              {new Date(p.created_at).toLocaleString("fr-FR")} — {p.method === "card" ? "Carte" : "Livraison"} {p.card_brand ? `${p.card_brand} ••${p.card_last4}` : ""} : <strong>{p.status}</strong> {Math.abs(p.amount).toFixed(2)} DT
              {p.failure_reason ? ` — ${p.failure_reason}` : ""} <span className="font-mono">{p.transaction_ref}</span>
            </p>
          ))}
        </div>
      )}
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
      <Link to={`/product/${it.product_id}`}>
        {img ? <img src={img} alt="" className="w-12 h-12 rounded-xl object-cover border border-brand-100" /> : <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">📦</div>}
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={`/product/${it.product_id}`} className="text-sm font-semibold truncate hover:text-brand-700">{name}</Link>
        <p className="text-xs text-ink/50">{cat ? `${cat} • ` : ""}{unit.toFixed(2)} DT / u • x{it.quantity}</p>
      </div>
      <span className="text-sm font-bold">{(unit * (it.quantity || 0)).toFixed(2)} DT</span>
    </div>
  );
}

function PayModal({ order, onClose, onPaid }) {
  const [card, setCard] = useState(EMPTY_CARD);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateCard(card);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/orders/${order.id}/pay`, { card: { number: card.number, holder: card.holder, exp_month: Number(card.exp_month), exp_year: Number(card.exp_year), cvc: card.cvc } });
      onPaid();
    } catch (err) {
      setError(err?.response?.data?.detail || "Paiement refusé.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Payer la commande #{order.id}</h2>
          <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink">✕</button>
        </div>
        <p className="text-sm text-ink/60 mb-4">Montant : <strong className="text-brand-700">{order.total.toFixed(2)} DT</strong></p>
        <CardForm card={card} onChange={setCard} errors={errors} />
        {error && <p className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy} className="mt-4 w-full bg-brand-600 text-white font-semibold py-3 rounded-full hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Traitement…" : `Payer ${order.total.toFixed(2)} DT`}
        </button>
      </form>
    </div>
  );
}
