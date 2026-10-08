// =====================================================================
// REPORTE DE BOBINAS EDITADAS — sección dentro de Reportes.
// Filtra por fecha/hora de edición (día/mes operativo 07:00→07:00),
// muestra resumen + tabla de eventos y exporta XLSX (Resumen/Detalle).
// =====================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, FileDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getReporteBobinasEditadas,
  type ReporteBobinasEditadas,
} from "@/lib/reporte-bobinas-editadas.functions";
import { exportReporteBobinasEditadas } from "@/lib/reporte-bobinas-editadas-export";
import { puedeUsarEdicionBobina } from "@/lib/edicion-bobina.functions";

export function ReporteBobinasEditadasSection() {
  const permisoFn = useServerFn(puedeUsarEdicionBobina);
  const reporteFn = useServerFn(getReporteBobinasEditadas);

  const { data: permiso } = useQuery({
    queryKey: ["permiso-edicion-bobina"],
    queryFn: () => permisoFn(),
    staleTime: 60_000,
  });

  const [mode, setMode] = useState<"dia" | "mes">("dia");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [maquina, setMaquina] = useState("");
  const [usuario, setUsuario] = useState("");
  const [folio, setFolio] = useState("");
  const [reporte, setReporte] = useState<ReporteBobinasEditadas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  if (permiso && !permiso.puede) return null;

  const consultar = async () => {
    setCargando(true);
    try {
      const res = await reporteFn({
        data: {
          mode,
          fecha,
          ...(maquina ? { maquina } : {}),
          ...(usuario.trim() ? { usuario: usuario.trim() } : {}),
          ...(folio.trim() ? { folio: folio.trim() } : {}),
        },
      });
      setReporte(res);
      if (res.eventos.length === 0)
        toast.info("Sin ediciones en el periodo seleccionado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(false);
    }
  };

  const exportar = async () => {
    if (!reporte) return;
    setExportando(true);
    try {
      await exportReporteBobinasEditadas(reporte);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          REPORTE DE BOBINAS EDITADAS
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Correcciones de bobina madre por fecha de edición. Día operativo de
          07:00 a 07:00 del día siguiente (cierre T3); mes operativo del 1 a las
          07:00 al 1 del mes siguiente.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Periodo
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "dia" | "mes")}
            className="mt-1 h-9 w-32 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="dia">Por día</option>
            <option value="mes">Por mes</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {mode === "dia" ? "Fecha" : "Mes"}
          </label>
          <Input
            type={mode === "dia" ? "date" : "month"}
            value={mode === "dia" ? fecha : fecha.slice(0, 7)}
            onChange={(e) =>
              setFecha(mode === "dia" ? e.target.value : `${e.target.value}-01`)
            }
            className="mt-1 w-40"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Máquina
          </label>
          <select
            value={maquina}
            onChange={(e) => setMaquina(e.target.value)}
            className="mt-1 h-9 w-32 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Todas</option>
            {(permiso?.maquinas ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Usuario
          </label>
          <Input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="correo"
            className="mt-1 w-44"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Folio
          </label>
          <Input
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            placeholder="N.º rollo"
            className="mt-1 w-32"
          />
        </div>
        <Button onClick={consultar} disabled={cargando}>
          {cargando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Consultar
        </Button>
        <Button
          variant="outline"
          onClick={exportar}
          disabled={!reporte || exportando}
        >
          {exportando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" />
          )}
          XLSX
        </Button>
      </div>

      {reporte && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
            <span>
              Periodo: <strong>{reporte.inicioMX}</strong> →{" "}
              <strong>{reporte.finMX}</strong> ({reporte.zonaHoraria})
            </span>
            {reporte.enCurso && (
              <span className="font-semibold text-amber-600">
                Periodo en curso (cierre T3 pendiente)
              </span>
            )}
            <span>
              Bobinas editadas: <strong>{reporte.resumen.bobinasDistintas}</strong>
            </span>
            <span>
              Eventos de edición: <strong>{reporte.resumen.eventos}</strong>
            </span>
            {reporte.resumen.porMaquina.map((p) => (
              <span key={p.maquina}>
                {p.maquina}: <strong>{p.bobinas}</strong> bobina(s),{" "}
                <strong>{p.eventos}</strong> evento(s)
              </span>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Fecha/Hora edición</th>
                  <th className="px-3 py-2">Día operativo</th>
                  <th className="px-3 py-2">N.º Rollo</th>
                  <th className="px-3 py-2">Planta</th>
                  <th className="px-3 py-2">Máquina</th>
                  <th className="px-3 py-2">Producción</th>
                  <th className="px-3 py-2">Usuario</th>
                  <th className="px-3 py-2">Campos</th>
                </tr>
              </thead>
              <tbody>
                {reporte.eventos.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Sin registros en el periodo seleccionado.
                    </td>
                  </tr>
                )}
                {reporte.eventos.map((e) => (
                  <>
                    <tr
                      key={e.eventoId}
                      className="cursor-pointer border-t border-border hover:bg-muted/20"
                      onClick={() =>
                        setExpandido(expandido === e.eventoId ? null : e.eventoId)
                      }
                    >
                      <td className="px-3 py-2">
                        {expandido === e.eventoId ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{e.editadoMX}</td>
                      <td className="px-3 py-2 tabular-nums">{e.diaOperativo}</td>
                      <td className="px-3 py-2 font-semibold tabular-nums">
                        {e.folio}
                      </td>
                      <td className="px-3 py-2">{e.planta}</td>
                      <td className="px-3 py-2">{e.maquina}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {e.fechaProduccion} · {e.turnoProduccion}
                      </td>
                      <td className="px-3 py-2 text-xs">{e.usuario}</td>
                      <td className="px-3 py-2">{e.campos.length}</td>
                    </tr>
                    {expandido === e.eventoId && (
                      <tr key={`${e.eventoId}-det`} className="border-t border-border bg-muted/10">
                        <td colSpan={9} className="px-6 py-3">
                          <div className="mb-2 text-xs">
                            <span className="text-muted-foreground">Motivo: </span>
                            {e.motivo}
                          </div>
                          <table className="w-full text-xs">
                            <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                              <tr>
                                <th className="py-1 pr-4">Campo</th>
                                <th className="py-1 pr-4">Valor anterior</th>
                                <th className="py-1">Valor nuevo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.campos.map((c, i) => (
                                <tr key={i} className="border-t border-border/50">
                                  <td className="py-1 pr-4 font-medium">{c.campo}</td>
                                  <td className="py-1 pr-4 text-muted-foreground">
                                    {c.valorAnterior}
                                  </td>
                                  <td className="py-1 font-semibold">
                                    {c.valorNuevo}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
