import { useMemo } from "react";
import { Copy, Trash2, Plus } from "lucide-react";
import { QUALITY_VARIABLES, evaluateValue, type Measurement, type ReleaseStatus } from "@/lib/qc-data";

const NUM_FIELDS: { key: keyof Measurement; label: string; specKey?: string; w?: string }[] = [
  { key: "calibre", label: "Calibre (mm)", specKey: "calibre", w: "w-20" },
  { key: "blancuraR457", label: "R457 %", specKey: "blancuraR457", w: "w-20" },
  { key: "blancuraA", label: "a*", specKey: "blancuraA", w: "w-16" },
  { key: "blancuraB", label: "b*", specKey: "blancuraB", w: "w-16" },
  { key: "tensionMD", label: "T. MD (g/in)", specKey: "tensionMD", w: "w-20" },
  { key: "tensionCD", label: "T. CD (g/in)", specKey: "tensionCD", w: "w-20" },
  { key: "relMDCD", label: "Rel MD/CD", specKey: "relMDCD", w: "w-20" },
  { key: "elongMD", label: "% Elong MD", specKey: "elongMD", w: "w-20" },
  { key: "humedad", label: "Humedad %", specKey: "humedad", w: "w-20" },
  { key: "pesoBase", label: "P. base g/m²", specKey: "pesoBase", w: "w-20" },
  { key: "anchoUtil", label: "Ancho cm", specKey: "anchoUtil", w: "w-20" },
  { key: "diametro", label: "Diámetro cm", specKey: "diametro", w: "w-20" },
  { key: "uniones", label: "Uniones", w: "w-16" },
  { key: "pesoRollo", label: "Peso rollo kg", w: "w-20" },
];

const STATUS_CLR: Record<ReleaseStatus, string> = {
  L: "bg-success/15 text-success border-success/30",
  NC: "bg-destructive/10 text-destructive border-destructive/30",
  C: "bg-warning/20 text-foreground border-warning/50",
};

export function MeasurementTable({
  rows,
  onChange,
}: {
  rows: Measurement[];
  onChange: (rows: Measurement[]) => void;
}) {
  const specMap = useMemo(() => Object.fromEntries(QUALITY_VARIABLES.map((q) => [q.key, q])), []);

  const setRow = (id: string, patch: Partial<Measurement>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => {
    const lastHora = rows[rows.length - 1]?.hora ?? "00:00";
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(), hora: lastHora, rollo: "", calibre: null, blancuraR457: null,
        blancuraA: null, blancuraB: null, tensionMD: null, tensionCD: null, relMDCD: null,
        elongMD: null, humedad: null, pesoBase: null, anchoUtil: null, diametro: null,
        uniones: 0, estatus: "L", pesoRollo: null, notas: "",
      },
    ]);
  };
  const dupRow = (id: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    onChange([...rows, { ...r, id: crypto.randomUUID() }]);
  };
  const delRow = (id: string) => {
    if (!confirm("¿Eliminar esta fila de medición?")) return;
    onChange(rows.filter((r) => r.id !== id));
  };

  // Averages
  const avg = useMemo(() => {
    const res: Record<string, number> = {};
    NUM_FIELDS.forEach(({ key }) => {
      const nums = rows.map((r) => r[key] as number | null).filter((v): v is number => typeof v === "number");
      res[key] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    });
    return res;
  }, [rows]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Mediciones por Hora</h3>
          <p className="text-xs text-muted-foreground">Validación automática por celda contra objetivos. Guardado automático como borrador.</p>
        </div>
        <button
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar fila
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1400px] w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Hora</th>
              <th className="px-2 py-2"># Rollo</th>
              {NUM_FIELDS.map((f) => (
                <th key={f.key as string} className="px-2 py-2">{f.label}</th>
              ))}
              <th className="px-2 py-2">Estatus</th>
              <th className="px-2 py-2 min-w-[200px]">Notas / Observaciones</th>
              <th className="px-2 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-accent/30">
                <td className="px-2 py-1.5">
                  <input
                    type="time"
                    value={r.hora}
                    onChange={(e) => setRow(r.id, { hora: e.target.value })}
                    className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={r.rollo}
                    onChange={(e) => setRow(r.id, { rollo: e.target.value })}
                    className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm font-medium tabular-nums"
                  />
                </td>
                {NUM_FIELDS.map((f) => {
                  const val = r[f.key] as number | null;
                  const spec = f.specKey ? specMap[f.specKey] : undefined;
                  const status = spec ? evaluateValue(spec, val) : "ok";
                  const ring =
                    status === "bad"
                      ? "border-destructive/50 bg-destructive/5 text-destructive"
                      : status === "warn"
                      ? "border-warning/60 bg-warning/10"
                      : "border-input bg-background";
                  return (
                    <td key={f.key as string} className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        value={val ?? ""}
                        onChange={(e) =>
                          setRow(r.id, { [f.key]: e.target.value === "" ? null : Number(e.target.value) } as Partial<Measurement>)
                        }
                        className={`${f.w ?? "w-20"} rounded-md border px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring ${ring}`}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1.5">
                  <select
                    value={r.estatus}
                    onChange={(e) => setRow(r.id, { estatus: e.target.value as ReleaseStatus })}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_CLR[r.estatus]}`}
                  >
                    <option value="L">L · Liberado</option>
                    <option value="NC">NC · No Conforme</option>
                    <option value="C">C · Condicional</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={r.notas}
                    onChange={(e) => setRow(r.id, { notas: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => dupRow(r.id)} title="Duplicar" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                    <button onClick={() => delRow(r.id)} title="Eliminar" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 text-xs font-semibold text-foreground">
            <tr className="border-t-2 border-border">
              <td className="px-2 py-2" colSpan={2}>PROMEDIO</td>
              {NUM_FIELDS.map((f) => (
                <td key={f.key as string} className="px-2 py-2 tabular-nums">{avg[f.key as string].toFixed(2)}</td>
              ))}
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
