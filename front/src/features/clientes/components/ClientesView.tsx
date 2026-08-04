'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getClients, getClient, blockClient, unblockClient, adminOtpLookup, type Client, type OtpLookupResult } from '../api';
import { dateStr, num } from '@/lib/format';

/* ── OTP Lookup ── */

function OtpLookup() {
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<OtpLookupResult | null>(null);
  const [error, setError]     = useState('');

  async function lookup() {
    if (!phone.trim()) return;
    setLoading(true); setResult(null); setError('');
    try {
      const full = phone.startsWith('+') ? phone : `+593${phone.replace(/^0/, '')}`;
      const res = await adminOtpLookup(full);
      setResult(res);
    } catch {
      setError('Error al consultar. Verifica el número.');
    } finally {
      setLoading(false);
    }
  }

  const expiresIn = result?.expires_at
    ? Math.max(0, Math.floor((new Date(result.expires_at).getTime() - Date.now()) / 1000))
    : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔐</span>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Consultar OTP de usuario</h2>
        <span className="ml-auto text-xs text-gray-400">Soporte — código no recibido</span>
      </div>
      <div className="flex gap-2">
        <input
          type="tel"
          placeholder="Ej: 0987216789 o +593987216789"
          value={phone}
          onChange={e => { setPhone(e.target.value); setResult(null); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={lookup}
          disabled={loading || !phone.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {result && !result.found && (
        <p className="mt-3 text-sm text-gray-500">No hay OTP pendiente para ese número (ya verificó o no existe).</p>
      )}

      {result?.found && (
        <div className={`mt-3 flex items-center gap-3 p-3 rounded-lg ${result.expired ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'}`}>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Código OTP</p>
            <p className="text-2xl font-bold tracking-widest text-gray-900 dark:text-white font-mono">{result.otp_code}</p>
            {result.expired
              ? <p className="text-xs text-red-500 mt-0.5">Código expirado — pide al usuario que reenvíe</p>
              : <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Válido por {expiresIn}s más</p>
            }
          </div>
          <a
            href={`https://wa.me/593${result.phone?.replace(/^\+593/, '').replace(/^0/, '')}?text=Hola, tu código OTP de Pana Taxi es: ${result.otp_code}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-medium hover:bg-[#1ebe5d] transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Enviar por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */

function StarRating({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className={`w-3 h-3 ${i < Math.round(value) ? 'text-yellow-400' : 'text-gray-200 dark:text-gray-700'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="text-xs text-gray-400 ml-1">{Number(value).toFixed(1)}</span>
    </span>
  );
}

function Badge({ status }: { status?: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    active:    { label: 'Activo',      cls: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' },
    suspended: { label: 'Suspendido',  cls: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400' },
    pending:   { label: 'Pendiente',   cls: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400' },
  };
  const s = cfg[status ?? ''] ?? { label: status ?? '—', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800' };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.cls}`}>{s.label}</span>;
}

function Avatar({ name, photo }: { name: string; photo?: string | null }) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  if (photo) return <img src={photo} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />;
  return (
    <span className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
      {initials}
    </span>
  );
}

/* ── Modal detalle / gestión ── */

function ClientModal({ client, onClose, onStatusChange }: {
  client: Client;
  onClose: () => void;
  onStatusChange: (id: string, newStatus: 'active' | 'suspended') => void;
}) {
  const [detail, setDetail] = useState<Client>(client);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getClient(client.id).then(setDetail).catch(() => setDetail(client));
  }, [client]);

  const isBlocked = detail.user?.status === 'suspended';

  const handleToggleBlock = async () => {
    setActionLoading(true);
    setError('');
    try {
      if (isBlocked) {
        await unblockClient(detail.id);
        onStatusChange(detail.id, 'active');
        setDetail((prev) => ({ ...prev, user: prev.user ? { ...prev.user, status: 'active' } : prev.user }));
      } else {
        await blockClient(detail.id);
        onStatusChange(detail.id, 'suspended');
        setDetail((prev) => ({ ...prev, user: prev.user ? { ...prev.user, status: 'suspended' } : prev.user }));
      }
    } catch {
      setError('No se pudo completar la acción. Intenta de nuevo.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-999999 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white">Gestión de cliente</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Perfil */}
          <div className="flex items-center gap-4">
            <Avatar name={detail.full_name} photo={detail.profile_photo_url} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 dark:text-white">{detail.full_name}</p>
              <p className="text-sm text-gray-400">{detail.user?.email ?? '—'}</p>
              <div className="mt-1"><Badge status={detail.user?.status} /></div>
            </div>
          </div>

          {/* Datos */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Teléfono',    value: detail.user?.phone ?? '—' },
              { label: 'Cédula',      value: detail.cedula ?? '—' },
              { label: 'Registrado',  value: dateStr(detail.created_at) },
              { label: 'Últ. actualiz.', value: dateStr(detail.updated_at) },
            ].map((f) => (
              <div key={f.label} className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{f.value}</p>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-50 dark:bg-brand-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{num(detail.total_trips)}</p>
              <p className="text-xs text-gray-400 mt-1">Viajes totales</p>
            </div>
            <div className="rounded-xl bg-yellow-50 dark:bg-yellow-500/10 p-4 text-center">
              <StarRating value={detail.rating} />
              <p className="text-xs text-gray-400 mt-2">Calificación promedio</p>
            </div>
          </div>

          {/* Contactos de emergencia */}
          {detail.emergency_contacts && detail.emergency_contacts.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Contactos de emergencia</p>
              <div className="space-y-2">
                {detail.emergency_contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm">👤</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone} · {c.relationship}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-500/10 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Acciones */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={handleToggleBlock}
            disabled={actionLoading}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              isBlocked
                ? 'bg-success-500 hover:bg-success-600 text-white'
                : 'bg-error-500 hover:bg-error-600 text-white'
            }`}
          >
            {actionLoading ? 'Procesando...' : isBlocked ? '✓ Reactivar cuenta' : '⊘ Suspender cuenta'}
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Vista principal ── */

export default function ClientesView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Client | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const LIMIT = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const res = await getClients({ page: p, limit: LIMIT, search: q || undefined });
      setClients(res.items ?? []);
      setTotal(res.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, search); }, [page, search, load]);

  const handleSearch = (val: string) => {
    setInputVal(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setSearch(val); }, 400);
  };

  const handleStatusChange = (id: string, newStatus: 'active' | 'suspended') => {
    setClients((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, user: c.user ? { ...c.user, status: newStatus } : c.user } : c,
      ),
    );
  };

  const totalPages = Math.ceil(total / LIMIT);

  const displayed = filterStatus === 'all'
    ? clients
    : clients.filter((c) => c.user?.status === filterStatus);

  const activeCount = clients.filter((c) => c.user?.status === 'active').length;
  const suspendedCount = clients.filter((c) => c.user?.status === 'suspended').length;

  return (
    <div className="space-y-5">
      <OtpLookup />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Clientes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? 'Cargando...' : `${num(total)} usuarios registrados en la app`}
          </p>
        </div>
        <button
          onClick={() => load(page, search)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total',       value: total,          color: 'text-brand-600 dark:text-brand-400',   bg: 'bg-brand-50 dark:bg-brand-500/10' },
          { label: 'Activos',     value: activeCount,    color: 'text-success-600 dark:text-success-400', bg: 'bg-success-50 dark:bg-success-500/10' },
          { label: 'Suspendidos', value: suspendedCount, color: 'text-error-600 dark:text-error-400',   bg: 'bg-error-50 dark:bg-error-500/10' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl ${s.bg} p-4`}>
            <p className={`text-2xl font-bold ${s.color}`}>{loading ? '—' : num(s.value)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Buscar */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre, email o teléfono..."
            value={inputVal}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {/* Filtro estado */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          {([
            { key: 'all',       label: 'Todos' },
            { key: 'active',    label: 'Activos' },
            { key: 'suspended', label: 'Suspendidos' },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === f.key
                  ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                {['Cliente', 'Email', 'Teléfono', 'Viajes', 'Calificación', 'Estado', 'Registrado', 'Acciones'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3.5">
                          <div className="h-4 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : displayed.length === 0
                ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-gray-400 text-sm">
                        {search ? 'Sin resultados para la búsqueda' : 'No hay clientes aún'}
                      </td>
                    </tr>
                  )
                : displayed.map((c) => (
                    <tr key={c.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${c.user?.status === 'suspended' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.full_name} photo={c.profile_photo_url} />
                          <span className="font-medium text-gray-800 dark:text-white whitespace-nowrap">{c.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.user?.email ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.user?.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-brand-600 dark:text-brand-400">{num(c.total_trips)}</span>
                      </td>
                      <td className="px-4 py-3"><StarRating value={c.rating} /></td>
                      <td className="px-4 py-3"><Badge status={c.user?.status} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{dateStr(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(c)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/25 transition-colors"
                        >
                          Gestionar
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {num(total)}
            </p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors">← Ant.</button>
              <span className="text-xs text-gray-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors">Sig. →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {selected && (
        <ClientModal
          client={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
