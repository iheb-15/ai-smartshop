import { useEffect, useState } from "react";
import api from "../../api/client";

const ALL_STATUSES = [
  { value: "PENDING", label: "En attente", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "CONFIRMED", label: "Confirmée", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { value: "PROCESSING", label: "En préparation", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "SHIPPED", label: "Expédiée", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "DELIVERED", label: "Livrée", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "CANCELLED", label: "Annulée", color: "bg-rose-50 text-rose-700 border-rose-200" },
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters (server-side)
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Pagination (server-side)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selected Order for Detail Modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalStatus, setModalStatus] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = {
        skip: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
      };
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo + "T23:59:59").toISOString();
      const res = await api.get("/orders/all", { params });
      setOrders(res.data);
      setTotalCount(Number(res.headers["x-total-count"] || res.data.length));
    } catch (err) {
      console.error(err);
      showToast("Impossible de charger les commandes.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce recherche + refetch serveur
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, dateFrom, dateTo, currentPage]);

  const getStatusBadge = (status) => {
    const s = (status || "").toUpperCase();
    const found = ALL_STATUSES.find((item) => item.value === s);
    return found ? found.color : "bg-slate-50 text-slate-700 border-slate-200";
  };

  const filteredOrders = orders;
  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
  const currentOrders = orders;

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.put(`/orders/${orderId}/status?status=${encodeURIComponent(newStatus)}`);
      showToast(`Statut de la commande #${orderId} mis à jour : ${newStatus}`);
      loadOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => ({ ...prev, status: newStatus }));
        setModalStatus(newStatus);
      }
    } catch (err) {
      console.error(err);
      showToast(err?.response?.data?.detail || "Erreur lors de la mise à jour du statut.", "error");
    }
  };

  const openOrderDetail = async (order) => {
    setSelectedOrder(order);
    setModalStatus((order.status || "PENDING").toUpperCase());
    // Recharge le détail enrichi (nom, image, catégorie, description) depuis le backend
    try {
      const res = await api.get(`/orders/${order.id}`);
      setSelectedOrder(res.data);
    } catch (err) {
      console.error("Détail commande non rechargé, affichage liste:", err);
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
          Gestion des Commandes
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Suivez l'état des livraisons, consultez le détail des paniers clients et gérez le cycle de vie des ventes.
        </p>
      </div>

      {/* Status KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Total</span>
          <p className="font-display text-lg font-bold text-ink mt-0.5">{orders.length}</p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase">En attente</span>
          <p className="font-display text-lg font-bold text-ink mt-0.5">
            {orders.filter((o) => (o.status || "").toUpperCase() === "PENDING").length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
          <span className="text-[10px] font-bold text-cyan-600 uppercase">Confirmées</span>
          <p className="font-display text-lg font-bold text-ink mt-0.5">
            {orders.filter((o) => ["CONFIRMED", "PAID"].includes((o.status || "").toUpperCase())).length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
          <span className="text-[10px] font-bold text-blue-600 uppercase">Expédiées</span>
          <p className="font-display text-lg font-bold text-ink mt-0.5">
            {orders.filter((o) => ["SHIPPED", "PROCESSING"].includes((o.status || "").toUpperCase())).length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase">Livrées</span>
          <p className="font-display text-lg font-bold text-ink mt-0.5">
            {orders.filter((o) => (o.status || "").toUpperCase() === "DELIVERED").length}
          </p>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
          <span className="text-[10px] font-bold text-rose-600 uppercase">Annulées</span>
          <p className="font-display text-lg font-bold text-ink mt-0.5">
            {orders.filter((o) => (o.status || "").toUpperCase() === "CANCELLED").length}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <input
              type="text"
              placeholder="Rechercher par #ID, nom de client ou email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            >
              <option value="all">Tous les statuts</option>
              {ALL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} ({s.value})
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
          </div>

          {/* Date To */}
          <div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
          <span>{totalCount} commande(s) trouvée(s) — filtre serveur</span>
          <span>Chiffre page courante : {orders.reduce((sum, o) => sum + (o.total || 0), 0).toFixed(2)} DT</span>
        </div>
      </div>

      {/* Print invoice button in detail modal handled below */}

      {/* Orders Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Chargement des commandes...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="text-3xl block mb-2">🛍️</span>
            <p className="font-semibold text-slate-700">Aucune commande trouvée.</p>
            <p className="text-xs text-slate-400 mt-1">Ajustez vos filtres de recherche.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-5 font-semibold">N° Commande</th>
                  <th className="py-3.5 px-5 font-semibold">Client</th>
                  <th className="py-3.5 px-5 font-semibold">Date</th>
                  <th className="py-3.5 px-5 font-semibold">Produits commandés</th>
                  <th className="py-3.5 px-5 font-semibold">Montant</th>
                  <th className="py-3.5 px-5 font-semibold">Statut</th>
                  <th className="py-3.5 px-5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-4 px-5 font-bold text-brand-700">
                      #{o.id}
                    </td>

                    {/* Customer */}
                    <td className="py-4 px-5">
                      <p className="font-semibold text-ink text-sm">
                        {o.user?.full_name || "Client anonyme"}
                      </p>
                      <p className="text-xs text-slate-400">{o.user?.email || "N/A"}</p>
                    </td>

                    {/* Date */}
                    <td className="py-4 px-5 text-xs text-slate-500">
                      {o.created_at
                        ? new Date(o.created_at).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "N/A"}
                    </td>

                    {/* Items detail : quels produits commandés + caractéristiques */}
                    <td className="py-4 px-5 min-w-[220px] max-w-[320px]">
                      {(o.items || []).length === 0 ? (
                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold">
                          Panier vide
                        </span>
                      ) : (
                        <div className="space-y-1.5">
                          {(o.items || []).slice(0, 3).map((item, idx) => {
                            const name =
                              item.product_name || item.product?.name || `Produit #${item.product_id}`;
                            const img = item.product_image || item.product?.image_url || "";
                            const cat = item.category_name || "";
                            return (
                              <div key={idx} className="flex items-center gap-2 min-w-0">
                                {img ? (
                                  <img
                                    src={img}
                                    alt=""
                                    className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-xs shrink-0">
                                    📦
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-ink truncate" title={name}>
                                    {name} <span className="text-slate-400 font-medium">x{item.quantity}</span>
                                  </p>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {cat ? `${cat} • ` : ""}
                                    {(item.unit_price || 0).toFixed(2)} DT / u
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          {(o.items || []).length > 3 && (
                            <p className="text-[11px] text-brand-600 font-semibold">
                              +{(o.items || []).length - 3} autre(s) article(s) — voir Détails
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 font-medium">
                            Total {(o.items || []).reduce((s, i) => s + (i.quantity || 0), 0)} unité(s) •{" "}
                            {(o.items || []).length} référence(s)
                          </p>
                        </div>
                      )}
                    </td>

                    {/* Total */}
                    <td className="py-4 px-5 font-bold text-ink text-sm">
                      {(o.total || 0).toFixed(2)} DT
                    </td>

                    {/* Status Dropdown */}
                    <td className="py-4 px-5">
                      <select
                        value={(o.status || "PENDING").toUpperCase()}
                        onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border focus:outline-hidden transition cursor-pointer ${getStatusBadge(
                          o.status
                        )}`}
                      >
                        {ALL_STATUSES.map((s) => (
                          <option key={s.value} value={s.value} className="bg-white text-ink">
                            {s.value} ({s.label})
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Action Button */}
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => openOrderDetail(o)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 transition"
                      >
                        Détails →
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
              Page {currentPage} sur {totalPages} ({totalCount} commandes)
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

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
                    Commande #{selectedOrder.id}
                  </h2>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusBadge(
                      selectedOrder.status
                    )}`}
                  >
                    {(selectedOrder.status || "PENDING").toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Passée le{" "}
                  {selectedOrder.created_at
                    ? new Date(selectedOrder.created_at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "N/A"}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600 text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Customer & Status Update Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
              {/* Customer Info Card */}
              <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  👤 Coordonnées Client
                </span>
                <p className="text-sm font-semibold text-ink">
                  {selectedOrder.user?.full_name || "Client Invité"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedOrder.user?.email || "Email non renseigné"}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Identifiant client : #{selectedOrder.user?.id || selectedOrder.user_id || "N/A"}
                </p>
              </div>

              {/* Status Update Card */}
              <div className="bg-brand-50/50 border border-brand-100 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-bold text-brand-800 uppercase tracking-wider block mb-2">
                    ⚡ Changer le statut
                  </span>
                  <select
                    value={modalStatus}
                    onChange={(e) => setModalStatus(e.target.value)}
                    className="w-full bg-white border border-brand-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-hidden"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.value} — {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedOrder.id, modalStatus)}
                  className="mt-3 w-full py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition"
                >
                  Appliquer le statut
                </button>
              </div>
            </div>

            {/* Order Items List */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                📦 Articles commandés ({(selectedOrder.items || []).length})
              </h3>

              <div className="border border-slate-200/80 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {(selectedOrder.items || []).length === 0 ? (
                  <p className="p-4 text-center text-xs text-slate-400">
                    Aucun détail d'article disponible pour cette commande.
                  </p>
                ) : (
                  selectedOrder.items.map((item, idx) => {
                    const name =
                      item.product_name || item.product?.name || `Produit #${item.product_id}`;
                    const img = item.product_image || item.product?.image_url || "";
                    const cat = item.category_name || "";
                    const desc =
                      item.product_description || item.product?.description || "";
                    const unit = Number(item.unit_price || 0);
                    return (
                      <div key={idx} className="p-3.5 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 text-lg">
                              📦
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">
                              {name}
                            </p>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                              Réf. produit #{item.product_id}
                              {cat ? ` • Catégorie : ${cat}` : ""}
                            </p>
                            {desc ? (
                              <p className="text-xs text-slate-500 mt-1 line-clamp-2" title={desc}>
                                {desc}
                              </p>
                            ) : null}
                            <p className="text-xs text-slate-400 mt-1">
                              Prix unitaire facturé : {unit.toFixed(2)} DT
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 block mb-1">
                            x {item.quantity}
                          </span>
                          <span className="text-sm font-bold text-ink">
                            {(unit * (item.quantity || 0)).toFixed(2)} DT
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="mt-6 pt-4 border-t border-slate-100 space-y-2 text-sm">
              <div className="flex justify-between text-slate-500 text-xs">
                <span>Sous-total articles</span>
                <span>{(selectedOrder.total || 0).toFixed(2)} DT</span>
              </div>
              <div className="flex justify-between text-slate-500 text-xs">
                <span>Frais de livraison</span>
                <span className="text-emerald-600 font-semibold">Gratuit</span>
              </div>
              <div className="flex justify-between text-base font-bold text-ink pt-2 border-t border-slate-100">
                <span>Montant Total TTC</span>
                <span className="text-brand-700 text-lg">
                  {(selectedOrder.total || 0).toFixed(2)} DT
                </span>
              </div>
            </div>

            {/* Close + print buttons */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
              >
                🖨 Imprimer la facture
              </button>
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
