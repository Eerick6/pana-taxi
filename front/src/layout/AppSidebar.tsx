"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { useCoop } from "../context/CoopContext";
import { ChevronDownIcon, HorizontaLDots } from "../icons/index";
import { UserRole } from "@/types";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  roles?: UserRole[];
  subItems?: { name: string; path: string }[];
};

const TaxiIcon = ({ name }: { name: string }) => (
  <span className="text-base leading-none">{name}</span>
);

const platformNav: NavItem[] = [
  {
    name: "Dashboard",
    icon: <TaxiIcon name="📊" />,
    path: "/",
  },
  {
    name: "Cooperativas",
    icon: <TaxiIcon name="🏢" />,
    path: "/cooperativas",
    roles: ["OWNER", "PLATFORM_ADMIN", "FINANCE", "MONITORING", "SUPPORT"],
  },
  {
    name: "Conductores",
    icon: <TaxiIcon name="👤" />,
    path: "/conductores",
    roles: ["OWNER", "PLATFORM_ADMIN", "MONITORING", "SUPPORT"],
  },
  {
    name: "Vehículos",
    icon: <TaxiIcon name="🚖" />,
    path: "/vehiculos",
    roles: ["OWNER", "PLATFORM_ADMIN", "MONITORING", "SUPPORT"],
  },
  {
    name: "Viajes",
    icon: <TaxiIcon name="🗺️" />,
    path: "/viajes",
    roles: ["OWNER", "PLATFORM_ADMIN", "MONITORING", "SUPPORT"],
  },
  {
    name: "Contabilidad",
    icon: <TaxiIcon name="💰" />,
    path: "/contabilidad",
    roles: ["OWNER", "PLATFORM_ADMIN", "FINANCE"],
  },
  {
    name: "SOS",
    icon: <TaxiIcon name="🆘" />,
    path: "/sos",
    roles: ["OWNER", "PLATFORM_ADMIN", "MONITORING", "SUPPORT"],
  },
  {
    name: "Paradas",
    icon: <TaxiIcon name="📍" />,
    path: "/paradas",
    roles: ["OWNER", "PLATFORM_ADMIN"],
  },
  {
    name: "Auditoria",
    icon: <TaxiIcon name="🔍" />,
    path: "/auditoria",
    roles: ["OWNER", "PLATFORM_ADMIN"],
  },
  {
    name: "Staff",
    icon: <TaxiIcon name="👥" />,
    path: "/staff",
    roles: ["OWNER", "PLATFORM_ADMIN"],
  },
  {
    name: "Configuración",
    icon: <TaxiIcon name="⚙️" />,
    path: "/configuracion",
    roles: ["OWNER"],
  },
];

const coopNav: NavItem[] = [
  {
    name: "Dashboard",
    icon: <TaxiIcon name="📊" />,
    path: "/",
  },
  {
    name: "Conductores",
    icon: <TaxiIcon name="👤" />,
    path: "/conductores",
  },
  {
    name: "Vehículos",
    icon: <TaxiIcon name="🚖" />,
    path: "/vehiculos",
  },
  {
    name: "Viajes",
    icon: <TaxiIcon name="🗺️" />,
    path: "/viajes",
  },
  {
    name: "Contabilidad",
    icon: <TaxiIcon name="💰" />,
    path: "/contabilidad",
    roles: ["COOPERATIVE_ADMIN"],
  },
  {
    name: "Staff",
    icon: <TaxiIcon name="👥" />,
    path: "/staff",
    roles: ["COOPERATIVE_ADMIN"],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { user, isPlatformStaff } = useAuth();
  const { cooperatives, selectedCoop, setSelectedCoop, isLoadingCoops } = useCoop();
  const pathname = usePathname();
  const router = useRouter();
  const [openSubmenu, setOpenSubmenu] = useState<{ type: string; index: number } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [coopOpen, setCoopOpen] = useState(false);
  const [coopSearch, setCoopSearch] = useState('');
  const coopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (coopRef.current && !coopRef.current.contains(e.target as Node)) {
        setCoopOpen(false);
        setCoopSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = useCallback((path: string) => pathname === path, [pathname]);

  const navItems = user
    ? isPlatformStaff
      ? platformNav.filter((item) => !item.roles || item.roles.includes(user.role))
      : coopNav.filter((item) => !item.roles || item.roles.includes(user.role))
    : [];

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

  const renderItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((nav, index) => (
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
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
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
      {/* Banner superior — visible solo cuando el sidebar está expandido */}
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

      {/* Coop Switcher — platform staff only */}
      {isPlatformStaff && (
        <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800" ref={coopRef}>
          {(isExpanded || isHovered || isMobileOpen) ? (
            <div className="relative">
              <button
                onClick={() => setCoopOpen((v) => !v)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700 transition-all text-left"
              >
                <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${selectedCoop ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300' : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-300'}`}>
                  {selectedCoop ? selectedCoop.name.slice(0, 2).toUpperCase() : '🏛'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none mb-0.5">
                    {selectedCoop ? 'Cooperativa' : 'Vista Global'}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white truncate leading-tight">
                    {selectedCoop ? selectedCoop.name : 'Plataforma'}
                  </p>
                </div>
                <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${coopOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {coopOpen && (
                <div className="absolute top-full mt-1.5 left-0 right-0 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[9999] overflow-hidden">
                  <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Buscar cooperativa..."
                      value={coopSearch}
                      onChange={(e) => setCoopSearch(e.target.value)}
                      className="w-full text-sm px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedCoop(null); setCoopOpen(false); setCoopSearch(''); router.push('/'); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${!selectedCoop ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      <span className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm flex-shrink-0">🏛️</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">Vista Plataforma</p>
                        <p className="text-xs text-gray-400">Todos los datos globales</p>
                      </div>
                      {!selectedCoop && <svg className="ml-auto w-3.5 h-3.5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </button>

                    {isLoadingCoops && (
                      <div className="px-4 py-3 text-xs text-gray-400">Cargando cooperativas...</div>
                    )}

                    {cooperatives
                      .filter((c) => !coopSearch || c.name.toLowerCase().includes(coopSearch.toLowerCase()) || c.ruc?.includes(coopSearch))
                      .map((coop) => (
                        <button
                          key={coop.id}
                          onClick={() => { setSelectedCoop(coop); setCoopOpen(false); setCoopSearch(''); router.push('/'); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${selectedCoop?.id === coop.id ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        >
                          <span className="flex-shrink-0 w-6 h-6 rounded-md bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300">
                            {coop.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{coop.name}</p>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${coop.status === 'active' ? 'bg-success-500' : coop.status === 'suspended' ? 'bg-error-500' : 'bg-warning-500'}`} />
                              <span className="text-xs text-gray-400 truncate">{coop.ruc}</span>
                            </div>
                          </div>
                          {selectedCoop?.id === coop.id && <svg className="ml-auto w-3.5 h-3.5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </button>
                      ))}

                    {!isLoadingCoops && cooperatives.length === 0 && (
                      <div className="px-4 py-4 text-center text-xs text-gray-400">Sin cooperativas cargadas</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center py-0.5" title={selectedCoop?.name ?? 'Vista Plataforma'}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${selectedCoop ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                {selectedCoop ? selectedCoop.name.slice(0, 2).toUpperCase() : '🏛'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar px-5">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className={`mb-3 text-xs uppercase flex leading-5 text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                {isExpanded || isHovered || isMobileOpen ? (isPlatformStaff ? "Plataforma" : "Cooperativa") : <HorizontaLDots />}
              </h2>
              {renderItems(navItems)}
            </div>
          </div>
        </nav>
        {(isExpanded || isHovered || isMobileOpen) && user && (
          <Link href="/profile" className="mt-auto mb-4 rounded-xl bg-gray-50 dark:bg-gray-800 p-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300">
              {user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{user.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{user.role}</p>
            </div>
            <svg className="ml-auto w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
