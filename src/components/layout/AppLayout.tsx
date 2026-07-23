import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Factory, ClipboardCheck, FileBarChart2,
  Settings, ChevronLeft, ChevronRight, Bell, ChevronDown, SlidersHorizontal,
  LogOut, Lock, Loader2, BookOpen, Users, Monitor, Tv, ClipboardList, Scale,
} from "lucide-react";

import logo from "@/assets/logo.png";
import { PLANTS } from "@/lib/qc-data";
import { useAuth, type AppModule } from "@/lib/auth";
import { useLabFilter, LAB_LABEL } from "@/lib/lab";
import { ShieldCheck } from "lucide-react";
import { auditAction } from "@/lib/audit";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  module: AppModule;
  pathPrefixes?: string[];
};

const NAV: NavItem[] = [
  // Dashboard oculto del menú (sigue accesible vía ruta directa)
  // { to: "/", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { to: "/pantallas-operativas", label: "Pantallas Operativas", icon: Monitor, module: "dashboard" },
  { to: "/produccion", label: "Producción", icon: Factory, module: "produccion", pathPrefixes: ["/produccion", "/historial"] },
  { to: "/ordenes-produccion", label: "Órdenes de Producción", icon: ClipboardList, module: "ordenes_produccion" },
  { to: "/pesaje/bobina-madre", label: "Control de Pesaje", icon: Scale, module: "pesaje_bobina_madre", pathPrefixes: ["/pesaje"] },

  { to: "/calidad/captura", label: "Control de Calidad", icon: ClipboardCheck, module: "control_calidad" },
  { to: "/calidad/captura-fuera-turno", label: "Captura fuera de turno", icon: ClipboardCheck, module: "control_calidad" },
  { to: "/variables-calidad", label: "Variables de Calidad", icon: SlidersHorizontal, module: "variables_calidad" },
  // { to: "/catalogos", label: "Catálogos", icon: BookOpen, module: "configuracion" }, // Oculto temporalmente
  { to: "/reportes", label: "Reportes", icon: FileBarChart2, module: "reportes" },
  // { to: "/auditoria", label: "Auditoría", icon: ShieldCheck, module: "auditoria" },
  // Usuarios y Permisos: oculto del menú lateral por decisión de negocio.
  // Solo accesible mediante ruta directa /usuarios (o enlace desde Configuración).
  // { to: "/usuarios", label: "Usuarios y Permisos", icon: Users, module: "usuarios_permisos" },
  { to: "/configuracion", label: "Configuración", icon: Settings, module: "configuracion" },
];

// Mapea cada ruta protegida con el módulo que controla su acceso.
const ROUTE_MODULE: Array<{ prefix: string; module: AppModule }> = [
  { prefix: "/produccion", module: "produccion" },
  { prefix: "/historial", module: "produccion" },
  { prefix: "/ordenes-produccion", module: "ordenes_produccion" },
  { prefix: "/pesaje", module: "pesaje_bobina_madre" },

  { prefix: "/control-calidad", module: "control_calidad" },
  { prefix: "/calidad", module: "control_calidad" },
  { prefix: "/variables-calidad", module: "variables_calidad" },
  { prefix: "/reportes", module: "reportes" },
  { prefix: "/reporte-mensual", module: "reportes" },
  { prefix: "/catalogos", module: "configuracion" },
  { prefix: "/configuracion", module: "configuracion" },
  { prefix: "/usuarios", module: "usuarios_permisos" },
];

function moduleForPath(pathname: string): AppModule {
  for (const entry of ROUTE_MODULE) {
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix + "/")) return entry.module;
  }
  return "dashboard";
}

function initials(name?: string | null, email?: string | null) {
  const base = (name ?? email ?? "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function AppLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const labFilter = useLabFilter();
  const [collapsed, setCollapsed] = useState(false);
  const [plantId, setPlantId] = useState("tlx");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({ select: (s) => s.location.search as { maquina?: string } });
  const plant = PLANTS.find((p) => p.id === plantId)!;
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  // 1) Redirigir a /login si no hay sesión
  useEffect(() => {
    if (!auth.loading && !auth.isAuthenticated) {
      void navigate({ to: "/login", replace: true });
    }
  }, [auth.loading, auth.isAuthenticated, navigate]);

  // 2) Si está en una ruta sin permisos, mandarlo al primer módulo permitido.
  useEffect(() => {
    if (auth.loading || !auth.isAuthenticated) return;
    const mod = moduleForPath(pathname);
    if (auth.canAccess(mod)) return;
    const firstAllowed = NAV.find((n) => auth.canAccess(n.module));
    if (firstAllowed && firstAllowed.to !== pathname) {
      void navigate({ to: firstAllowed.to, replace: true });
    }
  }, [auth.loading, auth.isAuthenticated, auth.modules, auth.roles, pathname, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleNav = useMemo(
    () => NAV.filter((item) => auth.canAccess(item.module)),
    [auth.modules, auth.roles], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const currentModule = moduleForPath(pathname);
  const allowedHere = auth.canAccess(currentModule);

  if (auth.loading || !auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayName = auth.profile?.nombre ?? auth.user?.email ?? "Usuario";
  const rolVisible = auth.profile?.rol_visible ?? auth.roles[0] ?? "";

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`${collapsed ? "w-[72px]" : "w-[260px]"} flex shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 border-r border-sidebar-border`}
      >
        <div className={`flex items-center justify-center border-b border-sidebar-border ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}>
          <div className={`flex w-full items-center justify-center rounded-md bg-white overflow-hidden ${collapsed ? "h-12" : "h-20"}`}>
            <img src={logo} alt="Convertipap" className="h-full w-full object-contain p-1" />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {visibleNav.map(({ to, label, icon: Icon, pathPrefixes }) => {
            const active =
              pathname === to ||
              (to !== "/" && pathname.startsWith(to)) ||
              (pathPrefixes ?? []).some((p) => pathname.startsWith(p));
            const isPantallas = to === "/pantallas-operativas";
            const isOrdenes = to === "/ordenes-produccion";
            return (
              <div key={to}>
                <Link
                  to={to}
                  className={
                    isOrdenes
                      ? `mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium border-l-2 transition-colors ${
                          active
                            ? "bg-sidebar-foreground text-sidebar border-primary shadow-sm"
                            : "bg-sidebar-foreground/90 text-sidebar border-transparent hover:bg-primary hover:text-primary-foreground"
                        }`
                      : "cabinet-panel mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground/90 hover:text-white"
                  }
                  data-active={active}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
                {isPantallas && !collapsed && (
                  <div className="ml-6 mb-1 border-l border-sidebar-border/60 pl-2">
                    {(["MP-04", "MP-05", "MP-06", "MP-07"] as const).map((maq) => {
                      const subActive =
                        pathname.startsWith("/operator-vision") &&
                        currentSearch?.maquina === maq;
                      return (
                        <Link
                          key={maq}
                          to="/operator-vision"
                          search={{ maquina: maq }}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cabinet-panel mx-1 my-0.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground/80 hover:text-white"
                          data-active={subActive}
                        >
                          <Tv className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Visor {maq}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>


        <button
          onClick={() => setCollapsed((c) => !c)}
          className="m-3 flex items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 py-2 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : (<><ChevronLeft className="h-4 w-4" /> Colapsar</>)}
        </button>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[64px] items-center justify-between gap-4 border-b border-border bg-gradient-to-r from-primary/30 via-primary/15 to-primary/5 px-6 shadow-sm">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Módulo</div>
            <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={plantId}
                onChange={(e) => setPlantId(e.target.value)}
                className="appearance-none rounded-md border border-input bg-background pl-3 pr-9 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PLANTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>

            <div className="hidden md:flex flex-col items-end leading-tight">
              <div className="text-xs text-muted-foreground capitalize">{dateStr}</div>
              <div className="text-xs font-semibold text-primary">Planta {plant.code}</div>
            </div>

            {labFilter.lab && (
              <div className="hidden md:flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
                <span className={`h-1.5 w-1.5 rounded-full ${labFilter.lab === "sur" ? "bg-amber-500" : "bg-sky-500"}`} />
                {LAB_LABEL[labFilter.lab]}
                <span className="text-[10px] font-normal text-muted-foreground">
                  · {labFilter.allowedMachineCodes?.join(" · ")}
                </span>
              </div>
            )}

            <button className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
            </button>

            <div className="flex items-center gap-2 border-l border-border pl-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                {initials(auth.profile?.nombre, auth.user?.email)}
              </div>
              <div className="hidden lg:block">
                <div className="text-sm font-medium leading-tight">{displayName}</div>
                <div className="text-[11px] text-muted-foreground leading-tight capitalize">
                  {rolVisible.replace(/_/g, " ")}
                </div>
              </div>
              <button
                onClick={async () => {
                  void auditAction("auth", `Logout: ${auth.user?.email ?? ""}`);
                  await queryClient.cancelQueries();
                  queryClient.clear();
                  await auth.signOut();
                  void navigate({ to: "/login", replace: true });
                }}
                className="ml-1 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto industrial-bg">
          <div className="mx-auto max-w-[1600px] p-6">
            {allowedHere ? (
              children
            ) : (
              <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
                <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">Sin acceso a este módulo</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Tu rol actual no tiene permisos para entrar a <strong>{title}</strong>.
                  Contacta al administrador si crees que es un error.
                </p>
                <Link
                  to="/"
                  className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Volver al inicio
                </Link>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
