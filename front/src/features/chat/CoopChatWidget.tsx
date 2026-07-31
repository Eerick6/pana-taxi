"use client";
import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useCoopChat, Conversation, ChatMessage } from "./useCoopChat";
import { useAuth } from "@/context/AuthContext";

function timeLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 24) return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
}

function participantLabel(conv: Conversation, currentId: string) {
  const other = conv.participant_a.id === currentId ? conv.participant_b : conv.participant_a;
  return other.name ?? other.email;
}

function typeLabel(type: string) {
  if (type === "driver_operator") return "Taxista";
  if (type === "driver_owner") return "Conductor/Dueño";
  return "Chat";
}

// ── Ventana individual de chat ────────────────────────────────────────────────
interface ChatWindowProps {
  conv: Conversation;
  msgs: ChatMessage[];
  currentId: string;
  onClose: () => void;
  onSend: (content: string) => void;
}

function ChatWindow({ conv, msgs, currentId, onClose, onSend }: ChatWindowProps) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  }

  const other = conv.participant_a.id === currentId ? conv.participant_b : conv.participant_a;

  return (
    <div className="fixed bottom-20 right-6 z-50 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      style={{ maxHeight: "70vh" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-brand-500 text-white">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
          {(other.name ?? other.email)[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{other.name ?? other.email}</p>
          <p className="text-xs text-white/70">{typeLabel(conv.type)}</p>
        </div>
        <button onClick={onClose} className="hover:bg-white/20 rounded-full p-1 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 dark:bg-gray-800">
        {msgs.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">Sin mensajes aún</p>
        )}
        {msgs.map((m) => {
          const mine = m.sender_id === currentId;
          return (
            <div key={m.message_id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                mine
                  ? "bg-brand-500 text-white rounded-br-sm"
                  : "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-bl-sm"
              }`}>
                <p className="break-words">{m.content}</p>
                <p className={`text-[10px] mt-0.5 ${mine ? "text-white/60 text-right" : "text-gray-400"}`}>
                  {timeLabel(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <textarea
          className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white max-h-24"
          rows={1}
          placeholder="Escribe un mensaje..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="w-9 h-9 flex-shrink-0 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Panel de lista de conversaciones ─────────────────────────────────────────
interface ConvListProps {
  conversations: Conversation[];
  currentId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function ConvListPanel({ conversations, currentId, onSelect, onClose }: ConvListProps) {
  return (
    <div className="fixed bottom-20 right-6 z-50 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      style={{ maxHeight: "70vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <span className="font-semibold text-gray-800 dark:text-white text-sm">Mensajes</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Lista */}
      <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 56px)" }}>
        {conversations.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8">No hay conversaciones</p>
        )}
        {conversations.map((c) => {
          const label = participantLabel(c, currentId);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-600 dark:text-brand-300 font-bold text-sm">
                  {label[0].toUpperCase()}
                </div>
                {c.unread_count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {c.unread_count > 9 ? "9+" : c.unread_count}
                  </span>
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm truncate ${c.unread_count > 0 ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-700 dark:text-gray-300"}`}>
                    {label}
                  </span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{timeLabel(c.last_message_at)}</span>
                </div>
                <p className="text-[11px] text-gray-400 truncate">{typeLabel(c.type)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Widget principal ──────────────────────────────────────────────────────────
export function CoopChatWidget() {
  const { user } = useAuth();
  const {
    conversations,
    messages,
    openConvId,
    totalUnread,
    openConversation,
    closeConversation,
    sendMessage,
  } = useCoopChat(user?.id);

  const [showList, setShowList] = useState(false);

  function handleSelectConv(id: string) {
    setShowList(false);
    openConversation(id);
  }

  function handleBubbleClick() {
    if (openConvId) {
      closeConversation();
    } else {
      setShowList((v) => !v);
    }
  }

  if (!user) return null;

  const activeConv = openConvId ? conversations.find((c) => c.id === openConvId) : null;

  return (
    <>
      {/* Lista de conversaciones */}
      {showList && !openConvId && (
        <ConvListPanel
          conversations={conversations}
          currentId={user.id}
          onSelect={handleSelectConv}
          onClose={() => setShowList(false)}
        />
      )}

      {/* Ventana de chat activa */}
      {activeConv && (
        <ChatWindow
          conv={activeConv}
          msgs={messages[activeConv.id] ?? []}
          currentId={user.id}
          onClose={closeConversation}
          onSend={(content) => sendMessage(activeConv.id, content)}
        />
      )}

      {/* Botón flotante */}
      <button
        onClick={handleBubbleClick}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white rounded-full shadow-lg flex items-center justify-center transition-all"
        aria-label="Mensajes"
      >
        {openConvId ? (
          // X cuando hay chat abierto
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          // Icono de chat
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        )}

        {/* Badge de no leídos */}
        {!openConvId && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    </>
  );
}
