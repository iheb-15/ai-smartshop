// Identifiant de session anonyme (persisté dans le navigateur) : relie les événements
// comportementaux et les conversations du chatbot d'un même visiteur, connecté ou non.
export function getSessionId() {
  let id = localStorage.getItem("chat_session_id");
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("chat_session_id", id);
  }
  return id;
}

export function formatPrice(value) {
  const n = Number(value || 0);
  return `${n.toFixed(n % 1 === 0 ? 0 : 2)} DT`;
}
