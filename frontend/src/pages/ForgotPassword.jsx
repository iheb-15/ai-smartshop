import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";

const STEPS = ["email", "code", "reset"];

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await api.post("/auth/forgot-password", { email });
      setInfo(res.data.message || "Code envoyé. Vérifiez votre boîte email.");
      setStep("code");
      setCooldown(60);
    } catch (err) {
      setError(err?.response?.data?.detail || "Envoi impossible.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/verify-otp", { email, code });
      setStep("reset");
      setInfo("Code vérifié. Choisissez un nouveau mot de passe.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Code invalide ou expiré.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { email, code, new_password: password });
      setInfo("Mot de passe réinitialisé. Redirection vers la connexion…");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err?.response?.data?.detail || "Réinitialisation impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-5 py-20">
      <h1 className="font-display text-3xl text-ink mb-2 text-center">Mot de passe oublié</h1>
      <div className="flex items-center justify-center gap-2 text-xs mb-6">
        {STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${
                STEPS.indexOf(step) >= i ? "bg-brand-600 text-white" : "bg-brand-50 text-ink/40"
              }`}
            >
              {i + 1}
            </span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-brand-100" />}
          </span>
        ))}
      </div>

      {info && <p className="text-emerald-600 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 mb-4">{info}</p>}
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {step === "email" && (
        <form onSubmit={sendCode} className="space-y-4">
          <input
            type="email"
            placeholder="Votre email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm"
            required
          />
          <button
            disabled={loading}
            className="w-full bg-brand-600 text-white font-semibold py-3 rounded-full hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Envoi…" : "Recevoir le code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyCode} className="space-y-4">
          <input
            inputMode="numeric"
            placeholder="Code à 6 chiffres"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm text-center text-2xl tracking-[0.5em] font-bold"
            required
            minLength={6}
            maxLength={6}
          />
          <button
            disabled={loading || code.length !== 6}
            className="w-full bg-brand-600 text-white font-semibold py-3 rounded-full hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Vérification…" : "Vérifier le code"}
          </button>
          <button
            type="button"
            disabled={cooldown > 0 || loading}
            onClick={sendCode}
            className="w-full text-sm font-semibold text-brand-600 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {cooldown > 0 ? `Renvoyer dans ${cooldown}s` : "Renvoyer un code"}
          </button>
        </form>
      )}

      {step === "reset" && (
        <form onSubmit={resetPassword} className="space-y-4">
          <input
            type="password"
            placeholder="Nouveau mot de passe (min 8 caractères)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm"
            required
            minLength={8}
          />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm"
            required
            minLength={8}
          />
          <button
            disabled={loading}
            className="w-full bg-brand-600 text-white font-semibold py-3 rounded-full hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Réinitialisation…" : "Réinitialiser"}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-ink/50 mt-5">
        <Link to="/login" className="text-brand-600 font-semibold">Retour à la connexion</Link>
      </p>
    </div>
  );
}
