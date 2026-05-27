import { type QualityVariable } from "@/lib/qc-data";
import { useEffect, useState } from "react";
import { Lock, Unlock, ShieldCheck } from "lucide-react";

export function QualityVariableTable({
  variables,
  productCode,
  locked = false,
}: { variables: QualityVariable[]; productCode?: string; locked?: boolean }) {
  const [rows, setRows] = useState<QualityVariable[]>(variables);
  const [unlocked, setUnlockedRaw] = useState(false);
  const setUnlocked = (v: boolean) => setUnlockedRaw(locked ? false : v);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    setRows(variables);
    setUnlocked(false); // re-lock cuando cambia la especificación
  }, [variables, productCode]);

  const update = (i: number, field: keyof QualityVariable, v: string) => {
    if (!unlocked || locked) return;
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: field === "label" || field === "unit" || field === "tolerance" || field === "key" ? v : Number(v) } : r)));
  };
  const allValid = rows.every((r) => r.min < r.objective && r.objective < r.max);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Variables de Calidad — Especificación{productCode ? ` · ${productCode}` : ""}
          </h3>
          <p className="text-xs text-muted-foreground">
            Valores fijos del catálogo de fabricación.{" "}
            {unlocked
              ? "Modo dirección activo: edición habilitada."
              : "Solo lectura. Requiere facultad de dirección para modificar."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${allValid ? "text-success" : "text-destructive"}`}>
            {allValid ? "Especificación válida" : "Revisa rangos: min < objetivo < máx"}
          </span>
          {unlocked ? (
            <button
              onClick={() => { setRows(variables); setUnlocked(false); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20"
            >
              <Unlock className="h-3.5 w-3.5" /> Bloquear y restaurar
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
            >
              <Lock className="h-3.5 w-3.5" /> Desbloquear (dirección)
            </button>
          )}
        </div>
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t border-border hover:bg-accent/40">
                <td className="px-4 py-2 font-medium text-foreground">{r.label}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.unit || "—"}</td>
                <td className="px-4 py-2"><Cell value={r.min} disabled={!unlocked} onChange={(v) => update(i, "min", v)} /></td>
                <td className="px-4 py-2"><Cell value={r.objective} disabled={!unlocked} onChange={(v) => update(i, "objective", v)} highlight /></td>
                <td className="px-4 py-2"><Cell value={r.max} disabled={!unlocked} onChange={(v) => update(i, "max", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAuth && (
        <AuthModal
          onCancel={() => setShowAuth(false)}
          onConfirm={() => { setUnlocked(true); setShowAuth(false); }}
        />
      )}
    </div>
  );
}

function Cell({ value, onChange, highlight, disabled }: { value: number; onChange: (v: string) => void; highlight?: boolean; disabled?: boolean }) {
  return (
    <input
      type="number"
      step="0.01"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`w-24 rounded-md border bg-background px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted/40 ${
        highlight ? "border-primary/40 font-semibold text-primary" : "border-input"
      } ${disabled ? "opacity-80" : ""}`}
    />
  );
}

function AuthModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    // Simulación: cualquier usuario con clave "direccion" se considera con facultades de dirección.
    if (pass === "direccion") onConfirm();
    else setErr("Credenciales sin facultad de dirección.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Autorización de dirección</h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Modificar las especificaciones base requiere validación de un usuario con facultades de dirección.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Usuario</label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="usuario.direccion"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clave</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="••••••••"
            />
          </div>
          {err && <div className="text-xs font-medium text-destructive">{err}</div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">Cancelar</button>
          <button onClick={submit} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Autorizar</button>
        </div>
      </div>
    </div>
  );
}
