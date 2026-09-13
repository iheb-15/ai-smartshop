import { useEffect, useState, useMemo } from "react";
import api from "../../api/client";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await api.get("/categories/");
      setCategories(res.data);
    } catch (err) {
      console.error(err);
      showToast("Impossible de charger les catégories.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [categories, search]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({ name: "", description: "" });
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (cat) => {
    setEditingCategory(cat);
    setFormData({ name: cat.name, description: cat.description || "" });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const name = formData.name.trim();
    if (!name) {
      setFormError("Le nom de la catégorie est obligatoire.");
      return;
    }

    setFormLoading(true);
    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, {
          name,
          description: formData.description.trim(),
        });
        showToast("Catégorie modifiée avec succès !");
      } else {
        await api.post("/categories/", {
          name,
          description: formData.description.trim(),
        });
        showToast("Nouvelle catégorie créée avec succès !");
      }
      setIsModalOpen(false);
      loadCategories();
    } catch (err) {
      console.error(err);
      setFormError(
        err?.response?.data?.detail || "Une erreur est survenue lors de l'enregistrement."
      );
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    setFormLoading(true);
    try {
      await api.delete(`/categories/${deleteCandidate.id}`);
      showToast("Catégorie supprimée avec succès.");
      setDeleteCandidate(null);
      loadCategories();
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.detail ||
        "Impossible de supprimer cette catégorie car elle contient des produits.";
      showToast(msg, "error");
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
            Gestion des Catégories
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Organisez votre catalogue en rayons thématiques pour faciliter la navigation et le filtrage des clients.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm transition"
        >
          <span>+</span> Nouvelle catégorie
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Catégories</span>
          <p className="font-display text-2xl font-bold text-ink mt-1">{categories.length}</p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase">Avec articles</span>
          <p className="font-display text-2xl font-bold text-ink mt-1">
            {categories.filter((c) => (c.product_count || 0) > 0).length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Catégories Vides</span>
          <p className="font-display text-2xl font-bold text-ink mt-1">
            {categories.filter((c) => !c.product_count || c.product_count === 0).length}
          </p>
        </div>
      </div>

      {/* Search Filter */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Rechercher une catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
        </div>
        <span className="text-xs text-slate-400 font-medium">
          {filteredCategories.length} catégorie(s)
        </span>
      </div>

      {/* Categories Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Chargement des catégories...
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="text-3xl block mb-2">🏷️</span>
            <p className="font-semibold text-slate-700">Aucune catégorie trouvée.</p>
            <p className="text-xs text-slate-400 mt-1">
              {search ? "Essayez une autre recherche." : "Créez votre première catégorie dès maintenant."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-6 font-semibold">Nom de la Catégorie</th>
                  <th className="py-3.5 px-6 font-semibold">Description</th>
                  <th className="py-3.5 px-6 font-semibold">Articles associés</th>
                  <th className="py-3.5 px-6 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-4 px-6 font-semibold text-ink text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-bold">
                          🏷️
                        </span>
                        <span>{c.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-xs text-slate-500 max-w-md truncate">
                      {c.description || <span className="italic text-slate-300">Aucune description</span>}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${
                          (c.product_count || 0) > 0
                            ? "bg-brand-50 text-brand-700 border-brand-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {c.product_count || 0} article(s)
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(c)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => setDeleteCandidate(c)}
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
      </div>

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-xl font-bold text-ink">
                {editingCategory ? "Modifier la catégorie" : "Nouvelle catégorie"}
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
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nom de la catégorie *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ex. Électronique, Décoration, Chaussures..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Courte présentation de la catégorie..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-hidden"
                />
              </div>

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
                    : editingCategory
                    ? "Mettre à jour"
                    : "Créer la catégorie"}
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
              🏷️
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Supprimer la catégorie ?</h2>
            <p className="text-sm text-slate-500 mt-2">
              Êtes-vous sûr de vouloir supprimer la catégorie <strong>"{deleteCandidate.name}"</strong> ?
            </p>

            {(deleteCandidate.product_count || 0) > 0 ? (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed font-medium">
                ⚠️ <strong>Suppression impossible :</strong> Cette catégorie contient actuellement{" "}
                <strong>{deleteCandidate.product_count} produit(s)</strong>. Veuillez d'abord réassigner ou supprimer ces produits dans l'onglet Produits.
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-3">
                Cette catégorie ne contient aucun article. Sa suppression est sans danger pour votre catalogue.
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Annuler
              </button>
              {(deleteCandidate.product_count || 0) === 0 && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={formLoading}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition"
                >
                  {formLoading ? "Suppression..." : "Confirmer la suppression"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
