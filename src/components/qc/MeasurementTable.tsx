import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Trash2, Plus, Lock, LogOut, UserCheck, ChevronDown, Check } from "lucide-react";
import { QUALITY_VARIABLES, evaluateValue, type Measurement, type ReleaseStatus } from "@/lib/qc-data";
import { useSession, setSession, clearSession } from "@/lib/session";

const NOTAS_OPCIONES = [
  "Sin novedad",
  "Ligeros hoyos",
  "Hoyos",
  "Ligero desfase",
  "Desfase",
  "Ligera suciedad",
  "Suciedad",
  "Destase",
  "Arrugas",
  "Manchas",
  "Variación de color",
  "Borde irregular",
  "Empalme / unión",
  "Paro de máquina",
];

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
  operadorTurno,
  turno,
}: {
  rows: Measurement[];
  onChange: (rows: Measurement[]) => void;
  operadorTurno: string;
  turno: string;
}) {
  const specMap = useMemo(() => Object.fromEntries(QUALITY_VARIABLES.map((q) => [q.key, q])), []);
  const session = useSession();
  const [showLogin, setShowLogin] = useState(false);

  const isOperadorTurno =
    session.role === "operador" &&
    !!session.user &&
    session.user.trim().toLowerCase() === operadorTurno.trim().toLowerCase();
  const isDireccion = session.role === "direccion";
  const canCapture = isOperadorTurno || isDireccion;

  const setRow = (id: string, patch: Partial<Measurement>) => {
    if (!canCapture) return;
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const nowHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const addRow = () => {
    if (!canCapture) return;
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(), hora: nowHHMM(), rollo: "", calibre: null, blancuraR457: null,
        blancuraA: null, blancuraB: null, tensionMD: null, tensionCD: null, relMDCD: null,
        elongMD: null, humedad: null, pesoBase: null, anchoUtil: null, diametro: null,
        uniones: 0, estatus: "L", pesoRollo: null, notas: "",
      },
    ]);
  };
  const dupRow = (id: string) => {
    if (!canCapture) return;
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    onChange([...rows, { ...r, id: crypto.randomUUID(), hora: nowHHMM() }]);
  };
  const delRow = (id: string) => {
    if (!canCapture) return;
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Mediciones por Hora</h3>
          <p className="text-xs text-muted-foreground">
            Captura habilitada solo para el operador en turno (<span className="font-medium text-foreground">{operadorTurno || "—"}</span>, Turno {turno}).
            {isDireccion && " · Dirección con acceso supervisión."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCapture ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                <UserCheck className="h-3.5 w-3.5" />
                {session.user} · {isDireccion ? "Dirección" : "Operador en turno"}
              </span>
              <button
                onClick={() => clearSession()}
                title="Cerrar sesión de captura"
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
              >
                <LogOut className="h-3.5 w-3.5" /> Salir
              </button>
              <button
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar fila
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Lock className="h-3.5 w-3.5" /> Iniciar captura
            </button>
          )}
        </div>
      </div>

      {!canCapture && (
        <div className="border-b border-warning/40 bg-warning/10 px-5 py-2.5 text-xs text-foreground">
          Solo el operador en turno (<span className="font-semibold">{operadorTurno || "—"}</span>) puede capturar mediciones.
          Inicia sesión para habilitar la captura.
        </div>
      )}


      <div className="overflow-x-auto">
        <table className="min-w-[1400px] w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2" title="Generada automáticamente por el sistema al agregar la fila">Hora <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[8px] font-bold text-muted-foreground">AUTO</span></th>
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
                    disabled={!canCapture}
                    onChange={(e) => setRow(r.id, { hora: e.target.value })}
                    className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums disabled:cursor-not-allowed disabled:bg-muted/40"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={r.rollo}
                    disabled={!canCapture}
                    onChange={(e) => setRow(r.id, { rollo: e.target.value })}
                    className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm font-medium tabular-nums disabled:cursor-not-allowed disabled:bg-muted/40"
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
                        disabled={!canCapture}
                        onChange={(e) =>
                          setRow(r.id, { [f.key]: e.target.value === "" ? null : Number(e.target.value) } as Partial<Measurement>)
                        }
                        className={`${f.w ?? "w-20"} rounded-md border px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted/40 ${ring}`}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1.5">
                  <select
                    value={r.estatus}
                    disabled={!canCapture}
                    onChange={(e) => setRow(r.id, { estatus: e.target.value as ReleaseStatus })}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-70 ${STATUS_CLR[r.estatus]}`}
                  >
                    <option value="L">L · Liberado</option>
                    <option value="NC">NC · No Conforme</option>
                    <option value="C">C · Condicional</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <NotasSelect
                    value={r.notas}
                    disabled={!canCapture}
                    onChange={(v: string) => setRow(r.id, { notas: v })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button disabled={!canCapture} onClick={() => dupRow(r.id)} title="Duplicar" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"><Copy className="h-3.5 w-3.5" /></button>
                    <button disabled={!canCapture} onClick={() => delRow(r.id)} title="Eliminar" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
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

      {showLogin && (
        <LoginModal
          operadorTurno={operadorTurno}
          turno={turno}
          onCancel={() => setShowLogin(false)}
          onSuccess={(user, role) => { setSession({ user, role }); setShowLogin(false); }}
        />
      )}
    </div>
  );
}

function LoginModal({
  operadorTurno, turno, onCancel, onSuccess,
}: {
  operadorTurno: string;
  turno: string;
  onCancel: () => void;
  onSuccess: (user: string, role: "operador" | "direccion") => void;
}) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const u = user.trim();
    if (!u || !pass) { setErr("Ingresa usuario y clave."); return; }
    // Mock: clave "direccion" = rol dirección; "turno" = operador en turno (debe coincidir el nombre)
    if (pass === "direccion") return onSuccess(u, "direccion");
    if (pass === "turno") {
      if (u.toLowerCase() !== operadorTurno.trim().toLowerCase()) {
        setErr(`Este turno está asignado a ${operadorTurno}. Solo ese operador puede capturar.`);
        return;
      }
      return onSuccess(u, "operador");
    }
    setErr("Credenciales inválidas.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Iniciar captura del turno</h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Turno {turno} asignado a <span className="font-semibold text-foreground">{operadorTurno || "—"}</span>.
          Solo ese operador (o un usuario con facultades de dirección) puede capturar mediciones.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Usuario</label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={operadorTurno || "nombre.usuario"}
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
          <button onClick={submit} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Iniciar</button>
        </div>
      </div>
    </div>
  );
}


function NotasSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () =>
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [value],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next.join(", "));
  };

  const label = selected.length === 0 ? "Seleccionar…" : selected.join(", ");

  return (
    <div ref={ref} className="relative w-full min-w-[200px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 py-1 text-left text-sm disabled:cursor-not-allowed disabled:bg-muted/40"
      >
        <span className={`truncate ${selected.length === 0 ? "text-muted-foreground" : "text-foreground"}`}>
          {label}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && !disabled && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-64 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {NOTAS_OPCIONES.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
