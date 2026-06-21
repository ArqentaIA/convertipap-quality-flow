import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Download, ArrowLeft, Lock, CircleDashed, ClipboardCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLabFilter, LAB_LABEL } from "@/lib/lab";
import { listMaquinasConEstado, listRollosMaquina } from "@/lib/produccion.functions";
import { formatCaptura } from "@/lib/format";
import { DetalleCalidadModal } from "@/components/qc/DetalleCalidadModal";
import { BuscadorRollo } from "@/components/qc/BuscadorRollo";

type Rango = "dia" | "semana" | "mes" | "año";
const RANGO_LABEL: Record<Rango, string> = { dia: "Día", semana: "Semana", mes: "Mes", año: "Año" };

export const Route = createFileRoute("/historial/$maquina")({
  component: HistorialPage,
  errorComponent: ({ error }) => (
    <AppLayout title="Historial">
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Error cargando historial: {error.message}
      </div>
    </AppLayout>
  ),
});

function HistorialPage() {
  const { maquina: maquinaCodigo } = Route.useParams();
  const [q, setQ] = useState("");
  const [rango, setRango] = useState<Rango>("dia");
  const [detalle, setDetalle] = useState<{ muestraId: string; folio: string } | null>(null);
  const labFilter = useLabFilter();

  const listMaquinasFn = useServerFn(listMaquinasConEstado);
  const { data: maquinas } = useSuspenseQuery({
    queryKey: ["produccion", "maquinas"],
    queryFn: () => listMaquinasFn({ data: undefined as never }),
  });
  const maquina = maquinas.find((m) => m.codigo.toUpperCase() === maquinaCodigo.toUpperCase());

  const listRollosFn = useServerFn(listRollosMaquina);
  const { data: rollos = [], isFetching } = useQuery({
    queryKey: ["produccion", "rollos", maquina?.id ?? "none", rango],
    queryFn: () =>
      maquina ? listRollosFn({ data: { maquina_id: maquina.id, rango } }) : Promise.resolve([]),
    enabled: !!maquina,
    refetchInterval: 60_000,
  });

  if (!labFilter.isMachineAllowed(maquinaCodigo)) {
    return (
      <AppLayout title={`Historial · ${maquinaCodigo.toUpperCase()}`}>
        <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Sin acceso a esta máquina</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu laboratorio asignado{labFilter.lab ? ` (${LAB_LABEL[labFilter.lab]})` : ""} no opera{" "}
            <strong>{maquinaCodigo.toUpperCase()}</strong>.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (!maquina) {
    return (
      <AppLayout title={`Historial · ${maquinaCodigo.toUpperCase()}`}>
        <div className="mx-auto mt-16 max-w-md rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <CircleDashed className="mx-auto mb-3 h-8 w-8 opacity-50" />
          La máquina <strong>{maquinaCodigo.toUpperCase()}</strong> no existe en el catálogo.
        </div>
      </AppLayout>
    );
  }

  const filtered = useMemo(
    () =>
      rollos.filter((r) =>
        [r.rollo, r.folioOrden, r.producto, r.operador, r.turno]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [rollos, q],
  );

  const total = filtered.length;
  const ok = filtered.filter((r) => r.estatus === "L").length;
  const nc = filtered.filter((r) => r.estatus === "NC").length;
  const kgTotal = filtered.reduce((s, r) => s + (r.pesoKg ?? 0), 0);
  const cumpProm = filtered.length
    ? (
        filtered.reduce((s, r) => s + (r.cumplimiento ?? 0), 0) /
        Math.max(filtered.filter((r) => r.cumplimiento != null).length, 1)
      ).toFixed(1)
    : "—";

  const exportXlsx = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "ConvertiPap QMS";
    wb.created = new Date();
    const ws = wb.addWorksheet(`Historial ${maquina.codigo}`, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.columns = [
      { header: "N° Captura", key: "captura", width: 12 },
      { header: "Rollo", key: "rollo", width: 12 },
      { header: "Orden", key: "orden", width: 22 },
      { header: "Fecha / Hora", key: "fecha", width: 20 },
      { header: "Turno", key: "turno", width: 8 },
      { header: "Producto", key: "producto", width: 28 },
      { header: "Operador", key: "operador", width: 18 },
      { header: "Peso (kg)", key: "peso", width: 12 },
      { header: "Cumpl. %", key: "cumpl", width: 10 },
      { header: "Estatus", key: "estatus", width: 14 },
      { header: "Observaciones", key: "obs", width: 60 },
    ];
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.alignment = { vertical: "middle", horizontal: "center" };
    header.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2A57" } };
      c.border = { bottom: { style: "thin", color: { argb: "FF0F2A57" } } };
    });
    header.height = 22;

    filtered.forEach((r) => {
      const obsParts: string[] = [];
      if (r.observacionesGenerales?.trim()) obsParts.push(r.observacionesGenerales.trim());
      if (r.liberacionJustificacion?.trim())
        obsParts.push(`Justificación: ${r.liberacionJustificacion.trim()}`);
      if (r.defectos && r.defectos.length > 0)
        obsParts.push(`Defectos: ${r.defectos.join(", ")}`);
      ws.addRow({
        captura: formatCaptura(r.secuenciaCaptura),
        rollo: r.rollo,
        orden: r.folioOrden,
        fecha: new Date(r.capturadoAt).toLocaleString("es-MX"),
        turno: r.turno,
        producto: r.producto,
        operador: r.operador,
        peso: r.pesoKg ?? null,
        cumpl: r.cumplimiento ?? null,
        estatus: r.estatus === "L" ? "Liberado" : r.estatus === "NC" ? "No conforme" : "Pendiente",
        obs: obsParts.join(" | "),
      });
    });

    ws.getColumn("obs").alignment = { wrapText: true, vertical: "top" };
    ws.getColumn("peso").numFmt = "#,##0.0";
    ws.getColumn("cumpl").numFmt = "0.0";

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial_${maquina.codigo}_${rango}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title={`Historial · ${maquina.codigo}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/produccion"
            className="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-all hover:border-primary/60"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Volver a Producción
          </Link>
          <div className="flex items-center gap-3">
            <BuscadorRollo />
            <RangoTabs rango={rango} setRango={setRango} />
            <span className="text-xs text-muted-foreground">
              60s {isFetching && <span className="animate-pulse">●</span>}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label={`Rollos (${RANGO_LABEL[rango]})`} value={String(total)} hint="capturados" />
          <StatCard label="OK" value={String(ok)} hint="liberados" tone="success" />
          <StatCard label="No conformes" value={String(nc)} hint="rechazados / fuera" tone="danger" />
          <StatCard label="Cumpl. prom." value={`${cumpProm}${cumpProm === "—" ? "" : "%"}`} hint={`${kgTotal.toFixed(0)} kg total`} tone="primary" />
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar rollo, orden, producto, operador…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={exportXlsx}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Exportar XLSX
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">N° Captura</th>
                  <th className="px-4 py-3">Rollo</th>
                  <th className="px-4 py-3">Orden</th>
                  <th className="px-4 py-3">Fecha / Hora</th>
                  <th className="px-4 py-3">Turno</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Operador</th>
                  <th className="px-4 py-3 text-right">Peso (kg)</th>
                  <th className="px-4 py-3 text-right">Cumpl.</th>
                  <th className="px-4 py-3">Estatus</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Sin rollos capturados para {maquina.codigo} en el rango "{RANGO_LABEL[rango]}".
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const tone =
                    r.estatus === "NC"
                      ? "bg-destructive/15 text-destructive border-destructive/40"
                      : r.estatus === "L"
                      ? "bg-success/15 text-success border-success/40"
                      : "bg-muted text-muted-foreground border-border";
                  return (
                    <tr key={r.muestraId} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 tabular-nums font-mono text-xs text-muted-foreground">{formatCaptura(r.secuenciaCaptura)}</td>
                      <td className="px-4 py-3 font-semibold text-primary">{r.rollo}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.folioOrden}</td>
                      <td className="px-4 py-3 tabular-nums text-xs">
                        {new Date(r.capturadoAt).toLocaleString("es-MX")}
                      </td>
                      <td className="px-4 py-3">{r.turno}</td>
                      <td className="px-4 py-3">{r.producto}</td>
                      <td className="px-4 py-3">{r.operador}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.pesoKg == null ? "—" : r.pesoKg.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {r.cumplimiento == null ? "—" : `${r.cumplimiento.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
                          {r.estatus === "L" ? "Liberado" : r.estatus === "NC" ? "No conforme" : "Pendiente"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDetalle({ muestraId: r.muestraId, folio: `${r.folioOrden} · Rollo ${r.rollo}` })}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                          title="Ver detalle completo de calidad"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" /> Detalle calidad
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <div>Mostrando {filtered.length} de {rollos.length} rollos · rango {RANGO_LABEL[rango]}</div>
          </div>
        </div>
      </div>

      <DetalleCalidadModal
        muestraId={detalle?.muestraId ?? null}
        folio={detalle?.folio ?? null}
        open={!!detalle}
        onOpenChange={(v) => !v && setDetalle(null)}
      />
    </AppLayout>
  );
}

function RangoTabs({ rango, setRango }: { rango: Rango; setRango: (r: Rango) => void }) {
  const opts: Rango[] = ["dia", "semana", "mes", "año"];
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-1 shadow-sm">
      {opts.map((r) => (
        <button
          key={r}
          onClick={() => setRango(r)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            rango === r ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {RANGO_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

function StatCard({
  label, value, hint, tone = "default",
}: { label: string; value: string; hint: string; tone?: "default" | "primary" | "success" | "danger" }) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    danger: "text-destructive",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
