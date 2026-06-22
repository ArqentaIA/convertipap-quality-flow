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
import { getEvidenciaFlag } from "@/lib/spec-documentos.functions";
import {
  crearBorrador,
  enviarARevision,
  publicarVersion,
  descartarBorrador,
} from "@/lib/spec-publicacion.functions";
import { EvidenciaDocumentalPanel } from "@/components/spec/EvidenciaDocumentalPanel";
import { imprimirVariablesCalidad } from "@/lib/variables-imprimir";
import { useAuth } from "@/lib/auth";
import {
  Pencil, Power, Lock, Save, X, ShieldAlert, Printer,
  FilePlus2, Send, CheckCircle2, Trash2,
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
  const crearBorradorFn = useServerFn(crearBorrador);
  const enviarRevisionFn = useServerFn(enviarARevision);
  const publicarFn = useServerFn(publicarVersion);
  const descartarFn = useServerFn(descartarBorrador);

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

  type Borrador = NonNullable<
    (typeof especs)[number] extends { borrador: infer B } ? B : never
  >;
  const borrador: Borrador | null =
    (activeSpec as unknown as { borrador?: Borrador | null })?.borrador ?? null;
  const hayBorrador = !!borrador;
  const enRevision = borrador?.estado === "en_revision";

  const auditQuery = useQuery({
    queryKey: ["spec-audit", activeSpec?.code],
    queryFn: () => listAuditFn({ data: { codigo: activeSpec!.code } }),
    enabled: !!activeSpec?.code,
  });
  const log = (auditQuery.data ?? []) as AuditRow[];

  const flagFn = useServerFn(getEvidenciaFlag);
  const flagQuery = useQuery({
    queryKey: ["spec-evidencia-flag"],
    queryFn: () => flagFn(),
    enabled: !!auth.session?.access_token,
  });
  const evidenciaObligatoria =
    flagQuery.data?.evidencia_obligatoria === true;

  const puedeEditar = auth.roles.some((r) =>
    (ROLES_EDIT as readonly string[]).includes(r),
  );

  // Variables a mostrar en la tabla: borrador (editable) o vigente (read-only).
  const variablesEditadas = useMemo(
    () => (hayBorrador ? borrador!.variables : activeSpec?.variables ?? []),
    [hayBorrador, borrador, activeSpec],
  );
  const caracteristicasFuente = hayBorrador
    ? borrador!.caracteristicas
    : activeSpec?.caracteristicas ?? "";

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<DraftMap>({});
  const [reason, setReason] = useState("");
  const [caracteristicas, setCaracteristicas] = useState<string>("");
  const [carInitial, setCarInitial] = useState<string>("");
  const [savingCar, setSavingCar] = useState(false);

  useEffect(() => {
    setIsEditing(false); setDraft({}); setReason("");
    const c = caracteristicasFuente ?? "";
    setCaracteristicas(c);
    setCarInitial(c);
  }, [activeSpec?.code, borrador?.id, caracteristicasFuente]);

  const handleImprimir = async () => {
    if (!activeSpec) return;
    try {
      await imprimirVariablesCalidad({
        code: activeSpec.code,
        name: activeSpec.name,
        family: activeSpec.family,
        specVersion:
          (activeSpec as unknown as { specVersion?: string | null }).specVersion ?? null,
        variables: activeSpec.variables.map((v) => ({
          label: v.label,
          unit: v.unit,
          min: v.min,
          objective: v.objective,
          max: v.max,
        })),
        caracteristicas: activeSpec.caracteristicas || null,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const startEdit = () => {
    if (!puedeEditar) {
      toast.error("Solo Calidad o Administrador pueden modificar especificaciones.");
      return;
    }
    if (!hayBorrador) {
      toast.error("Primero crea un borrador para modificar esta especificación.");
      return;
    }
    if (enRevision) {
      toast.error("La especificación está en revisión; descarta o publica antes de editar.");
      return;
    }
    const d: DraftMap = {};
    variablesEditadas.forEach((v) => {
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

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["variables-calidad", "especs"] });
    if (activeSpec?.code) {
      void queryClient.invalidateQueries({ queryKey: ["spec-audit", activeSpec.code] });
      void queryClient.invalidateQueries({
        queryKey: ["spec-documentos", activeSpec.code],
      });
      void queryClient.invalidateQueries({
        queryKey: ["spec-documentos-estado", activeSpec.code],
      });
    }
  };

  const handleCrearBorrador = async () => {
    if (!activeSpec) return;
    const motivo = window.prompt(
      "Motivo del nuevo borrador (mínimo 5 caracteres):",
      "",
    );
    if (!motivo || motivo.trim().length < 5) {
      if (motivo !== null) toast.warning("Motivo obligatorio (mínimo 5 caracteres).");
      return;
    }
    try {
      await crearBorradorFn({
        data: { producto_codigo: activeSpec.code, motivo: motivo.trim() },
      });
      toast.success("Borrador creado. Los cambios no impactan producción hasta publicar.");
      await invalidateAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleEnviarRevision = async () => {
    if (!borrador) return;
    const motivo = window.prompt("Motivo para enviar a revisión:", "");
    if (!motivo || motivo.trim().length < 5) return;
    try {
      await enviarRevisionFn({ data: { spec_id: borrador.id, motivo: motivo.trim() } });
      toast.success("Enviado a revisión.");
      await invalidateAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlePublicar = async () => {
    if (!borrador) return;
    const motivo = window.prompt(
      "Motivo de publicación (la versión vigente pasará a obsoleta):",
      "",
    );
    if (!motivo || motivo.trim().length < 5) return;
    try {
      await publicarFn({ data: { spec_id: borrador.id, motivo: motivo.trim() } });
      toast.success("Versión publicada. La vigente anterior pasó a obsoleta.");
      await invalidateAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDescartar = async () => {
    if (!borrador) return;
    const motivo = window.prompt(
      "Motivo del descarte (el borrador se conserva como 'descartada'):",
      "",
    );
    if (!motivo || motivo.trim().length < 5) return;
    try {
      await descartarFn({ data: { spec_id: borrador.id, motivo: motivo.trim() } });
      toast.success("Borrador descartado (no se eliminaron datos).");
      await invalidateAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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
    if (!activeSpec || !borrador) return;
    if (!reason.trim()) { toast.warning("Indique el motivo del cambio."); return; }

    const changes: Array<{
      variable_clave: string; variable_etiqueta: string;
      campo: "min" | "objetivo" | "max";
      valor_anterior: number; valor_nuevo: number;
    }> = [];

    variablesEditadas.forEach((v) => {
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
      toast.success(`${changes.length} cambio(s) guardados en el borrador.`);
      await invalidateAll();
      cancelEdit();
    } catch {
      /* ya notificado */
    }
  };

  const saveCaracteristicas = async () => {
    if (!activeSpec) return;
    if (!puedeEditar) {
      toast.error("Solo Calidad o Administrador pueden modificar.");
      return;
    }
    if (!hayBorrador) {
      toast.error("Primero crea un borrador para modificar características.");
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
        toast.success("Características guardadas en el borrador.");
        setCarInitial(caracteristicas);
        await invalidateAll();
      } else {
        toast.info("Sin cambios.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingCar(false);
    }
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

  const editEnabled =
    puedeEditar && hayBorrador && !enRevision && !!activeSpec?.hasSpec;

  return (
    <AppLayout title="Variables de Calidad · Catálogo Maestro de Especificaciones">
      <div className="space-y-5">
        {/* Indicador global de evidencia obligatoria */}
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
            evidenciaObligatoria
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          <ShieldAlert className={`h-3.5 w-3.5 ${evidenciaObligatoria ? "text-emerald-700" : "text-muted-foreground"}`} />
          Evidencia obligatoria:{" "}
          <span className="font-semibold">
            {evidenciaObligatoria ? "Activa" : "Inactiva"}
          </span>
        </div>

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
                    {p.borrador ? "  · ✎ borrador" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Panel Versiones — Fase 3 */}
        {activeSpec && (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold text-foreground">Versiones — {activeSpec.code}</h3>
              <span className="text-[11px] text-muted-foreground">
                Los cambios no impactan producción hasta publicar.
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              {/* Vigente */}
              <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-success">
                  <Power className="h-3 w-3" /> Vigente (lectura)
                </div>
                {activeSpec.hasSpec ? (
                  <div className="text-sm">
                    <div className="font-semibold text-foreground">
                      Versión {activeSpec.specVersion ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Esta versión es la que leen QC, reportes, QR y formularios MP-04…MP-07.
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Sin versión vigente.</div>
                )}
              </div>

              {/* Borrador */}
              <div
                className={`rounded-lg border p-3 ${
                  hayBorrador
                    ? enRevision
                      ? "border-warning/40 bg-warning/5"
                      : "border-primary/40 bg-primary/5"
                    : "border-dashed border-border bg-muted/20"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                  <Pencil className="h-3 w-3" />
                  {hayBorrador
                    ? enRevision
                      ? "En revisión"
                      : "Borrador (editable)"
                    : "Sin borrador activo"}
                </div>
                {hayBorrador ? (
                  <div className="space-y-2 text-sm">
                    <div className="font-semibold text-foreground">
                      Versión {borrador!.version}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {!enRevision && puedeEditar && (
                        <Button size="sm" variant="outline" onClick={handleEnviarRevision}>
                          <Send className="h-3.5 w-3.5" /> Enviar a revisión
                        </Button>
                      )}
                      {puedeEditar && (
                        <Button size="sm" onClick={handlePublicar} className="bg-success text-white hover:opacity-90">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Publicar versión
                        </Button>
                      )}
                      {puedeEditar && (
                        <Button size="sm" variant="outline" onClick={handleDescartar} className="border-destructive/40 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" /> Descartar
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Crea un borrador para modificar variables o características sin afectar la versión vigente.
                    </p>
                    {puedeEditar && (
                      <Button size="sm" onClick={handleCrearBorrador}>
                        <FilePlus2 className="h-3.5 w-3.5" /> Crear borrador
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tarjeta principal */}
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
                    <span>Versión vigente: <span className="font-semibold text-foreground tabular-nums">{activeSpec.specVersion}</span></span>
                  </>
                )}
                {hayBorrador && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                      <Pencil className="h-2.5 w-2.5" /> Editando borrador {borrador!.version}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {!isEditing ? (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={startEdit}
                    disabled={!editEnabled}
                    title={
                      !puedeEditar
                        ? "Sin permiso para editar"
                        : !hayBorrador
                          ? "Crea un borrador primero"
                          : enRevision
                            ? "Borrador en revisión"
                            : ""
                    }
                  >
                    <Pencil className="h-4 w-4" /> Editar variables
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleImprimir}
                    disabled={!activeSpec?.hasSpec}
                    className="bg-navy text-white hover:opacity-90"
                  >
                    <Printer className="h-4 w-4" /> Imprimir
                  </Button>
                </>
              ) : (
                <>
                  <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">
                    Editando borrador como {auth.profile?.nombre ?? auth.user?.email} ({auth.roles.join(", ")})
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
              Solo Calidad o Administrador pueden modificar especificaciones.
            </div>
          )}

          {puedeEditar && !hayBorrador && activeSpec?.hasSpec && (
            <div className="border-b border-border bg-muted/30 px-5 py-2 text-[11px] text-foreground flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" />
              Crea un borrador para modificar esta especificación. La versión vigente es solo de lectura.
            </div>
          )}

          {enRevision && (
            <div className="border-b border-border bg-warning/10 px-5 py-2 text-[11px] text-warning flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" />
              Borrador en revisión: descarta o publica antes de seguir editando.
            </div>
          )}

          {!activeSpec?.hasSpec && (
            <div className="border-b border-border bg-warning/10 px-5 py-2 text-[11px] text-warning flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" />
              Este producto aún no tiene especificación vigente registrada.
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
                {variablesEditadas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Sin variables registradas para esta especificación.
                    </td>
                  </tr>
                )}
                {variablesEditadas.map((v) => {
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
              {hayBorrador
                ? "Cambios escritos en el borrador. No impactan producción hasta publicar."
                : "Versión vigente (solo lectura)."}
            </div>
            <div>
              {log.length > 0
                ? `Última modificación: ${new Date(log[0].modificado_at).toLocaleString("es-MX")} · ${log[0].modificado_por_nombre ?? "—"}`
                : "Sin modificaciones registradas"}
            </div>
          </div>
        </div>

        {/* Evidencia documental — VIGENTE (histórica) */}
        {activeSpec?.hasSpec && (
          <EvidenciaDocumentalPanel
            productoCodigo={activeSpec.code}
            puedeEditar={false}
            target="vigente"
          />
        )}

        {/* Evidencia documental — BORRADOR (carga para habilitar edición) */}
        {hayBorrador && (
          <EvidenciaDocumentalPanel
            productoCodigo={activeSpec!.code}
            puedeEditar={puedeEditar}
            target="borrador"
          />
        )}

        {/* Características de los Atributos */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Características de los atributos {hayBorrador ? "(borrador)" : "(vigente · solo lectura)"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {hayBorrador
                  ? "Edita aquí; los cambios se aplican al borrador y no impactan producción hasta publicar."
                  : "Crea un borrador para modificar."}
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
              disabled={!editEnabled}
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
                  !editEnabled ||
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
            <p className="text-xs text-muted-foreground">Registro permanente, no modificable.</p>
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
