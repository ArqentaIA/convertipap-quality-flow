import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import logoUrl from "@/assets/logo-convertipap.png";
import sapLogo from "@/assets/sap-hana-logo.jpg.asset.json";
import { getMuestraTrace, type TraceMuestra } from "@/lib/trace.functions";
import { auditAction } from "@/lib/audit";

const traceQO = (id: string) =>
  queryOptions({
    queryKey: ["trace", id],
    queryFn: () => getMuestraTrace({ data: { id } }),
    staleTime: 60_000,
  });

const PAGE_TITLE = "Trazabilidad de Rollo | Convertipap";
const PAGE_DESC = "Verificación pública de rollo por código QR.";

export const Route = createFileRoute("/muestra/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    peso: typeof search.peso === "string" ? search.peso : undefined,
    vista: search.vista === "sap" ? ("sap" as const) : undefined,
    rollo: typeof search.rollo === "string" ? search.rollo : undefined,
    estatus: typeof search.estatus === "string" ? search.estatus : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(traceQO(params.id)),
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MuestraTracePage,
  pendingComponent: LoadingCard,
  errorComponent: NotFoundCard,
  notFoundComponent: NotFoundCard,
});

const CANONICAL_HOST = "www.convertipap.site";

type StatusKind = "liberado" | "no_conforme";

function normalizeStatus(t: Extract<TraceMuestra, { found: true }>): StatusKind {
  const est = (t.estatus_liberacion ?? "").toString().trim().toUpperCase();
  const dict = (t.dictamen ?? "").toString().trim().toLowerCase();
  const estado = (t.estado ?? "").toString().trim().toLowerCase();
  const justificada = t.liberado_con_justificacion === true;

  if (est === "NC" || dict === "rechazada" || estado === "rechazada") return "no_conforme";
  if (est === "L" && !justificada) return "liberado";
  if (dict === "liberada" && !justificada) return "liberado";
  if (estado === "liberada" && !justificada) return "liberado";
  if (t.mediciones.some((m) => m.estado !== "conforme")) return "no_conforme";
  if (justificada) return "no_conforme";
  return "liberado";
}

function MuestraTracePage() {
  const { id } = Route.useParams();
  const { peso, vista } = Route.useSearch();
  const { data } = useSuspenseQuery(traceQO(id));
  const trace = data as TraceMuestra;

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname !== CANONICAL_HOST && !window.location.hostname.includes("localhost")) {
      const target = `https://${CANONICAL_HOST}/muestra/${id}${window.location.search}`;
      window.location.replace(target);
      return;
    }
    if (trace.found) void auditAction("qr", `Visualización QR muestra ${id.slice(0, 8)}`, id);
  }, [id, trace]);

  if (!trace.found) return <NotFoundCard />;

  const status = normalizeStatus(trace);
  const pesoMostrado = trace.peso_kg ?? parsePesoParam(peso);

  return vista === "sap"
    ? <SapView trace={trace} status={status} pesoMostrado={pesoMostrado} />
    : <TrazabilidadView trace={trace} status={status} pesoMostrado={pesoMostrado} />;
}

function ShellSap({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <img src={logoUrl} alt="Convertipap" className="h-10 sm:h-12 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-[13px] sm:text-base font-bold tracking-[0.18em] uppercase text-[#0b2545]">
              Trazabilidad de rollo
            </h1>
            {subtitle && (
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
          <img src={sapLogo.url} alt="SAP" className="h-8 sm:h-10 w-auto object-contain" />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
      <footer className="py-3 text-center text-[11px] text-slate-400">
        Verificación pública · Solo lectura · Convertipap
      </footer>
    </div>
  );
}


/* ============================================================
 * VISTA SAP: minimal (rollo, peso, OP, estado, estatus)
 * ============================================================ */
function SapView({
  trace,
  status,
  pesoMostrado,
}: {
  trace: Extract<TraceMuestra, { found: true }>;
  status: StatusKind;
  pesoMostrado: number | null;
}) {
  const isLiberado = status === "liberado";
  return (
    <ShellSap subtitle="Vista SAP · Rollo">
      <div className="rounded-2xl border-2 border-[#0b2545] bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <Cell label="N.º de rollo" value={trace.numero_rollo ?? "—"} />
          <Cell
            label="Peso"
            value={pesoMostrado != null ? formatPeso(pesoMostrado) : "—"}
            unit={pesoMostrado != null ? "kg" : undefined}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <Cell label="Orden de producción" value={trace.folio} small />
          <Cell label="Estado" value={(trace.estado ?? "—").toUpperCase()} small />
        </div>
        <StatusBar isLiberado={isLiberado} />
      </div>
    </Shell>
  );
}

/* ============================================================
 * VISTA TRAZABILIDAD COMPLETA
 * ============================================================ */
function TrazabilidadView({
  trace,
  status,
  pesoMostrado,
}: {
  trace: Extract<TraceMuestra, { found: true }>;
  status: StatusKind;
  pesoMostrado: number | null;
}) {
  const isLiberado = status === "liberado";
  const fecha = new Date(trace.capturado_at || trace.hora_muestreo).toLocaleString("es-MX");

  return (
    <Shell subtitle="Trazabilidad completa">
      <div className="rounded-2xl border-2 border-[#0b2545] bg-white shadow-sm overflow-hidden">
        {/* Rollo + Peso destacados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <Cell label="N.º de rollo" value={trace.numero_rollo ?? "—"} />
          <Cell
            label="Peso"
            value={pesoMostrado != null ? formatPeso(pesoMostrado) : "—"}
            unit={pesoMostrado != null ? "kg" : undefined}
          />
        </div>

        {/* Datos generales */}
        <dl className="grid grid-cols-2 sm:grid-cols-3 border-t border-slate-200 text-[12px]">
          <Info label="Orden de producción" value={trace.folio} mono />
          <Info label="Estado" value={(trace.estado ?? "—").toUpperCase()} />
          <Info label="Turno" value={`T${trace.turno ?? "—"}`} />
          <Info label="Producto" value={`${trace.producto.codigo} · ${trace.producto.nombre}`} colSpan={2} />
          <Info label="Máquina" value={trace.maquina.codigo} />
          <Info label="Planta" value={trace.planta.codigo} />
          <Info label="Fecha captura" value={fecha} colSpan={2} />
        </dl>

        {/* Mediciones */}
        {trace.mediciones.length > 0 && (
          <div className="border-t border-slate-200">
            <div className="bg-[#0b2545] text-white text-[11px] font-bold tracking-[0.14em] uppercase px-4 py-2">
              Resultados de calidad
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-[0.06em]">
                  <tr>
                    <th className="text-left px-3 py-2">Variable</th>
                    <th className="text-right px-3 py-2">Valor</th>
                    <th className="text-right px-3 py-2">Mín</th>
                    <th className="text-right px-3 py-2">Máx</th>
                    <th className="text-center px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.mediciones.map((m) => {
                    const ok = m.estado === "conforme";
                    return (
                      <tr key={m.clave} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">
                          {m.etiqueta}
                          {m.unidad && <span className="text-slate-400"> ({m.unidad})</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#0b2545]">
                          {m.valor}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{m.min}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{m.max}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={
                              "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider " +
                              (ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")
                            }
                          >
                            {ok ? "OK" : "Fuera"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Defectos */}
        {trace.defectos && trace.defectos.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-1">
              Defectos reportados
            </div>
            <div className="flex flex-wrap gap-1.5">
              {trace.defectos.map((d) => (
                <span key={d} className="text-[11px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-200">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Observaciones */}
        {trace.observaciones_generales && trace.observaciones_generales.trim().length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-1">
              Observaciones
            </div>
            <div className="text-[12px] text-slate-700 whitespace-pre-wrap">
              {trace.observaciones_generales}
            </div>
          </div>
        )}

        <StatusBar isLiberado={isLiberado} />
      </div>
    </Shell>
  );
}

/* ============================================================
 * Helpers UI
 * ============================================================ */
function Cell({ label, value, unit, small }: { label: string; value: string | number; unit?: string; small?: boolean }) {
  return (
    <div className="p-6 text-center">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">{label}</div>
      <div
        className={
          "mt-2 font-extrabold text-[#0b2545] tabular-nums tracking-tight " +
          (small ? "text-xl sm:text-2xl" : "text-4xl sm:text-5xl")
        }
      >
        {value}
        {unit && <span className="ml-1 text-2xl sm:text-3xl font-semibold text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function Info({ label, value, colSpan, mono }: { label: string; value: string; colSpan?: number; mono?: boolean }) {
  return (
    <div
      className={
        "px-4 py-2 border-t border-slate-100 " +
        (colSpan === 2 ? "col-span-2 sm:col-span-1 " : "") +
        (colSpan === 3 ? "col-span-2 sm:col-span-3 " : "")
      }
    >
      <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className={"text-[12.5px] font-semibold text-slate-800 " + (mono ? "font-mono" : "")}>{value}</div>
    </div>
  );
}

function StatusBar({ isLiberado }: { isLiberado: boolean }) {
  return (
    <div className="grid grid-cols-[auto_1fr] border-t-2 border-[#0b2545]">
      <div className="bg-[#0b2545] text-white px-5 sm:px-7 py-5 flex items-center justify-center">
        <span className="text-sm sm:text-base font-bold tracking-[0.22em] uppercase">Estatus</span>
      </div>
      <div
        className={
          "px-5 py-5 flex items-center justify-center text-center font-extrabold tracking-[0.15em] uppercase text-xl sm:text-2xl " +
          (isLiberado ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")
        }
      >
        {isLiberado ? "LIBERADO" : "NO CONFORME"}
      </div>
    </div>
  );
}

function parsePesoParam(value?: string): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPeso(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toString();
}

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-4">
          <img src={logoUrl} alt="Convertipap" className="h-10 sm:h-12 w-auto object-contain" />
          <div className="flex-1 text-center">
            <h1 className="text-[13px] sm:text-base font-bold tracking-[0.18em] uppercase text-[#0b2545]">
              Trazabilidad de rollo
            </h1>
            {subtitle && (
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
      <footer className="py-3 text-center text-[11px] text-slate-400">
        Verificación pública · Solo lectura · Convertipap
      </footer>
    </div>
  );
}

function LoadingCard() {
  return (
    <Shell>
      <div className="rounded-2xl border-2 border-[#0b2545] bg-white p-10 text-center shadow-sm">
        <div className="mx-auto h-6 w-6 rounded-full border-2 border-[#0b2545] border-t-transparent animate-spin" />
        <p className="mt-4 text-sm text-slate-600">Consultando información del rollo…</p>
      </div>
    </Shell>
  );
}

function NotFoundCard() {
  return (
    <Shell>
      <div className="rounded-2xl border-2 border-[#0b2545] bg-white p-10 text-center shadow-sm">
        <p className="text-base font-semibold text-[#0b2545]">Registro de rollo no encontrado</p>
      </div>
    </Shell>
  );
}
