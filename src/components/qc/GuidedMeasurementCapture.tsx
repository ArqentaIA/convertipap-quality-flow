import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Lock, LogOut, UserCheck, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, Check, X, Clock, User as UserIcon, FileText, Save,
} from "lucide-react";
import { evaluateValue, type Measurement, type ReleaseStatus, type QualityVariable } from "@/lib/qc-data";
import { useSession, setSession, clearSession } from "@/lib/session";
import { ReleaseBadge } from "@/components/qc/StatusBadge";

const NOTAS_OPCIONES = [
  "Sin novedad",
  "Puntos negros",
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
  "Pliegues",
  "Rasgaduras",
  "Bajo gramaje",
  "Alto gramaje",
  "Humedad fuera de rango",
  "Tensión irregular",
  "Cambio de fabricación",
  "Limpieza de fieltros",
  "Ajuste de crepado",
  "Falla de yankee",
];

// Campos visibles en la tarjeta de captura operativa
const CAPTURE_FIELDS: { key: keyof Measurement; label: string; unit: string; specKey?: string; group: "linea" | "lab" }[] = [
  // En línea
  { key: "humedad",      label: "Humedad",         unit: "%",     specKey: "humedad",      group: "linea" },
  { key: "pesoBase",     label: "Peso Base",       unit: "g/m²",  specKey: "pesoBase",     group: "linea" },
  { key: "anchoUtil",    label: "Ancho útil",      unit: "cm",    specKey: "anchoUtil",    group: "linea" },
  { key: "diametro",     label: "Diámetro",        unit: "cm",    specKey: "diametro",     group: "linea" },
  { key: "uniones",      label: "Uniones",         unit: "",                              group: "linea" },
  { key: "pesoRollo",    label: "Peso Rollo",      unit: "kg",                            group: "linea" },
  // Laboratorio (obligatorias para análisis y liberación)
  { key: "calibre",      label: "Calibre",         unit: "mm",    specKey: "calibre",      group: "lab" },
  { key: "blancuraR457", label: "Blancura R457",   unit: "%",     specKey: "blancuraR457", group: "lab" },
  { key: "blancuraA",    label: "Blancura a*",     unit: "",      specKey: "blancuraA",    group: "lab" },
  { key: "blancuraB",    label: "Blancura b*",     unit: "",      specKey: "blancuraB",    group: "lab" },
  { key: "tensionMD",    label: "Tensión MD",      unit: "g/in",  specKey: "tensionMD",    group: "lab" },
  { key: "tensionCD",    label: "Tensión CD",      unit: "g/in",  specKey: "tensionCD",    group: "lab" },
  { key: "elongMD",      label: "Elongación MD",   unit: "%",     specKey: "elongMD",      group: "lab" },
];

type Draft = {
  rollo: string;
  hora: string;
  values: Record<string, number | null>;
  estatus: ReleaseStatus;
  notas: string;
  override?: { by: string; at: string; motivo: string; sugerido: ReleaseStatus } | null;
};

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function nextRollo(prev: string | undefined) {
  if (!prev) return "";
  const m = prev.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return "";
  const [, head, num, tail] = m;
  return `${head}${String(Number(num) + 1).padStart(num.length, "0")}${tail}`;
}

function emptyDraft(rolloSeed: string): Draft {
  return {
    rollo: rolloSeed,
    hora: nowHHMM(),
    values: Object.fromEntries(CAPTURE_FIELDS.map((f) => [f.key, null])),
    estatus: "L",
    notas: "",
    override: null,
  };
}

export function GuidedMeasurementCapture({
  rows, onChange, operadorTurno, turno, specVars, locked = false,
}: {
  rows: Measurement[];
  onChange: (rows: Measurement[]) => void;
  operadorTurno: string;
  turno: string;
  specVars: QualityVariable[];
  locked?: boolean;
}) {
  const session = useSession();
  const [showLogin, setShowLogin] = useState(false);

  // Si el usuario ya está autenticado en la app (header), heredamos la sesión de captura
  // como Dirección automáticamente, evitando el doble login "Iniciar captura".
  useEffect(() => {
    if (!session.user || !session.role) {
      setSession({ user: "Ing. Jonathan Alberto Pelaez", role: "direccion" });
    }
  }, [session.user, session.role]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const specMap = useMemo(() => Object.fromEntries(specVars.map((v) => [v.key, v])), [specVars]);

  const isOperadorTurno =
    session.role === "operador" &&
    !!session.user &&
    session.user.trim().toLowerCase() === operadorTurno.trim().toLowerCase();
  const isDireccion = session.role === "direccion";
  const canCapture = !locked && (isOperadorTurno || isDireccion);

  const lastRollo = rows[rows.length - 1]?.rollo;
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(nextRollo(lastRollo)));

  // Mantener rollo sugerido sincronizado si cambia la última fila y el operador aún no escribió
  const userTouchedRolloRef = useRef(false);
  useEffect(() => {
    if (!userTouchedRolloRef.current) {
      setDraft((d) => ({ ...d, rollo: nextRollo(lastRollo) }));
    }
  }, [lastRollo]);

  // Auto-sugerencia de estatus
  const suggestedStatus: ReleaseStatus = useMemo(() => {
    let hasBad = false;
    let hasWarn = false;
    for (const f of CAPTURE_FIELDS) {
      const spec = f.specKey ? specMap[f.specKey] : undefined;
      if (!spec) continue;
      const v = draft.values[f.key as string];
      if (typeof v !== "number") continue;
      const s = evaluateValue(spec, v);
      if (s === "bad") { hasBad = true; break; }
      if (s === "warn") hasWarn = true;
    }
    return hasBad ? "NC" : hasWarn ? "C" : "L";
  }, [draft.values, specMap]);

  // El estatus SIEMPRE sigue al sugerido por el sistema, salvo que exista
  // una sobreescritura explícita autorizada por Control de Calidad (queda evidencia).
  useEffect(() => {
    setDraft((d) => (d.override ? d : { ...d, estatus: suggestedStatus }));
  }, [suggestedStatus]);

  const [showQcOverride, setShowQcOverride] = useState(false);

  const setVal = (key: string, raw: string) => {
    if (!canCapture) return;
    const num = raw === "" ? null : Number(raw);
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: num } }));
  };

  const resetDraft = (seed: string) => {
    userTouchedRolloRef.current = false;
    setDraft(emptyDraft(seed));
  };

  const missingFields = useMemo(
    () => CAPTURE_FIELDS.filter((f) => typeof draft.values[f.key as string] !== "number"),
    [draft.values]
  );
  const isComplete = missingFields.length === 0;

  const save = () => {
    if (!canCapture) return;
    if (!draft.rollo.trim()) { toast.error("Captura el número de rollo."); return; }
    if (!isComplete) {
      toast.error("Captura completa requerida", {
        description: `Faltan ${missingFields.length} variable(s): ${missingFields.map((f) => f.label).join(", ")}`,
      });
      return;
    }

    const num = (k: string) => (draft.values[k] as number | null) ?? null;
    const tMD = num("tensionMD");
    const tCD = num("tensionCD");
    const relMDCD = tMD != null && tCD != null && tCD !== 0 ? Number((tMD / tCD).toFixed(2)) : null;

    const newRow: Measurement = {
      id: crypto.randomUUID(),
      hora: draft.hora || nowHHMM(),
      rollo: draft.rollo.trim(),
      calibre: num("calibre"),
      blancuraR457: num("blancuraR457"),
      blancuraA: num("blancuraA"),
      blancuraB: num("blancuraB"),
      tensionMD: tMD,
      tensionCD: tCD,
      relMDCD,
      elongMD: num("elongMD"),
      humedad: num("humedad"),
      pesoBase: num("pesoBase"),
      anchoUtil: num("anchoUtil"),
      diametro: num("diametro"),
      uniones: num("uniones") ?? 0,
      estatus: draft.estatus,
      pesoRollo: num("pesoRollo"),
      notas: draft.notas,
      estatusOverride: draft.override
        ? {
            sugerido: draft.override.sugerido,
            final: draft.estatus,
            by: draft.override.by,
            at: draft.override.at,
            motivo: draft.override.motivo,
          }
        : null,
    };
    onChange([...rows, newRow]);
    toast.success("Registro guardado correctamente", {
      description: `Rollo ${newRow.rollo} · ${newRow.hora}`,
    });
    resetDraft(nextRollo(newRow.rollo));
  };

  return (
    <div className="space-y-4">
      {/* ENCABEZADO + sesión */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Captura guiada de mediciones</h3>
          <p className="text-xs text-muted-foreground">
            Turno {turno} · Operador asignado: <span className="font-medium text-foreground">{operadorTurno || "—"}</span>
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
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
              >
                <LogOut className="h-3.5 w-3.5" /> Salir
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

      {locked && (
        <div className="rounded-md border border-success/40 bg-success/10 px-4 py-2 text-xs font-medium text-success">
          <Lock className="mr-1.5 inline h-3 w-3" /> Turno cerrado. Las mediciones están en solo lectura.
        </div>
      )}

      {/* ZONA SUPERIOR · TARJETA DE CAPTURA */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card to-primary/5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-5 py-3">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rollo Actual</div>
              <div className="flex items-baseline gap-3">
                <input
                  type="text"
                  value={draft.rollo}
                  disabled={!canCapture}
                  onChange={(e) => { userTouchedRolloRef.current = true; setDraft({ ...draft, rollo: e.target.value }); }}
                  placeholder="0000-0"
                  className="w-36 bg-transparent text-xl font-bold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
                />
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {draft.hora}
                </span>
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/15 px-3 py-1 text-xs font-semibold text-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Pendiente de captura
          </span>
        </div>

        {/* Grid de campos */}
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPTURE_FIELDS.map((f) => {
            const spec = f.specKey ? specMap[f.specKey] : undefined;
            const val = draft.values[f.key as string];
            const status = spec ? evaluateValue(spec, typeof val === "number" ? val : null) : "ok";
            const hasValue = typeof val === "number";
            const ring =
              !hasValue || !spec
                ? "border-input bg-background"
                : status === "bad"
                ? "border-destructive bg-destructive/5 text-destructive ring-destructive/30"
                : status === "warn"
                ? "border-warning bg-warning/10 ring-warning/30"
                : "border-success bg-success/5 ring-success/30";
            return (
              <div key={f.key as string} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {f.label} {f.unit && <span className="text-muted-foreground/70">({f.unit})</span>}
                  </label>
                  {hasValue && spec && (
                    status === "bad" ? <XCircle className="h-4 w-4 text-destructive" />
                    : status === "warn" ? <AlertTriangle className="h-4 w-4 text-warning" />
                    : <CheckCircle2 className="h-4 w-4 text-success" />
                  )}
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={val ?? ""}
                  disabled={!canCapture}
                  onChange={(e) => setVal(f.key as string, e.target.value)}
                  placeholder={spec ? String(spec.objective) : "—"}
                  className={`mt-2 w-full rounded-lg border px-3 py-3 text-2xl font-semibold tabular-nums outline-none ring-2 ring-transparent transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-muted/40 ${ring}`}
                />
                {spec && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Obj. <span className="font-medium text-foreground tabular-nums">{spec.objective}</span></span>
                    <span>Rango <span className="tabular-nums">{spec.min}–{spec.max}</span></span>
                  </div>
                )}
                {hasValue && spec && status !== "ok" && (
                  <div className={`mt-1.5 text-[11px] font-medium ${status === "bad" ? "text-destructive" : "text-warning-foreground"}`}>
                    {status === "bad" ? "⚠ Fuera de especificación" : "Cercano al límite"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Estatus + Notas + Guardar */}
        <div className="grid grid-cols-1 gap-4 border-t border-border bg-card/60 p-5 lg:grid-cols-[1fr_2fr_auto]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estatus</label>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${draft.estatus === "L" ? "bg-success" : draft.estatus === "C" ? "bg-warning" : "bg-destructive"}`} />
              <span className="text-sm font-semibold text-foreground">
                {draft.estatus === "L" ? "Liberado" : draft.estatus === "C" ? "Condicional" : "No Conforme"}
              </span>
              <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {draft.override ? (
                  <>Sobreescrito por <span className="font-semibold text-foreground">{draft.override.by}</span> · sugerido: {draft.override.sugerido === "L" ? "Liberado" : draft.override.sugerido === "C" ? "Condicional" : "No Conforme"}</>
                ) : (
                  <>Calculado automáticamente según especificaciones</>
                )}
              </span>
              {canCapture && !locked && (
                draft.override ? (
                  <button
                    onClick={() => setDraft((d) => ({ ...d, override: null, estatus: suggestedStatus }))}
                    className="rounded border border-input bg-background px-2 py-0.5 text-[10px] font-semibold hover:bg-accent"
                  >
                    Quitar override
                  </button>
                ) : (
                  <button
                    onClick={() => setShowQcOverride(true)}
                    className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20"
                  >
                    Cambiar (Control de Calidad)
                  </button>
                )
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas / Observaciones</label>
            <NotasSelect
              value={draft.notas}
              disabled={!canCapture}
              onChange={(v) => setDraft({ ...draft, notas: v })}
            />
          </div>
          <div className="flex items-end">
            <button
              disabled={!canCapture}
              onClick={save}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-md hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
            >
              <Save className="h-4 w-4" /> Guardar Registro
            </button>
          </div>
        </div>
      </div>

      {/* ZONA INFERIOR · RESUMEN */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Resumen del turno</h3>
          <span className="text-xs text-muted-foreground">{rows.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Hora</th>
                <th className="px-4 py-2">Rollo</th>
                <th className="px-4 py-2">Estatus</th>
                <th className="px-4 py-2">Observación</th>
                <th className="px-4 py-2 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">Aún no hay registros en este turno.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-border hover:bg-accent/40" onClick={() => setDetailId(r.id)}>
                  <td className="px-4 py-2 tabular-nums">{r.hora}</td>
                  <td className="px-4 py-2 font-medium tabular-nums">{r.rollo}</td>
                  <td className="px-4 py-2"><ReleaseBadge s={r.estatus} /></td>
                  <td className="px-4 py-2 text-muted-foreground">{r.notas || "Sin observaciones"}</td>
                  <td className="px-4 py-2 text-right">
                    <button className="text-xs font-medium text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}>
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showLogin && (
        <LoginModal
          operadorTurno={operadorTurno}
          turno={turno}
          onCancel={() => setShowLogin(false)}
          onSuccess={(user, role) => { setSession({ user, role }); setShowLogin(false); }}
        />
      )}

      {showQcOverride && (
        <QcOverrideModal
          sugerido={suggestedStatus}
          actual={draft.estatus}
          onCancel={() => setShowQcOverride(false)}
          onConfirm={({ by, nuevoEstatus, motivo }) => {
            setDraft((d) => ({
              ...d,
              estatus: nuevoEstatus,
              override: { by, at: new Date().toISOString(), motivo, sugerido: suggestedStatus },
            }));
            setShowQcOverride(false);
            toast.success("Estatus actualizado por Control de Calidad", {
              description: `Por ${by} · evidencia registrada`,
            });
          }}
        />
      )}

      {detailId && (
        <DetailDrawer
          row={rows.find((r) => r.id === detailId)!}
          specMap={specMap}
          capturedBy={session.user ?? operadorTurno}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

/* ---------- Detalle lateral ---------- */
function DetailDrawer({
  row, specMap, capturedBy, onClose,
}: {
  row: Measurement;
  specMap: Record<string, QualityVariable>;
  capturedBy: string;
  onClose: () => void;
}) {
  const fields: { key: keyof Measurement; label: string; unit?: string; specKey?: string }[] = [
    { key: "humedad", label: "Humedad", unit: "%", specKey: "humedad" },
    { key: "pesoBase", label: "Peso base", unit: "g/m²", specKey: "pesoBase" },
    { key: "anchoUtil", label: "Ancho útil", unit: "cm", specKey: "anchoUtil" },
    { key: "diametro", label: "Diámetro", unit: "cm", specKey: "diametro" },
    { key: "uniones", label: "Uniones" },
    { key: "pesoRollo", label: "Peso rollo", unit: "kg" },
    { key: "calibre", label: "Calibre", unit: "mm", specKey: "calibre" },
    { key: "blancuraR457", label: "R457", unit: "%", specKey: "blancuraR457" },
    { key: "tensionMD", label: "Tensión MD", unit: "g/in", specKey: "tensionMD" },
    { key: "tensionCD", label: "Tensión CD", unit: "g/in", specKey: "tensionCD" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalle del registro</div>
            <div className="text-lg font-bold text-foreground">Rollo {row.rollo}</div>
          </div>
          <button onClick={onClose} className="rounded-md border border-input bg-background p-2 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div><div className="text-muted-foreground">Hora</div><div className="font-semibold text-foreground tabular-nums">{row.hora}</div></div>
            <div><div className="text-muted-foreground">Estatus</div><ReleaseBadge s={row.estatus} /></div>
            <div className="col-span-2"><div className="text-muted-foreground">Capturado por</div>
              <div className="inline-flex items-center gap-1 font-semibold text-foreground"><UserIcon className="h-3 w-3" /> {capturedBy}</div>
            </div>
          </div>
          <div className="rounded-lg border border-border">
            <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground">Mediciones</div>
            <table className="w-full text-sm">
              <tbody>
                {fields.map((f) => {
                  const v = row[f.key] as number | null;
                  const spec = f.specKey ? specMap[f.specKey] : undefined;
                  const status = spec ? evaluateValue(spec, v) : "ok";
                  const dot = status === "bad" ? "bg-destructive" : status === "warn" ? "bg-warning" : "bg-success";
                  return (
                    <tr key={f.key as string} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{f.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                        {v ?? "—"} {v != null && f.unit}
                      </td>
                      <td className="px-3 py-2 w-6">{v != null && spec && <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observaciones</div>
            <div className="mt-1 rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
              {row.notas || "Sin observaciones."}
            </div>
          </div>
          <button onClick={onClose} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
            <X className="h-4 w-4" /> Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Login modal (reutilizado) ---------- */
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

  const USERS: Record<string, { pass: string; role: "operador" | "direccion" }> = {
    general: { pass: "12345678", role: "direccion" },
  };

  const submit = () => {
    const u = user.trim();
    if (!u || !pass) { setErr("Ingresa usuario y clave."); return; }
    const reg = USERS[u.toLowerCase()];
    if (reg && reg.pass === pass) return onSuccess(u, reg.role);
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
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Usuario</label>
            <input value={user} onChange={(e) => setUser(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={operadorTurno || "nombre.usuario"} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clave</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="••••••••" />
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

/* ---------- Notas (select múltiple) ---------- */
function NotasSelect({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => value.split(",").map((s) => s.trim()).filter(Boolean), [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt];
    onChange(next.join(", "));
  };

  return (
    <div ref={ref} className="relative mt-1 w-full">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:bg-muted/40">
        <span className={`truncate ${selected.length === 0 ? "text-muted-foreground" : "text-foreground"}`}>
          {selected.length === 0 ? "Seleccionar observaciones…" : selected.join(", ")}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && !disabled && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-64 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {NOTAS_OPCIONES.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">
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

/* ---------- Override de estatus (Control de Calidad) ---------- */
function QcOverrideModal({
  sugerido, actual, onCancel, onConfirm,
}: {
  sugerido: ReleaseStatus;
  actual: ReleaseStatus;
  onCancel: () => void;
  onConfirm: (p: { by: string; nuevoEstatus: ReleaseStatus; motivo: string }) => void;
}) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [nuevo, setNuevo] = useState<ReleaseStatus>(actual);
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Credenciales simuladas autorizadas de Control de Calidad
  const QC_USERS: Record<string, string> = {
    "calidad": "calidad",
    "qc": "qc",
    "jonathan.pelaez": "calidad",
  };

  const submit = () => {
    const u = user.trim().toLowerCase();
    if (!u || !pass) { setErr("Ingresa usuario y clave de Control de Calidad."); return; }
    if (QC_USERS[u] !== pass) { setErr("Credenciales de Control de Calidad inválidas."); return; }
    if (!motivo.trim() || motivo.trim().length < 5) { setErr("Captura un motivo (mín. 5 caracteres)."); return; }
    if (nuevo === sugerido) { setErr("El estatus seleccionado coincide con el sugerido."); return; }
    onConfirm({ by: user.trim(), nuevoEstatus: nuevo, motivo: motivo.trim() });
  };

  const label = (s: ReleaseStatus) => s === "L" ? "Liberado" : s === "C" ? "Condicional" : "No Conforme";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Cambio de estatus · Control de Calidad</h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          El estatus sugerido por el sistema es <span className="font-semibold text-foreground">{label(sugerido)}</span>.
          Sobreescribirlo requiere autenticación y queda registrado como evidencia.
        </p>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Usuario QC</label>
              <input value={user} onChange={(e) => setUser(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="usuario.calidad" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clave</label>
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="••••••••" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nuevo estatus</label>
            <select value={nuevo} onChange={(e) => setNuevo(e.target.value as ReleaseStatus)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold">
              <option value="L">🟢 Liberado</option>
              <option value="C">🟡 Condicional</option>
              <option value="NC">🔴 No Conforme</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Motivo / Justificación</label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ej. Reanálisis con muestra adicional, autorizado por jefe de calidad…" />
          </div>
          {err && <div className="text-xs font-medium text-destructive">{err}</div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">Cancelar</button>
          <button onClick={submit} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Confirmar y firmar</button>
        </div>
      </div>
    </div>
  );
}
