'use client';
import React, { useEffect, useCallback, useState, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { dateTimeStr } from '@/lib/format';
import type { AuditLog } from '@/types';
import { getAuditLogs, type AuditQuery } from '../api';

// ── Style maps ────────────────────────────────────────────────────────────────
const METHOD_STYLE: Record<string, string> = {
  GET:    'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  POST:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  PATCH:  'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  PUT:    'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  DELETE: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
};

const ROLE_STYLE: Record<string, string> = {
  driver:            'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  client:            'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  owner:             'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  platform_admin:    'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  cooperative_admin: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  finance:           'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  monitoring:        'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  support:           'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
};

const ROLE_LABEL: Record<string, string> = {
  driver: 'Conductor', client: 'Cliente', owner: 'Propietario',
  platform_admin: 'Admin Plataforma', cooperative_admin: 'Admin Coop',
  finance: 'Finanzas', monitoring: 'Monitoreo', support: 'Soporte',
};

// Maps raw action strings to human-readable descriptions
const ACTION_LABEL: Record<string, string> = {
  'POST auth/email-otp/request':   'Solicitud de OTP (email)',
  'POST auth/email-otp/verify':    'Inicio de sesión (OTP email)',
  'POST auth/otp/request':         'Solicitud de OTP (teléfono)',
  'POST auth/otp/verify':          'Inicio de sesión (OTP teléfono)',
  'POST auth/login':               'Inicio de sesión',
  'POST auth/refresh':             'Renovación de sesión',
  'POST auth/logout':              'Cierre de sesión',
  'PATCH drivers/me/location':     'Actualización de ubicación',
  'PATCH drivers/me/status':       'Cambio de estado del conductor',
  'PATCH trips/accept':            'Aceptar viaje',
  'PATCH trips/cancel':            'Cancelar viaje',
  'PATCH trips/complete':          'Completar viaje',
  'PATCH trips/start':             'Iniciar viaje',
  'PATCH trips/arrive':            'Conductor llegó',
  'POST trips':                    'Crear solicitud de viaje',
  'POST cooperatives':             'Crear cooperativa',
  'PATCH cooperatives':            'Actualizar cooperativa',
  'DELETE cooperatives':           'Eliminar cooperativa',
  'POST drivers':                  'Registrar conductor',
  'PATCH drivers':                 'Actualizar conductor',
  'DELETE drivers':                'Eliminar conductor',
  'POST vehicles':                 'Registrar vehículo',
  'PATCH vehicles':                'Actualizar vehículo',
  'DELETE vehicles':               'Eliminar vehículo',
  'POST users':                    'Crear usuario',
  'PATCH users':                   'Actualizar usuario',
  'DELETE users':                  'Eliminar usuario',
};

function humanAction(action: string): string {
  // Exact match first
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  // Try prefix match (ignoring UUID segments)
  const withoutUUID = action.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
  for (const [key, label] of Object.entries(ACTION_LABEL)) {
    if (withoutUUID.startsWith(key)) return label;
  }
  return action;
}

const statusColor = (code: number) =>
  code >= 500 ? 'text-rose-600 dark:text-rose-400'
  : code >= 400 ? 'text-amber-600 dark:text-amber-400'
  : 'text-emerald-600 dark:text-emerald-400';

// ── Constants ─────────────────────────────────────────────────────────────────
const ENTITY_OPTIONS = ['cooperatives', 'drivers', 'vehicles', 'trips', 'users', 'auth', 'sos', 'stands', 'accounting'];
const METHOD_OPTIONS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const ROLE_OPTIONS   = ['driver', 'client', 'owner', 'platform_admin', 'cooperative_admin', 'finance', 'monitoring', 'support'];
const STATUS_OPTIONS = [
  { label: '2xx OK',    value: '2', active: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30' },
  { label: '4xx Error', value: '4', active: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30' },
  { label: '5xx Fallo', value: '5', active: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30' },
];

// ── Filter pill ───────────────────────────────────────────────────────────────
function Pill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30">
      {label}
      <button onClick={onRemove} className="ml-0.5 opacity-60 hover:opacity-100 leading-none font-bold">×</button>
    </span>
  );
}

// ── URL helpers ───────────────────────────────────────────────────────────────
const FILTER_KEYS = ['entity_type', 'method', 'actor_role', 'status_class', 'action', 'from', 'to', 'actor_id', 'page'] as const;
type FilterKey = typeof FILTER_KEYS[number];

// ── Inner component (uses useSearchParams) ────────────────────────────────────
function AuditLogInner() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const pathname      = usePathname();
  const [items, setItems]     = useState<AuditLog[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Read from URL
  const get  = (k: FilterKey) => searchParams.get(k) ?? '';
  const page = Number(searchParams.get('page') ?? '1');

  // Write to URL — filters are the source of truth
  const set = useCallback((updates: Partial<Record<FilterKey, string>>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v); else params.delete(k);
    }
    // Reset page on filter change unless explicitly setting page
    if (!('page' in updates)) params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const clearAll = () => {
    const params = new URLSearchParams();
    router.replace(pathname, { scroll: false });
  };

  const activeFilters = FILTER_KEYS.filter((k) => k !== 'page' && get(k));

  // Load data whenever URL changes
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q: AuditQuery = {
        page,
        limit: 50,
        entity_type:  get('entity_type')  || undefined,
        method:       get('method')       || undefined,
        actor_role:   get('actor_role')   || undefined,
        actor_id:     get('actor_id')     || undefined,
        status_class: get('status_class') ? Number(get('status_class')) : undefined,
        action:       get('action')       || undefined,
        from:         get('from')         || undefined,
        to:           get('to')           || undefined,
      };
      const res = await getAuditLogs(q);
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / 50));

  // Pills for active filters
  const pills: { label: string; key: FilterKey }[] = [
    get('entity_type')  && { label: `Entidad: ${get('entity_type')}`,  key: 'entity_type'  as FilterKey },
    get('method')       && { label: `Método: ${get('method')}`,         key: 'method'       as FilterKey },
    get('actor_role')   && { label: `Rol: ${ROLE_LABEL[get('actor_role')] ?? get('actor_role')}`, key: 'actor_role' as FilterKey },
    get('status_class') && { label: `Estado: ${STATUS_OPTIONS.find(s => s.value === get('status_class'))?.label ?? get('status_class')}`, key: 'status_class' as FilterKey },
    get('action')       && { label: `Acción: "${get('action')}"`,       key: 'action'       as FilterKey },
    get('from')         && { label: `Desde: ${get('from')}`,            key: 'from'         as FilterKey },
    get('to')           && { label: `Hasta: ${get('to')}`,              key: 'to'           as FilterKey },
    get('actor_id')     && { label: `Actor: ${get('actor_id').slice(0, 8)}…`, key: 'actor_id' as FilterKey },
  ].filter(Boolean) as { label: string; key: FilterKey }[];

  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          {/* Action search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por acción…"
              defaultValue={get('action')}
              key={get('action')} // re-mounts when cleared
              onChange={(e) => {
                const v = e.target.value;
                // Debounce 400ms
                const t = setTimeout(() => set({ action: v }), 400);
                return () => clearTimeout(t);
              }}
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-colors
              ${filtersOpen || activeFilters.length > 0
                ? 'bg-brand-500 text-white border-brand-500 hover:bg-brand-600'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M10 12h4" />
            </svg>
            Filtros
            {activeFilters.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-white/25 text-white text-xs flex items-center justify-center font-bold">
                {activeFilters.length}
              </span>
            )}
          </button>

          {activeFilters.length > 0 && (
            <button onClick={clearAll} className="px-3 py-2.5 text-sm text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors rounded-xl border border-gray-200 dark:border-gray-700 hover:border-rose-200 dark:hover:border-rose-800 bg-white dark:bg-gray-900">
              Limpiar todo
            </button>
          )}
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Entidad</label>
                <select value={get('entity_type')} onChange={(e) => set({ entity_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Todas</option>
                  {ENTITY_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Método HTTP</label>
                <div className="flex flex-wrap gap-1.5">
                  {METHOD_OPTIONS.map((m) => (
                    <button key={m} onClick={() => set({ method: get('method') === m ? '' : m })}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors
                        ${get('method') === m
                          ? METHOD_STYLE[m] + ' border-current'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Rol del actor</label>
                <select value={get('actor_role')} onChange={(e) => set({ actor_role: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Todos</option>
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Estado HTTP</label>
                <div className="flex gap-1.5">
                  {STATUS_OPTIONS.map((s) => (
                    <button key={s.value} onClick={() => set({ status_class: get('status_class') === s.value ? '' : s.value })}
                      className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                        ${get('status_class') === s.value ? s.active : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Desde</label>
                <input type="date" value={get('from')} onChange={(e) => set({ from: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Hasta</label>
                <input type="date" value={get('to')} onChange={(e) => set({ to: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

            </div>
          </div>
        )}

        {/* Active pills */}
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pills.map((p) => (
              <Pill key={p.key} label={p.label} onRemove={() => set({ [p.key]: '' } as Record<FilterKey, string>)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            {loading ? 'Cargando…' : `${total.toLocaleString()} registros`}
          </p>
          {!loading && pages > 1 && (
            <p className="text-xs text-gray-400">página {page} de {pages}</p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Fecha', 'Actor / IP', 'Rol', 'Acción', 'Entidad', 'Estado'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                      {[50, 80, 55, 160, 65, 45].map((w, j) => (
                        <td key={j} className="px-4 py-3.5">
                          <div className="h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ width: `${w}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : items.map((log) => {
                    const [method, ...rest] = log.action.split(' ');
                    const isHttpMethod = Boolean(METHOD_STYLE[method]);
                    const path    = isHttpMethod ? rest.join(' ') : log.action;
                    const label   = humanAction(log.action);
                    const isAnon  = !log.actor_id;
                    const ip      = log.ip_address?.replace('::ffff:', '') ?? null;
                    const isOpen  = expanded === log.id;

                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className={`border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors cursor-pointer ${isOpen ? 'bg-gray-50/60 dark:bg-gray-800/30' : ''}`}
                          onClick={() => setExpanded(isOpen ? null : log.id)}
                        >
                          {/* Fecha */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-xs text-gray-600 dark:text-gray-300">{dateTimeStr(log.created_at)}</p>
                          </td>

                          {/* Actor / IP */}
                          <td className="px-4 py-3">
                            {isAnon ? (
                              <div>
                                <span className="text-xs text-gray-400 italic">Anónimo</span>
                                {ip && <p className="text-[10px] font-mono text-gray-400 mt-0.5">{ip}</p>}
                              </div>
                            ) : (
                              <div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); set({ actor_id: log.actor_id! }); }}
                                  title={`Filtrar por actor ${log.actor_id}`}
                                  className="text-xs font-mono text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-1.5 py-0.5 rounded hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors"
                                >
                                  {log.actor_id!.slice(0, 8)}…
                                </button>
                                {ip && <p className="text-[10px] font-mono text-gray-400 mt-0.5">{ip}</p>}
                              </div>
                            )}
                          </td>

                          {/* Rol */}
                          <td className="px-4 py-3">
                            {log.actor_role
                              ? <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_STYLE[log.actor_role] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                  {ROLE_LABEL[log.actor_role] ?? log.actor_role}
                                </span>
                              : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                            }
                          </td>

                          {/* Acción */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              {/* Human-readable label */}
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate max-w-[220px]" title={label}>{label}</span>
                              {/* Technical path — smaller, gray */}
                              <div className="flex items-center gap-1.5">
                                {isHttpMethod && (
                                  <span className={`shrink-0 text-[9px] font-bold px-1 py-px rounded ${METHOD_STYLE[method]}`}>{method}</span>
                                )}
                                <span className="text-[10px] font-mono text-gray-400 truncate max-w-[180px]" title={path}>{path}</span>
                              </div>
                            </div>
                          </td>

                          {/* Entidad */}
                          <td className="px-4 py-3">
                            {log.entity_type
                              ? <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">{log.entity_type}</span>
                              : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                            }
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            <span className={`text-sm font-bold tabular-nums ${statusColor(log.status_code)}`}>{log.status_code}</span>
                          </td>
                        </tr>

                        {/* Expanded metadata */}
                        {isOpen && (
                          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                            <td colSpan={6} className="px-5 py-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Metadata</p>
                                  <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 overflow-x-auto max-h-40 bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 leading-relaxed">
                                    {log.metadata ? JSON.stringify(log.metadata, null, 2) : 'Sin metadata'}
                                  </pre>
                                </div>
                                <div className="space-y-3 text-xs">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Acción completa</p>
                                    <p className="font-mono text-gray-600 dark:text-gray-300 break-all">{log.action}</p>
                                  </div>
                                  {log.entity_id && (
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">ID de entidad</p>
                                      <p className="font-mono text-gray-500 dark:text-gray-400 break-all">{log.entity_id}</p>
                                    </div>
                                  )}
                                  {log.actor_id && (
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">ID del actor</p>
                                      <div className="flex items-center gap-2">
                                        <p className="font-mono text-gray-500 dark:text-gray-400 break-all">{log.actor_id}</p>
                                        <button
                                          onClick={() => set({ actor_id: log.actor_id! })}
                                          className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/20 border border-brand-200 dark:border-brand-500/30 transition-colors font-medium"
                                        >
                                          Filtrar
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!loading && items.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin registros para los filtros aplicados</p>
            {activeFilters.length > 0 && (
              <button onClick={clearAll} className="mt-2 text-xs text-brand-500 hover:underline">Limpiar filtros</button>
            )}
          </div>
        )}

        {!loading && pages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400">{total.toLocaleString()} registros · página {page} de {pages}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => set({ page: '1' })} disabled={page === 1}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">«</button>
              <button onClick={() => set({ page: String(page - 1) })} disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Anterior</button>
              <span className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{page} / {pages}</span>
              <button onClick={() => set({ page: String(page + 1) })} disabled={page === pages}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Siguiente</button>
              <button onClick={() => set({ page: String(pages) })} disabled={page === pages}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Suspense wrapper required by Next.js for useSearchParams in client components
export default function AuditLogView() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuditLogInner />
    </Suspense>
  );
}
