import type { GeneralInfo, Shift } from "@/lib/qc-data";
import { PLANTS } from "@/lib/qc-data";
import { PRODUCT_SPECS } from "@/lib/spec-catalog";

import { useSession } from "@/lib/session";
import { Lock } from "lucide-react";

const ROSTER_FIELDS = new Set<keyof GeneralInfo>();

const FIELDS: { key: keyof GeneralInfo; label: string; type?: string; col?: number; options?: string[] }[] = [
  { key: "plantId", label: "Planta", type: "plant", col: 2 },
  { key: "area", label: "Área" },
  { key: "maquina", label: "Máquina", type: "select", options: ["MP-04", "MP-05", "MP-06", "MP-07"] },
  { key: "fabricacion", label: "Fabricación", type: "fabricacion" },
  { key: "jefeMaquina", label: "Jefe de Máquina" },
  { key: "operador", label: "Operador" },
  { key: "prensero", label: "Prensero" },
  { key: "analista", label: "Analista" },
  { key: "fecha", label: "Fecha", type: "date" },
  { key: "turno", label: "Turno", type: "select", options: ["1", "2", "3"] },
  { key: "horaInicio", label: "Hora inicio", type: "time" },
  { key: "horaFin", label: "Hora fin", type: "time" },
  { key: "velocidadMaquina", label: "Velocidad máquina (m/min)", type: "number" },
  { key: "velocidadEnrollador", label: "Velocidad enrollador (m/min)", type: "number" },
  { key: "crepado", label: "% Crepado", type: "number" },
  { key: "cumplimiento", label: "Cumplimiento %", type: "number" },
];

export function GeneralInfoForm({
  value, onChange, locked = false,
}: { value: GeneralInfo; onChange: (v: GeneralInfo) => void; locked?: boolean }) {
  const session = useSession();
  const isDireccion = session.role === "direccion";

  const SHIFT_HOURS: Record<Shift, { horaInicio: string; horaFin: string }> = {
    "1": { horaInicio: "07:00", horaFin: "15:00" },
    "2": { horaInicio: "15:00", horaFin: "23:00" },
    "3": { horaInicio: "23:00", horaFin: "07:00" },
  };

  const set = <K extends keyof GeneralInfo>(k: K, v: GeneralInfo[K]) => {
    if (locked) return;
    if (k === "turno") {
      const turno = v as Shift;
      const horario = SHIFT_HOURS[turno];
      onChange({ ...value, turno, ...(horario ?? { horaInicio: "", horaFin: "" }) });
      return;
    }
    onChange({ ...value, [k]: v });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Información General del Registro</h3>
          <p className="text-xs text-muted-foreground">
            Datos de cabecera del formato CAL-03-A · Capturados por el usuario operativo.
          </p>
        </div>
        {!isDireccion && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" /> Operadores solo editables por Dirección
          </span>
        )}
      </div>

      <fieldset disabled={locked} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 disabled:opacity-90">
        {locked && (
          <div className="md:col-span-2 lg:col-span-4 -mb-1 inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-[11px] font-semibold text-success">
            <Lock className="h-3 w-3" /> Turno cerrado · campos en solo lectura
          </div>
        )}
        {FIELDS.map((f) => {
          const lockedByRoster = ROSTER_FIELDS.has(f.key) && !isDireccion;
          const isComputed = f.key === "cumplimiento";
          return (
            <div key={f.key as string} className={f.col === 2 ? "md:col-span-2" : ""}>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {f.label}
                {lockedByRoster && <Lock className="h-2.5 w-2.5" />}
                {isComputed && (
                  <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                    AUTO
                  </span>
                )}
              </label>
              {f.type === "plant" ? (
                <select
                  value={value.plantId}
                  onChange={(e) => set("plantId", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {PLANTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : f.type === "fabricacion" ? (
                <select
                  value={value.fabricacion}
                  onChange={(e) => set("fabricacion", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Array.from(new Set(PRODUCT_SPECS.map((p) => p.family))).map((fam) => (
                    <optgroup key={fam} label={fam}>
                      {PRODUCT_SPECS.filter((p) => p.family === fam).map((p) => (
                        <option key={p.code} value={p.code}>{p.code}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : f.type === "select" ? (
                <select
                  value={String(value[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value as never)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {f.key === "turno" && <option value="">Seleccionar…</option>}
                  {f.options!.map((o) => <option key={o} value={o}>{f.key === "turno" ? `Turno ${o}` : o}</option>)}
                </select>
              ) : isComputed ? (
                <div
                  title="Calculado automáticamente conforme se capturan los rollos del turno: % de rollos liberados sobre el total."
                  className="flex w-full items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2 text-sm font-semibold tabular-nums text-foreground"
                >
                  <span className={value.cumplimiento == null ? "text-muted-foreground" : ""}>
                    {value.cumplimiento == null ? "—" : Number(value.cumplimiento).toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              ) : (
                <input
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "any" : undefined}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  value={
                    f.type === "number"
                      ? (value[f.key] === 0 || value[f.key] == null ? "" : (value[f.key] as number))
                      : (value[f.key] as string)
                  }
                  placeholder={f.type === "number" ? "0" : undefined}
                  disabled={lockedByRoster}
                  title={
                    f.key === "crepado"
                      ? "Acepta valores positivos o negativos (ej. 14 o -14)."
                      : lockedByRoster
                      ? "Asignación automática del turno. Solo Dirección puede modificarla."
                      : undefined
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const next = f.type === "number" ? (raw === "" || raw === "-" ? 0 : Number(raw)) : raw;
                    set(f.key, next as never);
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              )}
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
