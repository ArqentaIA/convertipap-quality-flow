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
  // Cualquier medición fuera de conforme => no conforme
  if (t.mediciones.some((m) => m.estado !== "conforme")) return "no_conforme";
  // Liberado con justificación se muestra como NO CONFORME en la vista pública
  // (la vista pública sólo tiene dos etiquetas oficiales).
  if (justificada) return "no_conforme";
  return "liberado";
}

function MuestraTracePage() {
  const { id } = Route.useParams();
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
  const isLiberado = status === "liberado";

  return (
    <Shell>
      <div className="rounded-2xl border-2 border-[#0b2545] bg-white shadow-sm overflow-hidden">
        {/* Datos principales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-6 text-center">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
              N.º de rollo
            </div>
            <div className="mt-2 text-4xl sm:text-5xl font-extrabold text-[#0b2545] tabular-nums tracking-tight">
              {trace.numero_rollo ?? "—"}
            </div>
          </div>
          <div className="p-6 text-center">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
              Peso
            </div>
            <div className="mt-2 text-4xl sm:text-5xl font-extrabold text-[#0b2545] tabular-nums tracking-tight">
              {trace.peso_kg != null ? (
                <>
                  {formatPeso(trace.peso_kg)}
                  <span className="ml-1 text-2xl sm:text-3xl font-semibold text-slate-500">kg</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>

        {/* Estatus */}
        <div className="grid grid-cols-[auto_1fr] border-t-2 border-[#0b2545]">
          <div className="bg-[#0b2545] text-white px-5 sm:px-7 py-5 flex items-center justify-center">
            <span className="text-sm sm:text-base font-bold tracking-[0.22em] uppercase">
              Estatus
            </span>
          </div>
          <div
            className={
              "px-5 py-5 flex items-center justify-center text-center font-extrabold tracking-[0.15em] uppercase text-xl sm:text-2xl " +
              (isLiberado
                ? "bg-emerald-50 text-emerald-800"
                : "bg-rose-50 text-rose-800")
            }
          >
            {isLiberado ? "LIBERADO" : "NO CONFORME"}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function formatPeso(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toString();
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <img src={logoUrl} alt="Convertipap" className="h-10 sm:h-12 w-auto object-contain" />
          <h1 className="text-center text-[13px] sm:text-base font-bold tracking-[0.18em] uppercase text-[#0b2545]">
            Trazabilidad de rollo
          </h1>
          <img src={sapLogo.url} alt="SAP" className="h-8 sm:h-10 w-auto object-contain" />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-xl">{children}</div>
      </main>
      <footer className="py-3 text-center text-[11px] text-slate-400">
        Verificación pública · Solo lectura
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
