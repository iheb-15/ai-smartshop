import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-brand-100 bg-white mt-10">
      <div className="max-w-6xl mx-auto px-5 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <p className="font-display text-xl text-brand-700 mb-2">
            Néo<span className="text-brand-500">Shop</span>
          </p>
          <p className="text-ink/50">
            Boutique intelligente : recommandations ML, recherche IA et assistant d'achat.
          </p>
        </div>
        <div>
          <p className="font-semibold mb-3">Boutique</p>
          <div className="flex flex-col gap-2 text-ink/60">
            <Link to="/shop" className="hover:text-brand-600">Tous les produits</Link>
            <Link to="/cart" className="hover:text-brand-600">Panier</Link>
            <Link to="/orders" className="hover:text-brand-600">Mes commandes</Link>
          </div>
        </div>
        <div>
          <p className="font-semibold mb-3">Compte</p>
          <div className="flex flex-col gap-2 text-ink/60">
            <Link to="/login" className="hover:text-brand-600">Connexion</Link>
            <Link to="/register" className="hover:text-brand-600">Inscription</Link>
          </div>
        </div>
        <div>
          <p className="font-semibold mb-3">Paiement simulé</p>
          <p className="text-ink/50">
            Checkout de démonstration : stock décrémenté, commande suivie, annulation possible.
          </p>
        </div>
      </div>
      <div className="border-t border-brand-50 py-4 text-center text-xs text-ink/40">
        © {new Date().getFullYear()} NéoShop — Projet PFE e-commerce + IA
      </div>
    </footer>
  );
}
