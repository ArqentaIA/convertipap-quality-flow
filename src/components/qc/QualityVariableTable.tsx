import { type QualityVariable } from "@/lib/qc-data";
import { useEffect, useState } from "react";

export function QualityVariableTable({
  variables,
  productCode,
}: { variables: QualityVariable[]; productCode?: string }) {
  const [rows, setRows] = useState<QualityVariable[]>(variables);
  useEffect(() => { setRows(variables); }, [variables, productCode]);
  const update = (i: number, field: keyof QualityVariable, v: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: field === "label" || field === "unit" || field === "tolerance" || field === "key" ? v : Number(v) } : r)));
  };
  const allValid = rows.every((r) => r.min < r.objective && r.objective < r.max);
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Variables de Calidad — Especificación{productCode ? ` · ${productCode}` : ""}
          </h3>
          <p className="text-xs text-muted-foreground">
            Valores base cargados del catálogo de fabricación. Editables por turno.
          </p>
        </div>
        <span className={`text-xs font-medium ${allValid ? "text-success" : "text-destructive"}`}>
          {allValid ? "Especificación válida" : "Revisa rangos: min < objetivo < máx"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Variable</th>
              <th className="px-4 py-2">Unidad</th>
              <th className="px-4 py-2">Mínimo</th>
              <th className="px-4 py-2">Objetivo</th>
              <th className="px-4 py-2">Máximo</th>
              <th className="px-4 py-2">Tolerancia / Nota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t border-border hover:bg-accent/40">
                <td className="px-4 py-2 font-medium text-foreground">{r.label}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.unit || "—"}</td>
                <td className="px-4 py-2"><Cell value={r.min} onChange={(v) => update(i, "min", v)} /></td>
                <td className="px-4 py-2"><Cell value={r.objective} onChange={(v) => update(i, "objective", v)} highlight /></td>
                <td className="px-4 py-2"><Cell value={r.max} onChange={(v) => update(i, "max", v)} /></td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="—"
                    defaultValue={r.tolerance ?? ""}
                    onBlur={(e) => update(i, "tolerance", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ value, onChange, highlight }: { value: number; onChange: (v: string) => void; highlight?: boolean }) {
  return (
    <input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-24 rounded-md border bg-background px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring ${
        highlight ? "border-primary/40 font-semibold text-primary" : "border-input"
      }`}
    />
  );
}
