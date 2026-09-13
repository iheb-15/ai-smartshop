import { useEffect, useState } from "react";
import api from "../../api/client";
import AdminUserDetail from "./AdminUserDetail";
import { useAuth } from "../../context/AuthContext";

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // all, admin, client
  const [statusFilter, setStatusFilter] = useState("all"); // all, active, inactive

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Detail drawer (fiche client)
  const [detailUserId, setDetailUserId] = useState(null);

  // Modals & Actions
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [roleCandidate, setRoleCandidate] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadUsers = async (opts = {}) => {
    const page = opts.page ?? currentPage;
    const q = opts.q ?? debouncedSearch;
    const role = opts.role ?? roleFilter;
    const status = opts.status ?? statusFilter;
    setLoading(true);
    setFetchError("");
    try {
      const params = {
        skip: (page - 1) * itemsPerPage,
        limit: itemsPerPage,
      };
      if (q && q.trim()) params.q = q.trim();
      if (role !== "all") params.role = role;
      if (status === "active") params.is_active = true;
      else if (status === "inactive") params.is_active = false;
      const res = await api.get("/auth/users", { params });
      setUsers(Array.isArray(res.data) ? res.data : []);
      const headerTotal = Number(res.headers?.["x-total-count"]);
      setTotalCount(Number.isFinite(headerTotal) ? headerTotal : (res.data || []).length);
    } catch (err) {
      console.error(err);
      const statusCode = err?.response?.status;
      const detail = err?.response?.data?.detail || "";
      if (statusCode === 401) {
        setFetchError("Session expirée — reconnectez-vous en admin.");
      } else if (statusCode === 403) {
        setFetchError("Accès refusé — ce compte n'est pas administrateur.");
      } else if (!err?.response) {
        setFetchError("Backend injoignable — vérifiez que uvicorn tourne sur http://127.0.0.1:8000 et VITE_API_URL.");
      } else {
        setFetchError(detail || "Impossible de charger la liste des utilisateurs.");
      }
      showToast(detail || "Impossible de charger la liste des utilisateurs.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Chargement initial unique
  useEffect(() => {
    loadUsers({ page: 1, q: "", role: "all", status: "all" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce recherche serveur
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    // Ignore le tout premier rendu (déjà chargé ci-dessus) pour éviter double appel
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, roleFilter, statusFilter, currentPage]);

  const filteredUsers = users;
  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;

  const handleToggleStatus = async (targetUser) => {
    if (targetUser.id === currentUser?.id && targetUser.is_active) {
      showToast("Vous ne pouvez pas désactiver votre propre compte administrateur.", "error");
      return;
    }

    try {
      const updated = await api.patch(`/auth/users/${targetUser.id}`, {
        is_active: !targetUser.is_active,
      });
      showToast(
        updated.data.is_active
          ? `Le compte de ${targetUser.full_name} a été activé.`
          : `Le compte de ${targetUser.full_name} a été désactivé.`
      );
      loadUsers();
    } catch (err) {
      console.error(err);
      showToast(err?.response?.data?.detail || "Impossible de modifier le statut.", "error");
    }
  };

  const handleConfirmRoleChange = async () => {
    if (!roleCandidate) return;
    if (roleCandidate.user.id === currentUser?.id && !roleCandidate.newRole) {
      showToast("Vous ne pouvez pas révoquer vos propres privilèges administrateur.", "error");
      setRoleCandidate(null);
      return;
    }

    setActionLoading(true);
    try {
      await api.patch(`/auth/users/${roleCandidate.user.id}`, {
        is_admin: roleCandidate.newRole,
      });
      showToast(
        roleCandidate.newRole
          ? `${roleCandidate.user.full_name} est désormais Administrateur.`
          : `${roleCandidate.user.full_name} a été repassé au rôle Client.`
      );
      setRoleCandidate(null);
      loadUsers();
    } catch (err) {
      console.error(err);
      showToast(err?.response?.data?.detail || "Impossible de modifier le rôle.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteCandidate) return;
    setActionLoading(true);
    try {
      await api.delete(`/auth/users/${deleteCandidate.id}`);
      showToast(`Le compte de ${deleteCandidate.full_name} a été supprimé.`);
      setDeleteCandidate(null);
      loadUsers();
    } catch (err) {
      console.error(err);
      showToast(
        err?.response?.data?.detail || "Impossible de supprimer ce compte utilisateur.",
        "error"
      );
      setDeleteCandidate(null);
    } finally {
      setActionLoading(false);
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
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
          Gestion des Clients & Utilisateurs
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Supervisez vos clients, leurs commandes, attribuez les rôles administrateurs et gérez les accès.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Inscrits</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">{totalCount}</p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-blue-600 uppercase">Clients (page)</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {users.filter((u) => !u.is_admin).length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-purple-600 uppercase">Admins (page)</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {users.filter((u) => u.is_admin).length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold text-rose-600 uppercase">Inactifs (page)</span>
          <p className="font-display text-xl font-bold text-ink mt-0.5">
            {users.filter((u) => !u.is_active).length}
          </p>
        </div>
      </div>

      {/* Debug connexion (masqué si OK) */}
      {fetchError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800">
          <p className="font-bold mb-1">Diagnostic connexion admin :</p>
          <p>API = {api.defaults.baseURL} • Token présent = {localStorage.getItem("token") ? "oui" : "non"} • user = {currentUser ? `${currentUser.email} (admin=${String(currentUser.is_admin)})` : "non connecté"}</p>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Rechercher par nom ou email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            >
              <option value="all">Tous les rôles</option>
              <option value="client">Clients uniquement</option>
              <option value="admin">Administrateurs uniquement</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Comptes Actifs</option>
              <option value="inactive">Comptes Désactivés</option>
            </select>
          </div>

          {/* Sort info */}
          <div className="text-xs text-slate-400">
            Tri serveur : plus récents d'abord
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
          <span>{totalCount} utilisateur(s) trouvé(s) — pagination serveur</span>
          <span>Les mots de passe sont cryptés et protégés.</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Chargement des utilisateurs...
          </div>
        ) : fetchError ? (
          <div className="p-12 text-center">
            <span className="text-3xl block mb-2">⚠️</span>
            <p className="font-semibold text-rose-600">{fetchError}</p>
            <p className="text-xs text-slate-400 mt-2">
              API : {api.defaults.baseURL} — connectez-vous avec admin@shop.com / admin123
            </p>
            <button
              onClick={() => loadUsers({ page: 1, q: "", role: "all", status: "all" })}
              className="mt-4 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition"
            >
              Réessayer
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="text-3xl block mb-2">👥</span>
            <p className="font-semibold text-slate-700">Aucun utilisateur trouvé.</p>
            <p className="text-xs text-slate-400 mt-1">Modifiez vos critères de recherche.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-6 font-semibold">Utilisateur</th>
                  <th className="py-3.5 px-6 font-semibold">Rôle</th>
                  <th className="py-3.5 px-6 font-semibold">Statut Compte</th>
                  <th className="py-3.5 px-6 font-semibold">Commandes</th>
                  <th className="py-3.5 px-6 font-semibold">Inscription</th>
                  <th className="py-3.5 px-6 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition">
                      {/* Name & Email */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                              u.is_admin
                                ? "bg-purple-100 text-purple-700"
                                : "bg-brand-100 text-brand-700"
                            }`}
                          >
                            {u.full_name?.charAt(0) || "U"}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-ink text-sm flex items-center gap-2">
                              <span>{u.full_name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                  Vous
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-6">
                        {u.is_admin ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <span>👑</span> ADMIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <span>🛍️</span> CLIENT
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6">
                        <button
                          onClick={() => handleToggleStatus(u)}
                          disabled={isCurrent}
                          title={isCurrent ? "Action désactivée pour votre propre compte" : "Cliquer pour basculer"}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                            isCurrent ? "cursor-not-allowed opacity-80" : "cursor-pointer"
                          } ${
                            u.is_active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                          }`}
                        >
                          {u.is_active ? "● Actif" : "○ Désactivé"}
                        </button>
                      </td>

                      {/* Orders Count */}
                      <td className="py-4 px-6 text-xs text-slate-600 font-medium">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-semibold text-slate-700">
                          {u.orders_count || 0} commande(s)
                        </span>
                      </td>

                      {/* Registration Date */}
                      <td className="py-4 px-6 text-xs text-slate-500">
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "Démo"}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => setDetailUserId(u.id)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 transition"
                        >
                          Fiche client
                        </button>
                        {/* Change Role Button */}
                        {!isCurrent && (
                          <button
                            onClick={() =>
                              setRoleCandidate({ user: u, newRole: !u.is_admin })
                            }
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                          >
                            {u.is_admin ? "Rétrograder Client" : "Promouvoir Admin"}
                          </button>
                        )}

                        {/* Delete Button */}
                        {!isCurrent && (
                          <button
                            onClick={() => setDeleteCandidate(u)}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                          >
                            Supprimer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {currentPage} sur {totalPages} ({totalCount} utilisateurs)
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

      {/* Role Change Confirmation Modal */}
      {roleCandidate && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold mb-4">
              👑
            </div>
            <h2 className="font-display text-xl font-bold text-ink">
              {roleCandidate.newRole ? "Promouvoir Administrateur ?" : "Rétrograder en Client ?"}
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              Voulez-vous modifier le rôle de <strong>{roleCandidate.user.full_name}</strong> en{" "}
              <strong>{roleCandidate.newRole ? "ADMINISTRATEUR" : "CLIENT"}</strong> ?
            </p>
            {roleCandidate.newRole && (
              <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-xl p-3 mt-3">
                ⚠️ Un administrateur a un accès complet à l'ensemble du tableau de bord, aux commandes et aux finances.
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRoleCandidate(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmRoleChange}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
              >
                {actionLoading ? "Modification..." : "Confirmer le changement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold mb-4">
              🗑️
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Supprimer l'utilisateur ?</h2>
            <p className="text-sm text-slate-500 mt-2">
              Êtes-vous sûr de vouloir supprimer le compte de <strong>{deleteCandidate.full_name}</strong> ({deleteCandidate.email}) ?
            </p>

            {(deleteCandidate.orders_count || 0) > 0 ? (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed font-medium">
                ⚠️ <strong>Commandes existantes :</strong> Cet utilisateur a passé{" "}
                <strong>{deleteCandidate.orders_count} commande(s)</strong>. Pour des raisons comptables, ce compte ne peut être supprimé. Vous pouvez désactiver son accès en cliquant sur son statut "Actif".
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-3">
                Cet utilisateur n'a aucune commande enregistrée. Son compte sera effacé définitivement.
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
              {(deleteCandidate.orders_count || 0) === 0 && (
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition"
                >
                  {actionLoading ? "Suppression..." : "Confirmer la suppression"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fiche client drawer */}
      {detailUserId && (
        <AdminUserDetail userId={detailUserId} onClose={() => setDetailUserId(null)} />
      )}
    </div>
  );
}
