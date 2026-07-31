"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import { Spanish } from "flatpickr/dist/l10n/es";
import api from "@/lib/api";
import { getAccessToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminConversation {
  id: string;
  type: string;
  message_count: number;
  last_message_at: string | null;
  last_message: { content: string; created_at: string } | null;
  participant_a: { id: string; email: string; phone?: string; full_name: string | null };
  participant_b: { id: string; email: string; phone?: string; full_name: string | null };
}

interface AdminMessage {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  sender: { id: string; email: string; full_name: string | null };
}

interface PagedConversations {
  items: AdminConversation[];
  total: number;
  page: number;
  limit: number;
}

interface Filters {
  search: string;
  type: string;
  from: string;
  to: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos" },
  { value: "driver_client", label: "Conductor / Cliente" },
  { value: "driver_owner", label: "Conductor / Dueño" },
  { value: "driver_operator", label: "Conductor / Operadora" },
];

const EMPTY_FILTERS: Filters = { search: "", type: "", from: "", to: "" };
const LIMIT = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeLabel(type: string) {
  return TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function displayName(p: { full_name: string | null; email: string; phone?: string }) {
  return p.full_name ?? p.phone ?? p.email;
}

function timeLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 24)
    return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
}

// ── Flatpickr date input ──────────────────────────────────────────────────────

function DateInput({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (val: string) => void;
}) {
  const fpRef = useRef<flatpickr.Instance | null>(null);

  useEffect(() => {
    const fp = flatpickr(`#${id}`, {
      locale: Spanish,
      dateFormat: "Y-m-d",
      defaultDate: value || undefined,
      disableMobile: true,
      onChange: (dates) => {
        if (dates[0]) {
          const y = dates[0].getFullYear();
          const m = String(dates[0].getMonth() + 1).padStart(2, "0");
          const d = String(dates[0].getDate()).padStart(2, "0");
          onChange(`${y}-${m}-${d}`);
        } else {
          onChange("");
        }
      },
    });
    fpRef.current = Array.isArray(fp) ? (fp[0] ?? null) : fp;
    return () => { fpRef.current?.destroy(); fpRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sync external clear
  useEffect(() => {
    if (!value && fpRef.current) fpRef.current.clear();
  }, [value]);

  return (
    <div className="relative flex-1">
      <input
        id={id}
        readOnly
        placeholder={placeholder}
        className="w-full pl-2.5 pr-7 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-brand-400 cursor-pointer"
      />
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  onChange,
  onClear,
  total,
}: {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  onClear: () => void;
  total: number;
}) {
  const hasActive = filters.search || filters.type || filters.from || filters.to;

  return (
    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Nombre, teléfono o correo..."
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-brand-400"
        />
      </div>

      {/* Type */}
      <select
        value={filters.type}
        onChange={(e) => onChange({ type: e.target.value })}
        className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-brand-400"
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Date range */}
      <div className="flex gap-2 items-center">
        <DateInput
          id="chat-filter-from"
          value={filters.from}
          placeholder="Desde"
          onChange={(v) => onChange({ from: v })}
        />
        <span className="text-xs text-gray-400 shrink-0">—</span>
        <DateInput
          id="chat-filter-to"
          value={filters.to}
          placeholder="Hasta"
          onChange={(v) => onChange({ to: v })}
        />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {total} conversación{total !== 1 ? "es" : ""}
        </span>
        {hasActive && (
          <button
            onClick={onClear}
            className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

// ── Conversation list item ────────────────────────────────────────────────────

function ConvItem({
  conv,
  selected,
  onSelect,
}: {
  conv: AdminConversation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
        selected ? "bg-brand-50 dark:bg-gray-700 border-l-2 border-l-brand-500" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded">
          {typeLabel(conv.type)}
        </span>
        <span className="text-[10px] text-gray-400">{timeLabel(conv.last_message_at)}</span>
      </div>
      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
        {displayName(conv.participant_a)}{" "}
        <span className="text-gray-400">↔</span>{" "}
        {displayName(conv.participant_b)}
      </div>
      {conv.last_message && (
        <p className="text-xs text-gray-500 truncate mt-0.5">{conv.last_message.content}</p>
      )}
      <p className="text-[10px] text-gray-400 mt-1">{conv.message_count} mensajes</p>
    </button>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MsgBubble({ msg, convParticipantAId }: { msg: AdminMessage; convParticipantAId: string }) {
  const isA = msg.sender.id === convParticipantAId;
  return (
    <div className={`flex ${isA ? "justify-start" : "justify-end"} mb-2`}>
      <div className={`max-w-[70%] flex flex-col ${isA ? "items-start" : "items-end"}`}>
        <span className="text-[10px] text-gray-400 mb-1 px-1">
          {msg.sender.full_name ?? msg.sender.email}
        </span>
        <div
          className={`px-3 py-2 rounded-2xl text-sm ${
            isA
              ? "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-sm"
              : "bg-brand-500 text-white rounded-tr-sm"
          }`}
        >
          {msg.content}
        </div>
        <span className="text-[10px] text-gray-400 mt-0.5 px-1">
          {new Date(msg.created_at).toLocaleTimeString("es-EC", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AdminChatPanel() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  const [convs, setConvs] = useState<AdminConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingConvs, setLoadingConvs] = useState(true);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedConv, setSelectedConv] = useState<AdminConversation | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async (p: number, f: Filters, append = false) => {
    setLoadingConvs(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (f.search) params.set("search", f.search);
      if (f.type) params.set("type", f.type);
      if (f.from) params.set("from", f.from);
      if (f.to) params.set("to", f.to);

      const { data } = await api.get<PagedConversations>(`/chat/admin/conversations?${params}`);
      setConvs((prev) => (append ? [...prev, ...data.items] : data.items));
      setTotal(data.total);
      setPage(p);
    } catch {
      // silencioso
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => { loadConversations(1, EMPTY_FILTERS); }, [loadConversations]);

  const handleFilterChange = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      if (searchTimer.current) clearTimeout(searchTimer.current);

      if ("search" in patch) {
        searchTimer.current = setTimeout(() => {
          setAppliedFilters(next);
          loadConversations(1, next);
        }, 400);
      } else {
        setAppliedFilters(next);
        loadConversations(1, next);
      }
    },
    [filters, loadConversations]
  );

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    loadConversations(1, EMPTY_FILTERS);
  }, [loadConversations]);

  // ── Load messages ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    try {
      const { data } = await api.get<{ items: AdminMessage[] }>(
        `/chat/admin/conversations/${convId}/messages?limit=60`
      );
      setMessages(data.items);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const selectConv = useCallback(
    (conv: AdminConversation) => {
      if (selectedConv?.id === conv.id) return;
      setSelectedConv(conv);
      loadMessages(conv.id);
    },
    [selectedConv, loadMessages]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    const token = getAccessToken();
    const socket = io(apiUrl, { auth: { token }, transports: ["websocket"] });

    socket.on(
      "chat.message",
      (payload: {
        message_id: string;
        conversation_id: string;
        sender_id: string;
        sender_name: string;
        content: string;
        created_at: string;
      }) => {
        setConvs((prev) =>
          prev
            .map((c) =>
              c.id === payload.conversation_id
                ? {
                    ...c,
                    last_message_at: payload.created_at,
                    message_count: c.message_count + 1,
                    last_message: { content: payload.content, created_at: payload.created_at },
                  }
                : c
            )
            .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))
        );

        if (selectedConv?.id === payload.conversation_id) {
          setMessages((prev) => [
            ...prev,
            {
              id: payload.message_id,
              conversation_id: payload.conversation_id,
              content: payload.content,
              created_at: payload.created_at,
              sender: {
                id: payload.sender_id,
                email: payload.sender_name,
                full_name: payload.sender_name,
              },
            },
          ]);
        }
      }
    );

    socketRef.current = socket;
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [user, selectedConv]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white dark:bg-gray-900">
      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-900 dark:text-white">Chats</h1>
          <button
            onClick={() => loadConversations(1, appliedFilters)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            title="Actualizar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
          total={total}
        />

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs && convs.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : convs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
              <span className="text-2xl mb-2">💬</span>
              Sin resultados
            </div>
          ) : (
            <>
              {convs.map((conv) => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  selected={selectedConv?.id === conv.id}
                  onSelect={() => selectConv(conv)}
                />
              ))}
              {convs.length < total && (
                <button
                  onClick={() => loadConversations(page + 1, appliedFilters, true)}
                  disabled={loadingConvs}
                  className="w-full py-3 text-xs text-brand-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {loadingConvs
                    ? "Cargando..."
                    : `Ver más (${total - convs.length} restantes)`}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedConv ? (
          <>
            <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {displayName(selectedConv.participant_a)}{" "}
                  <span className="text-gray-400">↔</span>{" "}
                  {displayName(selectedConv.participant_b)}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded font-medium">
                    {typeLabel(selectedConv.type)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {selectedConv.message_count} mensajes
                  </span>
                </div>
              </div>
              <div className="hidden md:flex gap-2">
                {[selectedConv.participant_a, selectedConv.participant_b].map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-full px-2.5 py-1"
                  >
                    <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">
                      {(p.full_name ?? p.email)[0].toUpperCase()}
                    </div>
                    <span className="text-xs text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                      {displayName(p)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50 dark:bg-gray-800">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
                  <span className="text-2xl mb-2">💬</span>
                  Sin mensajes aún
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <MsgBubble
                      key={msg.id}
                      msg={msg}
                      convParticipantAId={selectedConv.participant_a.id}
                    />
                  ))}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <p className="text-xs text-center text-gray-400">
                Vista de monitoreo — solo lectura
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <span className="text-5xl mb-4">💬</span>
            <p className="text-base font-medium">Selecciona una conversación</p>
            <p className="text-sm mt-1">para ver los mensajes</p>
          </div>
        )}
      </div>
    </div>
  );
}
