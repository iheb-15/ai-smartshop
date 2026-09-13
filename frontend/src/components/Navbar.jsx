import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { items } = useCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const cartCount = items.reduce((n, it) => n + it.quantity, 0);

  const closeAnd = (fn) => () => {
    setMenuOpen(false);
    if (fn) fn();
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-brand-100">
      <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <Link to="/" className="font-display text-2xl text-brand-700 tracking-tight">
          Néo<span className="text-brand-500">Shop</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink/70">
          <Link to="/shop" className="hover:text-brand-600">Boutique</Link>
          {user && <Link to="/orders" className="hover:text-brand-600">Mes commandes</Link>}
          {user?.is_admin && (
            <Link
              to="/admin/dashboard"
              className="px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-semibold border border-brand-200 hover:bg-brand-100 transition text-xs"
            >
              Console Admin
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-4">
          <Link
            to="/cart"
            className="relative text-sm font-semibold text-ink/80 hover:text-brand-600"
          >
            Panier
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-brand-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
          {user ? (
            <span className="hidden sm:inline text-sm text-ink/60">
              Bonjour, <strong className="text-ink">{user.full_name?.split(" ")[0]}</strong>
            </span>
          ) : null}
          {user ? (
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="hidden sm:inline text-sm font-semibold text-ink/60 hover:text-red-600"
            >
              Déconnexion
            </button>
          ) : (
            <Link
              to="/login"
              className="hidden sm:inline bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-brand-700 transition"
            >
              Connexion
            </Link>
          )}
          {/* Bouton menu mobile */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden p-2 rounded-lg border border-brand-100 text-ink/70"
            aria-label="Menu"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>
      {/* Menu mobile déroulant */}
      {menuOpen && (
        <nav className="md:hidden border-t border-brand-100 bg-white px-5 py-4 flex flex-col gap-3 text-sm font-medium text-ink/80">
          <Link to="/shop" onClick={closeAnd()} className="py-1">Boutique</Link>
          {user && <Link to="/orders" onClick={closeAnd()} className="py-1">Mes commandes</Link>}
          {user?.is_admin && (
            <Link
              to="/admin/dashboard"
              onClick={closeAnd()}
              className="py-1 px-2.5 rounded-lg bg-brand-50 text-brand-700 font-semibold border border-brand-200 w-fit text-xs"
            >
              Console Admin
            </Link>
          )}
          {user ? (
            <button
              onClick={closeAnd(() => {
                logout();
                navigate("/");
              })}
              className="text-left py-1 font-semibold text-ink/60"
            >
              Déconnexion ({user.email})
            </button>
          ) : (
            <Link
              to="/login"
              onClick={closeAnd()}
              className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-full text-center"
            >
              Connexion
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
