import { useEffect, useState } from "react";
import api from "../../api/client";

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters (server-side where possible)
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // all, in_stock, low_stock, out_of_stock (client-side)
  const [availabilityFilter, setAvailabilityFilter] = useState("all"); // all, available, hidden (client-side)
  const [sortBy, setSortBy] = useState("newest");

  // Pagination (server-side)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState(null);

  // Form State
  const initialForm = {
    name: "",
    description: "",
    price: "",
    promo_price: "",
    stock: "0",
    image_url: "",
    category_id: "",
    is_available: true,
  };
  const [formData, setFormData] = useState(initialForm);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {
        skip: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
      };
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      if (selectedCategory) params.category_id = Number(selectedCategory);
      if (sortBy === "price_asc" || sortBy === "price_desc" || sortBy === "newest") params.sort_by = sortBy;
      const [prodRes, catRes] = await Promise.all([
        api.get("/products/", { params }),
        categories.length ? Promise.resolve({ data: categories }) : api.get("/categories/"),
      ]);
      setProducts(prodRes.data);
      setTotalCount(Number(prodRes.headers["x-total-count"] || prodRes.data.length));
      if (!categories.length) setCategories(catRes.data);
    } catch (err) {
      console.error(err);
      showToast("Erreur lors du chargement des données.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce recherche serveur
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, selectedCategory, sortBy, currentPage]);

  // Filtres fins restés côté client (page courante serveur)
  const filteredProducts = products.filter((p) => {
    let matchesStock = true;
    if (stockFilter === "in_stock") matchesStock = p.stock > 5;
    else if (stockFilter === "low_stock") matchesStock = p.stock > 0 && p.stock <= 5;
    else if (stockFilter === "out_of_stock") matchesStock = p.stock === 0;

    let matchesAvailability = true;
    if (availabilityFilter === "available") matchesAvailability = p.is_available === true;
    else if (availabilityFilter === "hidden") matchesAvailability = p.is_available === false;

    return matchesStock && matchesAvailability;
  });

  // Pagination serveur
  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
  const currentProducts = filteredProducts;

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData(initialForm);
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      price: product.price.toString(),
      promo_price: product.promo_price ? product.promo_price.toString() : "",
      stock: product.stock.toString(),
      image_url: product.image_url || "",
      category_id: product.category_id ? product.category_id.toString() : "",
      is_available: product.is_available ?? true,
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const price = parseFloat(formData.price);
    const stock = parseInt(formData.stock, 10);
    const promo_price = formData.promo_price ? parseFloat(formData.promo_price) : null;

    if (isNaN(price) || price < 0) {
      setFormError("Le prix doit être un nombre positif.");
      return;
    }
    if (isNaN(stock) || stock < 0) {
      setFormError("Le stock doit être un entier positif ou nul.");
      return;
    }
    if (promo_price !== null && (isNaN(promo_price) || promo_price < 0)) {
      setFormError("Le prix promo doit être un nombre positif.");
      return;
    }
    if (promo_price !== null && promo_price > price) {
      setFormError("Le prix promo ne peut pas être supérieur au prix standard.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      price: price,
      promo_price: promo_price,
      stock: stock,
      image_url: formData.image_url.trim(),
      category_id: formData.category_id ? Number(formData.category_id) : null,
      is_available: formData.is_available,
    };

    setFormLoading(true);
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        showToast("Produit modifié avec succès !");
      } else {
        await api.post("/products/", payload);
        showToast("Nouveau produit ajouté au catalogue !");
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(err?.response?.data?.detail || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleAvailability = async (product) => {
    try {
      await api.patch(`/products/${product.id}/availability`);
      showToast(
        product.is_available
          ? `"${product.name}" est maintenant masqué de la boutique.`
          : `"${product.name}" est maintenant visible à la vente !`
      );
      loadData();
    } catch (err) {
      console.error(err);
      showToast("Impossible de modifier la disponibilité.", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    setFormLoading(true);
    try {
      await api.delete(`/products/${deleteCandidate.id}`);
      showToast("Produit supprimé avec succès.");
      setDeleteCandidate(null);
      loadData();
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.detail ||
        "Impossible de supprimer ce produit. Il est probablement rattaché à une commande passée.";
      showToast(msg, "error");
      setDeleteCandidate(null);
    } finally {
      setFormLoading(false);
    }
  };

  const getCategoryName = (catId) => {
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.name : "Sans catégorie";
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border flex items-center gap-3 transition-all ${
            toast.type === "error"
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-emerald-50 text-emerald-800 border-emerald-200"
          }`}
        >
          <span>{toast.type === "error" ? "⚠️" : "✅"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">Gestion des Produits</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gérez votre catalogue, les stocks, les tarifs et la visibilité de vos articles.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm transition"
        >
          <span>+</span> Ajouter un produit
        </button>
      </div>

      {/* Quick Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Articles</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">{totalCount}</p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase">En vente</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {products.filter((p) => p.is_available).length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-600 uppercase">Stock Faible (≤5)</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {products.filter((p) => p.stock > 0 && p.stock <= 5).length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-rose-600 uppercase">En Rupture</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {products.filter((p) => p.stock === 0).length}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <input
              type="text"
              placeholder="Rechercher par nom ou description..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            >
              <option value="">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Filter */}
          <div>
            <select
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            >
              <option value="all">Tous les stocks</option>
              <option value="in_stock">En stock (&gt; 5)</option>
              <option value="low_stock">Stock faible (1 à 5)</option>
              <option value="out_of_stock">En rupture (0)</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            >
              <option value="newest">Plus récents (serveur)</option>
              <option value="price_asc">Prix croissant (serveur)</option>
              <option value="price_desc">Prix décroissant (serveur)</option>
            </select>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Disponibilité :</span>
            {["all", "available", "hidden"].map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  setAvailabilityFilter(opt);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  availabilityFilter === opt
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {opt === "all" ? "Tous" : opt === "available" ? "En vente" : "Masqués"}
              </button>
            ))}
          </div>

          <span className="text-slate-400 font-medium">
            {totalCount} produit(s) — pagination serveur
          </span>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Chargement des produits en cours...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="text-3xl block mb-2">📦</span>
            <p className="font-semibold text-slate-700">Aucun produit ne correspond à vos critères.</p>
            <p className="text-xs text-slate-400 mt-1">Essayez de modifier votre recherche ou vos filtres.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-semibold">Produit</th>
                  <th className="py-3 px-4 font-semibold">Catégorie</th>
                  <th className="py-3 px-4 font-semibold">Prix</th>
                  <th className="py-3 px-4 font-semibold">Stock</th>
                  <th className="py-3 px-4 font-semibold">Visibilité</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition">
                    {/* Product info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            className="w-11 h-11 rounded-xl object-cover border border-slate-200/80 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 text-base">
                            📦
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-ink text-sm truncate max-w-xs">{p.name}</p>
                          <p className="text-xs text-slate-400 truncate max-w-xs">
                            {p.description || "Aucune description"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/60">
                        {getCategoryName(p.category_id)}
                      </span>
                    </td>

                    {/* Price & Promo */}
                    <td className="py-3.5 px-4">
                      {p.promo_price ? (
                        <div>
                          <span className="font-bold text-brand-700 text-sm">{p.promo_price.toFixed(2)} DT</span>
                          <span className="block text-xs text-slate-400 line-through">
                            {p.price.toFixed(2)} DT
                          </span>
                        </div>
                      ) : (
                        <span className="font-bold text-ink text-sm">{p.price.toFixed(2)} DT</span>
                      )}
                    </td>

                    {/* Stock */}
                    <td className="py-3.5 px-4">
                      {p.stock === 0 ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Rupture (0)
                        </span>
                      ) : p.stock <= 5 ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Critique ({p.stock})
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {p.stock} unités
                        </span>
                      )}
                    </td>

                    {/* Availability toggle */}
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleAvailability(p)}
                        title="Cliquer pour basculer"
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                          p.is_available
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                        }`}
                      >
                        {p.is_available ? "✓ En vente" : "✕ Masqué"}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(p)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => setDeleteCandidate(p)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {currentPage} sur {totalPages} ({totalCount} articles)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
              >
                Précédent
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg font-semibold transition ${
                    currentPage === page
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-xl font-bold text-ink">
                {editingProduct ? "Modifier le produit" : "Ajouter un nouveau produit"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg p-1"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="mt-6 space-y-4">
              {/* Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nom de l'article *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ex. Montre Connectée Fit"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Catégorie
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden bg-white"
                  >
                    <option value="">Sélectionner une catégorie...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Prices and Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Prix standard (DT) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Prix Promo (optionnel)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.promo_price}
                    onChange={(e) => setFormData({ ...formData, promo_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Stock disponible *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Image URL with live preview */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  URL de l'image
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://..."
                    className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                  />
                  {formData.image_url && (
                    <img
                      src={formData.image_url}
                      alt="Aperçu"
                      onError={(e) => (e.target.style.display = "none")}
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Description détaillée
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Caractéristiques, matière, utilisation..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                />
              </div>

              {/* Visibility Checkbox */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_available_input"
                  checked={formData.is_available}
                  onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                />
                <label htmlFor="is_available_input" className="text-sm font-medium text-slate-700 select-none">
                  Rendre ce produit visible et disponible à la vente immédiatement
                </label>
              </div>

              {/* Form Buttons */}
              <div className="pt-5 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-6 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
                >
                  {formLoading
                    ? "Enregistrement..."
                    : editingProduct
                    ? "Sauvegarder les modifications"
                    : "Créer le produit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold mb-4">
              🗑️
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Supprimer le produit ?</h2>
            <p className="text-sm text-slate-500 mt-2">
              Êtes-vous sûr de vouloir supprimer définitivement <strong>"{deleteCandidate.name}"</strong> ?
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3">
              ℹ️ Note : Si cet article a déjà été commandé par des clients, la suppression sera bloquée pour préserver l'historique comptable. Vous pourrez le masquer de la vente.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={formLoading}
                className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {formLoading ? "Suppression..." : "Confirmer la suppression"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
