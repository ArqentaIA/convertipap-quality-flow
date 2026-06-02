import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, QrCode, Factory, User, Calendar, Package, Hash, AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import logoUrl from "@/assets/logo-convertipap.png";
import { resolveRolloStatus, type RolloStatusInfo } from "@/lib/roll-status";

export const Route = createFileRoute("/t/$folio")({ component: TracePage });

// Datos de contexto del rollo (identidad, no estatus).
// El estatus NUNCA se almacena en el QR ni en esta tabla; se calcula en vivo.
type TraceContext = {
  folio: string;
  rollo?: string;
  ordenId?: string;
  maquina: string;
  planta: string;
  turno: string;
  operador: string;
  jefeMaquina: string;
  fecha: string;
  hora: string;
  producto: string;
  metricas: { label: string; value: string | number; unit?: string }[];
  emitido: string;
  validadoPor: string;
  simulado?: boolean;
};

const CONTEXT: Record<string, TraceContext> = {
  "CAL-2026-04830": { folio: "CAL-2026-04830", rollo: "4441-6", maquina: "MP-04", planta: "Tlaxcala", turno: "3", operador: "Palemón G.", jefeMaquina: "Palemón G.", fecha: "2026-05-26", hora: "01:25", producto: "PST Higiénico 13 g/m²", emitido: "2026-05-26 07:12", validadoPor: "Christian H. · Analista TLX", metricas: [{label:"Calibre",value:0.84,unit:"mm"},{label:"Humedad",value:6.2,unit:"%"},{label:"Peso base",value:13.19,unit:"g/m²"},{label:"Tensión MD",value:461,unit:"g/in"},{label:"Cumplimiento",value:"86.4",unit:"%"}] },
  "CAL-2026-04811": { folio: "CAL-2026-04811", rollo: "4438-6", maquina: "MP-04", planta: "Tlaxcala", turno: "1", operador: "Manuel Rivas", jefeMaquina: "Manuel Rivas", fecha: "2026-05-24", hora: "08:40", producto: "PST Higiénico 13 g/m²", emitido: "2026-05-24 14:55", validadoPor: "Christian H. · Analista TLX", metricas: [{label:"Calibre",value:0.74,unit:"mm"},{label:"Humedad",value:7.3,unit:"%"},{label:"Peso base",value:12.50,unit:"g/m²"},{label:"Tensión MD",value:402,unit:"g/in"},{label:"Cumplimiento",value:"78.2",unit:"%"}] },
};

function buildContext(folio: string): TraceContext {
  const ctx = CONTEXT[folio];
  if (ctx) return ctx;
  const suffix = folio.match(/(\d{2})$/)?.[1] ?? "04";
  const maquina = `MP-${suffix}`;
  const now = new Date();
  return {
    folio,
    rollo: `QR-${folio.slice(-5)}`,
    maquina,
    planta: "Tlaxcala",
    turno: "3",
    operador: "Operador asignado",
    jefeMaquina: "Jefe de máquina asignado",
    fecha: now.toISOString().slice(0, 10),
    hora: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    producto: "Papel tissue · registro de rollo",
    emitido: now.toLocaleString(),
    validadoPor: "Control de Calidad Convertipap",
    simulado: true,
    metricas: [
      { label: "Calibre", value: 0.84, unit: "mm" },
      { label: "Humedad", value: 6.2, unit: "%" },
      { label: "Peso base", value: 13.1, unit: "g/m²" },
      { label: "Tensión MD", value: 461, unit: "g/in" },
      { label: "Cumplimiento", value: "88.6", unit: "%" },
    ],
  };
}

function TracePage() {
  const { folio } = Route.useParams();
  const ctx = buildContext(folio);

  // Resolución en tiempo real: re-renderiza si el store de Calidad cambia.
  // Para folios históricos del mock se respeta su estatus legado (CONTEXT).
  const legacy: "L" | "NC" | "C" | undefined =
    folio === "CAL-2026-04811" ? "NC" :
    folio === "CAL-2026-04830" ? "L" : undefined;

  const est: RolloStatusInfo = useMemo(
    () =>
      resolveRolloStatus({
        rolloId: ctx.rollo,
        folio: ctx.folio,
        ordenId: ctx.ordenId,
        legacyEstatus: legacy ?? null,
      }),
    [ctx.rollo, ctx.folio, ctx.ordenId, legacy],
  );

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-center gap-3 pb-2">
          <img src={logoUrl} alt="Convertipap" className="h-12 w-auto" />
          <div className="text-center">
            <div className="text-base font-bold text-foreground">Convertipap</div>
            <div className="text-[11px] text-muted-foreground">Fábrica de papel tissue · Trazabilidad</div>
          </div>
        </div>

        <div className="rounded-xl border border-success/40 bg-success/5 p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-success" />
            <div>
              <div className="text-sm font-bold text-success">Documento auténtico</div>
              <div className="text-xs text-muted-foreground">
                Validado contra el registro interno · Emitido {ctx.emitido} · {ctx.validadoPor}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <QrCode className="h-3.5 w-3.5" /> Folio escaneado
              </div>
              <h1 className="mt-1 font-mono text-xl font-bold text-foreground">{ctx.folio}</h1>
              {ctx.rollo && <div className="text-xs text-muted-foreground">Rollo: <strong className="text-foreground">{ctx.rollo}</strong></div>}
            </div>
            <span
              className="inline-flex items-center rounded-md border px-3 py-1 text-xs font-bold"
              style={{ background: est.bg, color: est.color, borderColor: est.color }}
              title={`Fuente: ${est.source}`}
            >
              {est.label}
            </span>
          </div>

          {est.warnings.length > 0 && (
            <div className="mt-4 rounded-md border border-purple-300 bg-purple-50 p-3 text-xs text-purple-900">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" /> Inconsistencia detectada
              </div>
              <ul className="mt-1 list-disc pl-5">
                {est.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {ctx.simulado && (
            <div className="mt-4 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
              Vista de simulación preparada para trazabilidad por QR. Cuando se conecte la base de datos, este folio cargará el registro real sin cambiar el diseño. El estatus mostrado siempre se calcula en vivo desde el dictamen de Calidad.
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info icon={Factory} label="Planta / Máquina" value={`${ctx.planta} · ${ctx.maquina}`} />
            <Info icon={Hash} label="Turno" value={`T${ctx.turno}`} />
            <Info icon={Calendar} label="Fecha / hora" value={`${ctx.fecha} · ${ctx.hora}`} />
            <Info icon={Package} label="Producto" value={ctx.producto} />
            <Info icon={User} label="Operador" value={ctx.operador} />
            <Info icon={User} label="Jefe de máquina" value={ctx.jefeMaquina} />
          </div>

          <h3 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Métricas registradas</h3>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2">Variable</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Unidad</th></tr>
              </thead>
              <tbody>
                {ctx.metricas.map((m) => (
                  <tr key={m.label} className="border-t border-border">
                    <td className="px-3 py-2">{m.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{m.value}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.unit ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[11px] text-muted-foreground">
              Este documento es la representación digital del registro interno y no puede modificarse. El estatus se calcula en tiempo real mediante <code>resolveRolloStatus()</code> sobre el dictamen vigente de Calidad. Fuente: <strong>{est.source}</strong>.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
          Vista pública de trazabilidad · Solo lectura · No otorga acceso al sistema de control de calidad.
        </div>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background/40 p-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}
