"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";
import { getCooperativa } from "@/features/cooperativas/api";

const ROLE_LABEL: Record<string, string> = {
  cooperative_admin:      'Administrador',
  cooperative_operator:   'Operador',
  cooperative_supervisor: 'Supervisor',
};

type NavItem = { name: string; icon: string; path: string; roles?: string[] };

const NAV: NavItem[] = [
  { name: 'Dashboard',   icon: '📊', path: '/coop' },
  { name: 'Mapa en vivo', icon: '📡', path: '/coop/mapa' },
  { name: 'Socios', icon: '👤', path: '/coop/conductores' },
  { name: 'Vehículos',   icon: '🚖', path: '/coop/vehiculos' },
  { name: 'Viajes',      icon: '🗺️', path: '/coop/viajes' },
  { name: 'Desviaciones', icon: '🧭', path: '/coop/desviaciones', roles: ['cooperative_admin', 'cooperative_operator'] },
  { name: 'Pagos',       icon: '🧾', path: '/coop/pagos',           roles: ['cooperative_admin', 'cooperative_operator'] },
  { name: 'Staff',       icon: '🧑‍💼', path: '/coop/staff',          roles: ['cooperative_admin'] },
  { name: 'Paradas',    icon: '📍', path: '/coop/paradas',        roles: ['cooperative_admin', 'cooperative_operator'] },
  { name: 'Configuración', icon: '⚙️', path: '/coop/configuracion', roles: ['cooperative_admin'] },
];

export default function CoopSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { user } = useAuth();
  const pathname = usePathname();
  const [coopName, setCoopName] = useState<string | null>(null);

  useEffect(() => {
    if (user?.cooperative_id) {
      getCooperativa(user.cooperative_id).then((c) => setCoopName(c.name)).catch(() => {});
    }
  }, [user?.cooperative_id]);

  const isActive = useCallback((path: string) => {
    if (path === '/coop') return pathname === '/coop';
    return pathname === path || pathname.startsWith(path + '/');
  }, [pathname]);

  const visible = NAV.filter((n) => !n.roles || n.roles.includes(user?.role ?? ''));
  const expanded = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${isExpanded || isMobileOpen ? "w-[290px]" : isHovered ? "w-[290px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      {expanded ? (
        <Link href="/coop"
          className="block w-full shrink-0 h-16 lg:h-[76px] border-b border-gray-200 dark:border-gray-800"
          style={{ backgroundImage: 'url(/images/logo/banner1.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
          aria-label="Pana Taxi"
        />
      ) : (
        <div className="h-16 lg:h-[76px] flex items-center justify-center border-b border-gray-200 dark:border-gray-800">
          <Link href="/coop">
            <Image src="/images/logo/logo.webp" alt="Pana Taxi" width={36} height={36} className="rounded-lg" />
          </Link>
        </div>
      )}

      <div className="flex flex-col overflow-y-auto no-scrollbar px-4 py-4 flex-1">
        {/* Coop name badge */}
        {expanded && user?.cooperative_id && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500 dark:text-brand-400 mb-0.5">Cooperativa</p>
            <p className="text-xs font-medium text-brand-700 dark:text-brand-300 truncate">{coopName ?? '…'}</p>
          </div>
        )}

        <nav>
          <ul className="flex flex-col gap-0.5">
            {visible.map((nav) => (
              <li key={nav.name}>
                <Link
                  href={nav.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                    ${isActive(nav.path)
                      ? 'bg-brand-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}
                    ${!expanded ? 'justify-center' : ''}`}
                >
                  <span className="text-base leading-none flex-shrink-0">{nav.icon}</span>
                  {expanded && <span>{nav.name}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
