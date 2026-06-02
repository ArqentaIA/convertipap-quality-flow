import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, Factory, Calendar, Package, Hash } from "lucide-react";
import logoUrl from "@/assets/logo-convertipap.png";
import { getMuestraTrace, type TraceMuestra } from "@/lib/trace.functions";

const traceQO = (id: string) =>
  queryOptions({
    queryKey: ["trace", id],
    queryFn: () => getMuestraTrace({ data: { id } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/muestra/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(traceQO(params.id)),
  component: MuestraTracePage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-600 mb-3" />
        <h1 className="text-lg font-semibold">No se pudo cargar la muestra</h1>
        <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => <NotFound />,
});

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-600 mb-3" />
        <h1 className="text-lg font-semibold">Muestra no encontrada</h1>
        <p className="text-sm text-muted-foreground mt-2">El código QR no corresponde a una muestra registrada.</p>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString("es-MX"); } catch { return iso; }
}

function estadoColor(estado: string): string {
  if (estado === "conforme") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (estado === "no_conforme" || estado === "fuera_rango_critico") return "bg-rose-100 text-rose-800 border-rose-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function MuestraTracePage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(traceQO(id));
  const trace = data as TraceMuestra;

  if (!trace.found) return <NotFound />;

  const conformes = trace.mediciones.filter((m) => m.estado === "conforme").length;
  const total = trace.mediciones.length;
  const liberada = trace.dictamen === "liberada" || (trace.estado === "liberada");
  const noConforme = trace.dictamen === "rechazada" || trace.mediciones.some((m) => m.estado !== "conforme");

  const estatusLabel = liberada ? "CONFORME" : noConforme ? "NO CONFORME" : "EN REVISIÓN";
  const estatusClass = liberada
    ? "bg-emerald-600 text-white"
    : noConforme
    ? "bg-rose-600 text-white"
    : "bg-amber-500 text-white";

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Header */}
        <div className="bg-card border-2 border-foreground rounded-lg overflow-hidden shadow-sm">
          <div className="grid grid-cols-[auto_1fr] items-center gap-4 p-4 border-b border-foreground">
            <img src={logoUrl} alt="Convertipap" className="h-12 w-auto object-contain" />
            <div className="text-center">
              <div className="text-[11px] font-semibold tracking-wide">CONVERTIDOR DE PAPEL S.A. DE C.V</div>
              <div className="text-base font-extrabold tracking-widest">TRAZABILIDAD DE ROLLO</div>
              <div className="text-[10px] text-muted-foreground">FOR-CAL-04 · Verificación por QR</div>
            </div>
          </div>

          {/* Status banner */}
          <div className={`flex items-center justify-center gap-2 py-3 font-extrabold tracking-widest text-lg ${estatusClass}`}>
            {liberada ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            <span>{estatusLabel}</span>
          </div>

          {/* Identity */}
          <div className="grid grid-cols-2 divide-x divide-border border-t border-border text-sm">
            <div className="p-3 space-y-1">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1"><Package className="h-3 w-3" /> Producto</div>
              <div className="font-semibold">{trace.producto.nombre}</div>
              <div className="text-xs text-muted-foreground">{trace.producto.codigo}</div>
            </div>
            <div className="p-3 space-y-1">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1"><Hash className="h-3 w-3" /> No. Rollo</div>
              <div className="font-bold text-lg tabular-nums">{trace.numero_rollo ?? "—"}</div>
              <div className="text-xs text-muted-foreground">Folio {trace.folio}</div>
            </div>
            <div className="p-3 space-y-1 border-t border-border">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1"><Factory className="h-3 w-3" /> Máquina</div>
              <div className="font-medium">{trace.maquina.codigo} · {trace.maquina.nombre}</div>
              <div className="text-xs text-muted-foreground">Planta {trace.planta.nombre}</div>
            </div>
            <div className="p-3 space-y-1 border-t border-border">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1"><Calendar className="h-3 w-3" /> Captura</div>
              <div className="font-medium">{fmtDate(trace.capturado_at)}</div>
              <div className="text-xs text-muted-foreground">Turno {trace.turno || "—"}</div>
            </div>
          </div>
        </div>

        {/* Mediciones */}
        <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm">Mediciones de calidad</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{conformes}/{total} conformes</span>
          </div>
          {trace.mediciones.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sin mediciones registradas.</div>
          ) : (
            <div className="divide-y divide-border">
              {trace.mediciones.map((m) => (
                <div key={m.clave} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-sm">
                  <div>
                    <div className="font-medium">{m.etiqueta}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {m.min} – {m.max} {m.unidad}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold tabular-nums">{m.valor}{m.unidad && <span className="text-xs font-normal text-muted-foreground ml-1">{m.unidad}</span>}</div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${estadoColor(m.estado)}`}>
                    {m.estado === "conforme" ? "OK" : m.estado === "no_conforme" ? "Fuera" : m.estado === "fuera_rango_critico" ? "Crítico" : "Pend."}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {trace.observaciones_generales && (
          <div className="bg-card border border-border rounded-lg p-4 text-sm">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">Observaciones</div>
            <div className="whitespace-pre-wrap">{trace.observaciones_generales}</div>
          </div>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          Verificado contra Convertipap · FOR-CAL-04
        </p>
      </div>
    </div>
  );
}
