import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { ShieldCheck, QrCode, Factory, User, Calendar, Package, Hash, Printer } from "lucide-react";
import { ReleaseBadge } from "@/components/qc/StatusBadge";
import { printRollReport } from "@/lib/roll-report";
import logoUrl from "@/assets/logo-convertipap.png";

export const Route = createFileRoute("/t/$folio")({ component: TracePage });

// Simulación: en producción esto vendrá del backend (GET /api/v1/qc/trace/:folio)
type TraceRecord = {
  folio: string;
  rollo?: string;
  maquina: string;
  planta: string;
  turno: string;
  operador: string;
  jefeMaquina: string;
  fecha: string;
  hora: string;
  producto: string;
  estatus: "L" | "NC" | "C";
  cumplimiento: number;
  rollos: number;
  metricas: { label: string; value: string | number; unit?: string; status?: "L" | "NC" | "C" }[];
  emitido: string;
  validadoPor: string;
  simulado?: boolean;
};

const MOCK: Record<string, TraceRecord> = {
  "CAL-2026-04830": { folio: "CAL-2026-04830", rollo: "4441-6", maquina: "MP-04", planta: "Tlaxcala", turno: "3", operador: "Palemón G.", jefeMaquina: "Palemón G.", fecha: "2026-05-26", hora: "01:25", producto: "PST Higiénico 13 g/m²", estatus: "L", cumplimiento: 86.4, rollos: 14, emitido: "2026-05-26 07:12", validadoPor: "Christian H. · Analista TLX", metricas: [{label:"Calibre",value:0.84,unit:"mm",status:"L"},{label:"Humedad",value:6.2,unit:"%",status:"L"},{label:"Peso base",value:13.19,unit:"g/m²",status:"L"},{label:"Tensión MD",value:461,unit:"g/in",status:"L"},{label:"Cumplimiento",value:"86.4",unit:"%",status:"L"}] },
  "CAL-2026-04811": { folio: "CAL-2026-04811", rollo: "4438-6", maquina: "MP-04", planta: "Tlaxcala", turno: "1", operador: "Manuel Rivas", jefeMaquina: "Manuel Rivas", fecha: "2026-05-24", hora: "08:40", producto: "PST Higiénico 13 g/m²", estatus: "NC", cumplimiento: 78.2, rollos: 13, emitido: "2026-05-24 14:55", validadoPor: "Christian H. · Analista TLX", metricas: [{label:"Calibre",value:0.74,unit:"mm",status:"NC"},{label:"Humedad",value:7.3,unit:"%",status:"NC"},{label:"Peso base",value:12.50,unit:"g/m²",status:"NC"},{label:"Tensión MD",value:402,unit:"g/in",status:"NC"},{label:"Cumplimiento",value:"78.2",unit:"%",status:"NC"}] },
};

function buildTraceRecord(folio: string): TraceRecord {
  const mock = MOCK[folio];
  if (mock) return mock;

  const suffix = folio.match(/(\d{2})$/)?.[1] ?? "04";
  const maquina = `MP-${suffix}`;
  const now = new Date();
  const cumplimiento = 88.6;

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
    estatus: "L",
    cumplimiento,
    rollos: 1,
    emitido: now.toLocaleString(),
    validadoPor: "Control de Calidad Convertipap",
    simulado: true,
    metricas: [
      { label: "Calibre", value: 0.84, unit: "mm", status: "L" },
      { label: "Humedad", value: 6.2, unit: "%", status: "L" },
      { label: "Peso base", value: 13.1, unit: "g/m²", status: "L" },
      { label: "Tensión MD", value: 461, unit: "g/in", status: "L" },
      { label: "Cumplimiento", value: cumplimiento.toFixed(1), unit: "%", status: "L" },
    ],
  };
}

function TracePage() {
  const { folio } = Route.useParams();
  const rec = buildTraceRecord(folio);

  return (
    <AppLayout title={`Trazabilidad · ${rec.folio}`}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-xl border border-success/40 bg-success/5 p-4">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Convertipap" className="h-10 w-auto rounded-sm bg-background p-1" />
            <ShieldCheck className="h-6 w-6 text-success" />
            <div>
              <div className="text-sm font-bold text-success">Documento auténtico</div>
              <div className="text-xs text-muted-foreground">
                Validado contra el registro interno · Emitido {rec.emitido} · {rec.validadoPor}
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
              <h1 className="mt-1 font-mono text-xl font-bold text-foreground">{rec.folio}</h1>
              {rec.rollo && <div className="text-xs text-muted-foreground">Rollo: <strong className="text-foreground">{rec.rollo}</strong></div>}
            </div>
            <ReleaseBadge s={rec.estatus} />
          </div>

          {rec.simulado && (
            <div className="mt-4 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
              Vista de simulación preparada para trazabilidad por QR. Cuando se conecte la base de datos, este folio cargará el registro real sin cambiar el diseño.
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info icon={Factory} label="Planta / Máquina" value={`${rec.planta} · ${rec.maquina}`} />
            <Info icon={Hash} label="Turno" value={`T${rec.turno}`} />
            <Info icon={Calendar} label="Fecha / hora" value={`${rec.fecha} · ${rec.hora}`} />
            <Info icon={Package} label="Producto" value={rec.producto} />
            <Info icon={User} label="Operador" value={rec.operador} />
            <Info icon={User} label="Jefe de máquina" value={rec.jefeMaquina} />
          </div>

          <h3 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Métricas registradas</h3>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2">Variable</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Estatus</th></tr>
              </thead>
              <tbody>
                {rec.metricas.map((m) => (
                  <tr key={m.label} className="border-t border-border">
                    <td className="px-3 py-2">{m.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{m.value}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.unit ?? ""}</td>
                    <td className="px-3 py-2">{m.status && <ReleaseBadge s={m.status} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-[11px] text-muted-foreground">
              Este documento es la representación digital del registro interno y no puede modificarse. Cualquier corrección queda asentada en la bitácora auditada.
            </p>
            <button
              onClick={() => printRollReport({
                folio: rec.folio, rollo: rec.rollo, maquina: rec.maquina, planta: rec.planta,
                turno: rec.turno, operador: rec.operador, jefeMaquina: rec.jefeMaquina,
                fecha: rec.fecha, hora: rec.hora, producto: rec.producto, estatus: rec.estatus,
                metricas: rec.metricas, notas: `Validado por ${rec.validadoPor}`,
              })}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Printer className="h-3.5 w-3.5" /> Reimprimir reporte
            </button>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
          La información detallada se despliega únicamente al escanear el código QR y consultar el folio interno del sistema.
        </div>
      </div>
    </AppLayout>
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
