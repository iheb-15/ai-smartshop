import api from "../api/client";
import { getSessionId } from "./session";

// Envoi « fire-and-forget » d'un événement comportemental (vue produit, etc.).
// Les ajouts panier, achats, favoris, recherches et avis sont journalisés côté serveur.
export function trackEvent(event_type, { product_id = null, query = null, value = null } = {}) {
  const payload = { event_type, session_id: getSessionId() };
  if (product_id != null) payload.product_id = product_id;
  if (query) payload.query = query;
  if (value != null) payload.value = value;
  api.post("/events/", payload).catch(() => {});
}
