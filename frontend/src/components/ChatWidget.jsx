import { useState, useRef, useEffect } from "react";
import api from "../api/client";

function getSessionId() {
  let id = localStorage.getItem("chat_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("chat_session_id", id);
  }
  return id;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Bonjour ! Je suis votre assistant d'achat. Que cherchez-vous aujourd'hui ?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.post("/ai/chat", {
        session_id: getSessionId(),
        message: userMsg.content,
      });
      setMessages((m) => [...m, { role: "assistant", content: res.data.reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Désolé, le service IA est indisponible pour le moment (clé API manquante ou erreur serveur).",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 w-80 h-[28rem] bg-white rounded-2xl shadow-2xl border border-brand-100 flex flex-col overflow-hidden">
          <div className="bg-brand-600 text-white px-4 py-3 font-semibold text-sm flex items-center justify-between">
            Assistant d'achat IA
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-brand-50/40">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                  m.role === "user"
                    ? "bg-brand-600 text-white ml-auto rounded-br-sm"
                    : "bg-white text-ink border border-brand-100 rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && <div className="text-xs text-ink/40 px-2">L'assistant écrit…</div>}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={send} className="p-2 border-t border-brand-100 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez une question…"
              className="flex-1 text-sm px-3 py-2 rounded-full border border-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              className="bg-brand-600 text-white text-sm px-4 rounded-full hover:bg-brand-700"
            >
              →
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-brand-600 text-white shadow-xl hover:bg-brand-700 flex items-center justify-center text-2xl"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
