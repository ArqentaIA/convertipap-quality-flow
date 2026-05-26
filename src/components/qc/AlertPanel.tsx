import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function AlertPanel({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">
        <CheckCircle2 className="h-5 w-5" />
        <div>
          <div className="font-semibold">Todos los valores están dentro de rango</div>
          <div className="text-xs opacity-80">El turno cumple con las especificaciones de calidad.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" /> Existen valores fuera de especificación ({alerts.length})
      </div>
      <ul className="mt-2 space-y-1 text-xs text-destructive/90">
        {alerts.slice(0, 6).map((a, i) => <li key={i}>• {a}</li>)}
      </ul>
    </div>
  );
}
