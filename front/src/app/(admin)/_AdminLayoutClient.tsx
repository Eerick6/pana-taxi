"use client";

import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";
import { CoopProvider } from "@/context/CoopContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import Unauthorized from "@/components/common/Unauthorized";
import { usePathname } from "next/navigation";
import React from "react";
import type { UserRole } from "@/types";

// ── Mapa centralizado de permisos ─────────────────────────────────────────
// Alias cortos para legibilidad
const OW = "owner"          as UserRole;
const PA = "platform_admin" as UserRole;
const FI = "finance"        as UserRole;
const MO = "monitoring"     as UserRole;
const SU = "support"        as UserRole;

const ALL: UserRole[] = [OW, PA, FI, MO, SU];

/**
 * [prefijo_de_ruta, roles_permitidos]
 * Primera coincidencia más larga gana.
 */
const ROUTE_ACL: [string, UserRole[]][] = [
  // Principal — todos los roles de plataforma
  ["/dashboard",     ALL],
  ["/profile",       ALL],

  // Monitoreo
  ["/mapa",          [OW, PA, MO, SU]],
  ["/sos",           [OW, PA, MO, SU]],
  ["/desviaciones",  [OW, PA, MO, SU]],
  ["/paradas",       [OW, PA, MO, SU]],

  // Gestión
  ["/cooperativas",  [OW, PA, FI, MO, SU]],
  ["/conductores",   [OW, PA, MO, SU]],
  ["/vehiculos",     [OW, PA, MO, SU]],
  ["/clientes",      [OW, PA, SU]],
  ["/viajes",        [OW, PA, MO, SU]],

  // Finanzas
  ["/contabilidad",  [OW, PA, FI]],
  ["/reportes",      [OW, PA, FI]],
  ["/facturacion",   [OW, FI]],
  ["/planes",        [OW]],

  // Sistema
  ["/staff",         [OW, PA]],
  ["/auditoria",     [OW, PA]],
  ["/configuracion", [OW]],
];

function getAllowedRoles(pathname: string): UserRole[] {
  // Ordena por longitud desc → coincidencia más específica primero
  const sorted = [...ROUTE_ACL].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, roles] of sorted) {
    if (prefix === "/") {
      if (pathname === "/") return roles;
      continue;
    }
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return roles;
  }
  return ALL; // fallback: todos los roles de plataforma
}

// ── Layout ────────────────────────────────────────────────────────────────
export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { user, isLoading, isPlatformStaff } = useAuth();
  const pathname = usePathname();

  const mainMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  // ── Cargando sesión ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Sin sesión — el interceptor de api.ts ya redirige a /signin ──────────
  if (!user) return null;

  // ── Rol de cooperativa / conductor / cliente → no tiene acceso ───────────
  if (!isPlatformStaff) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900 p-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
            Portal de Administración
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Este portal es exclusivo para el equipo administrativo de Pana Taxi.
            Tu cuenta <span className="font-semibold text-gray-700 dark:text-gray-200">({user.role})</span> no tiene acceso aquí.
          </p>
        </div>
      </div>
    );
  }

  // ── Verificar permiso para la ruta actual ────────────────────────────────
  const allowedRoles = getAllowedRoles(pathname);
  const canAccess    = allowedRoles.includes(user.role);

  return (
    <CoopProvider>
      <div className="min-h-screen xl:flex overflow-x-hidden">
        <AppSidebar />
        <Backdrop />
        <div className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${mainMargin}`}>
          <AppHeader />
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            {canAccess
              ? children
              : <Unauthorized requiredRoles={allowedRoles} />
            }
          </div>
        </div>
      </div>
    </CoopProvider>
  );
}
