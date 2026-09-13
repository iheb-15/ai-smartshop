import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-5 py-24 text-center">
      <p className="font-display text-7xl text-brand-200 mb-4">404</p>
      <h1 className="font-display text-2xl text-ink mb-2">Page introuvable</h1>
      <p className="text-sm text-ink/50 mb-6">
        La page demandée n'existe pas ou a été déplacée.
      </p>
      <Link
        to="/"
        className="inline-block bg-brand-600 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-brand-700"
      >
        Retour à l'accueil
      </Link>
    </div>
  );
}
