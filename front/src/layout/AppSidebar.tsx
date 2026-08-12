"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { useCoop } from "../context/CoopContext";
import { ChevronDownIcon } from "../icons/index";
import { UserRole } from "@/types";
import { getPendingCooperativas } from "@/features/cooperativas/api";
import { getRecharges } from "@/features/contabilidad/api";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  roles?: UserRole[];
  subItems?: { name: string; path: string }[];
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const TaxiIcon = ({ name }: { name: string }) => (
  <span className="text-base leading-none">{name}</span>
);

const platformSections: NavSection[] = [
  {
    label: "Principal",
    items: [
      { name: "Dashboard", icon: <TaxiIcon name="📊" />, path: "/dashboard" },
      { name: "Mapa en vivo", icon: <TaxiIcon name="📡" />, path: "/mapa", roles: ["owner", "platform_admin", "monitoring", "support"] },
      { name: "SOS", icon: <TaxiIcon name="🆘" />, path: "/sos", roles: ["owner", "platform_admin", "monitoring", "support"] },
      { name: "Desviaciones", icon: <TaxiIcon name="🧭" />, path: "/desviaciones", roles: ["owner", "platform_admin", "monitoring", "support"] },
    ],
  },
  {
    label: "Gestión",
    items: [
      { name: "Cooperativas", icon: <TaxiIcon name="🏢" />, path: "/cooperativas", roles: ["owner", "platform_admin", "finance", "monitoring", "support"] },
      { name: "Conductores", icon: <TaxiIcon name="👤" />, path: "/conductores", roles: ["owner", "platform_admin", "monitoring", "support"] },
      { name: "Clientes", icon: <TaxiIcon name="👥" />, path: "/clientes", roles: ["owner", "platform_admin", "support"] },
      { name: "Viajes", icon: <TaxiIcon name="🗺️" />, path: "/viajes", roles: ["owner", "platform_admin", "monitoring", "support"] },
      { name: "Chats", icon: <TaxiIcon name="💬" />, path: "/chats", roles: ["owner", "platform_admin", "support", "monitoring"] },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { name: "Contabilidad", icon: <TaxiIcon name="💰" />, path: "/contabilidad", roles: ["owner", "platform_admin", "finance"] },
      { name: "Planes", icon: <TaxiIcon name="📋" />, path: "/planes", roles: ["owner"] },
      { name: "Facturación", icon: <TaxiIcon name="💳" />, path: "/facturacion", roles: ["owner", "finance"] },
      { name: "Reportes", icon: <TaxiIcon name="📈" />, path: "/reportes", roles: ["owner", "platform_admin", "finance"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      { name: "Staff", icon: <TaxiIcon name="🧑‍💼" />, path: "/staff", roles: ["owner", "platform_admin"] },
      { name: "Solicitudes", icon: <TaxiIcon name="📩" />, path: "/solicitudes", roles: ["owner", "platform_admin"] },
      { name: "Auditoria", icon: <TaxiIcon name="🔍" />, path: "/auditoria", roles: ["owner", "platform_admin"] },
      { name: "Configuración", icon: <TaxiIcon name="⚙️" />, path: "/configuracion", roles: ["owner"] },
    ],
  },
];

const coopSections: NavSection[] = [
  {
    label: "Principal",
    items: [
      { name: "Dashboard", icon: <TaxiIcon name="📊" />, path: "/dashboard" },
      { name: "Mapa en vivo", icon: <TaxiIcon name="📡" />, path: "/mapa" },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { name: "Socios", icon: <TaxiIcon name="👤" />, path: "/conductores" },
      { name: "Vehículos", icon: <TaxiIcon name="🚖" />, path: "/vehiculos" },
      { name: "Viajes", icon: <TaxiIcon name="🗺️" />, path: "/viajes" },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { name: "Contabilidad", icon: <TaxiIcon name="💰" />, path: "/contabilidad", roles: ["cooperative_admin"] },
    ],
  },
  {
    label: "Gestión",
    items: [
      { name: "Staff", icon: <TaxiIcon name="🧑‍💼" />, path: "/staff", roles: ["cooperative_admin"] },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { user, isPlatformStaff } = useAuth();
  // useCoop kept for future use but coop switcher removed from sidebar
  const pathname = usePathname();
  const router = useRouter();
  const [openSubmenu, setOpenSubmenu] = useState<{ type: string; index: number } | null>(null);
  const [pendingCoops, setPendingCoops] = useState(0);
  const [pendingRecharges, setPendingRecharges] = useState(0);

  useEffect(() => {
    if (!isPlatformStaff) return;
    const fetchCoops = () =>
      getPendingCooperativas().then((r) => setPendingCoops(r.total)).catch(() => {});
    const fetchRecharges = () =>
      getRecharges('pending').then((r) => setPendingRecharges(r.total ?? 0)).catch(() => {});
    fetchCoops();
    fetchRecharges();
    const iv = setInterval(() => { fetchCoops(); fetchRecharges(); }, 30000);
    window.addEventListener('coop-updated', fetchCoops);
    window.addEventListener('recharge-updated', fetchRecharges);
    return () => {
      clearInterval(iv);
      window.removeEventListener('coop-updated', fetchCoops);
      window.removeEventListener('recharge-updated', fetchRecharges);
    };
  }, [isPlatformStaff]);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(path + '/');
  }, [pathname]);

  const rawSections = user
    ? isPlatformStaff ? platformSections : coopSections
    : [];

  // Filter items by role and drop empty sections
  const navSections = rawSections
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((item) => !item.roles || item.roles.includes(user!.role)),
    }))
    .filter((sec) => sec.items.length > 0);

  // Flat list for submenu index tracking (same as before)
  const navItems = navSections.flatMap((s) => s.items);

  useEffect(() => {
    let matched = false;
    navItems.forEach((nav, index) => {
      if (nav.subItems?.some((sub) => isActive(sub.path))) {
        setOpenSubmenu({ type: "main", index });
        matched = true;
      }
    });
    if (!matched) setOpenSubmenu(null);
  }, [pathname, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prev) => ({
          ...prev,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number) => {
    setOpenSubmenu((prev) =>
      prev?.type === "main" && prev.index === index ? null : { type: "main", index }
    );
  };

  // Render a section's items; globalIndex tracks position across all sections for submenu state
  const renderSection = (sec: NavSection, globalOffset: number) => (
    <div key={sec.label} className="mb-4">
      {(isExpanded || isHovered || isMobileOpen) && (
        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          {sec.label}
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {sec.items.map((nav, localIdx) => {
          const index = globalOffset + localIdx;
          return (
            <li key={nav.name}>
              {nav.subItems ? (
                <>
                  <button
                    onClick={() => handleSubmenuToggle(index)}
                    className={`menu-item group w-full ${
                      openSubmenu?.index === index ? "menu-item-active" : "menu-item-inactive"
                    } ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`}
                  >
                    <span className={openSubmenu?.index === index ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
                      {nav.icon}
                    </span>
                    {(isExpanded || isHovered || isMobileOpen) && (
                      <span className="menu-item-text">{nav.name}</span>
                    )}
                    {(isExpanded || isHovered || isMobileOpen) && (
                      <ChevronDownIcon className={`ml-auto h-5 w-5 transition-transform duration-200 ${openSubmenu?.index === index ? "rotate-180 text-brand-500" : ""}`} />
                    )}
                  </button>
                  {(isExpanded || isHovered || isMobileOpen) && (
                    <div
                      ref={(el) => { subMenuRefs.current[`main-${index}`] = el; }}
                      className="overflow-hidden transition-all duration-300"
                      style={{ height: openSubmenu?.index === index ? `${subMenuHeight[`main-${index}`]}px` : "0px" }}
                    >
                      <ul className="mt-2 space-y-1 ml-9">
                        {nav.subItems.map((sub) => (
                          <li key={sub.name}>
                            <Link href={sub.path} className={`menu-dropdown-item ${isActive(sub.path) ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`}>
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : nav.path ? (
                <Link
                  href={nav.path}
                  className={`menu-item group ${isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"} ${!isExpanded && !isHovered ? "lg:justify-center" : ""}`}
                >
                  <span className={isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
                    {nav.icon}
                  </span>
                  {(isExpanded || isHovered || isMobileOpen) && (
                    <span className="menu-item-text">{nav.name}</span>
                  )}
                  {(isExpanded || isHovered || isMobileOpen) && nav.name === 'Cooperativas' && pendingCoops > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center bg-orange-500 text-white">
                      {pendingCoops > 99 ? '99+' : pendingCoops}
                    </span>
                  )}
                  {(!isExpanded && !isHovered && !isMobileOpen) && nav.name === 'Cooperativas' && pendingCoops > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500" />
                  )}
                  {(isExpanded || isHovered || isMobileOpen) && nav.name === 'Contabilidad' && pendingRecharges > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center bg-error-500 text-white animate-pulse">
                      {pendingRecharges > 99 ? '99+' : pendingRecharges}
                    </span>
                  )}
                  {(!isExpanded && !isHovered && !isMobileOpen) && nav.name === 'Contabilidad' && pendingRecharges > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error-500 animate-pulse" />
                  )}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${isExpanded || isMobileOpen ? "w-[290px]" : isHovered ? "w-[290px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {(isExpanded || isHovered || isMobileOpen) ? (
        <Link
          href="/"
          className="block w-full shrink-0 h-16 lg:h-[76px] border-b border-gray-200 dark:border-gray-800"
          style={{
            backgroundImage: 'url(/images/logo/banner1.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
          aria-label="Pana Taxi"
        />
      ) : (
        <div className="h-16 lg:h-[76px] flex items-center justify-center border-b border-gray-200 dark:border-gray-800">
          <Link href="/">
            <Image
              src="/images/logo/logo.webp"
              alt="Pana Taxi"
              width={36}
              height={36}
              className="rounded-lg"
            />
          </Link>
        </div>
      )}

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar px-5">
        <nav className="mb-6 mt-4">
          {(() => {
            let offset = 0;
            return navSections.map((sec) => {
              const el = renderSection(sec, offset);
              offset += sec.items.length;
              return el;
            });
          })()}
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
