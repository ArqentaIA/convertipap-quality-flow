import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, QrCode } from "lucide-react";
import logoUrl from "@/assets/logo-convertipap.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/lote-cintas/$id")({
  component: TrazaLoteCintas,
  head: () => ({
    meta: [
      { title: "Trazabilidad de lote de cintas · Convertipap" },
      { name: "description", content: "Consulta pública de trazabilidad del lote de pesaje de cintas: rollo, peso neto y detalle de cada cinta registrada." },
      { property: "og:title", content: "Trazabilidad de lote de cintas · Convertipap" },
      { property: "og:description", content: "Consulta pública del lote de pesaje de cintas: rollo, peso neto y cintas registradas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Cinta = { posicion: number; peso_cinta_kg: number; uniones: number; ancho_util: number; ancho_util_unidad: string | null };
type Traza = {
  lote_id: string;
  numero_rollo: string;
  fabricacion: string;
  numero_orden: string | null;
  producto_codigo: string | null;
  producto_nombre: string | null;
  fecha_produccion: string | null;
  peso_bobina_madre_neto_kg: number;
  peso_total_cintas_kg: number;
  cantidad_cintas: number;
  merma_kg: number | null;
  merma_porcentaje: number | null;
  estado: string;
  es_manual: boolean;
  origen_peso: string;
  cintas: Cinta[];
};

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function TrazaLoteCintas() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["traza-lote-cintas", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("trazabilidad_lote_cintas", { _lote_id: id });
      if (error) throw error;
      return (data as unknown as Traza | null) ?? null;
    },
  });

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-center gap-3 pb-2">
          <img src={logoUrl} alt="Convertipap" className="h-12 w-auto" />
          <div className="text-center">
            <div className="text-base font-bold text-foreground">Convertipap</div>
            <div className="text-[11px] text-muted-foreground">Trazabilidad · Pesaje de Cintas</div>
          </div>
        </div>

        {isLoading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Cargando registro…</div>}

        {!isLoading && !data && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
            No se encontró el lote de cintas solicitado.
          </div>
        )}

        {data && (
          <>
            <div className="rounded-xl border border-success/40 bg-success/5 p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-success" />
                <div>
                  <div className="text-sm font-bold text-success">Registro auténtico</div>
                  <div className="text-xs text-muted-foreground">
                    Lote {data.estado} · Origen del peso: {data.origen_peso === "manual" ? "captura manual" : "pesaje de bobina madre"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <QrCode className="h-3.5 w-3.5" /> N.º de rollo
                  </div>
                  <h1 className="mt-1 font-mono text-2xl font-bold text-foreground">{data.numero_rollo}</h1>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Peso neto bobina madre</div>
                  <div className="font-mono text-xl font-bold">{fmt(data.peso_bobina_madre_neto_kg)} kg</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Info label="Fabricación" value={data.fabricacion || "SIN DATOS REGISTRADOS"} />
                <Info label="Orden de producción" value={data.numero_orden || "SIN DATOS REGISTRADOS"} />
                <Info label="Producto" value={data.producto_nombre || data.producto_codigo || "SIN DATOS REGISTRADOS"} />
                <Info label="Fecha de producción" value={data.fecha_produccion || "SIN DATOS REGISTRADOS"} />
                <Info label="Cintas registradas" value={String(data.cintas.length)} />
                <Info label="Peso total cintas" value={`${fmt(data.peso_total_cintas_kg)} kg`} />
              </div>

              <h3 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Detalle de cintas</h3>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Pos.</th>
                      <th className="px-3 py-2 text-right">Peso (kg)</th>
                      <th className="px-3 py-2 text-right">Uniones</th>
                      <th className="px-3 py-2 text-right">Ancho útil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cintas.map((c) => (
                      <tr key={c.posicion} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{c.posicion}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(c.peso_cinta_kg)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.uniones}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.ancho_util} {c.ancho_util_unidad ?? ""}</td>
                      </tr>
                    ))}
                    {data.cintas.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Sin cintas registradas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
          Vista pública de trazabilidad · Solo lectura · No otorga acceso al sistema.
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
