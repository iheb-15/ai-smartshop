import { useEffect, useState } from "react";
import api from "../api/client";
import ProductGrid from "../components/ProductGrid";

const PAGE_SIZE = 12;

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    category_id: "",
    sort_by: "",
    min_price: "",
    max_price: "",
    in_stock: false,
  });
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [aiQuery, setAiQuery] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/categories/").then((res) => setCategories(res.data));
  }, []);

  // Recherche texte avec debounce (évite 1 appel par frappe)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(filters.q.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filters.q]);

  const loadClassic = async (opts = {}) => {
    const p = opts.page ?? page;
    setLoading(true);
    setAiMode(false);
    try {
      const params = { skip: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE };
      if (debouncedQ) params.q = debouncedQ;
      if (filters.category_id) params.category_id = filters.category_id;
      if (filters.sort_by) params.sort_by = filters.sort_by;
      if (filters.min_price !== "") params.min_price = Number(filters.min_price);
      if (filters.max_price !== "") params.max_price = Number(filters.max_price);
      if (filters.in_stock) params.in_stock = true;
      const res = await api.get("/products/", { params });
      setProducts(res.data || []);
      setTotalCount(Number(res.headers["x-total-count"] || (res.data || []).length));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.category_id, filters.sort_by, filters.min_price, filters.max_price, filters.in_stock, page]);

  const resetFilters = () => {
    setFilters({ q: "", category_id: "", sort_by: "", min_price: "", max_price: "", in_stock: false });
    setDebouncedQ("");
    setPage(1);
  };

  const runAiSearch = async (e) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setLoading(true);
    setAiMode(true);
    try {
      const res = await api.post("/ai/search", { query: aiQuery, top_k: 20 });
      setProducts(res.data || []);
      setTotalCount((res.data || []).length);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="flex items-end justify-between mb-6">
        <h1 className="font-display text-3xl text-ink">Boutique</h1>
        <span className="text-xs text-ink/40">{totalCount} produit(s)</span>
      </div>

      <form onSubmit={runAiSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder="Recherche intelligente : ex. « sac léger pour voyager pas cher »"
            className="flex-1 px-4 py-3 rounded-full border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
          <button
            type="submit"
            className="bg-brand-700 text-white px-6 rounded-full text-sm font-semibold hover:bg-brand-600"
          >
            ✨ Recherche IA
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-3 mb-8 items-center">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="Nom du produit…"
          className="px-3 py-2 rounded-lg border border-brand-100 text-sm"
        />
        <select
          value={filters.category_id}
          onChange={(e) => {
            setFilters((f) => ({ ...f, category_id: e.target.value }));
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-brand-100 text-sm"
        >
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filters.sort_by}
          onChange={(e) => {
            setFilters((f) => ({ ...f, sort_by: e.target.value }));
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-brand-100 text-sm"
        >
          <option value="">Trier par</option>
          <option value="price_asc">Prix croissant</option>
          <option value="price_desc">Prix décroissant</option>
          <option value="newest">Plus récents</option>
        </select>
        <input
          type="number"
          min={0}
          value={filters.min_price}
          onChange={(e) => {
            setFilters((f) => ({ ...f, min_price: e.target.value }));
            setPage(1);
          }}
          placeholder="Prix min"
          className="w-28 px-3 py-2 rounded-lg border border-brand-100 text-sm"
        />
        <input
          type="number"
          min={0}
          value={filters.max_price}
          onChange={(e) => {
            setFilters((f) => ({ ...f, max_price: e.target.value }));
            setPage(1);
          }}
          placeholder="Prix max"
          className="w-28 px-3 py-2 rounded-lg border border-brand-100 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            checked={filters.in_stock}
            onChange={(e) => {
              setFilters((f) => ({ ...f, in_stock: e.target.checked }));
              setPage(1);
            }}
            className="w-4 h-4 rounded text-brand-600"
          />
          En stock uniquement
        </label>
        <button
          type="button"
          onClick={resetFilters}
          className="text-sm font-semibold text-ink/50 hover:text-brand-600 underline"
        >
          Réinitialiser
        </button>
        {aiMode && (
          <span className="text-xs text-brand-600 font-medium">
            Résultats de la recherche IA pour « {aiQuery} »
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-center text-ink/40 py-10">Chargement…</p>
      ) : (
        <>
          <ProductGrid products={products} />
          {!aiMode && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-4 py-2 rounded-full border border-brand-100 text-sm font-semibold disabled:opacity-40"
              >
                ← Précédent
              </button>
              <span className="text-sm text-ink/60">Page {page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-4 py-2 rounded-full border border-brand-100 text-sm font-semibold disabled:opacity-40"
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
