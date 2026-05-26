import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { VarStatus } from "@/lib/qc-data";

export function StatusBadge({ status, label }: { status: VarStatus; label?: string }) {
  const map = {
    ok: { Icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30", text: label ?? "En rango" },
    warn: { Icon: AlertTriangle, cls: "bg-warning/20 text-foreground border-warning/50", text: label ?? "Cerca del límite" },
    bad: { Icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/30", text: label ?? "Fuera de rango" },
  } as const;
  const { Icon, cls, text } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {text}
    </span>
  );
}

export function ReleaseBadge({ s }: { s: "L" | "NC" | "C" }) {
  const map = {
    L: { cls: "bg-success/15 text-success border-success/30", text: "L · Liberado" },
    NC: { cls: "bg-destructive/10 text-destructive border-destructive/30", text: "NC · No Conforme" },
    C: { cls: "bg-warning/20 text-foreground border-warning/50", text: "C · Condicional" },
  } as const;
  const { cls, text } = map[s];
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{text}</span>;
}
