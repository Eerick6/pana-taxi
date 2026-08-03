"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
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

// Acepta el socket compartido del SocketContext
export function useCoopChat(
  currentUserId: string | undefined,
  socket: Socket | null,
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const openConvIdRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get<Conversation[]>("/chat/conversations");
      setConversations(data);
      setTotalUnread(data.reduce((s: number, c: Conversation) => s + (c.unread_count ?? 0), 0));
    } catch { /* silencioso */ }
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const { data } = await api.get<{ items: ChatMessage[] }>(
        `/chat/conversations/${convId}/messages?limit=60`
      );
      setMessages((prev) => ({ ...prev, [convId]: data.items }));
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
    } catch { /* silencioso */ }
  }, []);

  const sendMessage = useCallback(async (convId: string, content: string) => {
    await api.post("/chat/messages", { conversation_id: convId, content });
  }, []);

  const openConversation = useCallback((convId: string) => {
    setOpenConvId(convId);
    openConvIdRef.current = convId;
    socket?.emit("chat.join", { conversation_id: convId });
    if (!messages[convId]) loadMessages(convId);
    else {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
    }
  }, [socket, messages, loadMessages]);

  const closeConversation = useCallback(() => {
    if (openConvIdRef.current) {
      socket?.emit("chat.leave", { conversation_id: openConvIdRef.current });
    }
    setOpenConvId(null);
    openConvIdRef.current = null;
  }, [socket]);

  // Escuchar mensajes nuevos del socket compartido
  useEffect(() => {
    if (!socket || !currentUserId) return;

    const handler = (payload: ChatMessage) => {
      const { conversation_id } = payload;

      setMessages((prev) => ({
        ...prev,
        [conversation_id]: [...(prev[conversation_id] ?? []), payload],
      }));

      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== conversation_id) return c;
          const isOpen = openConvIdRef.current === conversation_id;
          return {
            ...c,
            last_message_at: payload.created_at,
            unread_count: isOpen || payload.sender_id === currentUserId
              ? c.unread_count
              : c.unread_count + 1,
          };
        });
        const idx = updated.findIndex((c) => c.id === conversation_id);
        if (idx > 0) {
          const [moved] = updated.splice(idx, 1);
          updated.unshift(moved);
        }
        setTotalUnread(updated.reduce((s, c) => s + c.unread_count, 0));
        return updated;
      });
    };

    socket.on("chat.message", handler);
    return () => { socket.off("chat.message", handler); };
  }, [socket, currentUserId]);

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
