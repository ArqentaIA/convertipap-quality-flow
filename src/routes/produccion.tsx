import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Factory, Gauge, Clock, Pause, Play, AlertTriangle, AlertOctagon, X, Check } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/produccion")({ component: ProduccionPage });

type Maquina = {
  codigo: string;
  planta: string;
  producto: string;
  orden: string;
  estado: "operando" | "paro" | "ajuste";
  velocidad: number;
  velocidadObj: number;
  oee: number;
  turnoHoras: number;
  rollosTurno: number;
  operador: string;
  /** Minutos transcurridos desde el inicio del turno actual */
  minutosDesdeInicioTurno: number;
  /** ¿Ya se capturó al menos un registro de calidad en este turno? */
  tieneRegistroTurno: boolean;
};

const MAQUINAS_INICIALES: Maquina[] = [
  { codigo: "MP-04", planta: "Tlaxcala", producto: "PST Higiénico 13 g/m²", orden: "OF-44218", estado: "operando", velocidad: 1720, velocidadObj: 1800, oee: 86.4, turnoHoras: 6.2, rollosTurno: 14, operador: "Palemón G.", minutosDesdeInicioTurno: 372, tieneRegistroTurno: true },
  { codigo: "MP-05", planta: "Tlaxcala", producto: "PST Higiénico 13 g/m²", orden: "OF-44219", estado: "operando", velocidad: 1815, velocidadObj: 1800, oee: 91.2, turnoHoras: 6.5, rollosTurno: 16, operador: "Ricardo M.", minutosDesdeInicioTurno: 390, tieneRegistroTurno: true },
  { codigo: "MP-06", planta: "Tlaxcala", producto: "PST Toalla 22 g/m²", orden: "OF-44225", estado: "ajuste", velocidad: 0, velocidadObj: 1500, oee: 62.1, turnoHoras: 4.0, rollosTurno: 8, operador: "Adrián P.", minutosDesdeInicioTurno: 240, tieneRegistroTurno: true },
  { codigo: "MP-07", planta: "Tlaxcala", producto: "PST Servilleta 17 g/m²", orden: "OF-44230", estado: "operando", velocidad: 1480, velocidadObj: 1500, oee: 88.0, turnoHoras: 6.0, rollosTurno: 15, operador: "Jorge H.", minutosDesdeInicioTurno: 360, tieneRegistroTurno: true },
];

const UMBRAL_MIN = 15;

const CAUSAS_PARO = [
  "Falla mecánica",
  "Falla eléctrica",
  "Falla neumática / hidráulica",
  "Cambio de producto / setup",
  "Falta de materia prima (pulpa)",
  "Rotura de hoja",
  "Mantenimiento no programado",
  "Falta de operador",
  "Ajuste de calidad fuera de spec",
  "Otro",
];

function ProduccionPage() {
  const [maquinas, setMaquinas] = useState<Maquina[]>(MAQUINAS_INICIALES);
  const [modal, setModal] = useState<Maquina | null>(null);

  const activos = maquinas.filter((m) => m.estado === "operando").length;
  const oeeProm = (maquinas.reduce((s, m) => s + m.oee, 0) / maquinas.length).toFixed(1);
  const rollos = maquinas.reduce((s, m) => s + m.rollosTurno, 0);
  const sinRegistro = maquinas.filter((m) => requiereCausa(m)).length;

  const guardarCausa = (codigo: string, causa: string, _obs: string) => {
    setMaquinas((prev) =>
      prev.map((m) =>
        m.codigo === codigo
          ? { ...m, estado: "paro", tieneRegistroTurno: true, velocidad: 0 }
          : m,
      ),
    );
    setModal(null);
    // En producción: POST /api/v1/qc/paros { maquina, causa, observacion, ts }
    console.info("Paro registrado", { codigo, causa });
  };

  return (
    <AppLayout title="Producción · Estado de máquinas">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KPI icon={Factory} label="Máquinas activas" value={`${activos} / ${maquinas.length}`} tone="primary" />
          <KPI icon={Gauge} label="OEE promedio" value={`${oeeProm}%`} tone="success" />
          <KPI icon={Clock} label="Rollos turno actual" value={String(rollos)} />
          <KPI icon={AlertTriangle} label="Sin registro >15 min" value={String(sinRegistro)} tone={sinRegistro > 0 ? "warning" : "default"} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {maquinas.map((m) => {
            const pct = m.velocidadObj ? Math.min(100, (m.velocidad / m.velocidadObj) * 100) : 0;
            const necesitaCausa = requiereCausa(m);
            return (
              <div
                key={m.codigo}
                className={`rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-md hover:border-primary/40 ${
                  necesitaCausa ? "border-destructive/50 ring-1 ring-destructive/20" : "border-border"
                }`}
              >
                <Link
                  to="/historial/$maquina"
                  params={{ maquina: m.codigo }}
                  className="block cursor-pointer"
                >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{m.planta}</div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-lg font-bold text-foreground">{m.codigo}</h3>
                      <span className="text-xs text-muted-foreground">· {m.orden}</span>
                    </div>
                  </div>
                  <EstadoChip estado={m.estado} />
                </div>

                <div className="mt-3 text-sm text-foreground">{m.producto}</div>
                <div className="text-xs text-muted-foreground">Operador: {m.operador}</div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>Velocidad</span>
                    <span className="tabular-nums">
                      <strong className="text-foreground">{m.velocidad}</strong> / {m.velocidadObj} m/min
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${m.estado === "operando" ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <Mini label="OEE" value={`${m.oee.toFixed(1)}%`} />
                  <Mini label="Horas" value={`${m.turnoHoras.toFixed(1)}h`} />
                  <Mini label="Rollos" value={String(m.rollosTurno)} />
                </div>
                </Link>





                {necesitaCausa && (
                  <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex items-start gap-2">
                      <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="flex-1 text-xs leading-relaxed text-foreground">
                        <strong className="text-destructive">Máquina sin registro.</strong>{" "}
                        Han pasado <span className="tabular-nums font-semibold">{m.minutosDesdeInicioTurno} min</span> desde el inicio del turno sin captura de calidad. Se considera <strong>parada</strong>.
                      </div>
                    </div>
                    <button
                      onClick={() => setModal(m)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground shadow-sm hover:opacity-90"
                    >
                      <AlertOctagon className="h-3.5 w-3.5" />
                      Registrar causa de paro
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modal && <CausaModal maquina={modal} onClose={() => setModal(null)} onSave={guardarCausa} />}
    </AppLayout>
  );
}

function requiereCausa(m: Maquina) {
  return !m.tieneRegistroTurno && m.minutosDesdeInicioTurno >= UMBRAL_MIN;
}

function CausaModal({
  maquina,
  onClose,
  onSave,
}: {
  maquina: Maquina;
  onClose: () => void;
  onSave: (codigo: string, causa: string, obs: string) => void;
}) {
  const [causa, setCausa] = useState<string>(CAUSAS_PARO[0]);
  const [obs, setObs] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2 text-destructive">
              <AlertOctagon className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Paro de máquina</span>
            </div>
            <h3 className="mt-1 text-base font-bold text-foreground">
              {maquina.codigo} · {maquina.planta}
            </h3>
            <p className="text-xs text-muted-foreground">
              Sin registro desde hace {maquina.minutosDesdeInicioTurno} min · Operador: {maquina.operador}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Causa del paro *</label>
            <select
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CAUSAS_PARO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Observaciones</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              placeholder="Describe la causa, código de alarma PLC, acciones tomadas…"
              className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            Esto generará un folio de incidencia y notificará al supervisor de planta.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(maquina.codigo, causa, obs)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5" />
            Registrar paro
          </button>
        </div>
      </div>
    </div>
  );
}

function EstadoChip({ estado }: { estado: Maquina["estado"] }) {
  const map = {
    operando: { cls: "bg-success/15 text-success border-success/30", icon: Play, txt: "Operando" },
    ajuste: { cls: "bg-warning/20 text-foreground border-warning/40", icon: Clock, txt: "Ajuste" },
    paro: { cls: "bg-destructive/15 text-destructive border-destructive/30", icon: Pause, txt: "Paro" },
  } as const;
  const { cls, icon: Icon, txt } = map[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {txt}
    </span>
  );
}

function KPI({ icon: Icon, label, value, tone = "default" }: { icon: any; label: string; value: string; tone?: "default" | "primary" | "success" | "warning" }) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-foreground",
  };
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-foreground tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
