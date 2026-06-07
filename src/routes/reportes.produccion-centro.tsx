import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionGate } from "@/components/SessionGate";
import {
  Download, FileSpreadsheet, Factory, CheckCircle2, Clock, AlertCircle,
  TrendingUp, TrendingDown, Activity, Gauge, Target, Wifi,
} from "lucide-react";
import logoUrl from "@/assets/logo-convertipap.png";
import { useAuth } from "@/lib/auth";
import { getProduccionCentro, type CentroProduccionPayload } from "@/lib/produccion-centro.functions";
import { formatCaptura } from "@/lib/format";

export const Route = createFileRoute("/reportes/produccion-centro")({
  component: () => <SessionGate><CentroPage /></SessionGate>,
  ssr: false,
  errorComponent: ({ error }) => (
    <AppLayout title="Centro de Control de Producción">
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error.message}
      </div>
    </AppLayout>
  ),
});

type Rango = "dia" | "semana" | "mes" | "año" | "custom";

function computeWindow(rango: Rango, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  if (rango === "dia") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (rango === "semana") start = new Date(now.getTime() - 7 * 86400000);
  else if (rango === "mes") start = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (rango === "año") start = new Date(now.getFullYear(), 0, 1);
  else if (rango === "custom" && customStart && customEnd) {
    return { start: new Date(customStart).toISOString(), end: new Date(customEnd).toISOString() };
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

const RANGO_LABEL: Record<Rango, string> = {
  dia: "Reporte Diario",
  semana: "Reporte Semanal",
  mes: "Reporte Mensual",
  año: "Reporte Anual",
  custom: "Rango Personalizado",
};

const fmtKg = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(n);
const fmtKg2 = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number | null | undefined) => n == null ? "—" : `${n.toFixed(1)}%`;
const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
};
const fmtHace = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return `Hace ${Math.floor(hrs / 24)} d`;
};

function CentroPage() {
  const auth = useAuth();
  const [rango, setRango] = useState<Rango>("semana");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [filtroTurno, setFiltroTurno] = useState<string>("");
  const [filtroMaquina, setFiltroMaquina] = useState<string>("");
  const [filtroProducto, setFiltroProducto] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const pageSize = 15;

  const { start, end } = useMemo(() => computeWindow(rango, customStart, customEnd), [rango, customStart, customEnd]);

  const opts = useMemo(
    () =>
      queryOptions({
        queryKey: ["centro-produccion", rango, start, end],
        queryFn: () => getProduccionCentro({ data: { rango, start, end } }),
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchInterval: 60_000,
      }),
    [rango, start, end],
  );

  const q = useQuery({ ...opts, enabled: !!auth.session?.access_token });
  const data = q.data;

  const tablaFiltrada = useMemo(() => {
    if (!data) return [];
    const text = busqueda.trim().toLowerCase();
    return data.tabla.filter((r) => {
      if (filtroTurno && r.turno !== filtroTurno) return false;
      if (filtroMaquina && r.maquina !== filtroMaquina) return false;
      if (filtroProducto && r.producto !== filtroProducto) return false;
      if (filtroEstado) {
        const lib = r.dictamen === "liberada" || r.estatus_liberacion === "L";
        const rech = r.dictamen === "rechazada" || r.estatus_liberacion === "NC";
        const pend = !lib && !rech;
        if (filtroEstado === "liberado" && !lib) return false;
        if (filtroEstado === "rechazado" && !rech) return false;
        if (filtroEstado === "pendiente" && !pend) return false;
      }
      if (text) {
        const blob = `${r.numero_rollo} ${r.maquina ?? ""} ${r.producto ?? ""} ${r.analista ?? ""} ${formatCaptura(r.secuencia_captura)}`.toLowerCase();
        if (!blob.includes(text)) return false;
      }
      return true;
    });
  }, [data, filtroTurno, filtroMaquina, filtroProducto, filtroEstado, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(tablaFiltrada.length / pageSize));
  const tablaPagina = tablaFiltrada.slice((pagina - 1) * pageSize, pagina * pageSize);

  const exportXLSX = async () => {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const empty = [{ "Sin datos": "Sin datos disponibles" }];
    const sheets: { name: string; rows: Record<string, unknown>[] }[] = [
      {
        name: "Resumen Ejecutivo",
        rows: [{
          "Rollos Producidos": data.kpis.rollosProducidos,
          "Kg Producidos": data.kpis.kgProducidos,
          "OEE Global %": data.kpis.oeeGlobalPct,
          "Calidad Liberada %": data.kpis.calidadLiberadaPct,
          "Tiempo Muerto (min)": data.kpis.tiempoMuertoMin,
          "Producción Promedio": `${data.kpis.produccionPromedio.valor} ${data.kpis.produccionPromedio.unidad}`,
          "Última Captura": fmtDate(data.kpis.ultimaCapturaAt),
          "Periodo Inicio": fmtDate(start),
          "Periodo Fin": fmtDate(end),
        }],
      },
      {
        name: "Último Rollo",
        rows: data.ultimoRollo ? [{
          "N° Captura": formatCaptura(data.ultimoRollo.secuencia_captura),
          "N° Rollo": data.ultimoRollo.numero_rollo,
          "Capturado": fmtDate(data.ultimoRollo.capturado_at),
          "Máquina": data.ultimoRollo.maquina ?? "—",
          "Turno": data.ultimoRollo.turno,
          "Producto": data.ultimoRollo.producto ?? "—",
          "Peso (kg)": data.ultimoRollo.peso_kg ?? "—",
          "Estado": data.ultimoRollo.estado,
          "Dictamen": data.ultimoRollo.dictamen ?? "—",
          "Analista": data.ultimoRollo.analista ?? "—",
        }] : empty,
      },
      {
        name: "Producción en el Tiempo",
        rows: data.serieTiempo.length ? data.serieTiempo.map((b) => ({
          Periodo: b.label, "Kg": b.kg, "Rollos": b.rollos, "Acumulado": b.acumulado,
        })) : empty,
      },
      {
        name: "Por Máquina",
        rows: data.maquinas.length ? data.maquinas.map((m) => ({
          Código: m.codigo, Nombre: m.nombre, Estado: m.estado,
          "Kg": m.kg, "Rollos": m.rollos, "OEE %": m.oeePct,
          "Calidad %": m.calidadPct, "Operativo (min)": m.tiempoOperativoMin,
        })) : empty,
      },
      {
        name: "Por Turno",
        rows: data.turnos.length ? data.turnos.map((t) => ({
          Turno: t.turno, Rollos: t.rollos, Kg: t.kg, "Calidad %": t.calidadPct, "Eficiencia %": t.eficienciaPct,
        })) : empty,
      },
      {
        name: "Por Producto",
        rows: data.productos.length ? data.productos.map((p) => ({
          Producto: p.producto, Kg: p.kg, Rollos: p.rollos, "Participación %": p.participacionPct,
        })) : empty,
      },
      {
        name: "FOMs",
        rows: [{
          "Kg Liberados": data.foms.kgLiberados.total, "Kg Liberados %": data.foms.kgLiberados.pct, "Tendencia %": data.foms.kgLiberados.tendenciaPct,
          "Kg No Liberados": data.foms.kgNoLiberados.total, "Kg No Liberados %": data.foms.kgNoLiberados.pct,
          "Costo No Calidad": data.foms.costoNoCalidad.total, "Costo MXN/kg": data.foms.costoNoCalidad.costoKg,
          "OEE Global %": data.foms.oeeGlobalPct,
        }],
      },
      {
        name: "Alertas",
        rows: data.alertas.length ? data.alertas.map((a) => ({
          Tipo: a.tipo, Título: a.titulo, Detalle: a.detalle, Cuándo: fmtDate(a.cuando),
        })) : empty,
      },
      {
        name: "Tabla Detallada",
        rows: tablaFiltrada.length ? tablaFiltrada.map((r) => ({
          "N° Captura": formatCaptura(r.secuencia_captura),
          "N° Rollo": r.numero_rollo,
          "Fecha/Hora": fmtDate(r.capturado_at),
          Máquina: r.maquina ?? "—",
          Turno: r.turno,
          Producto: r.producto ?? "—",
          "Peso (kg)": r.peso_kg ?? "—",
          Estado: r.estado,
          Dictamen: r.dictamen ?? "—",
          Analista: r.analista ?? "—",
        })) : empty,
      },
    ];
    for (const s of sheets) {
      const ws = XLSX.utils.json_to_sheet(s.rows);
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    XLSX.writeFile(wb, `centro_produccion_${stamp}.xlsx`);
  };

  const exportPDF = async () => {
    if (!data) return;
    const [{ default: jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const M = 40;
    try {
      const res = await fetch(logoUrl);
      const blob = await res.blob();
      const dataUrl: string = await new Promise((r) => { const fr = new FileReader(); fr.onloadend = () => r(fr.result as string); fr.readAsDataURL(blob); });
      doc.addImage(dataUrl, "PNG", M, M, 90, 36);
    } catch { /* opcional */ }
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("CENTRO DE CONTROL DE PRODUCCIÓN", pageW - M, M + 16, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
    doc.text(`${RANGO_LABEL[rango]} · ${fmtDate(start)} → ${fmtDate(end)}`, pageW - M, M + 32, { align: "right" });
    doc.text(`Usuario: ${auth.profile?.nombre ?? auth.user?.email ?? "—"}`, pageW - M, M + 46, { align: "right" });
    doc.text(`Impresión: ${new Date().toLocaleString("es-MX")}`, pageW - M, M + 60, { align: "right" });

    autoTable(doc, {
      startY: M + 84,
      head: [["KPI", "Valor"]],
      body: [
        ["Rollos producidos", String(data.kpis.rollosProducidos)],
        ["Kg producidos", fmtKg(data.kpis.kgProducidos)],
        ["OEE global", fmtPct(data.kpis.oeeGlobalPct)],
        ["Calidad liberada", fmtPct(data.kpis.calidadLiberadaPct)],
        ["Tiempo muerto (min)", String(data.kpis.tiempoMuertoMin)],
        ["Producción promedio", `${data.kpis.produccionPromedio.valor} ${data.kpis.produccionPromedio.unidad}`],
        ["Última captura", fmtDate(data.kpis.ultimaCapturaAt)],
      ],
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5 },
    });
    type DocWithTable = { lastAutoTable: { finalY: number } };
    let y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 16;

    if (data.ultimoRollo) {
      autoTable(doc, {
        startY: y,
        head: [["Último Rollo Capturado", ""]],
        body: [
          ["N° Captura", formatCaptura(data.ultimoRollo.secuencia_captura)],
          ["N° Rollo", data.ultimoRollo.numero_rollo],
          ["Máquina", data.ultimoRollo.maquina ?? "—"],
          ["Turno", data.ultimoRollo.turno],
          ["Producto", data.ultimoRollo.producto ?? "—"],
          ["Peso", data.ultimoRollo.peso_kg != null ? `${data.ultimoRollo.peso_kg} kg` : "—"],
          ["Estado", data.ultimoRollo.dictamen ?? data.ultimoRollo.estado],
          ["Analista", data.ultimoRollo.analista ?? "—"],
          ["Capturado", fmtDate(data.ultimoRollo.capturado_at)],
        ],
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 5 },
      });
      y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 16;
    }

    if (data.maquinas.length) {
      autoTable(doc, {
        startY: y,
        head: [["Máquina", "Estado", "Kg", "Rollos", "OEE %", "Calidad %"]],
        body: data.maquinas.map((m) => [m.codigo, m.estado, fmtKg(m.kg), String(m.rollos), fmtPct(m.oeePct), fmtPct(m.calidadPct)]),
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 5 },
      });
      y = (doc as unknown as DocWithTable).lastAutoTable.finalY + 16;
    }

    doc.setFontSize(8); doc.setTextColor(130);
    doc.text(`Filtros: Turno=${filtroTurno || "todos"} · Máquina=${filtroMaquina || "todas"} · Producto=${filtroProducto || "todos"} · Estado=${filtroEstado || "todos"}`, M, doc.internal.pageSize.getHeight() - 30);
    doc.text(`Registros considerados: ${tablaFiltrada.length}`, M, doc.internal.pageSize.getHeight() - 18);

    doc.save(`centro_produccion_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (q.error) {
    return (
      <AppLayout title="Centro de Control de Producción">
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(q.error as Error).message}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Centro de Control de Producción">
      <div className="space-y-6">
        {/* ── ENCABEZADO ── */}
        <Header
          rango={rango} setRango={setRango}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd} setCustomEnd={setCustomEnd}
          usuario={auth.profile?.nombre ?? auth.user?.email ?? "—"}
          start={start} end={end}
          onExportXLSX={exportXLSX} onExportPDF={exportPDF}
          loading={q.isFetching}
        />

        {q.isLoading || !data ? (
          <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">Cargando datos…</div>
        ) : (
          <>
            <UltimoRolloHero data={data} />

            <KpisRow kpis={data.kpis} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <ProduccionTiempo data={data} rango={rango} />
              </div>
              <AlertasPanel alertas={data.alertas} />
            </div>

            <MapaMaquinas maquinas={data.maquinas} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <TurnosCard turnos={data.turnos} />
              <ProductosCard productos={data.productos} />
              <FomsCard foms={data.foms} />
            </div>

            <TablaDetallada
              data={data}
              tablaFiltrada={tablaFiltrada}
              tablaPagina={tablaPagina}
              pagina={pagina} totalPaginas={totalPaginas} setPagina={setPagina}
              busqueda={busqueda} setBusqueda={setBusqueda}
              filtroTurno={filtroTurno} setFiltroTurno={setFiltroTurno}
              filtroMaquina={filtroMaquina} setFiltroMaquina={setFiltroMaquina}
              filtroProducto={filtroProducto} setFiltroProducto={setFiltroProducto}
              filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
            />

            <div className="text-center text-xs text-muted-foreground">
              Última actualización: {fmtDate(data.ultimaActualizacion)}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ──────────────── ENCABEZADO ────────────────
function Header(p: {
  rango: Rango; setRango: (r: Rango) => void;
  customStart: string; setCustomStart: (s: string) => void;
  customEnd: string; setCustomEnd: (s: string) => void;
  usuario: string; start: string; end: string;
  onExportXLSX: () => void; onExportPDF: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-white/10 p-2 backdrop-blur">
            <img src={logoUrl} alt="Convertipap" className="h-10 w-auto" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight">CENTRO DE CONTROL DE PRODUCCIÓN</div>
            <div className="text-xs text-slate-300">{RANGO_LABEL[p.rango]} · {fmtDate(p.start)} → {fmtDate(p.end)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={p.rango}
            onChange={(e) => p.setRango(e.target.value as Rango)}
            className="rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-white"
          >
            <option value="dia">Reporte Diario</option>
            <option value="semana">Reporte Semanal</option>
            <option value="mes">Reporte Mensual</option>
            <option value="año">Reporte Anual</option>
            <option value="custom">Rango Personalizado</option>
          </select>
          {p.rango === "custom" && (
            <>
              <input type="date" value={p.customStart} onChange={(e) => p.setCustomStart(e.target.value)} className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white" />
              <input type="date" value={p.customEnd} onChange={(e) => p.setCustomEnd(e.target.value)} className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white" />
            </>
          )}
          <button onClick={p.onExportPDF} className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-600">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button onClick={p.onExportXLSX} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-400">
            <FileSpreadsheet className="h-3.5 w-3.5" /> XLSX (BD)
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-200 sm:grid-cols-4">
        <div><span className="text-slate-400">Usuario:</span> <span className="font-medium">{p.usuario}</span></div>
        <div><span className="text-slate-400">Tipo:</span> <span className="font-medium">{RANGO_LABEL[p.rango]}</span></div>
        <div><span className="text-slate-400">Inicio:</span> <span className="font-medium">{fmtDate(p.start)}</span></div>
        <div><span className="text-slate-400">Impresión:</span> <span className="font-medium">{new Date().toLocaleString("es-MX")}</span></div>
      </div>
    </div>
  );
}

// ──────────────── ÚLTIMO ROLLO (PRIORIDAD 1) ────────────────
function UltimoRolloHero({ data }: { data: CentroProduccionPayload }) {
  const u = data.ultimoRollo;
  if (!u) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Sin datos disponibles — no hay rollos capturados
      </div>
    );
  }
  const semaforoMap = {
    verde: { color: "bg-emerald-500", text: "text-emerald-700", border: "border-emerald-500", label: "🟢 Liberado" },
    amarillo: { color: "bg-amber-500", text: "text-amber-700", border: "border-amber-500", label: "🟡 Pendiente" },
    rojo: { color: "bg-red-500", text: "text-red-700", border: "border-red-500", label: "🔴 Rechazado" },
  } as const;
  const s = semaforoMap[u.semaforo];
  const deltaKg = u.comparativo?.delta_peso_kg ?? null;
  const deltaPct = u.comparativo?.delta_peso_pct ?? null;
  return (
    <div className={`rounded-2xl border-2 ${s.border} bg-gradient-to-br from-card to-muted/30 p-6 shadow-lg`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 animate-pulse rounded-full ${s.color}`} />
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Último Rollo Capturado</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wifi className="h-3.5 w-3.5" /> {fmtHace(u.capturado_at)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Field label="N° Captura" value={formatCaptura(u.secuencia_captura)} mono />
        <Field label="N° Rollo" value={u.numero_rollo} mono />
        <Field label="Fecha / Hora" value={fmtDate(u.capturado_at)} />
        <Field label="Máquina" value={u.maquina ?? "—"} />
        <Field label="Turno" value={u.turno} />
        <Field label="Producto" value={u.producto ?? "—"} />
        <Field label="Peso (kg)" value={u.peso_kg != null ? fmtKg2(u.peso_kg) : "—"} mono />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estado</div>
          <div className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${s.text} ${s.color}/20`}>
            {s.label}
          </div>
        </div>
        <Field label="Analista" value={u.analista ?? "—"} />
        <Field label="Transcurrido" value={fmtHace(u.capturado_at)} />
      </div>
      {u.comparativo && (
        <div className="mt-5 rounded-lg border border-border bg-background/60 p-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">Comparativo vs anterior:</span>
            <span>
              Peso anterior: <strong>{u.comparativo.peso_anterior != null ? `${fmtKg2(u.comparativo.peso_anterior)} kg` : "—"}</strong>
            </span>
            <span className={`inline-flex items-center gap-1 font-bold ${deltaKg != null && deltaKg >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {deltaKg != null && deltaKg >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              Variación: {deltaKg != null ? `${deltaKg > 0 ? "+" : ""}${fmtKg2(deltaKg)} kg` : "—"}
              {deltaPct != null && ` (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`}
            </span>
            <span>Dictamen anterior: <strong>{u.comparativo.dictamen_anterior ?? "—"}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold text-foreground ${mono ? "font-mono tabular-nums" : ""}`}>{value}</div>
    </div>
  );
}

// ──────────────── KPIs ────────────────
function KpisRow({ kpis }: { kpis: CentroProduccionPayload["kpis"] }) {
  const items = [
    { icon: Factory, label: "Rollos Producidos", value: fmtKg(kpis.rollosProducidos), accent: "text-blue-600" },
    { icon: Activity, label: "Kg Producidos", value: `${fmtKg(kpis.kgProducidos)} kg`, accent: "text-indigo-600" },
    { icon: Target, label: "Producción vs Meta", value: fmtPct(kpis.cumplimientoPct), accent: "text-violet-600" },
    { icon: Gauge, label: "OEE Global", value: fmtPct(kpis.oeeGlobalPct), accent: "text-amber-600" },
    { icon: CheckCircle2, label: "Calidad Liberada", value: fmtPct(kpis.calidadLiberadaPct), accent: "text-emerald-600" },
    { icon: Clock, label: "Tiempo Muerto", value: `${kpis.tiempoMuertoMin} min`, accent: "text-orange-600" },
    { icon: TrendingUp, label: "Producción Promedio", value: `${fmtKg2(kpis.produccionPromedio.valor)} ${kpis.produccionPromedio.unidad}`, accent: "text-cyan-600" },
    { icon: Wifi, label: "Última Captura", value: fmtHace(kpis.ultimaCapturaAt), accent: "text-slate-600" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <it.icon className={`h-4 w-4 ${it.accent}`} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{it.label}</span>
          </div>
          <div className="mt-2 text-lg font-bold tabular-nums text-foreground">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// ──────────────── PRODUCCIÓN EN EL TIEMPO ────────────────
function ProduccionTiempo({ data, rango }: { data: CentroProduccionPayload; rango: Rango }) {
  const max = Math.max(1, ...data.serieTiempo.map((b) => b.kg));
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-primary" />
        <h3 className="text-sm font-semibold text-foreground">PRODUCCIÓN EN EL TIEMPO</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          {rango === "dia" ? "por hora" : rango === "año" ? "por mes" : "por día"}
        </span>
      </div>
      {data.serieTiempo.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">Sin datos disponibles</div>
      ) : (
        <div className="flex h-56 items-end gap-1">
          {data.serieTiempo.map((b) => (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="text-[9px] font-semibold tabular-nums text-muted-foreground">{b.kg > 0 ? fmtKg(b.kg) : ""}</div>
              <div className="flex w-full items-end" style={{ height: `${(b.kg / max) * 100}%`, minHeight: b.kg > 0 ? 2 : 0 }}>
                <div className="w-full rounded-t bg-primary/80 hover:bg-primary" title={`${b.label}: ${fmtKg(b.kg)} kg · ${b.rollos} rollos`} />
              </div>
              <div className="text-[9px] tabular-nums text-muted-foreground">{b.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────── ALERTAS ────────────────
function AlertasPanel({ alertas }: { alertas: CentroProduccionPayload["alertas"] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <h3 className="text-sm font-semibold text-foreground">ALERTAS AUTOMÁTICAS</h3>
        {alertas.length > 0 && (
          <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{alertas.length}</span>
        )}
      </div>
      {alertas.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Sin alertas activas</div>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {alertas.map((a) => (
            <li key={a.id} className="rounded-lg border border-border bg-muted/30 p-2 text-xs">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <div className="flex-1">
                  <div className="font-semibold text-foreground">{a.titulo}</div>
                  <div className="text-muted-foreground">{a.detalle}</div>
                </div>
                <div className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtHace(a.cuando)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ──────────────── MAPA DE MÁQUINAS ────────────────
function MapaMaquinas({ maquinas }: { maquinas: CentroProduccionPayload["maquinas"] }) {
  const estadoColor = (e: string) =>
    e === "produciendo" ? "bg-emerald-500" : e === "paro" ? "bg-red-500" : e === "preparacion" ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-primary" />
        <h3 className="text-sm font-semibold text-foreground">MAPA DE MÁQUINAS</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">orden: mayor a menor producción</span>
      </div>
      {maquinas.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Sin datos disponibles</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {maquinas.map((m) => (
            <div key={m.codigo} className="rounded-lg border border-border bg-background p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-foreground">{m.codigo}</div>
                  <div className="text-[10px] text-muted-foreground">{m.nombre}</div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${estadoColor(m.estado)}`}>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80" />
                  {m.estado}
                </span>
              </div>
              <dl className="space-y-1 text-xs">
                <Row label="Kg producidos" value={`${fmtKg(m.kg)} kg`} />
                <Row label="Rollos" value={String(m.rollos)} />
                <Row label="OEE" value={fmtPct(m.oeePct)} />
                <Row label="Calidad" value={fmtPct(m.calidadPct)} />
                <Row label="Operativo" value={`${m.tiempoOperativoMin} min`} />
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/50 py-0.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

// ──────────────── TURNOS ────────────────
function TurnosCard({ turnos }: { turnos: CentroProduccionPayload["turnos"] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-primary" />
        <h3 className="text-sm font-semibold text-foreground">ANÁLISIS DE TURNOS</h3>
      </div>
      {turnos.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Sin datos disponibles</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left">Turno</th><th className="text-right">Rollos</th><th className="text-right">Kg</th><th className="text-right">Calidad</th><th className="text-right">Eficiencia</th></tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.turno} className="border-t border-border">
                <td className="py-2 font-medium">Turno {t.turno}</td>
                <td className="py-2 text-right tabular-nums">{t.rollos}</td>
                <td className="py-2 text-right tabular-nums">{fmtKg(t.kg)}</td>
                <td className="py-2 text-right tabular-nums">{fmtPct(t.calidadPct)}</td>
                <td className="py-2 text-right tabular-nums">{fmtPct(t.eficienciaPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ──────────────── PRODUCTOS ────────────────
function ProductosCard({ productos }: { productos: CentroProduccionPayload["productos"] }) {
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-red-500", "bg-violet-500", "bg-cyan-500"];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-primary" />
        <h3 className="text-sm font-semibold text-foreground">PRODUCCIÓN POR PRODUCTO</h3>
      </div>
      {productos.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Sin datos disponibles</div>
      ) : (
        <ul className="space-y-2">
          {productos.map((p, i) => (
            <li key={p.producto} className="text-xs">
              <div className="flex justify-between">
                <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${colors[i % colors.length]}`} />{p.producto}</span>
                <span className="tabular-nums font-semibold">{fmtPct(p.participacionPct)} · {fmtKg(p.kg)} kg · {p.rollos} r</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${colors[i % colors.length]}`} style={{ width: `${Math.min(100, p.participacionPct)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ──────────────── FOMs ────────────────
function FomsCard({ foms }: { foms: CentroProduccionPayload["foms"] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-primary" />
        <h3 className="text-sm font-semibold text-foreground">FOMs (INDICADORES ESTRATÉGICOS)</h3>
      </div>
      <div className="space-y-2 text-xs">
        <FomBlock label="FOM 1 · Costo No Calidad" main={fmtMoney(foms.costoNoCalidad.total)} sub={`${fmtKg(foms.costoNoCalidad.kgNoLiberados)} kg × ${fmtMoney(foms.costoNoCalidad.costoKg)}/kg`} />
        <FomBlock label="FOM 2 · Kg Liberados" main={`${fmtKg(foms.kgLiberados.total)} kg`} sub={`${fmtPct(foms.kgLiberados.pct)} · tendencia ${foms.kgLiberados.tendenciaPct > 0 ? "+" : ""}${foms.kgLiberados.tendenciaPct}%`} positive={foms.kgLiberados.tendenciaPct >= 0} />
        <FomBlock label="FOM 3 · Kg No Liberados" main={`${fmtKg(foms.kgNoLiberados.total)} kg`} sub={`${fmtPct(foms.kgNoLiberados.pct)} · tendencia ${foms.kgNoLiberados.tendenciaPct > 0 ? "+" : ""}${foms.kgNoLiberados.tendenciaPct}%`} positive={foms.kgNoLiberados.tendenciaPct <= 0} />
        <FomBlock label="FOM 4 · OEE Global" main={fmtPct(foms.oeeGlobalPct)} sub="Disponibilidad × Rendimiento × Calidad" />
        <FomBlock label="FOM 5 · Cumplimiento de Meta" main={fmtPct(foms.cumplimientoMetaPct)} sub="Real ÷ Objetivo (meta no configurada)" />
      </div>
    </div>
  );
}

function FomBlock({ label, main, sub, positive }: { label: string; main: string; sub: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${positive === undefined ? "text-foreground" : positive ? "text-emerald-600" : "text-red-600"}`}>{main}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

// ──────────────── TABLA DETALLADA ────────────────
function TablaDetallada(p: {
  data: CentroProduccionPayload;
  tablaFiltrada: CentroProduccionPayload["tabla"];
  tablaPagina: CentroProduccionPayload["tabla"];
  pagina: number; totalPaginas: number; setPagina: (n: number) => void;
  busqueda: string; setBusqueda: (s: string) => void;
  filtroTurno: string; setFiltroTurno: (s: string) => void;
  filtroMaquina: string; setFiltroMaquina: (s: string) => void;
  filtroProducto: string; setFiltroProducto: (s: string) => void;
  filtroEstado: string; setFiltroEstado: (s: string) => void;
}) {
  const maquinasUnq = Array.from(new Set(p.data.tabla.map((r) => r.maquina).filter(Boolean) as string[])).sort();
  const productosUnq = Array.from(new Set(p.data.tabla.map((r) => r.producto).filter(Boolean) as string[])).sort();
  const turnosUnq = Array.from(new Set(p.data.tabla.map((r) => r.turno))).sort();
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <h3 className="text-sm font-semibold">TABLA DETALLADA</h3>
        <span className="text-[11px] text-muted-foreground">· {p.tablaFiltrada.length} registros</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input type="search" placeholder="Buscar…" value={p.busqueda} onChange={(e) => { p.setBusqueda(e.target.value); p.setPagina(1); }} className="rounded-md border border-input bg-background px-2 py-1 text-xs" />
          <select value={p.filtroTurno} onChange={(e) => { p.setFiltroTurno(e.target.value); p.setPagina(1); }} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
            <option value="">Todos los turnos</option>{turnosUnq.map((t) => <option key={t} value={t}>Turno {t}</option>)}
          </select>
          <select value={p.filtroMaquina} onChange={(e) => { p.setFiltroMaquina(e.target.value); p.setPagina(1); }} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
            <option value="">Todas las máquinas</option>{maquinasUnq.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={p.filtroProducto} onChange={(e) => { p.setFiltroProducto(e.target.value); p.setPagina(1); }} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
            <option value="">Todos los productos</option>{productosUnq.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={p.filtroEstado} onChange={(e) => { p.setFiltroEstado(e.target.value); p.setPagina(1); }} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
            <option value="">Todos los estados</option>
            <option value="liberado">Liberado</option>
            <option value="pendiente">Pendiente</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">N° Captura</th>
              <th className="px-3 py-2 text-left">N° Rollo</th>
              <th className="px-3 py-2 text-left">Fecha/Hora</th>
              <th className="px-3 py-2 text-left">Máquina</th>
              <th className="px-3 py-2 text-left">Turno</th>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-right">Peso (kg)</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Analista</th>
              <th className="px-3 py-2 text-left">Trazar</th>
            </tr>
          </thead>
          <tbody>
            {p.tablaPagina.length === 0 ? (
              <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Sin datos disponibles</td></tr>
            ) : p.tablaPagina.map((r) => {
              const lib = r.dictamen === "liberada" || r.estatus_liberacion === "L";
              const rech = r.dictamen === "rechazada" || r.estatus_liberacion === "NC";
              const badge = lib
                ? "bg-emerald-500/15 text-emerald-700"
                : rech ? "bg-red-500/15 text-red-700" : "bg-amber-500/15 text-amber-700";
              const txt = lib ? "Liberado" : rech ? "Rechazado" : "Pendiente";
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono tabular-nums">{formatCaptura(r.secuencia_captura)}</td>
                  <td className="px-3 py-2 font-mono">{r.numero_rollo}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtDate(r.capturado_at)}</td>
                  <td className="px-3 py-2">{r.maquina ?? "—"}</td>
                  <td className="px-3 py-2">{r.turno}</td>
                  <td className="px-3 py-2">{r.producto ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.peso_kg != null ? fmtKg2(r.peso_kg) : "—"}</td>
                  <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>{txt}</span></td>
                  <td className="px-3 py-2">{r.analista ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link to="/muestra/$id" params={{ id: r.id }} className="text-primary hover:underline">Ver</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {p.totalPaginas > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
          <span className="text-muted-foreground">Página {p.pagina} de {p.totalPaginas}</span>
          <div className="flex gap-2">
            <button onClick={() => p.setPagina(Math.max(1, p.pagina - 1))} disabled={p.pagina === 1} className="rounded-md border border-input bg-background px-3 py-1 disabled:opacity-50">Anterior</button>
            <button onClick={() => p.setPagina(Math.min(p.totalPaginas, p.pagina + 1))} disabled={p.pagina === p.totalPaginas} className="rounded-md border border-input bg-background px-3 py-1 disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}
