import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PRODUCT_SPECS, PRODUCT_FAMILIES } from "@/lib/spec-catalog";
import {
  Search, Plus, Pencil, Copy, GitBranch, Power, Lock, ShieldCheck,
  ChevronRight, FileSpreadsheet,
} from "lucide-react";

export const Route = createFileRoute("/variables-calidad")({ component: VariablesCalidad });

function VariablesCalidad() {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<string>("all");
  const [selected, setSelected] = useState<string>(PRODUCT_SPECS[0]?.code ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCT_SPECS.filter((p) => {
      const matchesFam = family === "all" || p.family === family;
      const matchesQ =
        !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.family.toLowerCase().includes(q);
      return matchesFam && matchesQ;
    });
  }, [query, family]);

  const activeSpec = useMemo(
    () => PRODUCT_SPECS.find((p) => p.code === selected) ?? filtered[0] ?? PRODUCT_SPECS[0],
    [selected, filtered],
  );

  return (
    <AppLayout title="Variables de Calidad · Catálogo Maestro de Especificaciones">
      <div className="space-y-5">
        {/* Header / banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Catálogo Maestro de Especificaciones</h2>
              <p className="text-xs text-muted-foreground max-w-2xl">
                Fuente única de verdad para las variables de calidad por producto. Los operadores consultan estos
                valores en modo lectura durante la captura del turno. Solo Dirección, Calidad Senior y Administrador
                pueden modificar.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
              <Power className="h-3 w-3" /> {PRODUCT_SPECS.length} especificaciones activas
            </span>
            <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> Crear especificación
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px,1fr]">
          {/* Lista de productos */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por código, nombre o familia…"
                  className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <select
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">Todas las familias ({PRODUCT_SPECS.length})</option>
                {PRODUCT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <ul className="max-h-[560px] overflow-y-auto">
              {filtered.map((p) => {
                const active = p.code === activeSpec?.code;
                return (
                  <li key={p.code}>
                    <button
                      onClick={() => setSelected(p.code)}
                      className={`flex w-full items-center justify-between gap-2 border-l-2 px-4 py-2.5 text-left transition-colors ${
                        active ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent/50"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold tabular-nums ${active ? "text-primary" : "text-foreground"}`}>{p.code}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {p.variables.length} var
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{p.family}</div>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted-foreground">Sin resultados</li>
              )}
            </ul>
          </div>

          {/* Detalle de especificación */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {activeSpec?.family}
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {activeSpec?.name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>Código: <span className="font-semibold text-foreground tabular-nums">{activeSpec?.code}</span></span>
                  <span>·</span>
                  <span>Planta: <span className="font-semibold text-foreground">TLX</span></span>
                  <span>·</span>
                  <span>Versión: <span className="font-semibold text-foreground">v1.0</span></span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 font-semibold text-success">
                    <Power className="h-2.5 w-2.5" /> Activa
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ActionBtn icon={Pencil} label="Editar" />
                <ActionBtn icon={Copy} label="Duplicar" />
                <ActionBtn icon={GitBranch} label="Versionar" />
                <ActionBtn icon={Power} label="Desactivar" />
                <ActionBtn icon={FileSpreadsheet} label="Exportar" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Variable</th>
                    <th className="px-4 py-2">Unidad</th>
                    <th className="px-4 py-2 tabular-nums">Mínimo</th>
                    <th className="px-4 py-2 tabular-nums">Objetivo</th>
                    <th className="px-4 py-2 tabular-nums">Máximo</th>
                    <th className="px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSpec?.variables.map((v) => (
                    <tr key={v.key} className="border-t border-border hover:bg-accent/40">
                      <td className="px-4 py-2 font-medium text-foreground">{v.label}</td>
                      <td className="px-4 py-2 text-muted-foreground">{v.unit || "—"}</td>
                      <td className="px-4 py-2 tabular-nums">{v.min}</td>
                      <td className="px-4 py-2 tabular-nums font-semibold text-primary">{v.objective}</td>
                      <td className="px-4 py-2 tabular-nums">{v.max}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                          <Power className="h-2.5 w-2.5" /> Activa
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Solo lectura · Modificación restringida a Dirección, Calidad Senior y Administrador.
              </div>
              <div>
                Última modificación: 2026-05-26 · Ing. Jonathan Alberto Peláez (Gerente de Calidad)
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ActionBtn({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-accent">
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
