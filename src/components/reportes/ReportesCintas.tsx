// =============================================================================
// Sección "REPORTES DE CINTAS" del módulo Reportes e Indicadores.
// Acceso controlado por el módulo `pesaje_cintas` (menú, ruta, componente,
// consulta y server function).
// =============================================================================
import { useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Layers, Database } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDatosReporteCintas, getBaseIntegralCintas } from "@/lib/reportes-cintas.functions";
import { generarReporteMejoradoCintas } from "@/services/reporteMejoradoBobinadorasCintas";
import { generarBaseIntegralCintas } from "@/services/baseIntegralPesajeCintas";
import { ReporteCintasError } from "@/services/cintas-plantilla-base";
import { auditAction } from "@/lib/audit";
import { useAuth } from "@/lib/auth";

const CARD_CLS =
  "relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-15px_rgba(5,150,105,0.20)] ring-1 ring-emerald-100 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-gradient-to-b before:from-emerald-500 before:via-teal-500 before:to-cyan-500";
const BTN_CLS =
  "inline-flex items-center gap-2 rounded-lg border border-[#16A34A]/30 bg-gradient-to-b from-[#16A34A]/10 to-[#16A34A]/5 px-3.5 py-1.5 text-xs font-semibold text-[#16A34A] shadow-sm transition-all hover:from-[#16A34A]/20 hover:to-[#16A34A]/10 active:scale-[0.98] disabled:opacity-50";
const INPUT_CLS = "rounded-md border border-input bg-background px-2 py-1.5 text-xs";
const LABEL_CLS = "text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700/80";

type Tipo = "mejorado" | "integral";

const TURNOS = ["1", "2", "3"];

function hoyISO(): string {
  const d = new Date();
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(d);
}

export function ReportesCintasSection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-700">Reportes de Cintas</h2>
      </div>
      <TarjetaReporte
        tipo="mejorado"
        icono={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
        titulo="Reporte de Bobinadoras — Cintas"
        descripcion="Formato mejorado con medidas dinámicas, pesos por cinta, observaciones y totales operativos."
      />
      <TarjetaReporte
        tipo="integral"
        icono={<Database className="h-4 w-4 text-emerald-600" />}
        titulo="Base Integral de Pesaje de Cintas"
        descripcion="Exportación completa de los datos, relaciones y trazabilidad que participan en el módulo de Pesaje de Cintas."
      />
    </section>
  );
}

function TarjetaReporte(props: {
  tipo: Tipo;
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
}) {
  const auth = useAuth();
  const [modo, setModo] = useState<"fecha" | "rango">("fecha");
  const [inicio, setInicio] = useState(hoyISO());
  const [fin, setFin] = useState(hoyISO());
  const [turno, setTurno] = useState("");
  const [bobinadora, setBobinadora] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fechaFin = modo === "fecha" ? inicio : fin;
  const rangoInvalido = modo === "rango" && (!inicio || !fin || fin < inicio);

  const datosFn = useServerFn(getDatosReporteCintas);
  const integralFn = useServerFn(getBaseIntegralCintas);

  const conteo = useQuery({
    queryKey: ["reportes-cintas-conteo", inicio, fechaFin, turno],
    queryFn: () => datosFn({ data: { fechaInicio: inicio, fechaFin: fechaFin, turno: turno || null } }),
    enabled: !!auth.session?.access_token && !!inicio && !!fechaFin && !rangoInvalido,
    staleTime: 30_000,
    retry: false,
  });

  const bobinadoras = useMemo(() => {
    const set = new Set(
      (conteo.data?.lotes ?? [])
        .map((l) => (l.bobinadora_nombre_snapshot ?? "").trim())
        .filter((n) => n && n !== "SIN DATOS REGISTRADOS"),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [conteo.data]);

  const resumen = useMemo(() => {
    const d = conteo.data;
    if (!d) return null;
    const lotes = bobinadora
      ? d.lotes.filter((l) => (l.bobinadora_nombre_snapshot ?? "").trim() === bobinadora)
      : d.lotes;
    const ids = new Set(lotes.map((l) => l.id));
    const registradas = d.cintas.filter((c) => c.estado === "registrada" && ids.has(c.lote_id)).length;
    return { lotes: lotes.length, cintas: registradas };
  }, [conteo.data, bobinadora]);

  const nombreArchivo = () => {
    const t = turno ? `T${turno}` : "TODOS";
    const b = bobinadora ? ` ${bobinadora}` : "";
    if (props.tipo === "mejorado") {
      const fecha = inicio === fechaFin ? inicio : `${inicio}_al_${fechaFin}`;
      return `Reporte de Bobinadoras — Cintas ${fecha} ${t}${b}.xlsx`;
    }
    return `Base_Integral_Pesaje_Cintas_${inicio}_${fechaFin}_${t}${b.replace(/\s+/g, "_")}.xlsx`;
  };

  const filtrarPorBobinadora = <T extends { lotes: { id: string; bobinadora_nombre_snapshot: string }[]; cintas: { lote_id: string }[] }>(
    d: T,
  ): T => {
    if (!bobinadora) return d;
    const lotes = d.lotes.filter((l) => (l.bobinadora_nombre_snapshot ?? "").trim() === bobinadora);
    const ids = new Set(lotes.map((l) => l.id));
    return { ...d, lotes, cintas: d.cintas.filter((c) => ids.has(c.lote_id)) };
  };

  const generar = async () => {
    setError(null); setMsg(null);
    if (!inicio) { setError("La fecha inicial es obligatoria."); return; }
    if (modo === "rango" && !fin) { setError("La fecha final es obligatoria en modo rango."); return; }
    if (rangoInvalido) { setError("La fecha final no puede ser menor a la fecha inicial."); return; }

    setBusy(true);
    const fileName = nombreArchivo();
    const input = { fechaInicio: inicio, fechaFin, turno: turno || null };
    try {
      let lotes = 0, cintas = 0;
      if (props.tipo === "integral") {
        const data = filtrarPorBobinadora(await integralFn({ data: input }));
        const r = await generarBaseIntegralCintas(data, fileName);
        lotes = r.lotes; cintas = r.cintas;
      } else {
        const data = filtrarPorBobinadora(await datosFn({ data: input }));
        const r = await generarReporteMejoradoCintas(data, fileName);
        lotes = r.lotes; cintas = r.cintas;
      }
      setMsg(`Generado: ${fileName} · ${lotes} lotes · ${cintas} cintas`);
      void auditAction("reportes", `Descarga de reporte de cintas (${props.tipo})`, null, {
        tipo_reporte: props.tipo,
        fecha_inicio: inicio,
        fecha_fin: fechaFin,
        turno: turno || "todos",
        usuario: auth.profile?.email ?? null,
        rol: auth.roles.join(","),
        lotes,
        cintas,
        archivo: fileName,
        resultado: "exitoso",
      });
    } catch (e) {
      const err = e as Error;
      const sinDatos = err instanceof ReporteCintasError && err.message === "SIN_REGISTROS";
      setError(sinDatos
        ? "No existen registros de cintas en el periodo y turno seleccionados."
        : err.message);
      void auditAction("reportes", `Descarga de reporte de cintas (${props.tipo})`, null, {
        tipo_reporte: props.tipo,
        fecha_inicio: inicio,
        fecha_fin: fechaFin,
        turno: turno || "todos",
        usuario: auth.profile?.email ?? null,
        rol: auth.roles.join(","),
        archivo: fileName,
        resultado: sinDatos ? "sin datos" : "error",
        detalle: sinDatos ? null : err.message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={CARD_CLS}>
      <div className="flex items-start gap-3">
        {props.icono}
        <div>
          <div className="text-sm font-bold text-foreground">{props.titulo}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">{props.descripcion}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>Periodo</label>
          <select className={INPUT_CLS} value={modo} onChange={(e) => setModo(e.target.value as "fecha" | "rango")}>
            <option value="fecha">Fecha</option>
            <option value="rango">Rango de fechas</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>Fecha inicial</label>
          <input type="date" className={INPUT_CLS} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        {modo === "rango" && (
          <div className="flex flex-col gap-1">
            <label className={LABEL_CLS}>Fecha final</label>
            <input type="date" className={INPUT_CLS} value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>Turno</label>
          <select className={INPUT_CLS} value={turno} onChange={(e) => setTurno(e.target.value)}>
            <option value="">Todos</option>
            {TURNOS.map((t) => <option key={t} value={t}>Turno {t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>Bobinadora</label>
          <select className={INPUT_CLS} value={bobinadora} onChange={(e) => setBobinadora(e.target.value)}>
            <option value="">Todas</option>
            {bobinadoras.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">
          {conteo.isFetching
            ? "Consultando registros…"
            : conteo.error
              ? <span className="text-destructive">{(conteo.error as Error).message}</span>
              : resumen
                ? resumen.lotes === 0
                  ? "Sin datos en el periodo y turno seleccionados."
                  : `${resumen.lotes} lotes · ${resumen.cintas} cintas registradas`
                : "—"}
          {msg && <span className="ml-2 text-emerald-700">· {msg}</span>}
          {error && <span className="ml-2 text-destructive">· {error}</span>}
        </div>
        <button
          onClick={() => void generar()}
          disabled={busy || rangoInvalido || !resumen || resumen.lotes === 0}
          className={BTN_CLS}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          {busy ? "Generando…" : "Generar Excel"}
        </button>
      </div>
    </div>
  );
}
