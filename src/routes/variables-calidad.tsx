import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PRODUCT_SPECS, PRODUCT_FAMILIES } from "@/lib/spec-catalog";
import {
  AUTHORIZED_USERS, AUTH_PASSWORD, appendAudit, auditFor,
  type SpecChangeRecord,
} from "@/lib/spec-audit";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo-convertipap.png";
import {
  Pencil, Power, Lock, FileSpreadsheet, ShieldCheck, Save, X,
} from "lucide-react";

export const Route = createFileRoute("/variables-calidad")({ component: VariablesCalidad });

type DraftMap = Record<string, { min: number; objective: number; max: number }>;

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

  // Edición
  const [authOpen, setAuthOpen] = useState(false);
  const [editor, setEditor] = useState<
    { username: string; fullName: string; role: SpecChangeRecord["role"] } | null
  >(null);
  const [draft, setDraft] = useState<DraftMap>({});
  const [reason, setReason] = useState("");

  // Bitácora del producto activo
  const [log, setLog] = useState<SpecChangeRecord[]>([]);
  useEffect(() => {
    setLog(auditFor(activeSpec?.code ?? ""));
    setEditor(null); setDraft({}); setReason("");
  }, [activeSpec?.code]);

  const isEditing = editor !== null;

  const startEdit = () => setAuthOpen(true);
  const onAuthorized = (u: { username: string; fullName: string; role: SpecChangeRecord["role"] }) => {
    setEditor(u);
    const d: DraftMap = {};
    activeSpec?.variables.forEach((v) => {
      d[v.key] = { min: v.min, objective: v.objective, max: v.max };
    });
    setDraft(d);
    setAuthOpen(false);
  };
  const cancelEdit = () => { setEditor(null); setDraft({}); setReason(""); };

  const saveEdit = () => {
    if (!editor || !activeSpec) return;
    if (!reason.trim()) { alert("Indique el motivo del cambio."); return; }
    const now = new Date().toISOString();
    const records: SpecChangeRecord[] = [];
    activeSpec.variables.forEach((v) => {
      const d = draft[v.key];
      if (!d) return;
      (["min", "objective", "max"] as const).forEach((field) => {
        if (d[field] !== v[field]) {
          records.push({
            id: crypto.randomUUID(),
            timestamp: now,
            username: editor.username,
            fullName: editor.fullName,
            role: editor.role,
            plant: "TLX",
            productCode: activeSpec.code,
            productName: activeSpec.name,
            variableKey: v.key,
            variableLabel: v.label,
            field,
            oldValue: v[field],
            newValue: d[field],
            reason: reason.trim(),
          });
          // Mutación local del catálogo (en producción: persistir en BD)
          (v as any)[field] = d[field];
        }
      });
    });
    if (records.length === 0) { alert("No hay cambios para guardar."); return; }
    appendAudit(records);
    setLog(auditFor(activeSpec.code));
    cancelEdit();
  };

  const exportPDF = async () => {
    if (!activeSpec) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const records = auditFor(activeSpec.code).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const W = doc.internal.pageSize.getWidth();

    // Logo centrado y luego título debajo
    let cursorY = 30;
    try {
      const blob = await fetch(logoUrl).then((r) => r.blob());
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      const logoW = 130;
      const logoH = logoW * (300 / 700); // ~55.7
      doc.addImage(dataUrl, "PNG", (W - logoW) / 2, cursorY, logoW, logoH);
      cursorY += logoH + 18;
    } catch {
      cursorY = 50;
    }

    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text("Reporte de Trazabilidad de Cambios de Especificaciones", W / 2, cursorY, { align: "center" });
    cursorY += 16;

    doc.setFontSize(10).setFont("helvetica", "normal");
    const meta = [
      ["Planta", "TLX"],
      ["Producto", activeSpec.name],
      ["Código", activeSpec.code],
      ["Familia", activeSpec.family],
      ["Fecha de emisión", new Date().toLocaleString("es-MX")],
    ];
    autoTable(doc, {
      startY: cursorY,
      head: [["Datos Generales", ""]],
      body: meta,
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 140 } },
    });

    autoTable(doc, {
      head: [["Fecha y Hora", "Usuario", "Nombre Completo", "Variable", "Campo", "Anterior", "Nuevo", "Motivo"]],
      body: records.length
        ? records.map((r) => [
            new Date(r.timestamp).toLocaleString("es-MX"),
            r.username,
            r.fullName,
            r.variableLabel,
            r.field,
            String(r.oldValue),
            String(r.newValue),
            r.reason,
          ])
        : [["—", "—", "—", "Sin cambios registrados", "—", "—", "—", "—"]],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235] },
      startY: (doc as any).lastAutoTable.finalY + 14,
    });

    const last = records[records.length - 1];
    const y = (doc as any).lastAutoTable.finalY + 24;
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text("Último cambio realizado por:", 40, y);
    doc.setFont("helvetica", "normal");
    doc.text(last ? last.fullName : "—", 40, y + 14);
    doc.setFont("helvetica", "bold").text("Fecha:", 40, y + 32);
    doc.setFont("helvetica", "normal").text(last ? new Date(last.timestamp).toLocaleString("es-MX") : "—", 90, y + 32);
    doc.setFont("helvetica", "bold").text("Cargo:", 40, y + 48);
    doc.setFont("helvetica", "normal").text(last ? last.role : "—", 90, y + 48);

    doc.save(`Trazabilidad_${activeSpec.code}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <AppLayout title="Variables de Calidad · Catálogo Maestro de Especificaciones">
      <div className="space-y-5">
        {/* Selectores */}
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
                {PRODUCT_FAMILIES.map((f) => (<option key={f} value={f}>{f}</option>))}
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

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {activeSpec?.family}
              </div>
              <h3 className="text-base font-semibold text-foreground">{activeSpec?.name}</h3>
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
              {!isEditing ? (
                <>
                  <button onClick={startEdit} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-accent">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button onClick={exportPDF} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-accent">
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar
                  </button>
                </>
              ) : (
                <>
                  <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">
                    Editando como {editor?.fullName} ({editor?.role})
                  </span>
                  <button onClick={saveEdit} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90">
                    <Save className="h-3.5 w-3.5" /> Guardar
                  </button>
                  <button onClick={cancelEdit} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-accent">
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </button>
                </>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="border-b border-border bg-muted/20 px-5 py-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Motivo del cambio (obligatorio)
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. Ajuste por validación de proceso / cambio de proveedor / etc."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

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
                {activeSpec?.variables.map((v) => {
                  const d = draft[v.key];
                  return (
                    <tr key={v.key} className="border-t border-border hover:bg-accent/40">
                      <td className="px-4 py-2 font-medium text-foreground">{v.label}</td>
                      <td className="px-4 py-2 text-muted-foreground">{v.unit || "—"}</td>
                      {(["min", "objective", "max"] as const).map((f) => (
                        <td key={f} className="px-4 py-2 tabular-nums">
                          {isEditing && d ? (
                            <input
                              type="number" step="0.01" value={d[f]}
                              onChange={(e) => setDraft((prev) => ({
                                ...prev,
                                [v.key]: { ...prev[v.key], [f]: Number(e.target.value) },
                              }))}
                              className={`w-24 rounded-md border bg-background px-2 py-1 text-sm tabular-nums ${
                                f === "objective" ? "border-primary/40 font-semibold text-primary" : "border-input"
                              }`}
                            />
                          ) : (
                            <span className={f === "objective" ? "font-semibold text-primary" : ""}>{v[f]}</span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                          <Power className="h-2.5 w-2.5" /> Activa
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              Solo lectura · Modificación restringida a Dirección, Calidad Senior y Administrador.
            </div>
            <div>
              {log.length > 0
                ? `Última modificación: ${new Date(log[log.length - 1].timestamp).toLocaleString("es-MX")} · ${log[log.length - 1].fullName}`
                : "Sin modificaciones registradas"}
            </div>
          </div>
        </div>

        {/* Bitácora */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground">Bitácora de cambios — {activeSpec?.code}</h3>
            <p className="text-xs text-muted-foreground">Registro permanente, no modificable.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Fecha y hora</th>
                  <th className="px-4 py-2">Usuario</th>
                  <th className="px-4 py-2">Nombre</th>
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">Variable</th>
                  <th className="px-4 py-2">Campo</th>
                  <th className="px-4 py-2 tabular-nums">Anterior</th>
                  <th className="px-4 py-2 tabular-nums">Nuevo</th>
                  <th className="px-4 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {log.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Sin movimientos registrados.</td></tr>
                )}
                {[...log].reverse().map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2 tabular-nums">{new Date(r.timestamp).toLocaleString("es-MX")}</td>
                    <td className="px-4 py-2">{r.username}</td>
                    <td className="px-4 py-2">{r.fullName}</td>
                    <td className="px-4 py-2">{r.role}</td>
                    <td className="px-4 py-2">{r.variableLabel}</td>
                    <td className="px-4 py-2">{r.field}</td>
                    <td className="px-4 py-2 tabular-nums">{r.oldValue}</td>
                    <td className="px-4 py-2 tabular-nums font-semibold text-primary">{r.newValue}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {authOpen && (
        <AuthModal
          onCancel={() => setAuthOpen(false)}
          onConfirm={onAuthorized}
        />
      )}
    </AppLayout>
  );
}

function AuthModal({
  onCancel, onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (u: { username: string; fullName: string; role: SpecChangeRecord["role"] }) => void;
}) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const u = AUTHORIZED_USERS[user.trim().toLowerCase()];
    if (!u || pass !== AUTH_PASSWORD) {
      setErr("No cuenta con autorización para modificar especificaciones.");
      return;
    }
    onConfirm({ username: user.trim().toLowerCase(), fullName: u.fullName, role: u.role });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Autenticación requerida</h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Solo Dirección, Calidad Senior o Administrador pueden modificar especificaciones.
          Se requiere revalidar credenciales aunque exista sesión iniciada.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Usuario</label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="jonathan.pelaez"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contraseña</label>
            <input
              type="password" value={pass}
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
          <button onClick={submit} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Autenticar</button>
        </div>
      </div>
    </div>
  );
}
