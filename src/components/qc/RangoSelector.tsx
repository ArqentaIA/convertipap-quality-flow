import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type Rango = "turno" | "dia" | "semana" | "mes" | "año" | "custom";

export const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

export function rangoLabel(r: Rango, mesesSel: number[]) {
  if (r === "turno") return "Turno actual";
  if (r === "dia") return "Hoy";
  if (r === "semana") return "Últimos 7 días";
  if (r === "mes") return "Mes en curso";
  if (r === "año") return `Año en curso (${new Date().getFullYear()})`;
  if (mesesSel.length === 0) return "Sin meses seleccionados";
  if (mesesSel.length === 12) return "Todo el año";
  if (mesesSel.length <= 3) return mesesSel.map(i => MESES[i]).join(", ");
  return `${mesesSel.length} meses seleccionados`;
}

export function rangoToFreq(r: Rango): string {
  switch (r) {
    case "turno": return "Por turno";
    case "dia": return "Diario";
    case "semana": return "Semanal";
    case "mes": return "Mensual";
    case "año": return "Anual";
    case "custom": return "Meses seleccionados";
  }
}

export function RangoSelector({
  rango,
  setRango,
  mesesSel,
  setMesesSel,
  includeTurno = false,
}: {
  rango: Rango;
  setRango: (r: Rango) => void;
  mesesSel: number[];
  setMesesSel: (m: number[]) => void;
  includeTurno?: boolean;
}) {
  const opts: { v: Rango; label: string }[] = [
    ...(includeTurno ? [{ v: "turno" as Rango, label: "Turno" }] : []),
    { v: "dia", label: "Día" },
    { v: "semana", label: "Semana" },
    { v: "mes", label: "Mes" },
    { v: "año", label: "Año" },
  ];

  const toggleMes = (i: number) => {
    if (mesesSel.includes(i)) setMesesSel(mesesSel.filter(x => x !== i));
    else setMesesSel([...mesesSel, i].sort((a, b) => a - b));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-border bg-background p-1 shadow-sm">
        {opts.map(o => (
          <button
            key={o.v}
            onClick={() => {
              setRango(o.v);
              if (o.v === "año") setMesesSel(MESES.map((_, i) => i));
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              rango === o.v ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRango("custom")}
            className={`h-[34px] text-xs font-semibold ${rango === "custom" ? "border-primary text-primary" : ""}`}
          >
            Meses
            {rango === "custom" && mesesSel.length < 12 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                {mesesSel.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Selecciona meses</span>
            <div className="flex gap-1">
              <button
                onClick={() => { setMesesSel(MESES.map((_, i) => i)); setRango("custom"); }}
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                Todos
              </button>
              <span className="text-[10px] text-muted-foreground">·</span>
              <button
                onClick={() => { setMesesSel([]); setRango("custom"); }}
                className="text-[10px] font-semibold text-muted-foreground hover:underline"
              >
                Ninguno
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MESES.map((m, i) => {
              const active = mesesSel.includes(i);
              return (
                <button
                  key={m}
                  onClick={() => { toggleMes(i); setRango("custom"); }}
                  className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  {m}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
