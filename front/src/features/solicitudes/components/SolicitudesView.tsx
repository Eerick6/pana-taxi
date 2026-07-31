'use client';
import React, { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

type LeadStatus = 'new' | 'read' | 'archived';

interface Lead {
  id: string;
  name: string;
  cooperative: string;
  email: string;
  driver_count_range: string | null;
  message: string | null;
  status: LeadStatus;
  created_at: string;
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Nueva',
  read: 'Leída',
  archived: 'Archivada',
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
  read: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  archived: 'bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-600',
};

const FILTERS: { label: string; value: LeadStatus | '' }[] = [
  { label: 'Todas', value: '' },
  { label: 'Nuevas', value: 'new' },
  { label: 'Leídas', value: 'read' },
  { label: 'Archivadas', value: 'archived' },
];

export default function SolicitudesView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<LeadStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (filter) params.status = filter;
      const { data } = await api.get('/platform/leads', { params });
      setLeads(data.items);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: LeadStatus) => {
    setUpdating(id);
    try {
      await api.patch(`/platform/leads/${id}/status`, { status });
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
      if (selected?.id === id) setSelected((s) => s ? { ...s, status } : s);
    } finally {
      setUpdating(null);
    }
  };

  const deleteLead = async (id: string) => {
    if (!confirm('¿Eliminar esta solicitud?')) return;
    setDeleting(id);
    try {
      await api.delete(`/platform/leads/${id}`);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setTotal((t) => t - 1);
      if (selected?.id === id) setSelected(null);
    } finally {
      setDeleting(null);
    }
  };

  const newCount = leads.filter((l) => l.status === 'new').length;

  return (
    <div className="flex gap-6 min-h-0">
      {/* Left — list */}
      <div className="flex-1 min-w-0">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">{total} solicitud{total !== 1 ? 'es' : ''}</span>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 animate-pulse flex gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
                    <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {filter ? 'No hay solicitudes con ese filtro.' : 'Aún no hay solicitudes de contacto.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => {
                    setSelected(lead);
                    if (lead.status === 'new') updateStatus(lead.id, 'read');
                  }}
                  className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${selected?.id === lead.id ? 'bg-brand-50 dark:bg-brand-500/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {lead.status === 'new' && (
                          <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
                        )}
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{lead.name}</p>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{lead.cooperative}</p>
                      <p className="text-xs text-gray-400 truncate">{lead.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[lead.status]}`}>
                        {STATUS_LABEL[lead.status]}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(lead.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  {lead.message && (
                    <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">{lead.message}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-xs text-gray-400">Página {page} de {Math.ceil(total / limit)}</span>
            <button
              disabled={page >= Math.ceil(total / limit)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* Right — detail panel */}
      <div className="w-96 flex-shrink-0">
        {selected ? (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-5 sticky top-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold text-gray-900 dark:text-white">{selected.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{selected.cooperative}</p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-1 ${STATUS_STYLE[selected.status]}`}>
                {STATUS_LABEL[selected.status]}
              </span>
            </div>

            {/* Fields */}
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-gray-400 mb-0.5">Correo</dt>
                <dd><a href={`mailto:${selected.email}`} className="text-brand-500 hover:underline">{selected.email}</a></dd>
              </div>
              {selected.driver_count_range && (
                <div>
                  <dt className="text-xs font-medium text-gray-400 mb-0.5">Conductores</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{selected.driver_count_range}</dd>
                </div>
              )}
              {selected.message && (
                <div>
                  <dt className="text-xs font-medium text-gray-400 mb-0.5">Mensaje</dt>
                  <dd className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{selected.message}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-gray-400 mb-0.5">Recibida</dt>
                <dd className="text-gray-500 text-xs">{new Date(selected.created_at).toLocaleString('es-EC')}</dd>
              </div>
            </dl>

            {/* Actions */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <p className="text-xs font-medium text-gray-400 mb-2">Cambiar estado</p>
              <div className="flex gap-2">
                {(['new', 'read', 'archived'] as LeadStatus[]).filter((s) => s !== selected.status).map((s) => (
                  <button
                    key={s}
                    disabled={updating === selected.id}
                    onClick={() => updateStatus(selected.id, s)}
                    className="flex-1 py-2 px-3 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <button
                disabled={deleting === selected.id}
                onClick={() => deleteLead(selected.id)}
                className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-red-200 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 mt-1"
              >
                {deleting === selected.id ? 'Eliminando...' : 'Eliminar solicitud'}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 h-48 flex items-center justify-center">
            <p className="text-sm text-gray-400">Selecciona una solicitud para ver los detalles</p>
          </div>
        )}
      </div>
    </div>
  );
}
