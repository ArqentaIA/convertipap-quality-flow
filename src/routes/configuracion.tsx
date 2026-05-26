import { createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Bell, Save, Lock, ShieldCheck, Users } from "lucide-react";
import { getRoster, subscribeRoster, updateShiftAssignment, type RosterEntry } from "@/lib/roster";
import { useSession } from "@/lib/session";
import type { Shift } from "@/lib/qc-data";

export const Route = createFileRoute("/configuracion")({ component: ConfigPage });

function ConfigPage() {
  return (
    <AppLayout title="Configuración del sistema">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Parámetros generales" desc="Aplica a todas las plantas">
            <Field label="Tolerancia de advertencia (% del rango)" value="10" suffix="%" />
            <Field label="Hora de corte turno 1" value="07:00" />
            <Field label="Hora de corte turno 2" value="15:00" />
            <Field label="Hora de corte turno 3" value="23:00" />
            <Field label="Frecuencia de muestreo sugerida" value="30" suffix="min" />
          </Card>

          <RosterCard />
        </div>


        <div className="space-y-6">
          <Card title="Notificaciones" desc="Alertas automáticas">
            <Toggle label="Alerta por valor fuera de rango" on />
            <Toggle label="Resumen diario por correo" on />
            <Toggle label="Notificar no conformidades a supervisor" on />
            <Toggle label="Resumen semanal a dirección" />
          </Card>

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

function Toggle({ label, on }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground">{label}</span>
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </div>
  );
}

function RosterCard() {
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
            <Users className="h-4 w-4" /> Operadores por turno
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
