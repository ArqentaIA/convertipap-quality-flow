import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Bell, Save } from "lucide-react";

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
