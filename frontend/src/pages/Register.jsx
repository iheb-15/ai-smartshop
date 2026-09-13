import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await register(form.full_name, form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.detail || "Erreur lors de l'inscription.");
    }
  };

  return (
    <div className="max-w-sm mx-auto px-5 py-20">
      <h1 className="font-display text-3xl text-ink mb-6 text-center">Créer un compte</h1>
      <form onSubmit={submit} className="space-y-4">
        <input
          placeholder="Nom complet"
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm"
          required
          minLength={8}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button className="w-full bg-brand-600 text-white font-semibold py-3 rounded-full hover:bg-brand-700">
          S'inscrire
        </button>
      </form>
      <p className="text-center text-sm text-ink/50 mt-5">
        Déjà un compte ? <Link to="/login" className="text-brand-600 font-semibold">Se connecter</Link>
      </p>
    </div>
  );
}
