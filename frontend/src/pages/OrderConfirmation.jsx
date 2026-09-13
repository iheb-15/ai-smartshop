import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import api from "../api/client";
import ProductGrid from "../components/ProductGrid";

export default function OrderConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state?.order || null);
  const [reco, setReco] = useState([]);

  useEffect(() => {
    if (!order) api.get(`/orders/${id}`).then((res) => setOrder(res.data)).catch(() => {});
    api.get("/ai/recommendations/for-me", { params: { top_k: 4 } }).then((res) => setReco(res.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!order) return <p className="text-center py-20 text-ink/40">Chargement…</p>;

  const paid = order.payment_status === "PAID";
  const payment = (order.payments || []).find((p) => p.status === "SUCCEEDED") || (order.payments || [])[0];

  return (
    <div className="max-w-3xl mx-auto px-5 py-12">
      <div className="bg-white border border-brand-100 rounded-3xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 text-3xl flex items-center justify-center mx-auto mb-4">✓</div>
        <h1 className="font-display text-3xl text-ink mb-2">Merci pour votre commande !</h1>
        <p className="text-ink/60 mb-6">
          Commande <strong>#{order.id}</strong> enregistrée le {new Date(order.created_at).toLocaleString("fr-FR")}.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 text-sm text-left mb-6">
          <div className="bg-brand-50 rounded-xl p-4">
            <p className="text-[11px] font-bold text-ink/50 uppercase">Montant</p>
            <p className="font-display text-xl text-brand-700">{order.total.toFixed(2)} DT</p>
          </div>
          <div className="bg-brand-50 rounded-xl p-4">
            <p className="text-[11px] font-bold text-ink/50 uppercase">Paiement</p>
            <p className="font-semibold">{order.payment_method === "card" ? "Carte bancaire" : "À la livraison"}</p>
            <p className={`text-xs font-semibold ${paid ? "text-emerald-600" : "text-amber-600"}`}>{paid ? "Payé" : "En attente de règlement"}</p>
            {payment?.transaction_ref && <p className="text-[11px] text-ink/40 font-mono mt-1">Réf. {payment.transaction_ref}</p>}
          </div>
          <div className="bg-brand-50 rounded-xl p-4">
            <p className="text-[11px] font-bold text-ink/50 uppercase">Livraison</p>
            <p className="font-semibold">{order.shipping_name}</p>
            <p className="text-xs text-ink/60">{order.shipping_address}, {order.shipping_city}</p>
          </div>
        </div>
        <ul className="text-left divide-y divide-brand-50 border border-brand-100 rounded-xl mb-6">
          {(order.items || []).map((it, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{it.product_name || it.product?.name} <span className="text-ink/40">× {it.quantity}</span></span>
              <span className="font-semibold">{(it.unit_price * it.quantity).toFixed(2)} DT</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to={`/orders/${order.id}/invoice`} className="px-5 py-2.5 rounded-full border border-brand-200 text-brand-700 font-semibold text-sm hover:bg-brand-50">🧾 Voir la facture</Link>
          <Link to="/orders" className="px-5 py-2.5 rounded-full border border-brand-200 text-brand-700 font-semibold text-sm hover:bg-brand-50">Suivre mes commandes</Link>
          <Link to="/shop" className="px-5 py-2.5 rounded-full bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700">Continuer mes achats</Link>
        </div>
      </div>

      {reco.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl text-ink mb-1">Vous pourriez aussi aimer</h2>
          <p className="text-sm text-ink/50 mb-4">Sélection personnalisée par notre moteur de recommandation.</p>
          <ProductGrid products={reco} />
        </section>
      )}
    </div>
  );
}
