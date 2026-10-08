// =====================================================================
// Edición de bobina madre — menú para Jefe de Calidad.
// Permite localizar bobinas capturadas en Control de Calidad / Captura
// fuera de turno, corregir sus valores (ventana de 24 h, motivo
// obligatorio, trazabilidad completa) e imprimir la etiqueta actualizada.
// =====================================================================
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Printer, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetalleCalidadModal } from "@/components/qc/DetalleCalidadModal";
import {
  buscarBobinasEditables,
  getEtiquetaBobina,
  puedeUsarEdicionBobina,
  type BobinaEditable,
} from "@/lib/edicion-bobina.functions";
import { printEtiquetaLiberacion } from "@/lib/etiqueta-liberacion";
import { fechaHoraMX } from "@/lib/format";

export const Route = createFileRoute("/calidad/edicion-bobina")({
  component: EdicionBobinaPage,
});

function EdicionBobinaPage() {
  const permisoFn = useServerFn(puedeUsarEdicionBobina);
  const buscarFn = useServerFn(buscarBobinasEditables);
  const etiquetaFn = useServerFn(getEtiquetaBobina);

  const { data: permiso, isLoading: cargandoPermiso } = useQuery({
    queryKey: ["permiso-edicion-bobina"],
    queryFn: () => permisoFn(),
    staleTime: 60_000,
  });

  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState("");
  const [maquina, setMaquina] = useState("");
  const [resultados, setResultados] = useState<BobinaEditable[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ id: string; folio: string } | null>(null);

  const buscar = async () => {
    setBuscando(true);
    try {
      const res = await buscarFn({
        data: {
          ...(folio.trim() ? { folio: folio.trim() } : {}),
          ...(fecha ? { fecha } : {}),
          ...(maquina ? { maquina } : {}),
        },
      });
      setResultados(res);
      if (res.length === 0) toast.info("Sin bobinas que coincidan con los filtros.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  const imprimir = async (b: BobinaEditable) => {
    setImprimiendo(b.muestra_id);
    try {
      const data = await etiquetaFn({ data: { muestra_id: b.muestra_id } });
      await printEtiquetaLiberacion(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImprimiendo(null);
    }
  };

  if (cargandoPermiso) {
    return (
      <AppLayout title="Edición de bobina madre">
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verificando permisos…
        </div>
      </AppLayout>
    );
  }

  if (!permiso?.puede) {
    return (
      <AppLayout title="Edición de bobina madre">
        <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>Acceso restringido.</strong> Este módulo es exclusivo del
            Jefe de Calidad autorizado por máquina. Si necesitas corregir una
            bobina, solicita la autorización al administrador.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Edición de bobina madre">
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">
            Buscar bobina capturada
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Folio / N.º de rollo
              </label>
              <Input
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                placeholder="Ej. 12671-4"
                className="mt-1 w-44"
                onKeyDown={(e) => e.key === "Enter" && buscar()}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Día operativo
              </label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
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
                {permiso.maquinas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={buscar} disabled={buscando}>
              {buscando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Buscar
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Solo se muestran bobinas de tus máquinas autorizadas (
            {permiso.maquinas.join(", ")}). La edición está disponible durante
            las 24 horas posteriores a la captura; la impresión de etiqueta no
            modifica datos.
          </p>
        </div>

        {resultados !== null && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">N.º Rollo</th>
                  <th className="px-3 py-2">Máquina</th>
                  <th className="px-3 py-2">Planta</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Capturado</th>
                  <th className="px-3 py-2">Turno</th>
                  <th className="px-3 py-2">Estatus</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {resultados.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Sin registros para los filtros seleccionados.
                    </td>
                  </tr>
                )}
                {resultados.map((b) => (
                  <tr key={b.muestra_id} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      {b.numero_rollo}
                    </td>
                    <td className="px-3 py-2">{b.maquina}</td>
                    <td className="px-3 py-2">{b.planta}</td>
                    <td className="px-3 py-2">{b.producto}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {fechaHoraMX(b.capturado_at)}
                    </td>
                    <td className="px-3 py-2">{b.turno}</td>
                    <td className="px-3 py-2">{b.estatus}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!b.dentro_ventana}
                          title={
                            b.dentro_ventana
                              ? `Editable hasta ${fechaHoraMX(b.expira_at)}`
                              : "La ventana de edición de 24 h ya venció"
                          }
                          onClick={() =>
                            setDetalle({ id: b.muestra_id, folio: b.numero_rollo })
                          }
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={imprimiendo === b.muestra_id}
                          onClick={() => imprimir(b)}
                        >
                          {imprimiendo === b.muestra_id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Printer className="mr-1 h-3.5 w-3.5" />
                          )}
                          Imprimir etiqueta
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DetalleCalidadModal
        muestraId={detalle?.id ?? null}
        folio={detalle?.folio ?? null}
        open={detalle !== null}
        onOpenChange={(v) => {
          if (!v) {
            setDetalle(null);
            // Recargar la lista para reflejar los cambios guardados.
            if (resultados !== null) void buscar();
          }
        }}
      />
    </AppLayout>
  );
}
