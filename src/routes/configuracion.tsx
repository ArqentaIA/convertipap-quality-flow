import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionGate } from "@/components/SessionGate";
import { Save, Eye, X, Mail, Sliders, Bell, ShieldAlert, FileCheck2, Lock, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoConvertipap from "@/assets/logo-convertipap.png";
import { toast } from "sonner";
import { getAppSettings, updateAppSettings, type AppSettings } from "@/lib/settings.functions";
import { getCEOReport } from "@/lib/ceo-report.functions";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/configuracion")({
  component: ConfigGate,
  ssr: false,
  errorComponent: ({ error }) => (
    <AppLayout title="Configuración del sistema">
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudo cargar la configuración: {error.message}
      </div>
    </AppLayout>
  ),
});

function ConfigGate() {
  return (
    <SessionGate>
      <ConfigPage />
    </SessionGate>
  );
}

const settingsQueryOptions = queryOptions({
  queryKey: ["app_settings"],
  queryFn: () => getAppSettings(),
});

function ConfigPage() {
  const { session } = useAuth();
  const settingsQuery = useQuery({
    ...settingsQueryOptions,
    enabled: !!session?.access_token,
    retry: false,
  });

  if (settingsQuery.error) {
    return (
      <AppLayout title="Configuración del sistema">
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudo cargar la configuración: {settingsQuery.error.message}
        </div>
      </AppLayout>
    );
  }

  if (settingsQuery.isLoading || !settingsQuery.data) {
    return (
      <AppLayout title="Configuración del sistema">
        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">Cargando configuración…</div>
      </AppLayout>
    );
  }

  return <ConfigContent settings={settingsQuery.data} />;
}

function ConfigContent({ settings }: { settings: AppSettings }) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("administrador");
  const [previewCEO, setPreviewCEO] = useState(false);
  const [confirmEvidencia, setConfirmEvidencia] = useState(false);
  const [form, setForm] = useState<AppSettings>(settings);
  const qc = useQueryClient();
  const updateFn = useServerFn(updateAppSettings);

  useEffect(() => { setForm(settings); }, [settings]);

  const mutation = useMutation({
    mutationFn: (data: Omit<AppSettings, "id" | "updated_at">) => updateFn({ data }),
    onSuccess: (saved) => {
      qc.setQueryData(["app_settings"], saved);
      toast.success("Configuración guardada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const { id: _id, updated_at: _u, ...payload } = form;
    void _id; void _u;
    mutation.mutate(payload);
  };

  return (
    <AppLayout title="Configuración del sistema">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card icon={Sliders} title="Parámetros generales" desc="Aplican a todas las máquinas">
            {false && (
            <Field
              label="Tolerancia de advertencia (% del rango)"
              value={String(form.tolerancia_advertencia_pct)}
              suffix="%"
              onChange={(v) => set("tolerancia_advertencia_pct", Number(v) || 0)}
              type="number"
            />
            )}
            <ShiftRange
              label="Turno 1"
              inicio={form.turno1_inicio}
              fin={form.turno1_fin}
              onInicio={(v) => set("turno1_inicio", v)}
              onFin={(v) => set("turno1_fin", v)}
            />
            <ShiftRange
              label="Turno 2"
              inicio={form.turno2_inicio}
              fin={form.turno2_fin}
              onInicio={(v) => set("turno2_inicio", v)}
              onFin={(v) => set("turno2_fin", v)}
            />
            <ShiftRange
              label="Turno 3"
              inicio={form.turno3_inicio}
              fin={form.turno3_fin}
              onInicio={(v) => set("turno3_inicio", v)}
              onFin={(v) => set("turno3_fin", v)}
            />
            <Field
              label="Frecuencia de muestreo sugerida"
              value={String(form.frecuencia_muestreo_min)}
              suffix="min"
              onChange={(v) => set("frecuencia_muestreo_min", Number(v) || 0)}
              type="number"
            />
            {false && (
            <Field
              label="Costo de no calidad"
              value={String(form.costo_no_calidad_kg ?? 18)}
              suffix="MXN/kg"
              onChange={(v) => set("costo_no_calidad_kg", Number(v) || 0)}
              type="number"
            />
            )}
          </Card>
        </div>




        <div className="space-y-6">
          {false && (
          <Card icon={Bell} title="Notificaciones" desc="Alertas automáticas del sistema">
            <Toggle
              label="Alerta por valor fuera de rango"
              on={form.notif_fuera_rango}
              onChange={(v) => set("notif_fuera_rango", v)}
              hint="Envía una notificación cuando una variable supere los límites configurados."
            />
            <Toggle
              label="Resumen diario por correo"
              on={form.notif_resumen_diario}
              onChange={(v) => set("notif_resumen_diario", v)}
              hint="Envía automáticamente un resumen diario de producción."
            />
            <Toggle
              label="Notificar no conformidades a supervisor"
              on={form.notif_no_conformidades}
              onChange={(v) => set("notif_no_conformidades", v)}
              hint="Notifica incidencias y eventos de calidad al supervisor responsable."
            />
            <Toggle
              label="Resumen semanal a dirección"
              on={form.notif_resumen_semanal}
              onChange={(v) => set("notif_resumen_semanal", v)}
              hint="Genera un reporte consolidado semanal para dirección."
            />
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Toggle
                label="Reporte CEO"
                on={form.ceo_report_enabled}
                onChange={(v) => set("ceo_report_enabled", v)}
                hint="Correo ejecutivo diario con producción total, estado de las máquinas, eficiencia general, tiempo de paro, calidad, alertas críticas y resumen ejecutivo automático."
              />
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <label className="text-xs text-muted-foreground">Hora de envío</label>
                  <input
                    type="time"
                    value={form.ceo_report_hora}
                    onChange={(e) => set("ceo_report_hora", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="grid grid-cols-[140px_1fr] items-start gap-3">
                  <label className="pt-1.5 text-xs text-muted-foreground">Destinatarios</label>
                  <div>
                    <input
                      type="text"
                      value={form.ceo_report_destinatarios}
                      onChange={(e) => set("ceo_report_destinatarios", e.target.value)}
                      placeholder="correo1@empresa.com, correo2@empresa.com"
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Separa varios correos con coma. El reporte se enviará a todos los destinatarios listados.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  El reporte se envía automáticamente a los correos configurados.
                </p>
                <button
                  onClick={() => setPreviewCEO(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/40 bg-background px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                >
                  <Eye className="h-3.5 w-3.5" /> Previsualizar reporte
                </button>
              </div>
            </div>
          </Card>
          )}
          {previewCEO && <CEOReportPreview onClose={() => setPreviewCEO(false)} />}

          {false && isAdmin && (
            <Card icon={FileCheck2} title="Control documental de especificaciones" desc="Variables de Calidad · Catálogo Maestro">
              <Toggle
                label="Exigir evidencia documental vigente"
                on={form.spec_evidencia_obligatoria}
                onChange={(v) => {
                  if (v && !form.spec_evidencia_obligatoria) {
                    setConfirmEvidencia(true);
                  } else {
                    set("spec_evidencia_obligatoria", false);
                  }
                }}
                hint="Cuando está activa, no se puede editar, agregar ni inactivar variables si la especificación no tiene evidencia documental vigente."
              />
              <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                Estado actual:{" "}
                <span className={`font-semibold ${form.spec_evidencia_obligatoria ? "text-emerald-700" : "text-muted-foreground"}`}>
                  {form.spec_evidencia_obligatoria ? "Activa" : "Inactiva"}
                </span>
                <span className="opacity-60">· Recuerda guardar los cambios.</span>
              </div>
            </Card>
          )}

          {confirmEvidencia && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmEvidencia(false)}>
              <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Activar evidencia obligatoria</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Al activar esta opción, no se permitirá editar, agregar o inactivar variables sin evidencia documental vigente.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmEvidencia(false)}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { set("spec_evidencia_obligatoria", true); setConfirmEvidencia(false); }}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Activar
                  </button>
                </div>
              </div>
            </div>
          )}


          {isAdmin && <MachineAccessCodesCard />}

          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {mutation.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

function Card({ icon: Icon, title, desc, children }: { icon?: React.ComponentType<{ className?: string }>; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, suffix, onChange, type = "text" }: { label: string; value: string; suffix?: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="grid grid-cols-2 items-center gap-3">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background py-1.5 pl-3 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function ShiftRange({ label, inicio, fin, onInicio, onFin }: { label: string; inicio: string; fin: string; onInicio: (v: string) => void; onFin: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-3">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          type="time"
          value={inicio}
          onChange={(e) => onInicio(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="pointer-events-none absolute -top-2 left-2 bg-card px-1 text-[9px] uppercase tracking-wider text-muted-foreground">Inicio</span>
      </div>
      <div className="relative">
        <input
          type="time"
          value={fin}
          onChange={(e) => onFin(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="pointer-events-none absolute -top-2 left-2 bg-card px-1 text-[9px] uppercase tracking-wider text-muted-foreground">Término</span>
      </div>
    </div>
  );
}

function Toggle({ label, on, hint, onChange }: { label: string; on?: boolean; hint?: string; onChange?: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      className="flex w-full items-start justify-between gap-3 text-left"
    >
      <div className="flex-1">
        <span className="text-sm text-foreground">{label}</span>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      <span className={`relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

function CEOReportPreview({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const reportQuery = useQuery({
    queryKey: ["ceo-report"],
    queryFn: () => getCEOReport(),
    enabled: !!session?.access_token,
    retry: false,
  });

  const now = new Date();
  const fecha = now.toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hora = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });

  if (reportQuery.error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-xl bg-card p-5 text-sm text-destructive shadow-2xl" onClick={(e) => e.stopPropagation()}>
          No se pudo cargar la previsualización: {reportQuery.error.message}
        </div>
      </div>
    );
  }

  const data = reportQuery.data;
  const estadoLabel = (e: string) =>
    e === "operando" ? "Operando" : e === "paro" ? "En paro" : e === "mantenimiento" ? "Mantenimiento" : "Libre";
  const estadoCls = (e: string) =>
    e === "operando" ? "bg-emerald-100 text-emerald-700"
      : e === "paro" ? "bg-red-100 text-red-700"
      : e === "mantenimiento" ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-600";
  const estatusCls = (s: string) =>
    s === "Liberado" ? "bg-emerald-100 text-emerald-700"
      : s === "Rechazado" ? "bg-red-100 text-red-700"
      : s === "Retenido" ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-600";
  const fmtFecha = (iso: string) =>
    new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mail className="h-4 w-4 text-primary" /> Previsualización · Reporte CEO
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-52px)] overflow-y-auto bg-[#f5f6f8] p-6">
          <div className="mx-auto max-w-3xl rounded-lg bg-white shadow-sm">
            <div className="rounded-t-lg bg-gradient-to-r from-primary to-primary/80 px-6 py-5 text-primary-foreground">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md p-1.5 shadow-sm">
                    <img src={logoConvertipap} alt="Convertipap" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider opacity-90">Convertipap · Reporte Ejecutivo Diario</div>
                    <div className="mt-0.5 text-xl font-bold leading-tight">Resumen de producción · Últimas 24h</div>
                  </div>
                </div>
                <div className="text-right text-[11px] leading-relaxed opacity-95">
                  <div className="capitalize">{fecha}</div>
                  <div>Generado a las {hora}</div>
                </div>
              </div>
            </div>

            {!data ? (
              <div className="p-6 text-sm text-gray-500">Cargando datos…</div>
            ) : (
              <>
                {/* KPIs producción */}
                <div className="grid grid-cols-2 gap-3 border-b border-gray-200 p-5 sm:grid-cols-4">
                  <KPI label="Rollos producidos" value={String(data.totales.rollos)} />
                  <KPI label="Kg producidos" value={data.totales.kg.toLocaleString("es-MX")} />
                  <KPI label="OEE promedio" value={`${data.totales.oeePromedio}%`} />
                  <KPI label="Máquinas activas" value={`${data.totales.maquinasActivas}/${data.totales.maquinasTotales}`} />
                </div>

                {/* KPIs calidad */}
                <div className="grid grid-cols-2 gap-3 border-b border-gray-200 px-5 pb-5 sm:grid-cols-4">
                  <KPI label="Cumplimiento" value={`${data.calidad.cumplimientoPct}%`} />
                  <KPI label="Muestras" value={String(data.calidad.muestrasTotales)} />
                  <KPI label="Rollos no liberados" value={String(data.calidad.rollosNoLiberados)} />
                  <KPI label="Kg no liberados" value={data.calidad.kgNoLiberados.toLocaleString("es-MX")} />
                </div>

                {/* Desglose por máquina */}
                <div className="border-b border-gray-200 p-5">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Desglose por máquina</div>
                  {data.maquinas.length === 0 ? (
                    <p className="text-xs text-gray-500">Sin máquinas registradas.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-500">
                          <th className="py-2">Máquina</th>
                          <th className="py-2">Estado</th>
                          <th className="py-2 text-right">Rollos</th>
                          <th className="py-2 text-right">Kg</th>
                          <th className="py-2 text-right">OEE</th>
                          <th className="py-2 text-right">Paro (min)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.maquinas.map((m) => (
                          <tr key={m.codigo} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 font-semibold text-gray-900">{m.codigo}</td>
                            <td className="py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${estadoCls(m.estado)}`}>
                                {estadoLabel(m.estado)}
                              </span>
                            </td>
                            <td className="py-2 text-right tabular-nums text-gray-700">{m.rollos}</td>
                            <td className="py-2 text-right tabular-nums text-gray-700">{m.kg.toLocaleString("es-MX")}</td>
                            <td className="py-2 text-right tabular-nums text-gray-700">{m.oee}%</td>
                            <td className="py-2 text-right tabular-nums text-gray-700">{m.paroMin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Listado de rollos */}
                <div className="border-b border-gray-200 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Listado de rollos · {data.rollos.length}
                    </div>
                  </div>
                  {data.rollos.length === 0 ? (
                    <p className="text-xs text-gray-500">Sin rollos capturados en las últimas 24h.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-500">
                            <th className="py-2 pr-2">Folio</th>
                            <th className="py-2 pr-2">Fecha</th>
                            <th className="py-2 pr-2">Máq.</th>
                            <th className="py-2 pr-2">Turno</th>
                            <th className="py-2 pr-2">Cód. Producto</th>
                            <th className="py-2 pr-2 text-right">Peso (kg)</th>
                            <th className="py-2 pr-2 text-right">Ancho útil</th>
                            <th className="py-2 pr-2 text-right">Blancura R457 (%)</th>
                            <th className="py-2 pr-2 text-right">Diámetro (cm)</th>
                            <th className="py-2 pr-2">Estatus</th>
                            <th className="py-2">Defectos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.rollos.map((r, i) => (
                            <tr key={`${r.folio}-${i}`} className="border-b border-gray-100 last:border-0 align-top">
                              <td className="py-2 pr-2 font-semibold text-gray-900">{r.folio}</td>
                              <td className="py-2 pr-2 text-gray-700">{fmtFecha(r.fecha)}</td>
                              <td className="py-2 pr-2 text-gray-700">{r.maquina}</td>
                              <td className="py-2 pr-2 text-gray-700">{r.turno}</td>
                              <td className="py-2 pr-2 text-gray-700">{r.codigoProducto}</td>
                              <td className="py-2 pr-2 text-right tabular-nums text-gray-700">
                                {r.pesoKg != null ? r.pesoKg.toLocaleString("es-MX") : "—"}
                              </td>
                              <td className="py-2 pr-2 text-right tabular-nums text-gray-700">
                                {r.anchoUtil != null ? r.anchoUtil.toLocaleString("es-MX") : "—"}
                              </td>
                              <td className="py-2 pr-2 text-right tabular-nums text-gray-700">
                                {r.blancuraR457 != null ? r.blancuraR457.toLocaleString("es-MX") : "—"}
                              </td>
                              <td className="py-2 pr-2 text-right tabular-nums text-gray-700">
                                {r.diametro != null ? r.diametro.toLocaleString("es-MX") : "—"}
                              </td>
                              <td className="py-2 pr-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${estatusCls(r.estatus)}`}>
                                  {r.estatus}
                                </span>
                              </td>
                              <td className="py-2 text-gray-700">
                                {r.defectos.length ? r.defectos.join(", ") : "—"}
                              </td>
                            </tr>
                          ))}

                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">Resumen ejecutivo</div>
                  <p className="text-xs leading-relaxed text-gray-700">
                    En las últimas 24 horas se produjeron <b>{data.totales.rollos}</b> rollos
                    (<b>{data.totales.kg.toLocaleString("es-MX")} kg</b>) con un OEE promedio del{" "}
                    <b>{data.totales.oeePromedio}%</b> y cumplimiento de calidad del{" "}
                    <b>{data.calidad.cumplimientoPct}%</b>. {data.calidad.rollosNoLiberados > 0 ? (
                      <>Se detectaron <b>{data.calidad.rollosNoLiberados}</b> rollos no liberados ({data.calidad.kgNoLiberados.toLocaleString("es-MX")} kg).</>
                    ) : (
                      <>No se reportan rollos retenidos o rechazados.</>
                    )}
                  </p>
                </div>
              </>
            )}

            <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-5 py-3 text-center text-[10px] text-gray-500">
              Generado automáticamente por la plataforma Convertipap · Calidad &amp; Producción · Envío diario 07:00 am
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

