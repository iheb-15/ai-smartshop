import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import ProductGrid from "../components/ProductGrid";

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({ full_name: "", phone: "", address: "", city: "", postal_code: "" });
  const [pwd, setPwd] = useState({ current_password: "", new_password: "", confirm: "" });
  const [msg, setMsg] = useState(null);
  const [pwdMsg, setPwdMsg] = useState(null);
  const [orders, setOrders] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name || "", phone: user.phone || "", address: user.address || "", city: user.city || "", postal_code: user.postal_code || "" });
  }, [user]);

  useEffect(() => {
    api.get("/orders/").then((res) => setOrders(res.data || [])).catch(() => {});
    api.get("/events/recently-viewed", { params: { limit: 4 } }).then((res) => setRecent(res.data || [])).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await updateProfile(form);
      setMsg({ ok: true, text: "Profil mis à jour." });
    } catch (err) {
      setMsg({ ok: false, text: err?.response?.data?.detail || "Mise à jour impossible." });
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwdMsg(null);
    if (pwd.new_password !== pwd.confirm) return setPwdMsg({ ok: false, text: "La confirmation ne correspond pas." });
    try {
      await api.put("/auth/me/password", { current_password: pwd.current_password, new_password: pwd.new_password });
      setPwd({ current_password: "", new_password: "", confirm: "" });
      setPwdMsg({ ok: true, text: "Mot de passe modifié." });
    } catch (err) {
      const d = err?.response?.data?.detail;
      setPwdMsg({ ok: false, text: typeof d === "string" ? d : "Le nouveau mot de passe doit contenir au moins 8 caractères." });
    }
  };

  const spent = orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-5 py-10">
      <h1 className="font-display text-3xl text-ink mb-6">Mon profil</h1>
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <Stat label="Commandes" value={orders.length} to="/orders" />
        <Stat label="Total dépensé" value={`${spent.toFixed(0)} DT`} />
        <Stat label="Membre depuis" value={user?.created_at ? new Date(user.created_at).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : "—"} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <form onSubmit={save} className="bg-white border border-brand-100 rounded-2xl p-6 space-y-3">
          <h2 className="font-display text-xl mb-2">Informations & adresse de livraison</h2>
          <Input label="Nom complet" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
          <Input label="Email" value={user?.email || ""} disabled />
          <Input label="Téléphone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Input label="Adresse" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ville" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Input label="Code postal" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />
          </div>
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
          <button className="bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-full hover:bg-brand-700">Enregistrer</button>
        </form>
        <form onSubmit={changePassword} className="bg-white border border-brand-100 rounded-2xl p-6 space-y-3 h-fit">
          <h2 className="font-display text-xl mb-2">Sécurité</h2>
          <Input label="Mot de passe actuel" type="password" value={pwd.current_password} onChange={(v) => setPwd({ ...pwd, current_password: v })} />
          <Input label="Nouveau mot de passe (8 caractères min.)" type="password" value={pwd.new_password} onChange={(v) => setPwd({ ...pwd, new_password: v })} />
          <Input label="Confirmer" type="password" value={pwd.confirm} onChange={(v) => setPwd({ ...pwd, confirm: v })} />
          {pwdMsg && <p className={`text-sm ${pwdMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>{pwdMsg.text}</p>}
          <button className="border border-brand-600 text-brand-700 font-semibold px-6 py-2.5 rounded-full hover:bg-brand-50">Changer le mot de passe</button>
        </form>
      </div>
      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl text-ink mb-4">Récemment consultés</h2>
          <ProductGrid products={recent} />
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, to }) {
  const body = (
    <div className="bg-white border border-brand-100 rounded-2xl p-4 text-center">
      <p className="font-display text-2xl text-brand-700">{value}</p>
      <p className="text-xs text-ink/50">{label}</p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function Input({ label, value, onChange, type = "text", disabled = false }) {
  return (
    <div>
      <label className="text-xs font-semibold text-ink/70">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full mt-1 px-3 py-2.5 rounded-xl border border-brand-100 text-sm disabled:bg-slate-50 disabled:text-ink/50"
      />
    </div>
  );
}
