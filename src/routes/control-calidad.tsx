import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StepperWizard } from "@/components/qc/StepperWizard";
import { KPIGrid } from "@/components/qc/KPIGrid";
import { GeneralInfoForm } from "@/components/qc/GeneralInfoForm";
import { QualityVariableTable } from "@/components/qc/QualityVariableTable";
import { MeasurementTable } from "@/components/qc/MeasurementTable";
import { AlertPanel } from "@/components/qc/AlertPanel";
import { ReleaseBadge } from "@/components/qc/StatusBadge";
import { ShiftStatusBar } from "@/components/qc/ShiftStatusBar";
import { useShiftStatus } from "@/lib/shift-status";
import {
  DEFAULT_GENERAL, SAMPLE_MEASUREMENTS, PLANTS, evaluateValue,
  type Measurement, type GeneralInfo,
} from "@/lib/qc-data";
import { PRODUCT_SPEC_MAP } from "@/lib/spec-catalog";
import {
  ArrowLeft, ArrowRight, Save, FileText, FileSpreadsheet, Pencil, CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/control-calidad")({ component: ControlCalidad });

const STEPS = [
  { id: 1, title: "Información General", subtitle: "Cabecera del registro" },
  { id: 2, title: "Mediciones por Hora", subtitle: "Captura del turno" },
  { id: 3, title: "Resumen y Guardado", subtitle: "Validación final" },
];

function ControlCalidad() {
  const [step, setStep] = useState(1);
  const [info, setInfo] = useState<GeneralInfo>(DEFAULT_GENERAL);
  const [measurements, setMeasurements] = useState<Measurement[]>(SAMPLE_MEASUREMENTS);
  const shift = useShiftStatus();
  const locked = shift.status !== "borrador";

  const activeSpec = useMemo(
    () => PRODUCT_SPEC_MAP[info.fabricacion] ?? PRODUCT_SPEC_MAP["PHR01"],
    [info.fabricacion],
  );
  const specVars = activeSpec.variables;
  const specMap = useMemo(() => Object.fromEntries(specVars.map((q) => [q.key, q])), [specVars]);
  const alerts = useMemo(() => {
    const out: string[] = [];
    measurements.forEach((m) => {
      specVars.forEach((q) => {
        const v = (m as any)[q.key];
        if (typeof v === "number" && evaluateValue(specMap[q.key], v) === "bad") {
          out.push(`${m.hora} · Rollo ${m.rollo}: ${q.label} = ${v}${q.unit} (rango ${q.min}–${q.max})`);
        }
      });
    });
    return out;
  }, [measurements, specMap, specVars]);

  // Cumplimiento calculado: % de mediciones numéricas dentro de especificación
  const cumplimiento = useMemo(() => {
    let total = 0;
    let okCount = 0;
    measurements.forEach((m) => {
      specVars.forEach((q) => {
        const v = (m as any)[q.key];
        if (typeof v === "number") {
          total += 1;
          if (evaluateValue(specMap[q.key], v) !== "bad") okCount += 1;
        }
      });
    });
    return total === 0 ? 0 : (okCount / total) * 100;
  }, [measurements, specMap, specVars]);

  const infoView = useMemo(() => ({ ...info, cumplimiento }), [info, cumplimiento]);

  const plant = PLANTS.find((p) => p.id === info.plantId)!;

  return (
    <AppLayout title="Control de Calidad · Registro de Producción">
      <div className="space-y-5">
        {step !== 1 && <ShiftStatusBar />}
        <StepperWizard steps={STEPS} current={step} onGo={setStep} />

        {step === 1 && (
          <div className="space-y-5">
            
            <GeneralInfoForm value={infoView} onChange={setInfo} locked={locked} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <QualityVariableTable variables={specVars} productCode={activeSpec.code} locked={locked} />
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs text-foreground/80">
              Los valores capturados en el paso 3 se evaluarán automáticamente contra estos objetivos. Las celdas fuera
              de rango se marcarán en rojo, cerca del límite en amarillo y dentro del rango en verde.
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <AlertPanel alerts={alerts} />
            <MeasurementTable rows={measurements} onChange={setMeasurements} operadorTurno={info.operador} turno={info.turno} locked={locked} />
          </div>
        )}

        {step === 4 && (
          <SummaryPanel info={infoView} plantName={plant.name} measurements={measurements} alerts={alerts} onEdit={setStep} />
        )}

        <ActionFooter
          step={step}
          total={STEPS.length}
          onBack={() => setStep((s) => Math.max(1, s - 1))}
          onNext={() => setStep((s) => Math.min(STEPS.length, s + 1))}
        />
      </div>
    </AppLayout>
  );
}

function ActionFooter({ step, total, onBack, onNext }: { step: number; total: number; onBack: () => void; onNext: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-6 mt-6 border-t border-border bg-card/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
        <button
          onClick={onBack}
          disabled={step === 1}
          className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Anterior
        </button>
        <div className="text-xs text-muted-foreground">Paso {step} de {total}</div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
            <Save className="h-4 w-4" /> Guardar borrador
          </button>
          {step < total ? (
            <button onClick={onNext} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => alert("Registro guardado correctamente ✓")}
              className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-semibold text-success-foreground hover:opacity-90"
            >
              <CheckCircle2 className="h-4 w-4" /> Guardar registro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({
  info, plantName, measurements, alerts, onEdit,
}: {
  info: GeneralInfo; plantName: string; measurements: Measurement[]; alerts: string[]; onEdit: (s: number) => void;
}) {
  const finalStatus = alerts.length === 0 ? "ok" : "issues";

  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-5 shadow-sm ${
        finalStatus === "ok" ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/10"
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estado final del registro</div>
            <div className={`mt-1 text-xl font-bold ${finalStatus === "ok" ? "text-success" : "text-foreground"}`}>
              {finalStatus === "ok" ? "✓ Listo para liberar" : `⚠ ${alerts.length} alertas de calidad detectadas`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onEdit(1)} className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"><Pencil className="h-3.5 w-3.5" /> Editar sección</button>
            <button className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"><FileText className="h-3.5 w-3.5" /> Exportar PDF</button>
            <button className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"><FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Información general</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
            <Item label="Planta" v={plantName} />
            <Item label="Máquina" v={info.maquina} />
            <Item label="Fabricación" v={info.fabricacion} />
            <Item label="Fecha" v={info.fecha} />
            <Item label="Turno" v={`Turno ${info.turno}`} />
            <Item label="Horario" v={`${info.horaInicio} – ${info.horaFin}`} />
            <Item label="Jefe de máquina" v={info.jefeMaquina} />
            <Item label="Operador" v={info.operador} />
            <Item label="Analista" v={info.analista} />
            <Item label="Vel. máquina" v={`${info.velocidadMaquina} m/min`} />
            <Item label="Vel. enrollador" v={`${info.velocidadEnrollador} m/min`} />
            <Item label="% Crepado" v={`${info.crepado}%`} />
          </dl>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Cumplimiento del turno</h3>
          <div className="mt-3 text-4xl font-bold text-primary tabular-nums">{info.cumplimiento.toFixed(2)}%</div>
          <div className="mt-1 text-xs text-muted-foreground">{measurements.length} mediciones · {alerts.length} alertas</div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, info.cumplimiento)}%` }} />
          </div>
        </div>
      </div>

      <AlertPanel alerts={alerts} />

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Resumen de mediciones</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Hora</th><th>Rollo</th><th>P. base</th><th>Humedad</th><th>Ancho</th><th>Diámetro</th><th>Estatus</th></tr>
            </thead>
            <tbody>
              {measurements.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-2 tabular-nums">{m.hora}</td>
                  <td className="px-4 font-medium tabular-nums">{m.rollo}</td>
                  <td className="px-4 tabular-nums">{m.pesoBase}</td>
                  <td className="px-4 tabular-nums">{m.humedad}%</td>
                  <td className="px-4 tabular-nums">{m.anchoUtil} cm</td>
                  <td className="px-4 tabular-nums">{m.diametro} cm</td>
                  <td className="px-4 py-2"><ReleaseBadge s={m.estatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Item({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{v}</dd>
    </div>
  );
}
