// Formulaire de carte bancaire (paiement SIMULÉ : aucune donnée n'est transmise à un prestataire réel).
export const TEST_CARDS = [
  { number: "4242 4242 4242 4242", label: "Visa — paiement accepté" },
  { number: "5555 5555 5555 4444", label: "Mastercard — paiement accepté" },
  { number: "4000 0000 0000 0002", label: "Refusée — fonds insuffisants" },
  { number: "4000 0000 0000 0069", label: "Refusée — carte expirée" },
];

export function luhnValid(number) {
  const digits = (number || "").replace(/\D/g, "");
  if (digits.length < 12) return false;
  let sum = 0;
  const parity = digits.length % 2;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]);
    if (i % 2 === parity) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(number) {
  const d = (number || "").replace(/\D/g, "");
  if (d.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(d) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "American Express";
  if (d.startsWith("6")) return "Discover";
  return d ? "Carte" : "";
}

export function formatCardNumber(value) {
  return (value || "").replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function validateCard(card) {
  const errors = {};
  if (!luhnValid(card.number)) errors.number = "Numéro de carte invalide.";
  if (!card.holder || card.holder.trim().length < 2) errors.holder = "Nom du titulaire requis.";
  const m = Number(card.exp_month);
  const y = Number(card.exp_year);
  const now = new Date();
  if (!(m >= 1 && m <= 12)) errors.exp_month = "Mois invalide.";
  if (!(y >= now.getFullYear()) || (y === now.getFullYear() && m < now.getMonth() + 1)) errors.exp_year = "Carte expirée.";
  if (!/^\d{3,4}$/.test(card.cvc || "")) errors.cvc = "CVC invalide.";
  return errors;
}

export const EMPTY_CARD = { number: "", holder: "", exp_month: "", exp_year: "", cvc: "" };

export default function CardForm({ card, onChange, errors = {}, showTestCards = true }) {
  const set = (key, value) => onChange({ ...card, [key]: value });
  const brand = cardBrand(card.number);
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-ink/70">Numéro de carte</label>
        <div className="relative">
          <input
            inputMode="numeric"
            autoComplete="cc-number"
            value={card.number}
            onChange={(e) => set("number", formatCardNumber(e.target.value))}
            placeholder="4242 4242 4242 4242"
            className={`w-full mt-1 px-3 py-2.5 rounded-xl border text-sm font-mono tracking-wider ${errors.number ? "border-rose-300" : "border-brand-100"}`}
          />
          {brand && <span className="absolute right-3 top-3.5 text-[11px] font-bold text-ink/50">{brand}</span>}
        </div>
        {errors.number && <p className="text-[11px] text-rose-600 mt-1">{errors.number}</p>}
      </div>
      <div>
        <label className="text-xs font-semibold text-ink/70">Titulaire</label>
        <input
          autoComplete="cc-name"
          value={card.holder}
          onChange={(e) => set("holder", e.target.value.toUpperCase())}
          placeholder="NOM PRÉNOM"
          className={`w-full mt-1 px-3 py-2.5 rounded-xl border text-sm ${errors.holder ? "border-rose-300" : "border-brand-100"}`}
        />
        {errors.holder && <p className="text-[11px] text-rose-600 mt-1">{errors.holder}</p>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-semibold text-ink/70">Mois</label>
          <input
            inputMode="numeric"
            autoComplete="cc-exp-month"
            value={card.exp_month}
            onChange={(e) => set("exp_month", e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="MM"
            className={`w-full mt-1 px-3 py-2.5 rounded-xl border text-sm ${errors.exp_month ? "border-rose-300" : "border-brand-100"}`}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink/70">Année</label>
          <input
            inputMode="numeric"
            autoComplete="cc-exp-year"
            value={card.exp_year}
            onChange={(e) => set("exp_year", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="AAAA"
            className={`w-full mt-1 px-3 py-2.5 rounded-xl border text-sm ${errors.exp_year ? "border-rose-300" : "border-brand-100"}`}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink/70">CVC</label>
          <input
            inputMode="numeric"
            autoComplete="cc-csc"
            value={card.cvc}
            onChange={(e) => set("cvc", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="123"
            className={`w-full mt-1 px-3 py-2.5 rounded-xl border text-sm ${errors.cvc ? "border-rose-300" : "border-brand-100"}`}
          />
        </div>
      </div>
      {(errors.exp_month || errors.exp_year || errors.cvc) && (
        <p className="text-[11px] text-rose-600">{errors.exp_month || errors.exp_year || errors.cvc}</p>
      )}
      {showTestCards && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
          <p className="font-semibold mb-1">Paiement simulé — cartes de test :</p>
          <ul className="space-y-0.5">
            {TEST_CARDS.map((c) => (
              <li key={c.number} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...card, number: c.number, holder: card.holder || "CLIENT TEST", exp_month: card.exp_month || "12", exp_year: card.exp_year || String(new Date().getFullYear() + 3), cvc: card.cvc || "123" })}
                  className="font-mono underline decoration-dotted hover:text-amber-950"
                >
                  {c.number}
                </button>
                <span className="text-amber-700">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
