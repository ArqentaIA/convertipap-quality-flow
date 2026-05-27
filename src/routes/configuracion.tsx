import { createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Bell, Save, Lock, ShieldCheck, Users, Eye, X, Mail } from "lucide-react";
import { getRoster, subscribeRoster, updateShiftAssignment, type RosterEntry } from "@/lib/roster";
import { useSession } from "@/lib/session";
import type { Shift } from "@/lib/qc-data";
import logoConvertipap from "@/assets/logo-convertipap.png";

export const Route = createFileRoute("/configuracion")({ component: ConfigPage });

const MAQUINAS = ["MP-04", "MP-05", "MP-06", "MP-07"] as const;
type Maquina = typeof MAQUINAS[number];

function ConfigPage() {
  const [maquina, setMaquina] = useState<Maquina>("MP-04");
  const [previewCEO, setPreviewCEO] = useState(false);



  return (
    <AppLayout title="Configuración del sistema">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Configuración por máquina</div>
          <p className="text-xs text-muted-foreground">Selecciona la máquina para editar sus parámetros, operadores y notificaciones.</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-background p-1 shadow-sm">
          {MAQUINAS.map((m) => (
            <button
              key={m}
              onClick={() => setMaquina(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                maquina === m ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Parámetros generales" desc={`Aplican a la máquina ${maquina}`}>
            <Field label="Tolerancia de advertencia (% del rango)" value="10" suffix="%" />
            <Field label="Hora de corte turno 1" value="07:00" />
            <Field label="Hora de corte turno 2" value="15:00" />
            <Field label="Hora de corte turno 3" value="23:00" />
            <Field label="Frecuencia de muestreo sugerida" value="30" suffix="min" />
          </Card>

          <RosterCard maquina={maquina} />
        </div>


        <div className="space-y-6">
          <Card title="Notificaciones" desc={`Alertas automáticas · ${maquina}`}>
            <Toggle label="Alerta por valor fuera de rango" on hint="Envía una notificación cuando una variable supere los límites configurados." />
            <Toggle label="Resumen diario por correo" on hint="Envía automáticamente un resumen diario de producción." />
            <Toggle label="Notificar no conformidades a supervisor" on hint="Notifica incidencias y eventos de calidad al supervisor responsable." />
            <Toggle label="Resumen semanal a dirección" hint="Genera un reporte consolidado semanal para dirección." />
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Toggle
                label="Reporte CEO"
                on
                hint="Correo ejecutivo diario con producción total, estado de las 4 máquinas, eficiencia general, tiempo de paro, calidad, alertas críticas y resumen ejecutivo automático."
              />
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <label className="text-xs text-muted-foreground">Hora de envío</label>
                  <input
                    type="time"
                    defaultValue="07:00"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="grid grid-cols-[140px_1fr] items-start gap-3">
                  <label className="pt-1.5 text-xs text-muted-foreground">Destinatarios</label>
                  <div>
                    <input
                      type="text"
                      defaultValue="ceo@convertipap.com"
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
          {previewCEO && <CEOReportPreview onClose={() => setPreviewCEO(false)} />}

          <Card title="Preferencias regionales">
            <Field label="Zona horaria" value="America/Mexico_City" />
            <Field label="Idioma" value="Español (MX)" />
            <Field label="Unidades" value="Métrico (g/m², m/min, mm)" />
          </Card>

          <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90">
            <Save className="h-4 w-4" /> Guardar cambios
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
        <Bell className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="grid grid-cols-2 items-center gap-3">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          defaultValue={value}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function Toggle({ label, on, hint }: { label: string; on?: boolean; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <span className="text-sm text-foreground">{label}</span>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      <span className={`relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </div>
  );
}

function RosterCard({ maquina }: { maquina: string }) {
  const session = useSession();
  const isDireccion = session.role === "direccion";
  const roster = useSyncExternalStore(subscribeRoster, getRoster, getRoster);
  const [draft, setDraft] = useState<Record<Shift, RosterEntry> | null>(null);
  const [editing, setEditing] = useState(false);

  const data = draft ?? roster;

  const startEdit = () => { setDraft({ ...roster }); setEditing(true); };
  const cancel = () => { setDraft(null); setEditing(false); };
  const save = () => {
    if (!draft) return;
    (Object.keys(draft) as Shift[]).forEach((t) => updateShiftAssignment(t, draft[t]));
    setDraft(null); setEditing(false);
  };
  const change = (turno: Shift, field: keyof RosterEntry, val: string) => {
    if (!draft) return;
    setDraft({ ...draft, [turno]: { ...draft[turno], [field]: val } });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4" /> Operadores por turno · <span className="text-primary">{maquina}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Se asignan automáticamente al seleccionar turno en Control de Calidad.
          </p>
        </div>
        {isDireccion ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
            <ShieldCheck className="h-3 w-3" /> Dirección · puede editar
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" /> Solo lectura — requiere Dirección
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Turno</th>
              <th className="px-3 py-2">Jefe de máquina</th>
              <th className="px-3 py-2">Operador</th>
              <th className="px-3 py-2">Prensero</th>
            </tr>
          </thead>
          <tbody>
            {(["1", "2", "3"] as Shift[]).map((t) => (
              <tr key={t} className="border-t border-border">
                <td className="px-3 py-2 font-semibold text-foreground">Turno {t}</td>
                {(["jefeMaquina", "operador", "prensero"] as (keyof RosterEntry)[]).map((f) => (
                  <td key={f} className="px-3 py-2">
                    <input
                      value={data[t][f]}
                      disabled={!editing}
                      onChange={(e) => change(t, f, e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-foreground"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        {!editing ? (
          <button
            onClick={startEdit}
            disabled={!isDireccion}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Editar asignaciones
          </button>
        ) : (
          <>
            <button onClick={cancel} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">Cancelar</button>
            <button onClick={save} className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-success-foreground hover:opacity-90">
              <Save className="h-3.5 w-3.5" /> Guardar cambios
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CEOReportPreview({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const fecha = now.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const hora = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
  const planta = "Planta Tlaxcala";
  const maquinas = [
    { id: "MP-04", estado: "Operando", eficiencia: 92.4, paro: "00:12", cumplimiento: 96.1 },
    { id: "MP-05", estado: "Operando", eficiencia: 88.7, paro: "00:35", cumplimiento: 94.3 },
    { id: "MP-06", estado: "Paro programado", eficiencia: 71.2, paro: "02:10", cumplimiento: 89.5 },
    { id: "MP-07", estado: "Operando", eficiencia: 90.1, paro: "00:20", cumplimiento: 95.7 },
  ];
  const totalProd = 142.8;
  const efGeneral = 85.6;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mail className="h-4 w-4 text-primary" /> Previsualización · Reporte CEO
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-52px)] overflow-y-auto bg-[#f5f6f8] p-6">
          <div className="mx-auto max-w-2xl rounded-lg bg-white shadow-sm">
            {/* Header */}
            <div className="rounded-t-lg bg-gradient-to-r from-primary to-primary/80 px-6 py-5 text-primary-foreground">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md p-1.5 shadow-sm">
                    <img src={logoConvertipap} alt="Convertipap" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider opacity-90">Convertipap · Reporte Ejecutivo Diario</div>
                    <div className="mt-0.5 text-xl font-bold leading-tight">Resumen de producción</div>
                  </div>
                </div>
                <div className="text-right text-[11px] leading-relaxed opacity-95">
                  <div className="font-semibold">{planta}</div>
                  <div className="capitalize">{fecha}</div>
                  <div>Generado a las {hora}</div>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3 border-b border-gray-200 p-5">
              <KPI label="Producción total" value={`${totalProd} t`} />
              <KPI label="Eficiencia general" value={`${efGeneral}%`} />
              <KPI label="Tiempo de paro" value="03:17 h" />
            </div>

            {/* Estado de máquinas */}
            <div className="border-b border-gray-200 p-5">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Estado de las 4 máquinas</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="py-2">Máquina</th>
                    <th className="py-2">Estado</th>
                    <th className="py-2 text-right">Eficiencia</th>
                    <th className="py-2 text-right">Paro</th>
                    <th className="py-2 text-right">Calidad</th>
                  </tr>
                </thead>
                <tbody>
                  {maquinas.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 font-semibold text-gray-900">{m.id}</td>
                      <td className="py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          m.estado === "Operando" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>{m.estado}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">{m.eficiencia}%</td>
                      <td className="py-2 text-right tabular-nums text-gray-700">{m.paro}</td>
                      <td className="py-2 text-right tabular-nums text-gray-700">{m.cumplimiento}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Alertas */}
            <div className="border-b border-gray-200 p-5">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Alertas críticas</div>
              <ul className="space-y-2 text-xs text-gray-700">
                <li className="flex gap-2 rounded-md bg-red-50 p-2.5 text-red-700">
                  <span>•</span>
                  <span><b>MP-06</b> — Paro programado prolongado (02:10 h). Afecta cumplimiento del día.</span>
                </li>
                <li className="flex gap-2 rounded-md bg-amber-50 p-2.5 text-amber-800">
                  <span>•</span>
                  <span><b>MP-05</b> — 3 rollos no conformes en turno 2 (humedad fuera de rango).</span>
                </li>
              </ul>
            </div>

            {/* Resumen ejecutivo */}
            <div className="p-5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">Resumen ejecutivo</div>
              <p className="text-xs leading-relaxed text-gray-700">
                La planta operó al <b>{efGeneral}%</b> de eficiencia con una producción total de <b>{totalProd} t</b>.
                Tres de cuatro máquinas se mantuvieron en operación continua. El paro programado en MP-06
                impactó la eficiencia general. La calidad promedio se mantuvo por arriba del 94% en las máquinas
                activas. Se recomienda revisar control de humedad en MP-05 durante el siguiente turno.
              </p>
            </div>

            {/* Footer */}
            <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-5 py-3 text-center text-[10px] text-gray-500">
              Generado automáticamente por la plataforma Convertipap · Calidad &amp; Producción
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
