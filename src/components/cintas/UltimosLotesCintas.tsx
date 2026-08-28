// =============================================================================
// Últimos rollos cortados — panel inferior del módulo CORTES BOBINA.
// Siempre visible (aun sin rollo de origen capturado) y limitado a la planta
// activa del encabezado: TLX e IXT nunca mezclan información.
// =============================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Eye } from "lucide-react";
import {
  listarUltimosLotesCintas,
  obtenerLoteYCintas,
  type LoteResumen,
} from "@/lib/pesaje-cintas.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function n(v: number | null | undefined, d = 2): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function EstadoBadge({ estado }: { estado: LoteResumen["estado"] }) {
  const cls =
    estado === "finalizado"
      ? "bg-success/15 text-success"
      : estado === "anulado"
        ? "bg-destructive/15 text-destructive"
        : "bg-warning/15 text-warning";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${cls}`}>{estado}</span>;
}

export function UltimosLotesCintas({ planta }: { planta: string | null }) {
  const listar = useServerFn(listarUltimosLotesCintas);
  const [busqueda, setBusqueda] = useState("");
  const [termino, setTermino] = useState("");
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["ultimos-lotes-cintas", planta, termino],
    queryFn: () => listar({ data: { planta, buscar: termino || null, limite: 50 } }),
    staleTime: 30_000,
  });

  const lotes = q.data ?? [];
  const totalCintas = lotes.reduce((a, l) => a + (l.cantidad_cintas ?? 0), 0);
  const totalKg = lotes.reduce((a, l) => a + Number(l.peso_total_cintas_kg ?? 0), 0);

  return (
    <div className="mt-6 rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">Últimos rollos cortados</div>
          <div className="text-xs text-muted-foreground">
            {planta ? `Planta ${planta}` : "Planta activa"} · {lotes.length} lotes · {totalCintas} cintas · {n(totalKg)} kg
          </div>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTermino(busqueda.trim());
          }}
        >
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar rollo…"
            className="h-9 w-44 rounded-md border bg-background px-3 text-sm"
          />
          <button type="submit" className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            <Search className="h-4 w-4" /> Buscar
          </button>
          {termino && (
            <button
              type="button"
              className="h-9 rounded-md border px-3 text-sm"
              onClick={() => { setBusqueda(""); setTermino(""); }}
            >
              Limpiar
            </button>
          )}
        </form>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : lotes.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground">Sin rollos cortados para esta planta.</div>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Rollo</th>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-right">Neto (kg)</th>
                <th className="px-3 py-2 text-right">Cintas</th>
                <th className="px-3 py-2 text-right">Cintas (kg)</th>
                <th className="px-3 py-2 text-right">Mermas (kg)</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-semibold">{l.numero_rollo}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {l.producto_codigo ? `${l.producto_codigo} — ${l.producto_nombre ?? ""}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{n(l.peso_bobina_madre_neto_kg)}</td>
                  <td className="px-3 py-2 text-right">{l.cantidad_cintas}</td>
                  <td className="px-3 py-2 text-right">{n(l.peso_total_cintas_kg)}</td>
                  <td className="px-3 py-2 text-right">{n(l.peso_mermas_kg)}</td>
                  <td className="px-3 py-2"><EstadoBadge estado={l.estado} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{fechaCorta(l.fecha_produccion ?? l.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setDetalleId(l.id)}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" /> Detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetalleLoteDialog loteId={detalleId} onClose={() => setDetalleId(null)} />
    </div>
  );
}

function DetalleLoteDialog({ loteId, onClose }: { loteId: string | null; onClose: () => void }) {
  const traer = useServerFn(obtenerLoteYCintas);
  const q = useQuery({
    queryKey: ["detalle-lote-cintas", loteId],
    enabled: !!loteId,
    queryFn: () => traer({ data: { lote_id: loteId! } }),
  });

  const lote = q.data?.lote ?? null;
  const cintas = (q.data?.cintas ?? []).filter((c) => c.estado !== "anulada");

  return (
    <Dialog open={!!loteId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Detalle del rollo {lote?.numero_rollo ?? ""}</DialogTitle>
        </DialogHeader>

        {q.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : !lote ? (
          <div className="py-8 text-sm text-muted-foreground">No fue posible cargar el lote.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato k="Fabricación" v={lote.fabricacion} />
              <Dato k="Producto" v={lote.producto_codigo ? `${lote.producto_codigo}` : "—"} />
              <Dato k="Orden" v={lote.numero_orden ?? "—"} />
              <Dato k="Estado" v={lote.estado} />
              <Dato k="Neto rollo (kg)" v={n(lote.peso_bobina_madre_neto_kg)} />
              <Dato k="Cintas" v={String(lote.cantidad_cintas)} />
              <Dato k="Total cintas (kg)" v={n(lote.peso_total_cintas_kg)} />
              <Dato k="Peso de mermas (kg)" v={n(lote.peso_mermas_kg)} />
              <Dato k="Conductor" v={lote.conductor_nombre_snapshot || "—"} />
              <Dato k="Bobinadora" v={lote.bobinadora_nombre_snapshot || "—"} />
              <Dato k="Fecha producción" v={lote.fecha_produccion ?? "—"} />
              <Dato k="Origen" v={lote.es_manual ? "Captura manual" : "Sistema"} />
            </div>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Pos.</th>
                    <th className="px-3 py-2 text-right">Peso (kg)</th>
                    <th className="px-3 py-2 text-right">Ancho útil</th>
                    <th className="px-3 py-2 text-right">Uniones</th>
                    <th className="px-3 py-2 text-left">Estatus</th>
                    <th className="px-3 py-2 text-left">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cintas.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-2 font-semibold">{c.posicion}</td>
                      <td className="px-3 py-2 text-right">{n(c.peso_cinta_kg)}</td>
                      <td className="px-3 py-2 text-right">{n(c.ancho_util, 3)} {c.ancho_util_unidad ?? "cm"}</td>
                      <td className="px-3 py-2 text-right">{c.uniones}</td>
                      <td className="px-3 py-2">{c.estatus_liberacion ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.observaciones ?? "—"}</td>
                    </tr>
                  ))}
                  {cintas.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Sin cintas registradas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-sm font-medium text-foreground">{v}</div>
    </div>
  );
}
