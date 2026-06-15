import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  queryOptions,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionGate } from "@/components/SessionGate";
import {
  listSpecAuditByProductCode,
  registrarSpecAuditByCode,
  listEspecsActivasConVariables,
  updateCaracteristicasByCode,
} from "@/lib/qc.functions";
import { useAuth } from "@/lib/auth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo-convertipap.png";
import {
  Pencil, Power, Lock, FileSpreadsheet, Save, X, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const especsQueryOptions = queryOptions({
  queryKey: ["variables-calidad", "especs"],
  queryFn: () => listEspecsActivasConVariables(),
});

export const Route = createFileRoute("/variables-calidad")({
  component: VariablesCalidadGate,
  ssr: false,
});

function VariablesCalidadGate() {
  return (
    <SessionGate>
      <VariablesCalidad />
    </SessionGate>
  );
}

type DraftMap = Record<string, { min: number; objective: number; max: number }>;

// Spec: Dirección y Gerencia General solo pueden CONSULTAR variables de calidad.
const ROLES_EDIT = ["calidad", "administrador"] as const;

type AuditRow = {
  id: string;
  modificado_at: string;
  modificado_por_nombre: string | null;
  modificado_por_rol: string | null;
  variable_clave: string;
  variable_etiqueta: string;
  campo: string;
  valor_anterior: number | null;
  valor_nuevo: number | null;
  motivo: string;
};

function VariablesCalidad() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const listAuditFn = useServerFn(listSpecAuditByProductCode);
  const registrarFn = useServerFn(registrarSpecAuditByCode);
  const updateCaracFn = useServerFn(updateCaracteristicasByCode);

  const especsQuery = useQuery({
    ...especsQueryOptions,
    enabled: !!auth.session?.access_token,
    retry: false,
  });
  const especs = especsQuery.data ?? [];

  const families = useMemo(
    () => Array.from(new Set(especs.map((p) => p.family))).sort(),
    [especs],
  );

  const [family, setFamily] = useState<string>("all");
  const [selected, setSelected] = useState<string>(especs[0]?.code ?? "");

  const filtered = useMemo(
    () => especs.filter((p) => family === "all" || p.family === family),
    [family, especs],
  );
  const activeSpec = useMemo(
    () => especs.find((p) => p.code === selected) ?? filtered[0] ?? especs[0],
    [selected, filtered, especs],
  );

  const auditQuery = useQuery({
    queryKey: ["spec-audit", activeSpec?.code],
    queryFn: () => listAuditFn({ data: { codigo: activeSpec!.code } }),
    enabled: !!activeSpec?.code,
  });
  const log = (auditQuery.data ?? []) as AuditRow[];

  const puedeEditar = auth.roles.some((r) =>
    (ROLES_EDIT as readonly string[]).includes(r),
  );

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<DraftMap>({});
  const [reason, setReason] = useState("");
  const [caracteristicas, setCaracteristicas] = useState<string>("");
  const [carInitial, setCarInitial] = useState<string>("");
  const [savingCar, setSavingCar] = useState(false);

  useEffect(() => {
    setIsEditing(false); setDraft({}); setReason("");
    const c = ((activeSpec as unknown as { caracteristicas?: string })?.caracteristicas) ?? "";
    setCaracteristicas(c);
    setCarInitial(c);
  }, [activeSpec?.code, activeSpec]);

  const startEdit = () => {
    if (!puedeEditar) {
      toast.error("Solo Calidad o Administrador pueden modificar especificaciones.");
      return;
    }
    const d: DraftMap = {};
    activeSpec?.variables.forEach((v) => {
      d[v.key] = { min: v.min, objective: v.objective, max: v.max };
    });
    setDraft(d);
    setIsEditing(true);
  };
  const cancelEdit = () => { setIsEditing(false); setDraft({}); setReason(""); };

  const saveMut = useMutation({
    mutationFn: registrarFn,
    onError: (e: Error) => toast.error(e.message),
  });

  if (especsQuery.error) {
    return (
      <AppLayout title="Variables de Calidad · Catálogo Maestro de Especificaciones">
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudieron cargar las variables: {especsQuery.error.message}
        </div>
      </AppLayout>
    );
  }

  if (especsQuery.isLoading) {
    return (
      <AppLayout title="Variables de Calidad · Catálogo Maestro de Especificaciones">
        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">Cargando variables…</div>
      </AppLayout>
    );
  }

  const saveEdit = async () => {
    if (!activeSpec) return;
    if (!reason.trim()) { toast.warning("Indique el motivo del cambio."); return; }

    const changes: Array<{
      variable_clave: string; variable_etiqueta: string;
      campo: "min" | "objetivo" | "max";
      valor_anterior: number; valor_nuevo: number;
    }> = [];

    activeSpec.variables.forEach((v) => {
      const d = draft[v.key];
      if (!d) return;
      (["min", "objective", "max"] as const).forEach((field) => {
        if (d[field] !== v[field]) {
          changes.push({
            variable_clave: v.key,
            variable_etiqueta: v.label,
            campo: field === "objective" ? "objetivo" : (field as "min" | "max"),
            valor_anterior: v[field],
            valor_nuevo: d[field],
          });
        }
      });
    });

    if (changes.length === 0) { toast.info("No hay cambios para guardar."); return; }

    try {
      for (const c of changes) {
        await saveMut.mutateAsync({
          data: {
            producto_codigo: activeSpec.code,
            variable_clave: c.variable_clave,
            variable_etiqueta: c.variable_etiqueta,
            campo: c.campo,
            valor_anterior: c.valor_anterior,
            valor_nuevo: c.valor_nuevo,
            motivo: reason.trim(),
          },
        });
      }
      toast.success(`${changes.length} cambio(s) guardados en la base de datos.`);
      await queryClient.invalidateQueries({ queryKey: ["variables-calidad", "especs"] });
      void queryClient.invalidateQueries({ queryKey: ["spec-audit", activeSpec.code] });
      cancelEdit();
    } catch {
      /* error ya notificado por onError */
    }
  };

  const saveCaracteristicas = async () => {
    if (!activeSpec) return;
    if (!puedeEditar) {
      toast.error("Solo Calidad o Administrador pueden modificar.");
      return;
    }
    if (caracteristicas.length > 700) {
      toast.error("Máximo 700 caracteres.");
      return;
    }
    setSavingCar(true);
    try {
      const res = await updateCaracFn({
        data: { producto_codigo: activeSpec.code, caracteristicas },
      });
      if (res.changed) {
        toast.success("Características guardadas.");
        setCarInitial(caracteristicas);
        await queryClient.invalidateQueries({ queryKey: ["variables-calidad", "especs"] });
        void queryClient.invalidateQueries({ queryKey: ["spec-audit", activeSpec.code] });
      } else {
        toast.info("Sin cambios.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingCar(false);
    }
  };


  const exportPDF = async () => {
    if (!activeSpec) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const records = [...log].sort((a, b) => a.modificado_at.localeCompare(b.modificado_at));
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const MARGIN_X = 36;
    const CONTENT_W = W - MARGIN_X * 2;

    // Paleta industrial sobria
    const C_PRIMARY: [number, number, number] = [15, 42, 79];   // azul corporativo profundo
    const C_ACCENT:  [number, number, number] = [37, 99, 235];  // azul vivo
    const C_TEXT:    [number, number, number] = [30, 41, 59];
    const C_MUTED:   [number, number, number] = [100, 116, 139];
    const C_LINE:    [number, number, number] = [203, 213, 225];
    const C_ZEBRA:   [number, number, number] = [247, 249, 252];

    const issuedAt = new Date();
    const emisor = auth.profile?.nombre ?? auth.user?.email ?? "—";
    const rolEmisor = auth.roles.join(", ") || "—";

    // Logo precargado para encabezado en todas las páginas
    let logoDataUrl: string | null = null;
    try {
      const blob = await fetch(logoUrl).then((r) => r.blob());
      logoDataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
    } catch { /* sin logo */ }

    const drawHeader = () => {
      // Banda superior fina
      doc.setFillColor(...C_PRIMARY);
      doc.rect(0, 0, W, 4, "F");

      // Logo a la izquierda
      if (logoDataUrl) {
        const logoW = 90;
        const logoH = logoW * (300 / 700);
        doc.addImage(logoDataUrl, "PNG", MARGIN_X, 16, logoW, logoH);
      }

      // Título central
      doc.setTextColor(...C_PRIMARY).setFont("helvetica", "bold").setFontSize(7.5);
      doc.text("REPORTE DE TRAZABILIDAD", W / 2, 26, { align: "center" });
      doc.setTextColor(...C_MUTED).setFont("helvetica", "normal").setFontSize(7.5);
      doc.text("Catálogo Maestro de Especificaciones de Calidad", W / 2, 38, { align: "center" });


      // Línea inferior del encabezado
      doc.setDrawColor(...C_LINE).setLineWidth(0.5);
      doc.line(MARGIN_X, 78, W - MARGIN_X, 78);
    };

    const drawFooter = (pageNum: number, pageTotal: number) => {
      const fy = H - 28;
      doc.setDrawColor(...C_LINE).setLineWidth(0.5);
      doc.line(MARGIN_X, fy, W - MARGIN_X, fy);
      doc.setFontSize(7.5).setTextColor(...C_MUTED).setFont("helvetica", "normal");
      doc.text("Convertipap · Fábrica de Papel Tissue", MARGIN_X, fy + 10);
      doc.text(
        `Generado por: ${emisor} (${rolEmisor})  ·  ${issuedAt.toLocaleString("es-MX")}`,
        W / 2, fy + 10, { align: "center" },
      );
      doc.text(`Página ${pageNum} de ${pageTotal}`, W - MARGIN_X, fy + 10, { align: "right" });
      doc.setFontSize(7.5).setTextColor(180, 180, 180);
      doc.text(
        "Documento controlado. Reproducción no autorizada prohibida.",
        W / 2, fy + 19, { align: "center" },
      );
    };

    let cursorY = 92;

    // ===== Datos Generales =====
    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN_X, right: MARGIN_X, top: 92, bottom: 44 },
      head: [["DATOS GENERALES", ""]],
      body: [
        ["Producto", activeSpec.name],
        ["Código de producto", activeSpec.code],
        ["Cláusula de referencia", "Cláusula 9.1.2 ISO 9001:2015"],
        ["Tipo de documento", "ESPECIFICACIÓN PST"],
        ["Área", "CALIDAD"],
        ["Fecha y hora de emisión", issuedAt.toLocaleString("es-MX")],
        ["Emitido por", `${emisor}  ·  ${rolEmisor}`],
      ],
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 5, textColor: C_TEXT, lineColor: C_LINE, lineWidth: 0.3 },
      headStyles: { fillColor: C_PRIMARY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, halign: "left" },
      columnStyles: {
        0: { cellWidth: 150, fillColor: C_ZEBRA, textColor: C_PRIMARY },
      },
    });

    // ===== Política Ambiental =====
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(...C_PRIMARY);
    doc.text("POLÍTICA AMBIENTAL", MARGIN_X, cursorY);
    doc.setDrawColor(...C_ACCENT).setLineWidth(0.8);
    doc.line(MARGIN_X, cursorY + 2, MARGIN_X + 130, cursorY + 2);

    const policyText =
      "En CONVERTIDOR DE PAPEL S. A. DE C. V. fabricamos papel higiénico, papel servilleta, toallas y toallas para cocina a base de fibras recicladas y otros aditivos de origen orgánico, características que permiten que nuestros productos sean 100 % biodegradables.\n\n" +
      "Para CONVERTIDOR DE PAPEL S. A. DE C. V., la protección del medio ambiente es un compromiso permanente con nuestros clientes, nuestros colaboradores y el planeta.";

    doc.setFontSize(7.5).setFont("helvetica", "normal").setTextColor(...C_TEXT);
    const splitPolicy = doc.splitTextToSize(policyText, CONTENT_W);
    doc.text(splitPolicy, MARGIN_X, cursorY + 14);

    const policyBlockHeight = splitPolicy.length * 7.5 * 1.2;

    // ===== Especificaciones Vigentes =====
    cursorY = cursorY + 14 + policyBlockHeight + 12;
    doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(...C_PRIMARY);
    doc.text("ESPECIFICACIONES VIGENTES", MARGIN_X, cursorY);
    doc.setDrawColor(...C_ACCENT).setLineWidth(1);
    doc.line(MARGIN_X, cursorY + 3, MARGIN_X + 130, cursorY + 3);

    autoTable(doc, {
      startY: cursorY + 8,
      margin: { left: MARGIN_X, right: MARGIN_X, top: 92, bottom: 44 },
      head: [["#", "Variable", "Unidad", "Mínimo", "Objetivo", "Máximo"]],
      body: activeSpec.variables.map((v, i) => [
        String(i + 1).padStart(2, "0"),
        v.label,
        v.unit || "—",
        v.min == null ? "—" : String(v.min),
        v.objective == null ? "—" : String(v.objective),
        v.max == null ? "—" : String(v.max),
      ]),
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 4.5, textColor: C_TEXT, lineColor: C_LINE, lineWidth: 0.3 },
      headStyles: { fillColor: C_PRIMARY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, halign: "center" },
      alternateRowStyles: { fillColor: C_ZEBRA },
      columnStyles: {
        0: { halign: "center", cellWidth: 28, textColor: C_MUTED, fontSize: 7.5 },
        1: { cellWidth: 170 },
        2: { halign: "center", cellWidth: 55 },
        3: { halign: "right", font: "courier" },
        4: { halign: "right", font: "courier", textColor: C_ACCENT },
        5: { halign: "right", font: "courier" },
      },
    });

    // ===== Características de los Atributos =====
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
    doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(...C_PRIMARY);
    doc.text("CARACTERÍSTICAS DE LOS ATRIBUTOS", MARGIN_X, cursorY);
    doc.setDrawColor(...C_ACCENT).setLineWidth(1);
    doc.line(MARGIN_X, cursorY + 3, MARGIN_X + 160, cursorY + 3);

    autoTable(doc, {
      startY: cursorY + 8,
      margin: { left: MARGIN_X, right: MARGIN_X, top: 92, bottom: 44 },
      body: [[caracteristicas?.trim() ? caracteristicas : "Sin características registradas."]],
      theme: "grid",
      styles: {
        fontSize: 7.5, cellPadding: 8, textColor: C_TEXT,
        lineColor: C_LINE, lineWidth: 0.3, minCellHeight: 40,
        fillColor: [252, 253, 255],
      },
    });


    // ===== Control y Autorización del Documento (firmantes) =====
    let signY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
    if (signY + 110 > H - 50) { doc.addPage(); signY = 92; }

    doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(...C_PRIMARY);
    doc.text("CONTROL Y AUTORIZACIÓN DEL DOCUMENTO", MARGIN_X, signY);
    doc.setDrawColor(...C_ACCENT).setLineWidth(1);
    doc.line(MARGIN_X, signY + 3, MARGIN_X + CONTENT_W, signY + 3);

    const signers = [
      { action: "Elaboró:", role: "Jefe de Calidad", name: "Karina Méndez" },
      { action: "Revisó:", role: "Gerente de Calidad", name: "Jonatan Peláez" },
      { action: "Revisó:", role: "Gerente de Producción", name: "Luis Alcalá" },
      { action: "Autorizó:", role: "Director de Planta", name: "Javier García" },
      { action: "Autorizó:", role: "Dirección corporativa", name: "Lic. Luis Reséndiz" },
    ];

    const colW = CONTENT_W / 5;
    const rowH = 22;
    const tableY = signY + 10;

    // Dibujar tabla de firmantes horizontal (5 columnas x 4 filas)
    for (let c = 0; c < 5; c++) {
      const x = MARGIN_X + c * colW;
      // Fila 1: Acción
      doc.setFillColor(...C_PRIMARY);
      doc.rect(x, tableY, colW, rowH, "F");
      doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(6);
      doc.text(signers[c].action, x + colW / 2, tableY + rowH / 2 + 2, { align: "center" });

      // Fila 2: Cargo
      const bg2: [number, number, number] = c % 2 === 0 ? [252, 253, 255] : C_ZEBRA;
      doc.setFillColor(...bg2);
      doc.rect(x, tableY + rowH, colW, rowH, "F");
      doc.setTextColor(...C_TEXT).setFont("helvetica", "normal").setFontSize(6);
      doc.text(signers[c].role, x + colW / 2, tableY + rowH + rowH / 2 + 2, { align: "center" });

      // Fila 3: Nombre
      const bg3: [number, number, number] = c % 2 === 0 ? [252, 253, 255] : C_ZEBRA;
      doc.setFillColor(...bg3);
      doc.rect(x, tableY + rowH * 2, colW, rowH, "F");
      doc.text(signers[c].name, x + colW / 2, tableY + rowH * 2 + rowH / 2 + 2, { align: "center" });

      // Fila 4: Firma
      const bg4: [number, number, number] = c % 2 === 0 ? [252, 253, 255] : C_ZEBRA;
      doc.setFillColor(...bg4);
      doc.rect(x, tableY + rowH * 3, colW, rowH * 1.8, "F");
      doc.setTextColor(...C_MUTED).setFontSize(5.5);
      doc.text("Firma", x + colW / 2, tableY + rowH * 3 + 8, { align: "center" });
    }

    // Bordes de la tabla
    doc.setDrawColor(...C_LINE).setLineWidth(0.3);
    // Líneas verticales
    for (let c = 0; c <= 5; c++) {
      const x = MARGIN_X + c * colW;
      doc.line(x, tableY, x, tableY + rowH * 4.8);
    }
    // Líneas horizontales
    for (let r = 0; r <= 4; r++) {
      const y = tableY + (r === 4 ? rowH * 4.8 : r * rowH);
      doc.line(MARGIN_X, y, MARGIN_X + CONTENT_W, y);
    }

    // ===== Encabezado y pie en todas las páginas =====
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      drawHeader();
      drawFooter(p, pageCount);
    }

    doc.save(`Trazabilidad_${activeSpec.code}_${issuedAt.toISOString().slice(0, 10)}.pdf`);
  };

  if (especs.length === 0) {
    return (
      <AppLayout title="Variables de Calidad · Catálogo Maestro de Especificaciones">
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay productos con especificaciones registradas en la base de datos.
        </div>
      </AppLayout>
    );
  }

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
                <option value="all">Todas las familias ({especs.length})</option>
                {families.map((f) => (<option key={f} value={f}>{f}</option>))}
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
                {activeSpec?.specVersion && (
                  <>
                    <span>·</span>
                    <span>Versión: <span className="font-semibold text-foreground tabular-nums">{activeSpec.specVersion}</span></span>
                  </>
                )}
                <span>·</span>
                <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 font-semibold text-success">
                  <Power className="h-2.5 w-2.5" /> Activa
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {!isEditing ? (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={startEdit}
                    disabled={!puedeEditar || !activeSpec?.hasSpec}
                    title={puedeEditar ? "" : "Sin permiso para editar"}
                  >
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                  <Button variant="destructive" size="lg" onClick={exportPDF}>
                    <FileSpreadsheet className="h-5 w-5" /> Exportar
                  </Button>
                </>
              ) : (
                <>
                  <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">
                    Editando como {auth.profile?.nombre ?? auth.user?.email} ({auth.roles.join(", ")})
                  </span>
                  <button
                    onClick={saveEdit}
                    disabled={saveMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" /> {saveMut.isPending ? "Guardando…" : "Guardar"}
                  </button>
                  <button onClick={cancelEdit} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-accent">
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </button>
                </>
              )}
            </div>
          </div>

          {!puedeEditar && (
            <div className="border-b border-border bg-muted/20 px-5 py-2 text-[11px] text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" />
              Solo Dirección, Calidad o Administrador pueden modificar especificaciones.
            </div>
          )}

          {!activeSpec?.hasSpec && (
            <div className="border-b border-border bg-warning/10 px-5 py-2 text-[11px] text-warning flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" />
              Este producto aún no tiene especificación registrada en la base de datos.
            </div>
          )}

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
                {activeSpec?.variables.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Sin variables registradas para esta especificación.
                    </td>
                  </tr>
                )}
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
              Persistencia real · cambios escritos en producto_variables + spec_audit_log.
            </div>
            <div>
              {log.length > 0
                ? `Última modificación: ${new Date(log[0].modificado_at).toLocaleString("es-MX")} · ${log[0].modificado_por_nombre ?? "—"}`
                : "Sin modificaciones registradas"}
            </div>
          </div>
        </div>

        {/* Características de los Atributos */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Características de los atributos</h3>
              <p className="text-xs text-muted-foreground">
                Información adicional asociada al producto/especificación seleccionado.
              </p>
            </div>
            <span
              className={`text-[11px] font-semibold tabular-nums ${
                caracteristicas.length > 700 ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {caracteristicas.length}/700
            </span>
          </div>
          <div className="space-y-3 px-5 py-4">
            <label htmlFor="caracteristicas-atributos" className="sr-only">
              CARACTERÍSTICAS DE LOS ATRIBUTOS
            </label>
            <textarea
              id="caracteristicas-atributos"
              value={caracteristicas}
              maxLength={700}
              onChange={(e) => setCaracteristicas(e.target.value.slice(0, 700))}
              placeholder="Captura características adicionales de los atributos…"
              disabled={!puedeEditar || !activeSpec?.hasSpec}
              rows={5}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setCaracteristicas(carInitial)}
                disabled={savingCar || caracteristicas === carInitial}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-accent disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Revertir
              </button>
              <button
                onClick={saveCaracteristicas}
                disabled={
                  !puedeEditar ||
                  !activeSpec?.hasSpec ||
                  savingCar ||
                  caracteristicas === carInitial
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> {savingCar ? "Guardando…" : "Guardar características"}
              </button>
            </div>
          </div>
        </div>

        {/* Bitácora */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground">Bitácora de cambios — {activeSpec?.code}</h3>
            <p className="text-xs text-muted-foreground">Registro permanente, no modificable (Supabase · spec_audit_log).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Usuario</th>
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
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Sin cambios registrados para este producto.
                    </td>
                  </tr>
                )}
                {log.map((r) => {
                  const rExt = r as AuditRow & {
                    valor_anterior_texto?: string | null;
                    valor_nuevo_texto?: string | null;
                  };
                  const ant = rExt.valor_anterior_texto != null
                    ? (rExt.valor_anterior_texto || "(vacío)")
                    : (r.valor_anterior ?? "—");
                  const nue = rExt.valor_nuevo_texto != null
                    ? (rExt.valor_nuevo_texto || "(vacío)")
                    : (r.valor_nuevo ?? "—");
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2 text-xs">{new Date(r.modificado_at).toLocaleString("es-MX")}</td>
                      <td className="px-4 py-2 text-xs">{r.modificado_por_nombre ?? "—"}</td>
                      <td className="px-4 py-2 text-xs uppercase">{r.modificado_por_rol ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{r.variable_etiqueta}</td>
                      <td className="px-4 py-2 text-xs">{r.campo}</td>
                      <td className="px-4 py-2 text-xs max-w-[280px] whitespace-pre-wrap break-words">{ant}</td>
                      <td className="px-4 py-2 text-xs font-semibold max-w-[280px] whitespace-pre-wrap break-words">{nue}</td>
                      <td className="px-4 py-2 text-xs">{r.motivo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
