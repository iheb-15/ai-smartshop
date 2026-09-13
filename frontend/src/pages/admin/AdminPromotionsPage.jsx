import { useEffect, useState, useMemo } from "react";
import api from "../../api/client";

export default function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all, active, inactive

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  // Form State
  const initialForm = {
    name: "",
    discount_percent: "15",
    target_type: "product", // product, category, all
    product_id: "",
    category_id: "",
    starts_at: "",
    ends_at: "",
    is_active: true,
  };
  const [formData, setFormData] = useState(initialForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [promRes, prodRes, catRes] = await Promise.all([
        api.get("/promotions/"),
        api.get("/products/"),
        api.get("/categories/"),
      ]);
      setPromotions(promRes.data);
      setProducts(prodRes.data);
      setCategories(catRes.data);
    } catch (err) {
      console.error(err);
      showToast("Impossible de charger les promotions.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getTemporalStatus = (promo) => {
    if (!promo.is_active) return { label: "Désactivée", color: "bg-slate-100 text-slate-500 border-slate-200" };
    const now = new Date();
    if (promo.starts_at && new Date(promo.starts_at) > now) {
      return { label: "À venir", color: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    if (promo.ends_at && new Date(promo.ends_at) < now) {
      return { label: "Expirée", color: "bg-rose-50 text-rose-700 border-rose-200" };
    }
    return { label: "En cours", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  };

  const filteredPromotions = useMemo(() => {
    return promotions.filter((p) => {
      const query = search.toLowerCase();
      const nameMatch = p.name.toLowerCase().includes(query);
      const targetMatch =
        (p.product_name && p.product_name.toLowerCase().includes(query)) ||
        (p.category_name && p.category_name.toLowerCase().includes(query));

      const matchesSearch = !query || nameMatch || targetMatch;

      let matchesStatus = true;
      if (statusFilter === "active") matchesStatus = p.is_active === true;
      else if (statusFilter === "inactive") matchesStatus = p.is_active === false;

      return matchesSearch && matchesStatus;
    });
  }, [promotions, search, statusFilter]);

  const openCreateModal = () => {
    setEditingPromotion(null);
    setFormData(initialForm);
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (promo) => {
    setEditingPromotion(promo);
    let target_type = "all";
    if (promo.product_id) target_type = "product";
    else if (promo.category_id) target_type = "category";

    setFormData({
      name: promo.name,
      discount_percent: promo.discount_percent.toString(),
      target_type,
      product_id: promo.product_id ? promo.product_id.toString() : "",
      category_id: promo.category_id ? promo.category_id.toString() : "",
      starts_at: promo.starts_at ? promo.starts_at.slice(0, 16) : "",
      ends_at: promo.ends_at ? promo.ends_at.slice(0, 16) : "",
      is_active: promo.is_active,
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleToggleActive = async (promo) => {
    try {
      await api.patch(`/promotions/${promo.id}/toggle-active`);
      showToast(
        promo.is_active
          ? `La promotion "${promo.name}" a été désactivée.`
          : `La promotion "${promo.name}" est désormais active !`
      );
      loadData();
    } catch (err) {
      console.error(err);
      showToast("Impossible de modifier l'état de la promotion.", "error");
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const discount = parseFloat(formData.discount_percent);
    if (isNaN(discount) || discount <= 0 || discount > 100) {
      setFormError("La réduction doit être comprise entre 1% et 100%.");
      return;
    }

    if (formData.starts_at && formData.ends_at && new Date(formData.ends_at) <= new Date(formData.starts_at)) {
      setFormError("La date de fin doit être postérieure à la date de début.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      discount_percent: discount,
      starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : null,
      ends_at: formData.ends_at ? new Date(formData.ends_at).toISOString() : null,
      is_active: formData.is_active,
      product_id: formData.target_type === "product" && formData.product_id ? Number(formData.product_id) : null,
      category_id: formData.target_type === "category" && formData.category_id ? Number(formData.category_id) : null,
    };

    if (formData.target_type === "product" && !payload.product_id) {
      setFormError("Veuillez sélectionner un produit cible.");
      return;
    }
    if (formData.target_type === "category" && !payload.category_id) {
      setFormError("Veuillez sélectionner une catégorie cible.");
      return;
    }

    setFormLoading(true);
    try {
      if (editingPromotion) {
        await api.put(`/promotions/${editingPromotion.id}`, payload);
        showToast("Promotion modifiée avec succès !");
      } else {
        await api.post("/promotions/", payload);
        showToast("Nouvelle promotion enregistrée !");
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(err?.response?.data?.detail || "Une erreur est survenue.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    setFormLoading(true);
    try {
      await api.delete(`/promotions/${deleteCandidate.id}`);
      showToast("Promotion supprimée avec succès.");
      setDeleteCandidate(null);
      loadData();
    } catch (err) {
      console.error(err);
      showToast(err?.response?.data?.detail || "Impossible de supprimer la promotion.", "error");
      setDeleteCandidate(null);
    } finally {
      setFormLoading(false);
    }
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Gestion des Promotions & Réductions
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Créez des remises attractives sur des produits précis ou sur des catégories entières pour stimuler les ventes.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm transition"
        >
          <span>+</span> Nouvelle promotion
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Offres</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">{promotions.length}</p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase">En Cours</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {promotions.filter((p) => getTemporalStatus(p).label === "En cours").length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-blue-600 uppercase">À Venir</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {promotions.filter((p) => getTemporalStatus(p).label === "À venir").length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Désactivées / Expirées</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {promotions.filter((p) => !p.is_active || getTemporalStatus(p).label === "Expirée").length}
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <input
            type="text"
            placeholder="Rechercher par nom d'offre, produit ou catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Statut :</span>
          {["all", "active", "inactive"].map((opt) => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === opt
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {opt === "all" ? "Toutes" : opt === "active" ? "Actives" : "Inactives"}
            </button>
          ))}
        </div>
      </div>

      {/* Promotions Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Chargement des promotions...
          </div>
        ) : filteredPromotions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="text-3xl block mb-2">🎟️</span>
            <p className="font-semibold text-slate-700">Aucune promotion enregistrée.</p>
            <p className="text-xs text-slate-400 mt-1">Créez votre première opération commerciale.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-6 font-semibold">Promotion</th>
                  <th className="py-3.5 px-6 font-semibold">Réduction</th>
                  <th className="py-3.5 px-6 font-semibold">Cible</th>
                  <th className="py-3.5 px-6 font-semibold">Période</th>
                  <th className="py-3.5 px-6 font-semibold">État</th>
                  <th className="py-3.5 px-6 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPromotions.map((p) => {
                  const temporal = getTemporalStatus(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition">
                      {/* Name */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-sm">
                            🏷️
                          </span>
                          <div>
                            <p className="font-semibold text-ink text-sm">{p.name}</p>
                            <p className="text-xs text-slate-400">Réf. promo #{p.id}</p>
                          </div>
                        </div>
                      </td>

                      {/* Discount Badge */}
                      <td className="py-4 px-6">
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          -{p.discount_percent}%
                        </span>
                      </td>

                      {/* Target */}
                      <td className="py-4 px-6 text-xs">
                        {p.product_name ? (
                          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                            📦 Produit : {p.product_name}
                          </span>
                        ) : p.category_name ? (
                          <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                            🏷️ Catégorie : {p.category_name}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                            🌐 Tout le catalogue
                          </span>
                        )}
                      </td>

                      {/* Dates */}
                      <td className="py-4 px-6 text-xs text-slate-500">
                        {p.starts_at || p.ends_at ? (
                          <div className="space-y-0.5">
                            {p.starts_at && (
                              <p>Du {new Date(p.starts_at).toLocaleDateString("fr-FR")}</p>
                            )}
                            {p.ends_at && (
                              <p>Au {new Date(p.ends_at).toLocaleDateString("fr-FR")}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Illimitée</span>
                        )}
                      </td>

                      {/* Status / Toggle */}
                      <td className="py-4 px-6">
                        <button
                          onClick={() => handleToggleActive(p)}
                          title="Cliquer pour basculer"
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${temporal.color} hover:opacity-80`}
                        >
                          {p.is_active ? "✓ " : "✕ "}
                          {temporal.label}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(p)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-xl font-bold text-ink">
                {editingPromotion ? "Modifier la promotion" : "Nouvelle promotion"}
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
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nom de la promotion *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ex. Soldes de Printemps, Promo Rentrée..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                />
              </div>

              {/* Discount Percentage */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Pourcentage de réduction (%) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    required
                    value={formData.discount_percent}
                    onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden pr-10"
                  />
                  <span className="absolute right-3.5 top-2.5 font-bold text-slate-400 text-sm">%</span>
                </div>
              </div>

              {/* Target Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ciblage de la promotion
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  {[
                    { type: "product", label: "📦 Un produit" },
                    { type: "category", label: "🏷️ Une catégorie" },
                    { type: "all", label: "🌐 Tout le site" },
                  ].map((target) => (
                    <button
                      type="button"
                      key={target.type}
                      onClick={() => setFormData({ ...formData, target_type: target.type })}
                      className={`py-2 px-2 rounded-xl border font-semibold text-center transition ${
                        formData.target_type === target.type
                          ? "bg-brand-50 border-brand-300 text-brand-700 shadow-xs"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {target.label}
                    </button>
                  ))}
                </div>

                {formData.target_type === "product" && (
                  <select
                    value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden bg-white"
                  >
                    <option value="">Sélectionner un produit...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.price.toFixed(2)} DT)
                      </option>
                    ))}
                  </select>
                )}

                {formData.target_type === "category" && (
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
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Date de début (optionnel)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.starts_at}
                    onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:border-brand-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Date de fin (optionnel)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.ends_at}
                    onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:border-brand-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="promo_active_toggle"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                />
                <label htmlFor="promo_active_toggle" className="text-sm font-medium text-slate-700 select-none">
                  Activer immédiatement cette promotion
                </label>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
                >
                  {formLoading
                    ? "Enregistrement..."
                    : editingPromotion
                    ? "Mettre à jour"
                    : "Créer la promotion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold mb-4">
              🗑️
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Supprimer la promotion ?</h2>
            <p className="text-sm text-slate-500 mt-2">
              Êtes-vous sûr de vouloir supprimer l'offre promotionnelle <strong>"{deleteCandidate.name}"</strong> (-{deleteCandidate.discount_percent}%) ?
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
