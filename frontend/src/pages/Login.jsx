import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const rawFrom = location.state?.from;
  const from = typeof rawFrom === "string" ? rawFrom : rawFrom?.pathname || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      // Affiche le vrai message backend (ex. 403 compte désactivé) au lieu d'un texte générique
      setError(err?.response?.data?.detail || "Email ou mot de passe incorrect.");
    }
  };

  return (
    <div className="max-w-sm mx-auto px-5 py-20">
      <h1 className="font-display text-3xl text-ink mb-6 text-center">Connexion</h1>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-brand-100 rounded-xl px-4 py-3 text-sm"
          required
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button className="w-full bg-brand-600 text-white font-semibold py-3 rounded-full hover:bg-brand-700">
          Se connecter
        </button>
      </form>
      <p className="text-center text-sm mt-4">
        <Link to="/forgot-password" className="text-brand-600 font-semibold hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>
      <p className="text-center text-sm text-ink/50 mt-5">
        Pas de compte ? <Link to="/register" className="text-brand-600 font-semibold">S'inscrire</Link>
      </p>
      
    </div>
  );
}
