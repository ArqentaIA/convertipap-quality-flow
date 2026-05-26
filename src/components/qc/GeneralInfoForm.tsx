import type { GeneralInfo, Shift } from "@/lib/qc-data";
import { PLANTS } from "@/lib/qc-data";
import { PRODUCT_SPECS } from "@/lib/spec-catalog";
import { getShiftAssignment } from "@/lib/roster";
import { useSession } from "@/lib/session";
import { Lock } from "lucide-react";

const ROSTER_FIELDS = new Set<keyof GeneralInfo>(["jefeMaquina", "operador", "prensero"]);

const FIELDS: { key: keyof GeneralInfo; label: string; type?: string; col?: number; options?: string[] }[] = [
  { key: "plantId", label: "Planta", type: "plant", col: 2 },
  { key: "area", label: "Área" },
  { key: "maquina", label: "Máquina" },
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
  value, onChange,
}: { value: GeneralInfo; onChange: (v: GeneralInfo) => void }) {
  const session = useSession();
  const isDireccion = session.role === "direccion";

  const set = <K extends keyof GeneralInfo>(k: K, v: GeneralInfo[K]) => {
    if (k === "turno") {
      const turno = v as Shift;
      const equipo = getShiftAssignment(turno);
      onChange({ ...value, turno, ...equipo });
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
            Datos de cabecera del formato CAL-03-A · El equipo se asigna automáticamente según el turno seleccionado.
          </p>
        </div>
        {!isDireccion && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" /> Operadores solo editables por Dirección
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((f) => {
          const lockedByRoster = ROSTER_FIELDS.has(f.key) && !isDireccion;
          return (
            <div key={f.key as string} className={f.col === 2 ? "md:col-span-2" : ""}>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {f.label}
                {lockedByRoster && <Lock className="h-2.5 w-2.5" />}
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
                  value={String(value[f.key])}
                  onChange={(e) => set(f.key, e.target.value as never)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {f.options!.map((o) => <option key={o} value={o}>Turno {o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type ?? "text"}
                  value={value[f.key] as string | number}
                  disabled={lockedByRoster}
                  title={lockedByRoster ? "Asignación automática del turno. Solo Dirección puede modificarla." : undefined}
                  onChange={(e) =>
                    set(f.key, (f.type === "number" ? Number(e.target.value) : e.target.value) as never)
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              )}
            </div>
          );
        })}
        <div className="md:col-span-2 lg:col-span-4">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notas generales</label>
          <textarea
            rows={2}
            value={value.notas}
            onChange={(e) => set("notas", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}
