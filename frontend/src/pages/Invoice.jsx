import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";

const PAY_LABEL = { PAID: "Payée", UNPAID: "À régler à la livraison", REFUNDED: "Remboursée", FAILED: "Paiement échoué" };

export default function Invoice() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/orders/${id}`).then((res) => setOrder(res.data)).catch((e) => setError(e?.response?.data?.detail || "Facture introuvable."));
  }, [id]);

  if (error) return <p className="text-center py-20 text-rose-600">{error}</p>;
  if (!order) return <p className="text-center py-20 text-ink/40">Chargement…</p>;

  const subtotal = (order.items || []).reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const catalogTotal = (order.items || []).reduce((s, it) => s + (it.product?.price || it.unit_price) * it.quantity, 0);
  const discount = Math.max(0, catalogTotal - subtotal);
  const payment = (order.payments || []).find((p) => p.status === "SUCCEEDED");

  return (
    <div className="max-w-3xl mx-auto px-5 py-10">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link to="/orders" className="text-sm font-semibold text-brand-600 hover:underline">← Mes commandes</Link>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">🖨 Imprimer / PDF</button>
      </div>
      <div className="bg-white border border-brand-100 rounded-2xl p-8 print:border-0 print:p-0">
        <div className="flex justify-between items-start mb-8">
          <div>
            <p className="font-display text-2xl text-brand-700">Néo<span className="text-brand-500">Shop</span></p>
            <p className="text-xs text-ink/50">Boutique en ligne intelligente<br />Avenue Habib Bourguiba, Tunis<br />contact@neoshop.tn</p>
          </div>
          <div className="text-right">
            <h1 className="font-display text-2xl text-ink">FACTURE</h1>
            <p className="text-sm font-semibold">N° F-{String(order.id).padStart(6, "0")}</p>
            <p className="text-xs text-ink/50">Émise le {new Date(order.created_at).toLocaleDateString("fr-FR")}</p>
            <p className={`text-xs font-bold mt-1 ${order.payment_status === "PAID" ? "text-emerald-600" : "text-amber-600"}`}>{PAY_LABEL[order.payment_status] || order.payment_status}</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 text-sm mb-8">
          <div>
            <p className="text-[11px] font-bold text-ink/50 uppercase mb-1">Facturé à / Livré à</p>
            <p className="font-semibold">{order.shipping_name || order.user?.full_name}</p>
            <p>{order.shipping_address}</p>
            <p>{order.shipping_postal_code} {order.shipping_city}</p>
            <p className="text-ink/60">{order.shipping_phone}</p>
            <p className="text-ink/60">{order.user?.email}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-ink/50 uppercase mb-1">Paiement</p>
            <p className="font-semibold">{order.payment_method === "card" ? "Carte bancaire" : "Paiement à la livraison"}</p>
            {payment?.card_brand && <p>{payment.card_brand} •••• {payment.card_last4}</p>}
            {payment?.transaction_ref && <p className="font-mono text-xs text-ink/60">Réf. {payment.transaction_ref}</p>}
            {order.paid_at && <p className="text-xs text-ink/60">Réglée le {new Date(order.paid_at).toLocaleString("fr-FR")}</p>}
            <p className="text-xs text-ink/60 mt-1">Statut logistique : {order.status}</p>
          </div>
        </div>
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[11px] uppercase text-ink/50">
              <th className="py-2">Désignation</th>
              <th className="py-2 text-right">PU HT</th>
              <th className="py-2 text-right">Qté</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {(order.items || []).map((it, i) => (
              <tr key={i}>
                <td className="py-2.5">
                  <p className="font-semibold">{it.product_name || it.product?.name}</p>
                  {it.category_name && <p className="text-xs text-ink/50">{it.category_name}</p>}
                </td>
                <td className="py-2.5 text-right">{it.unit_price.toFixed(2)} DT</td>
                <td className="py-2.5 text-right">{it.quantity}</td>
                <td className="py-2.5 text-right font-semibold">{(it.unit_price * it.quantity).toFixed(2)} DT</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <div className="w-64 text-sm space-y-1">
            {discount > 0 && (
              <>
                <div className="flex justify-between text-ink/60"><span>Prix catalogue</span><span>{catalogTotal.toFixed(2)} DT</span></div>
                <div className="flex justify-between text-rose-600"><span>Remises</span><span>−{discount.toFixed(2)} DT</span></div>
              </>
            )}
            <div className="flex justify-between text-ink/60"><span>Sous-total</span><span>{subtotal.toFixed(2)} DT</span></div>
            <div className="flex justify-between text-ink/60"><span>Livraison</span><span>0.00 DT</span></div>
            <div className="flex justify-between text-ink/60"><span>TVA (incluse 19%)</span><span>{(order.total - order.total / 1.19).toFixed(2)} DT</span></div>
            <div className="flex justify-between font-display text-xl border-t border-ink/10 pt-2"><span>Total TTC</span><span>{order.total.toFixed(2)} DT</span></div>
          </div>
        </div>
        {order.notes && <p className="text-xs text-ink/50 mt-6">Instructions : {order.notes}</p>}
        <p className="text-[11px] text-ink/40 mt-8 text-center">Document généré automatiquement — projet de fin d'études NéoShop (paiement simulé, sans valeur comptable).</p>
      </div>
    </div>
  );
}
