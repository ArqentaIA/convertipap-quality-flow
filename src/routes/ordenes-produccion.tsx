import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Upload, Search, X, CheckCircle2, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import {
  listOrdenesActivas,
  importarOrdenes,
  cerrarOrden,
  type ImportSummary,
  type ImportRow,
  type OrdenProduccion,
} from "@/lib/ordenes-produccion.functions";
import { fechaCortoMX, horaMX } from "@/lib/format";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/ordenes-produccion")({
  head: () => ({
    meta: [
      { title: "Órdenes de Producción · Convertipap" },
      { name: "description", content: "Importación y control de órdenes de producción (SAP)" },
      { property: "og:title", content: "Órdenes de Producción · Convertipap" },
      { property: "og:description", content: "Importación y control de órdenes de producción" },
    ],
  }),
  component: OrdenesProduccionPage,
});

const PAGE_SIZE = 15;

function OrdenesProduccionPage() {
  return (
    <AppLayout title="Órdenes de Producción">
      <OrdenesProduccionContent />
    </AppLayout>
  );
}

function OrdenesProduccionContent() {
  const auth = useAuth();
  const puedeEditar = auth.canEdit("ordenes_produccion");
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [ultimoResumen, setUltimoResumen] = useState<ImportSummary | null>(null);
  const [procesando, setProcesando] = useState(false);

  const listar = useServerFn(listOrdenesActivas);
  const importar = useServerFn(importarOrdenes);
  const cerrar = useServerFn(cerrarOrden);

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ["ordenes_produccion", "activas"],
    queryFn: () => listar(),
  });

  const importMutation = useMutation({
    mutationFn: (payload: { rows: ImportRow[]; archivo_origen: string }) =>
      importar({ data: payload }),
    onSuccess: (resumen) => {
      setUltimoResumen(resumen);
      qc.invalidateQueries({ queryKey: ["ordenes_produccion"] });
      toast.success(`Importación completa: ${resumen.insertadas} nueva(s), ${resumen.duplicadas.length} duplicada(s)`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cerrarMutation = useMutation({
    mutationFn: (id: string) => cerrar({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ordenes_produccion"] });
      toast.success("Orden cerrada correctamente");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ordenes;
    return ordenes.filter((o) => o.numero_orden.toLowerCase().includes(q));
  }, [ordenes, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error("Solo se acepta formato .xlsx");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setProcesando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("El archivo no tiene hojas de cálculo");

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        header: 1,
        raw: true,
        defval: null,
      }) as unknown as unknown[][];

      if (raw.length === 0) throw new Error("El archivo está vacío");

      // Detectar encabezado. Esperamos "Orden" en A y "Cantidad" en C.
      const header = raw[0].map((c) => String(c ?? "").trim().toLowerCase());
      const tieneEncabezado =
        header[0] === "orden" || header[0]?.includes("orden");
      if (tieneEncabezado) {
        const colA = header[0] ?? "";
        const colC = header[2] ?? "";
        if (!colA.includes("orden")) {
          throw new Error(`Columna A debe ser "Orden" (encontrado: "${raw[0][0]}")`);
        }
        if (!colC.includes("cantidad") && !colC.includes("peso")) {
          throw new Error(`Columna C debe ser "Cantidad" o "Peso" (encontrado: "${raw[0][2]}")`);
        }
      }

      const dataRows = tieneEncabezado ? raw.slice(1) : raw;
      const rows: ImportRow[] = [];
      const parseErrores: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const fila = dataRows[i] ?? [];
        const a = fila[0];
        const c = fila[2];
        if (a == null || String(a).trim() === "") continue; // fila vacía

        const numero = String(a).trim();
        const pesoNum = typeof c === "number" ? c : Number(String(c ?? "").replace(/[^0-9.\-]/g, ""));
        if (!Number.isFinite(pesoNum)) {
          parseErrores.push(`Fila ${i + (tieneEncabezado ? 2 : 1)}: peso no numérico`);
          continue;
        }
        if (pesoNum < 0) {
          parseErrores.push(`Fila ${i + (tieneEncabezado ? 2 : 1)}: peso negativo`);
          continue;
        }
        rows.push({ numero_orden: numero, peso_registrado: pesoNum });
      }

      if (rows.length === 0) {
        toast.error("No se encontraron filas válidas para importar");
        return;
      }
      if (parseErrores.length > 0) {
        toast.warning(`${parseErrores.length} fila(s) con error de formato — se omitieron`);
      }

      await importMutation.mutateAsync({ rows, archivo_origen: file.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al procesar el archivo");
    } finally {
      setProcesando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      {/* Recuadro de carga */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Importar órdenes desde SAP
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Archivo <strong>.xlsx</strong>. Se leen: <strong>Columna A</strong> (número de orden) y{" "}
              <strong>Columna C</strong> (peso registrado en kg). Las órdenes duplicadas se omiten automáticamente.
            </p>
          </div>
          {puedeEditar ? (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={procesando || importMutation.isPending}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {procesando || importMutation.isPending ? "Procesando…" : "Seleccionar archivo"}
            </button>
          ) : (
            <span className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Solo lectura
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => void onFileSelected(e)}
          />
        </div>

        {ultimoResumen && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Resumen de la última importación</h3>
              <button
                onClick={() => setUltimoResumen(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ResumenBox label="Total procesadas" valor={ultimoResumen.total} />
              <ResumenBox
                label="Registradas"
                valor={ultimoResumen.insertadas}
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />}
              />
              <ResumenBox
                label="Duplicadas"
                valor={ultimoResumen.duplicadas.length}
                icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />}
              />
              <ResumenBox
                label="Con error"
                valor={ultimoResumen.errores.length}
                icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              <div><strong>Archivo:</strong> {ultimoResumen.archivo}</div>
              <div>
                <strong>Fecha:</strong> {fechaCortoMX(ultimoResumen.fecha)} {horaMX(ultimoResumen.fecha)}
              </div>
            </div>
            {ultimoResumen.duplicadas.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  Ver órdenes duplicadas ({ultimoResumen.duplicadas.length})
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md bg-background p-2 text-xs">
                  {ultimoResumen.duplicadas.map((n) => (
                    <div key={n} className="py-0.5">
                      La orden de producción <strong>{n}</strong> ya está registrada y no fue importada nuevamente.
                    </div>
                  ))}
                </div>
              </details>
            )}
            {ultimoResumen.errores.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-destructive">
                  Ver errores ({ultimoResumen.errores.length})
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md bg-background p-2 text-xs">
                  {ultimoResumen.errores.map((e, i) => (
                    <div key={i} className="py-0.5">
                      <strong>{e.numero_orden}:</strong> {e.motivo}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>

      {/* Tabla de órdenes activas */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Órdenes de Producción Activas</h2>
            <p className="text-xs text-muted-foreground">
              {filtradas.length} orden(es){busqueda ? ` — filtro: "${busqueda}"` : ""}
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por número de orden…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPagina(1);
              }}
              className="w-72 rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Orden de Producción</th>
                <th className="px-4 py-3 text-right">Peso registrado</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Hora</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Archivo</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No hay órdenes activas.
                  </td>
                </tr>
              ) : (
                visibles.map((o) => (
                  <FilaOrden
                    key={o.id}
                    orden={o}
                    puedeCerrar={puedeEditar}
                    cerrando={cerrarMutation.isPending && cerrarMutation.variables === o.id}
                    onCerrar={() => {
                      if (
                        window.confirm(
                          `¿Confirmas que deseas cerrar la orden de producción ${o.numero_orden}? Después del cierre dejará de aparecer entre las órdenes activas.`,
                        )
                      ) {
                        cerrarMutation.mutate(o.id);
                      }
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between border-t border-border p-3 text-sm">
            <span className="text-muted-foreground">
              Página {paginaActual} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="rounded-md border border-input px-3 py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="rounded-md border border-input px-3 py-1 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ResumenBox({
  label,
  valor,
  icon,
}: {
  label: string;
  valor: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground">{valor}</div>
    </div>
  );
}

function FilaOrden({
  orden,
  puedeCerrar,
  cerrando,
  onCerrar,
}: {
  orden: OrdenProduccion;
  puedeCerrar: boolean;
  cerrando: boolean;
  onCerrar: () => void;
}) {
  const pesoFmt = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(orden.peso_registrado);

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 font-medium text-foreground">{orden.numero_orden}</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">
        {pesoFmt} <span className="text-xs text-muted-foreground">kg</span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{fechaCortoMX(orden.fecha_registro)}</td>
      <td className="px-4 py-3 text-muted-foreground">{horaMX(orden.fecha_registro)}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
          Activa
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[220px]" title={orden.archivo_origen ?? ""}>
        {orden.archivo_origen ?? "—"}
      </td>
      <td className="px-4 py-3 text-right">
        {puedeCerrar ? (
          <button
            onClick={onCerrar}
            disabled={cerrando}
            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            {cerrando ? "Cerrando…" : "Cerrar orden"}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}
