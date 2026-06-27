"use client";
import Link from "next/link";
import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Propietario',
  PLATFORM_ADMIN: 'Admin Plataforma',
  FINANCE: 'Finanzas',
  MONITORING: 'Monitoreo',
  SUPPORT: 'Soporte',
  COOPERATIVE_ADMIN: 'Admin Cooperativa',
  COOPERATIVE_OPERATOR: 'Operador',
  COOPERATIVE_SUPERVISOR: 'Supervisor',
};

export default function UserDropdown() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen((p) => !p); }}
        className="flex items-center gap-2 text-gray-700 dark:text-gray-400 dropdown-toggle"
      >
        <span className="flex-shrink-0 w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300">
          {initials}
        </span>
        <span className="hidden sm:block font-medium text-sm text-gray-800 dark:text-gray-200 max-w-[120px] truncate">
          {user?.full_name ?? 'Cargando...'}
        </span>
        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute right-0 mt-3 flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        {/* User info */}
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
          <span className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{user?.full_name ?? '—'}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email ?? '—'}</p>
            <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
            </span>
          </div>
        </div>

        <ul className="flex flex-col gap-0.5 py-2 border-b border-gray-100 dark:border-gray-800">
          <li>
            <DropdownItem
              onItemClick={() => setIsOpen(false)}
              tag="a"
              href="/profile"
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              Mi Perfil
            </DropdownItem>
          </li>
        </ul>

        <button
          onClick={() => { setIsOpen(false); logout(); }}
          className="flex items-center gap-3 px-3 py-2 mt-1 text-sm font-medium text-error-600 dark:text-error-400 rounded-lg hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors w-full text-left"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Cerrar sesión
        </button>
      </Dropdown>
    </div>
  );
}
