import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PRODUCT_SPECS, PRODUCT_FAMILIES } from "@/lib/spec-catalog";
import {
  Plus, Pencil, Copy, GitBranch, Power, Lock, ShieldCheck, FileSpreadsheet,
} from "lucide-react";

export const Route = createFileRoute("/variables-calidad")({ component: VariablesCalidad });

function VariablesCalidad() {
  const [family, setFamily] = useState<string>("all");
  const [selected, setSelected] = useState<string>(PRODUCT_SPECS[0]?.code ?? "");

  const filtered = useMemo(
    () => PRODUCT_SPECS.filter((p) => family === "all" || p.family === family),
    [family],
  );

  const activeSpec = useMemo(
    () => PRODUCT_SPECS.find((p) => p.code === selected) ?? filtered[0] ?? PRODUCT_SPECS[0],
    [selected, filtered],
  );

  return (
    <AppLayout title="Variables de Calidad · Catálogo Maestro de Especificaciones">
      <div className="space-y-5">

        {/* Selectores desplegables */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px,1fr]">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Familia</label>
              <select
                value={family}
                onChange={(e) => { setFamily(e.target.value); setSelected(""); }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">Todas las familias ({PRODUCT_SPECS.length})</option>
                {PRODUCT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Producto / Especificación ({filtered.length})
              </label>
              <select
                value={activeSpec?.code ?? ""}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {filtered.length === 0 && <option value="">Sin productos en esta familia</option>}
                {filtered.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name} · {p.variables.length} var
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>

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
