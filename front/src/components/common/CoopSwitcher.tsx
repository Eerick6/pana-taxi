'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useCoop } from '@/context/CoopContext';
import { useAuth } from '@/context/AuthContext';

export default function CoopSwitcher() {
  const { cooperatives, selectedCoop, setSelectedCoop, isLoadingCoops } = useCoop();
  const { isPlatformStaff } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isPlatformStaff) return null;

  const filtered = cooperatives.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.ruc?.toLowerCase().includes(search.toLowerCase())
  );

  const label = selectedCoop ? selectedCoop.name : 'Plataforma';
  const initials = selectedCoop
    ? selectedCoop.name.slice(0, 2).toUpperCase()
    : '🏛';

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-w-[180px] max-w-[240px]"
        aria-label="Cambiar contexto de cooperativa"
      >
        {/* Avatar */}
        <span className={`flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold ${selectedCoop ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
          {selectedCoop ? initials : '🏛'}
        </span>

        {/* Labels */}
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[10px] font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase leading-none">
            {selectedCoop ? 'Cooperativa' : 'Vista Global'}
          </span>
          <span className="text-sm font-semibold text-gray-800 dark:text-white leading-tight truncate max-w-[140px]">
            {label}
          </span>
        </div>

        {/* Chevron */}
        <svg
          className={`ml-auto w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[99999] overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
              <input
                autoFocus
                type="text"
                placeholder="Buscar cooperativa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm pl-8 pr-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {/* Platform-wide option */}
            <button
              onClick={() => { setSelectedCoop(null); setOpen(false); setSearch(''); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${!selectedCoop ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-base">🏛️</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Vista Plataforma</p>
                <p className="text-xs text-gray-400">Todos los datos globales</p>
              </div>
              {!selectedCoop && (
                <svg className="ml-auto w-4 h-4 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Divider */}
            {filtered.length > 0 && (
              <div className="px-4 py-1.5">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {isLoadingCoops ? 'Cargando...' : `${filtered.length} cooperativas`}
                </span>
              </div>
            )}

            {/* Cooperatives list */}
            {filtered.map((coop) => (
              <button
                key={coop.id}
                onClick={() => { setSelectedCoop(coop); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${selectedCoop?.id === coop.id ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300">
                  {coop.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{coop.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400 truncate">{coop.ruc}</p>
                    <span className={`inline-flex w-1.5 h-1.5 rounded-full flex-shrink-0 ${coop.status === 'active' ? 'bg-success-500' : coop.status === 'suspended' ? 'bg-error-500' : 'bg-warning-500'}`} />
                  </div>
                </div>
                {selectedCoop?.id === coop.id && (
                  <svg className="ml-auto w-4 h-4 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}

            {!isLoadingCoops && filtered.length === 0 && search && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                Sin resultados para &quot;{search}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
