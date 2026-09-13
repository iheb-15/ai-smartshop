import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import CardForm, { EMPTY_CARD, validateCard } from "../components/CardForm";

const STEPS = ["Livraison", "Paiement", "Confirmation"];

export default function Checkout() {
  const navigate = useNavigate();
  const { refresh } = useCart();
  const { refreshUser } = useAuth();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [shipping, setShipping] = useState({ full_name: "", phone: "", address: "", city: "", postal_code: "" });
  const [shippingErrors, setShippingErrors] = useState({});
  const [method, setMethod] = useState("card");
  const [card, setCard] = useState(EMPTY_CARD);
  const [cardErrors, setCardErrors] = useState({});
  const [notes, setNotes] = useState("");
  const [saveAddress, setSaveAddress] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/orders/checkout/preview")
      .then((res) => {
        setPreview(res.data);
        setShipping((s) => ({ ...s, ...res.data.default_shipping }));
      })
      .catch(() => setPreview({ lines: [], total: 0 }))
      .finally(() => setLoading(false));
  }, []);

  const validateShipping = () => {
    const e = {};
    if (!shipping.full_name || shipping.full_name.trim().length < 2) e.full_name = "Nom requis.";
    if (!shipping.phone || shipping.phone.trim().length < 6) e.phone = "Téléphone requis.";
    if (!shipping.address || shipping.address.trim().length < 5) e.address = "Adresse requise.";
    if (!shipping.city || shipping.city.trim().length < 2) e.city = "Ville requise.";
    setShippingErrors(e);
    return Object.keys(e).length === 0;
  };

  const goPayment = () => {
    if (validateShipping()) setStep(1);
  };

  const goConfirm = () => {
    if (method === "card") {
      const e = validateCard(card);
      setCardErrors(e);
      if (Object.keys(e).length) return;
    }
    setStep(2);
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = { payment_method: method, shipping, notes: notes || null, save_address: saveAddress };
      if (method === "card") {
        payload.card = { number: card.number, holder: card.holder, exp_month: Number(card.exp_month), exp_year: Number(card.exp_year), cvc: card.cvc };
      }
      const res = await api.post("/orders/checkout", payload);
      await refresh();
      refreshUser();
      navigate(`/orders/${res.data.id}/confirmation`, { state: { order: res.data } });
    } catch (err) {
      const status = err?.response?.status;
      setError(err?.response?.data?.detail || "Le paiement n'a pas pu être traité.");
      if (status === 402) setStep(1); // paiement refusé : retour à l'étape carte
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-center py-20 text-ink/40">Préparation de votre commande…</p>;

  if (!preview || preview.lines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-20 text-center">
        <p className="text-ink/60 mb-4">Votre panier est vide.</p>
        <Link to="/shop" className="text-brand-600 font-semibold">Retour à la boutique</Link>
      </div>
    );
  }

  const unavailable = preview.lines.filter((l) => !l.available);

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <h1 className="font-display text-3xl text-ink mb-2">Finaliser ma commande</h1>
      <ol className="flex items-center gap-2 text-xs font-semibold mb-8">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center ${i <= step ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"}`}>{i + 1}</span>
            <span className={i <= step ? "text-brand-700" : "text-slate-400"}>{label}</span>
            {i < STEPS.length - 1 && <span className="text-slate-300 mx-1">—</span>}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-6 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <strong>Échec :</strong> {error}
        </div>
      )}
      {unavailable.length > 0 && (
        <div className="mb-6 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Stock insuffisant pour : {unavailable.map((l) => l.name).join(", ")}. Ajustez votre <Link to="/cart" className="underline font-semibold">panier</Link> avant de payer.
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          {step === 0 && (
            <section className="bg-white border border-brand-100 rounded-2xl p-6">
              <h2 className="font-display text-xl mb-4">Adresse de livraison</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nom complet" error={shippingErrors.full_name} value={shipping.full_name} onChange={(v) => setShipping({ ...shipping, full_name: v })} />
                <Field label="Téléphone" error={shippingErrors.phone} value={shipping.phone} onChange={(v) => setShipping({ ...shipping, phone: v })} placeholder="+216 …" />
                <Field label="Adresse" error={shippingErrors.address} value={shipping.address} onChange={(v) => setShipping({ ...shipping, address: v })} className="sm:col-span-2" />
                <Field label="Ville" error={shippingErrors.city} value={shipping.city} onChange={(v) => setShipping({ ...shipping, city: v })} />
                <Field label="Code postal" value={shipping.postal_code} onChange={(v) => setShipping({ ...shipping, postal_code: v })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink/70 mt-4">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="w-4 h-4" />
                Enregistrer cette adresse dans mon profil
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Instructions de livraison (optionnel)"
                rows={2}
                className="w-full mt-4 border border-brand-100 rounded-xl px-3 py-2 text-sm"
              />
              <div className="flex justify-between mt-6">
                <Link to="/cart" className="text-sm font-semibold text-ink/50 hover:text-ink">← Retour au panier</Link>
                <button onClick={goPayment} className="bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-full hover:bg-brand-700">Continuer →</button>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="bg-white border border-brand-100 rounded-2xl p-6">
              <h2 className="font-display text-xl mb-4">Mode de paiement</h2>
              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                <MethodOption active={method === "card"} onClick={() => setMethod("card")} title="Carte bancaire" desc="Paiement en ligne sécurisé (simulation)" icon="💳" />
                <MethodOption active={method === "cash_on_delivery"} onClick={() => setMethod("cash_on_delivery")} title="Paiement à la livraison" desc="Réglez en espèces à la réception" icon="🚚" />
              </div>
              {method === "card" ? (
                <CardForm card={card} onChange={setCard} errors={cardErrors} />
              ) : (
                <p className="text-sm text-ink/60 bg-brand-50 rounded-xl p-4">
                  Vous réglerez <strong>{preview.total.toFixed(2)} DT</strong> au livreur. Vous pourrez aussi payer en ligne plus tard depuis « Mes commandes ».
                </p>
              )}
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(0)} className="text-sm font-semibold text-ink/50 hover:text-ink">← Livraison</button>
                <button onClick={goConfirm} className="bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-full hover:bg-brand-700">Vérifier la commande →</button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="bg-white border border-brand-100 rounded-2xl p-6 space-y-4">
              <h2 className="font-display text-xl">Vérification</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="bg-brand-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-ink/50 uppercase mb-1">Livraison</p>
                  <p className="font-semibold">{shipping.full_name}</p>
                  <p>{shipping.address}</p>
                  <p>{shipping.postal_code} {shipping.city}</p>
                  <p className="text-ink/60">{shipping.phone}</p>
                </div>
                <div className="bg-brand-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-ink/50 uppercase mb-1">Paiement</p>
                  {method === "card" ? (
                    <>
                      <p className="font-semibold">Carte bancaire</p>
                      <p className="font-mono">•••• •••• •••• {card.number.replace(/\s/g, "").slice(-4)}</p>
                      <p className="text-ink/60">{card.holder} — {card.exp_month}/{card.exp_year}</p>
                    </>
                  ) : (
                    <p className="font-semibold">Paiement à la livraison</p>
                  )}
                </div>
              </div>
              {notes && <p className="text-xs text-ink/60">Instructions : {notes}</p>}
              <div className="flex justify-between items-center pt-2">
                <button onClick={() => setStep(1)} className="text-sm font-semibold text-ink/50 hover:text-ink">← Paiement</button>
                <button
                  onClick={submit}
                  disabled={submitting || unavailable.length > 0}
                  className="bg-brand-600 text-white font-semibold px-8 py-3 rounded-full hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting ? "Traitement du paiement…" : method === "card" ? `Payer ${preview.total.toFixed(2)} DT` : "Confirmer la commande"}
                </button>
              </div>
            </section>
          )}
        </div>

        <aside className="lg:col-span-2">
          <div className="bg-white border border-brand-100 rounded-2xl p-5 sticky top-24">
            <h3 className="font-display text-lg mb-4">Récapitulatif</h3>
            <ul className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
              {preview.lines.map((l) => (
                <li key={l.product_id} className="flex items-center gap-3 text-sm">
                  <img src={l.image_url} alt="" className="w-12 h-12 rounded-lg object-cover bg-brand-50" onError={(e) => { e.currentTarget.src = "/favicon.svg"; }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{l.name}</p>
                    <p className="text-xs text-ink/50">
                      {l.quantity} × {l.effective_price} DT
                      {l.promotion && <span className="ml-1 text-rose-600 font-semibold">({l.promotion})</span>}
                    </p>
                  </div>
                  <span className="font-semibold">{l.line_total.toFixed(2)} DT</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-brand-100 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-ink/60"><span>Sous-total</span><span>{preview.subtotal.toFixed(2)} DT</span></div>
              {preview.discount > 0 && <div className="flex justify-between text-rose-600"><span>Remises</span><span>−{preview.discount.toFixed(2)} DT</span></div>}
              <div className="flex justify-between text-ink/60"><span>Livraison</span><span className="text-emerald-600 font-semibold">Offerte</span></div>
              <div className="flex justify-between font-display text-xl pt-2"><span>Total</span><span className="text-brand-700">{preview.total.toFixed(2)} DT</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, error, placeholder, className = "" }) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold text-ink/70">{label}</label>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full mt-1 px-3 py-2.5 rounded-xl border text-sm ${error ? "border-rose-300" : "border-brand-100"}`}
      />
      {error && <p className="text-[11px] text-rose-600 mt-1">{error}</p>}
    </div>
  );
}

function MethodOption({ active, onClick, title, desc, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition ${active ? "border-brand-600 bg-brand-50 ring-2 ring-brand-200" : "border-brand-100 hover:border-brand-300"}`}
    >
      <span className="text-xl">{icon}</span>
      <p className="font-semibold text-sm mt-1">{title}</p>
      <p className="text-xs text-ink/50">{desc}</p>
    </button>
  );
}
