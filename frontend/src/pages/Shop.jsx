import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import ProductGrid from "../components/ProductGrid";
import { getSessionId } from "../lib/session";

const PAGE_SIZE = 12;
const EXAMPLES = ["un cadeau sport à moins de 100 DT", "écouteurs bluetooth pas cher", "nouveautés maison en promo", "les mieux notés en électronique"];

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    category_id: searchParams.get("category_id") || "",
    sort_by: "",
    min_price: "",
    max_price: "",
    in_stock: false,
  });
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [aiQuery, setAiQuery] = useState(searchParams.get("q") || "");
  const [aiResult, setAiResult] = useState(null); // {mode, interpretation, results}
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);

  useEffect(() => {
    api.get("/categories/").then((res) => setCategories(res.data));
    api.get("/ai/status").then((res) => setAiStatus(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(filters.q.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filters.q]);

  const loadClassic = async () => {
    setLoading(true);
    setAiResult(null);
    try {
      const params = { skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, session_id: getSessionId() };
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
    if (searchParams.get("q")) {
      runAiSearch(null, searchParams.get("q"));
      return;
    }
    loadClassic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.category_id, filters.sort_by, filters.min_price, filters.max_price, filters.in_stock, page]);

  const resetFilters = () => {
    setFilters({ q: "", category_id: "", sort_by: "", min_price: "", max_price: "", in_stock: false });
    setDebouncedQ("");
    setAiQuery("");
    setAiResult(null);
    setPage(1);
    setSearchParams({});
  };

  const runAiSearch = async (e, forced) => {
    if (e) e.preventDefault();
    const q = (forced ?? aiQuery).trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await api.post("/ai/search", { query: q, top_k: 24, session_id: getSessionId() });
      setAiResult(res.data);
      setProducts(res.data.results || []);
      setTotalCount(res.data.total || 0);
      setSearchParams({ q });
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const labels = aiResult?.interpretation?.labels || [];

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="flex items-end justify-between mb-6">
        <h1 className="font-display text-3xl text-ink">Boutique</h1>
        <span className="text-xs text-ink/40">{totalCount} produit(s)</span>
      </div>

      <form onSubmit={runAiSearch} className="mb-3">
        <div className="flex gap-2">
          <input
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder="Recherche en langage naturel : « un cadeau sport à moins de 100 DT »"
            className="flex-1 px-4 py-3 rounded-full border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
          <button type="submit" className="bg-brand-700 text-white px-6 rounded-full text-sm font-semibold hover:bg-brand-600">
            ✨ Recherche IA
          </button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 mb-6 text-xs">
        <span className="text-ink/40">Essayez :</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setAiQuery(ex);
              runAiSearch(null, ex);
            }}
            className="px-3 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100"
          >
            {ex}
          </button>
        ))}
        {aiStatus && (
          <span className="ml-auto text-[11px] text-ink/40" title="Mode de compréhension de la requête">
            Compréhension : {aiStatus.features?.search === "llm" ? "LLM (Claude) + TF-IDF" : "règles + TF-IDF (clé IA non configurée)"}
          </span>
        )}
      </div>

      {aiResult && (
        <div className="mb-6 bg-white border border-indigo-100 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Ce que j'ai compris</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${aiResult.mode === "llm" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {aiResult.mode === "llm" ? "analyse LLM" : "analyse par règles"}
            </span>
            {labels.map((l) => (
              <span key={l} className={`text-xs px-2.5 py-1 rounded-full border ${l.startsWith("Aucune") ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-indigo-50 border-indigo-100 text-indigo-800"}`}>
                {l}
              </span>
            ))}
            {labels.length === 0 && <span className="text-xs text-ink/50">Aucun filtre particulier détecté.</span>}
            <button type="button" onClick={resetFilters} className="ml-auto text-xs font-semibold text-ink/50 hover:text-brand-600 underline">
              Effacer la recherche
            </button>
          </div>
        </div>
      )}

      {!aiResult && (
        <div className="flex flex-wrap gap-3 mb-8 items-center">
          <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Nom du produit…" className="px-3 py-2 rounded-lg border border-brand-100 text-sm" />
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
            <option value="rating">Les mieux notés</option>
            <option value="popular">Les plus vendus</option>
            <option value="newest">Plus récents</option>
          </select>
          <input type="number" min={0} value={filters.min_price} onChange={(e) => { setFilters((f) => ({ ...f, min_price: e.target.value })); setPage(1); }} placeholder="Prix min" className="w-28 px-3 py-2 rounded-lg border border-brand-100 text-sm" />
          <input type="number" min={0} value={filters.max_price} onChange={(e) => { setFilters((f) => ({ ...f, max_price: e.target.value })); setPage(1); }} placeholder="Prix max" className="w-28 px-3 py-2 rounded-lg border border-brand-100 text-sm" />
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={filters.in_stock} onChange={(e) => { setFilters((f) => ({ ...f, in_stock: e.target.checked })); setPage(1); }} className="w-4 h-4 rounded text-brand-600" />
            En stock uniquement
          </label>
          <button type="button" onClick={resetFilters} className="text-sm font-semibold text-ink/50 hover:text-brand-600 underline">Réinitialiser</button>
        </div>
      )}

      {loading ? (
        <p className="text-center text-ink/40 py-10">Chargement…</p>
      ) : (
        <>
          <ProductGrid products={products} emptyLabel={aiResult ? "Aucun produit ne correspond. Essayez d'autres mots ou élargissez le budget." : "Aucun produit trouvé."} />
          {!aiResult && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-4 py-2 rounded-full border border-brand-100 text-sm font-semibold disabled:opacity-40">← Précédent</button>
              <span className="text-sm text-ink/60">Page {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-4 py-2 rounded-full border border-brand-100 text-sm font-semibold disabled:opacity-40">Suivant →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
