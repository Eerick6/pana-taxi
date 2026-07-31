"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getAccessToken } from "@/lib/api";
import api from "@/lib/api";

export interface ChatMessage {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  type: string;
  participant_a: { id: string; email: string; name?: string };
  participant_b: { id: string; email: string; name?: string };
  last_message_at: string | null;
  unread_count: number;
}

export function useCoopChat(currentUserId: string | undefined) {
  const socketRef = useRef<Socket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);

  // ── Cargar lista de conversaciones ──────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get<Conversation[]>("/chat/conversations");
      setConversations(data);
      setTotalUnread(data.reduce((s: number, c: Conversation) => s + (c.unread_count ?? 0), 0));
    } catch { /* silencioso */ }
  }, []);

  // ── Cargar mensajes de una conversación ─────────────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const { data } = await api.get<{ items: ChatMessage[] }>(
        `/chat/conversations/${convId}/messages?limit=60`
      );
      setMessages((prev) => ({ ...prev, [convId]: data.items }));
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
      setTotalUnread((n) => Math.max(0, n - (conversations.find((c) => c.id === convId)?.unread_count ?? 0)));
    } catch { /* silencioso */ }
  }, [conversations]);

  // ── Enviar mensaje ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (convId: string, content: string) => {
    await api.post("/chat/messages", { conversation_id: convId, content });
  }, []);

  // ── Abrir conversación ───────────────────────────────────────────────────────
  const openConversation = useCallback((convId: string) => {
    setOpenConvId(convId);
    // Unirse a la sala WebSocket
    socketRef.current?.emit("chat.join", { conversation_id: convId });
    // Cargar historial si no lo tenemos
    if (!messages[convId]) loadMessages(convId);
    else {
      // Si ya tenemos mensajes, marcar como leído actualizando el unread
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
    }
  }, [messages, loadMessages]);

  const closeConversation = useCallback(() => {
    if (openConvId) {
      socketRef.current?.emit("chat.leave", { conversation_id: openConvId });
    }
    setOpenConvId(null);
  }, [openConvId]);

  // ── WebSocket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    const token = getAccessToken();

    const socket = io(apiUrl, {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      // Re-unirse a la sala activa si estaba abierta
      if (openConvId) socket.emit("chat.join", { conversation_id: openConvId });
    });

    socket.on("chat.message", (payload: ChatMessage) => {
      const { conversation_id } = payload;

      // Agregar mensaje al hilo
      setMessages((prev) => ({
        ...prev,
        [conversation_id]: [...(prev[conversation_id] ?? []), payload],
      }));

      // Actualizar last_message_at en la lista de conversaciones
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== conversation_id) return c;
          const isOpen = openConvId === conversation_id;
          return {
            ...c,
            last_message_at: payload.created_at,
            unread_count: isOpen || payload.sender_id === currentUserId
              ? c.unread_count
              : c.unread_count + 1,
          };
        });
        // Mover la conversación al tope
        const idx = updated.findIndex((c) => c.id === conversation_id);
        if (idx > 0) {
          const [moved] = updated.splice(idx, 1);
          updated.unshift(moved);
        }
        setTotalUnread(updated.reduce((s, c) => s + c.unread_count, 0));
        return updated;
      });
    });

    socketRef.current = socket;
    return () => { socket.disconnect(); socketRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Cargar conversaciones al montar
  useEffect(() => { loadConversations(); }, [loadConversations]);

  return {
    conversations,
    messages,
    openConvId,
    totalUnread,
    openConversation,
    closeConversation,
    sendMessage,
    loadConversations,
  };
}
