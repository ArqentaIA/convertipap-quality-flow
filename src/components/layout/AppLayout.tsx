import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard, Factory, ClipboardCheck, FileBarChart2,
  Settings, Users, ChevronLeft, ChevronRight, Bell, ChevronDown,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { PLANTS } from "@/lib/qc-data";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/produccion", label: "Producción", icon: Factory },
  { to: "/control-calidad", label: "Control de Calidad", icon: ClipboardCheck },
  { to: "/reportes", label: "Reportes", icon: FileBarChart2 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
  { to: "/usuarios", label: "Usuarios y permisos", icon: Users },
];

export function AppLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [plantId, setPlantId] = useState("tlx");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const plant = PLANTS.find((p) => p.id === plantId)!;
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      {/* SidebarCabinet */}
      <aside
        className={`${collapsed ? "w-[72px]" : "w-[260px]"} flex shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 border-r border-sidebar-border`}
      >
        <div className={`flex items-center justify-center border-b border-sidebar-border ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}>
          <div className={`flex w-full items-center justify-center rounded-md bg-white overflow-hidden ${collapsed ? "h-12" : "h-20"}`}>
            <img src={logo} alt="Convertipap" className="h-full w-full object-contain p-1" />
          </div>
        </div>


        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className="cabinet-panel mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground/90 hover:text-white"
                data-active={active}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
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
        {/* TopHeader */}
        <header className="flex h-[64px] items-center justify-between gap-4 border-b border-border bg-gradient-to-r from-primary/30 via-primary/15 to-primary/5 px-6 shadow-sm">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Módulo</div>
            <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Plant selector */}
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
              <div className="text-xs font-semibold text-primary">Turno 3 · Activo</div>
            </div>

            <button className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
            </button>

            <div className="flex items-center gap-2 border-l border-border pl-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">CH</div>
              <div className="hidden lg:block">
                <div className="text-sm font-medium leading-tight">Christian H.</div>
                <div className="text-[11px] text-muted-foreground leading-tight">Analista · {plant.code}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto industrial-bg">
          <div className="mx-auto max-w-[1600px] p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
