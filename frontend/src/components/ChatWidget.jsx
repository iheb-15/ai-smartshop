import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../api/client";
import { getSessionId } from "../lib/session";
import { useAuth } from "../context/AuthContext";

const WELCOME = {
  role: "assistant",
  content: "Bonjour ! Je suis votre assistant d'achat. Décrivez ce que vous cherchez (produit, budget, catégorie), demandez les promotions ou le suivi de vos commandes.",
  suggestions: ["Quelles sont les promotions ?", "Un cadeau sport à moins de 100 DT", "Que me recommandez-vous ?", "Où en est ma commande ?"],
};

function ProductMiniCard({ p }) {
  const price = p.effective_price != null ? p.effective_price : p.price;
  return (
    <Link
      to={`/product/${p.id}`}
      className="flex items-center gap-2 bg-white border border-brand-100 rounded-xl p-1.5 hover:border-brand-400 transition min-w-0"
    >
      <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-brand-50" onError={(e) => { e.currentTarget.src = "/favicon.svg"; }} />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-ink truncate">{p.name}</p>
        <p className="text-[11px] text-brand-700 font-bold">
          {price} DT {price < p.price && <span className="text-ink/40 line-through font-normal">{p.price} DT</span>}
          {p.stock <= 0 && <span className="text-rose-500 ml-1">rupture</span>}
        </p>
      </div>
    </Link>
  );
}

export default function ChatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(null); // llm | fallback
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, loading]);

  // Restaure la conversation de la session (persistée côté serveur)
  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoaded(true);
    api
      .get("/ai/chat/history", { params: { session_id: getSessionId(), limit: 20 } })
      .then((res) => {
        const hist = (res.data || []).map((m) => ({ role: m.role, content: m.content }));
        if (hist.length) setMessages([WELCOME, ...hist]);
      })
      .catch(() => {});
    api.get("/ai/status").then((res) => setMode(res.data.features?.chatbot || null)).catch(() => {});
  }, [open, historyLoaded]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setMessages((m) => [...m, { role: "user", content }]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.post("/ai/chat", { session_id: getSessionId(), message: content });
      const data = res.data;
      setMode(data.mode);
      setMessages((m) => [...m, { role: "assistant", content: data.reply, products: data.products || [], suggestions: data.suggestions || [] }]);
      if ((data.actions || []).includes("cart_updated")) window.dispatchEvent(new Event("cart:updated"));
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: err?.response?.data?.detail || "Désolé, le service est momentanément indisponible. Réessayez dans un instant." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (location.pathname.startsWith("/admin")) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 print:hidden">
      {open && (
        <div className="mb-3 w-[22rem] max-w-[calc(100vw-3rem)] h-[32rem] max-h-[calc(100vh-7rem)] bg-white rounded-2xl shadow-2xl border border-brand-100 flex flex-col overflow-hidden">
          <div className="bg-brand-600 text-white px-4 py-3 text-sm flex items-center justify-between">
            <div>
              <p className="font-semibold leading-tight">Assistant d'achat IA</p>
              <p className="text-[10px] text-white/70">
                {mode === "llm" ? "Propulsé par Claude • outils connectés au catalogue" : mode === "fallback" ? "Mode assisté (règles) • clé IA non configurée" : user ? `Connecté : ${user.full_name?.split(" ")[0]}` : "Visiteur"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white" aria-label="Fermer">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-brand-50/40">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}>
                <div
                  className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm whitespace-pre-line ${
                    m.role === "user" ? "bg-brand-600 text-white rounded-br-sm" : "bg-white text-ink border border-brand-100 rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
                {m.products?.length > 0 && (
                  <div className="grid grid-cols-1 gap-1.5 w-[88%]">
                    {m.products.slice(0, 4).map((p) => (
                      <ProductMiniCard key={p.id} p={p} />
                    ))}
                  </div>
                )}
                {m.suggestions?.length > 0 && i === messages.length - 1 && !loading && (
                  <div className="flex flex-wrap gap-1.5 w-[88%]">
                    {m.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-brand-200 text-brand-700 hover:bg-brand-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="text-xs text-ink/40 px-2 flex items-center gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:150ms]">●</span>
                <span className="animate-pulse [animation-delay:300ms]">●</span>
                <span className="ml-1">L'assistant réfléchit…</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-2 border-t border-brand-100 flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez une question…"
              className="flex-1 text-sm px-3 py-2 rounded-full border border-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button type="submit" disabled={loading} className="bg-brand-600 text-white text-sm px-4 rounded-full hover:bg-brand-700 disabled:opacity-50">
              →
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-brand-600 text-white shadow-xl hover:bg-brand-700 flex items-center justify-center text-2xl"
        aria-label="Ouvrir l'assistant"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
