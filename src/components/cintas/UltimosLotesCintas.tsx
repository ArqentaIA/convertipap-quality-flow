// =============================================================================
// Últimos rollos cortados — panel inferior del módulo CORTES BOBINA.
// Siempre visible (aun sin rollo de origen capturado) y limitado a la planta
// activa del encabezado: TLX e IXT nunca mezclan información.
// =============================================================================
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Eye, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  listarUltimosLotesCintas,
  obtenerLoteYCintas,
  puedeEditarCorte,
  editarCintaCorte,
  prepararImpresion,
  listarSkuSapCintas,
  type LoteResumen,
  type CintaRegistrada,
} from "@/lib/pesaje-cintas.functions";
import { abrirImpresionEtiquetas, type EtiquetaSnapshot } from "@/lib/etiqueta-cinta";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function n(v: number | null | undefined, d = 2): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Rollo</th>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-left">SKU SAP bobina</th>
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
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{l.sku_sap ?? "—"}</td>
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

type Borrador = {
  peso: string; ancho: string; sku: string; uniones: string; obs: string; estatus: "" | "L" | "C" | "NC";
};

function DetalleLoteDialog({ loteId, onClose }: { loteId: string | null; onClose: () => void }) {
  const traer = useServerFn(obtenerLoteYCintas);
  const permisoFn = useServerFn(puedeEditarCorte);
  const editarFn = useServerFn(editarCintaCorte);
  const prepararFn = useServerFn(prepararImpresion);
  const skusFn = useServerFn(listarSkuSapCintas);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["detalle-lote-cintas", loteId],
    enabled: !!loteId,
    queryFn: () => traer({ data: { lote_id: loteId! } }),
  });
  const permQ = useQuery({
    queryKey: ["puede-editar-corte", loteId],
    enabled: !!loteId,
    queryFn: () => permisoFn({ data: { lote_id: loteId! } }),
  });

  const lote = q.data?.lote ?? null;
  const cintas = (q.data?.cintas ?? []).filter((c) => c.estado === "registrada");
  const skusQ = useQuery({
    queryKey: ["skus-cintas", lote?.producto_codigo ?? ""],
    enabled: !!lote,
    queryFn: () => skusFn({ data: { producto_codigo: lote?.producto_codigo ?? null } }),
  });

  const [editando, setEditando] = useState(false);
  const [borr, setBorr] = useState<Record<string, Borrador>>({});
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);

  const puede = permQ.data?.puede === true;

  function iniciar() {
    const b: Record<string, Borrador> = {};
    for (const c of cintas) {
      b[c.id] = {
        peso: String(c.peso_cinta_kg ?? ""), ancho: String(c.ancho_util ?? ""), sku: c.sku_sap ?? "",
        uniones: String(c.uniones ?? 0), obs: c.observaciones ?? "", estatus: (c.estatus_liberacion ?? "") as Borrador["estatus"],
      };
    }
    setBorr(b); setMotivo(""); setEditando(true);
  }

  function cambiada(c: CintaRegistrada): boolean {
    const b = borr[c.id];
    if (!b) return false;
    return Number(b.peso) !== Number(c.peso_cinta_kg) || Number(b.ancho) !== Number(c.ancho_util)
      || (b.sku || null) !== (c.sku_sap ?? null) || Number(b.uniones) !== Number(c.uniones)
      || (b.obs.trim() || null) !== (c.observaciones ?? null) || (b.estatus || null) !== (c.estatus_liberacion ?? null);
  }

  async function guardar() {
    const mod = cintas.filter(cambiada);
    if (mod.length === 0) { toast.info("No hay cambios por guardar."); return; }
    if (motivo.trim().length < 10) { toast.error("Escribe el motivo (mínimo 10 caracteres)."); return; }
    for (const c of mod) {
      const b = borr[c.id];
      if (!(Number(b.peso) > 0) || !(Number(b.ancho) > 0) || !Number.isInteger(Number(b.uniones)) || Number(b.uniones) < 0) {
        toast.error(`Posición ${c.posicion}: revisa peso, ancho y uniones.`); return;
      }
    }
    setGuardando(true);
    let ok = 0;
    try {
      for (const c of mod) {
        const b = borr[c.id];
        await editarFn({ data: {
          cinta_id: c.id, peso_cinta_kg: Number(b.peso), ancho_util: Number(b.ancho), sku_sap: b.sku || null,
          uniones: Number(b.uniones), observaciones: b.obs.trim() || null, estatus: b.estatus || null,
          motivo: motivo.trim(), idempotency_key: crypto.randomUUID(),
        } });
        ok++;
      }
      toast.success(`${ok} cinta(s) actualizada(s). Ya puedes imprimir la etiqueta Ver 2.0.`);
      setEditando(false);
    } catch (e) {
      toast.error(`${ok > 0 ? `${ok} guardada(s). ` : ""}${e instanceof Error ? e.message : "Error al guardar."}`);
    } finally {
      setGuardando(false);
      await q.refetch();
      void qc.invalidateQueries({ queryKey: ["ultimos-lotes-cintas"] });
    }
  }

  async function imprimir(cintaId: string | null) {
    if (!lote) return;
    setImprimiendo(cintaId ?? "todas");
    try {
      const fresh = await q.refetch();
      const vigentes = (fresh.data?.cintas ?? []).filter((c) => c.estado === "registrada");
      const res = await prepararFn({ data: { lote_id: lote.id, motivo: null, cinta_id: cintaId } });
      const snap = res.snapshot as unknown as EtiquetaSnapshot;
      snap.cintas = (snap.cintas ?? []).map((c) => ({
        ...c,
        estatus_liberacion: vigentes.find((v) => v.id === c.id)?.estatus_liberacion ?? null,
      }));
      await abrirImpresionEtiquetas(snap);
      toast.success(`Impresión ${res.folio} · ${res.cantidad_etiquetas} etiqueta(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al imprimir.");
    } finally {
      setImprimiendo(null);
    }
  }

  const skus = skusQ.data?.items ?? [];
  const inp = "h-8 w-full rounded border bg-background px-2 text-sm";

  return (
    <Dialog open={!!loteId} onOpenChange={(o) => { if (!o) { setEditando(false); onClose(); } }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-auto">
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
              <Dato k="Origen" v={lote.imp_bobina_id ? "Bobina importada" : lote.es_manual ? "Captura manual" : "Sistema"} />
            </div>

            {puede && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!editando ? (
                  <>
                    <button type="button" onClick={iniciar}
                      className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
                      <Pencil className="h-4 w-4" /> Editar cintas
                    </button>
                    <button type="button" disabled={!!imprimiendo} onClick={() => void imprimir(null)}
                      className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                      {imprimiendo === "todas" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Imprimir todas
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Editable hasta {permQ.data?.expira_at ? fechaCorta(permQ.data.expira_at) : "—"}
                  </span>
                )}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Pos.</th>
                    <th className="px-3 py-2 text-right">Peso (kg)</th>
                    <th className="px-3 py-2 text-right">Ancho útil</th>
                    <th className="px-3 py-2 text-right">Uniones</th>
                    <th className="px-3 py-2 text-left">SKU SAP</th>
                    <th className="px-3 py-2 text-left">Estatus</th>
                    <th className="px-3 py-2 text-left">Observaciones</th>
                    <th className="px-3 py-2 text-left">Ver.</th>
                    {puede && !editando && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {cintas.map((c) => {
                    const b = borr[c.id];
                    const set = (k: keyof Borrador, v: string) => setBorr((p) => ({ ...p, [c.id]: { ...p[c.id], [k]: v } }));
                    return editando && b ? (
                      <tr key={c.id} className={`border-t ${cambiada(c) ? "bg-warning/10" : ""}`}>
                        <td className="px-3 py-2 font-semibold">{c.posicion}</td>
                        <td className="px-2 py-1"><input className={`${inp} w-24 text-right`} type="number" step="0.01" value={b.peso} onChange={(e) => set("peso", e.target.value)} /></td>
                        <td className="px-2 py-1"><input className={`${inp} w-20 text-right`} type="number" step="0.001" value={b.ancho} onChange={(e) => set("ancho", e.target.value)} /></td>
                        <td className="px-2 py-1"><input className={`${inp} w-16 text-right`} type="number" step="1" min="0" value={b.uniones} onChange={(e) => set("uniones", e.target.value)} /></td>
                        <td className="px-2 py-1">
                          <select className={`${inp} w-40`} value={b.sku} onChange={(e) => set("sku", e.target.value)}>
                            <option value="">—</option>
                            {b.sku && !skus.some((s) => s.clave === b.sku) && <option value={b.sku}>{b.sku}</option>}
                            {skus.map((s) => <option key={s.clave} value={s.clave}>{s.clave}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <select className={`${inp} w-20`} value={b.estatus} onChange={(e) => set("estatus", e.target.value)}>
                            <option value="">—</option><option value="L">L</option><option value="C">C</option><option value="NC">NC</option>
                          </select>
                        </td>
                        <td className="px-2 py-1"><input className={`${inp} w-48`} maxLength={500} value={b.obs} onChange={(e) => set("obs", e.target.value)} /></td>
                        <td className="px-3 py-2 text-muted-foreground">{c.version_etiqueta ?? 1}.0</td>
                      </tr>
                    ) : (
                      <tr key={c.id} className="border-t">
                        <td className="px-3 py-2 font-semibold">{c.posicion}</td>
                        <td className="px-3 py-2 text-right">{n(c.peso_cinta_kg)}</td>
                        <td className="px-3 py-2 text-right">{n(c.ancho_util, 3)} {c.ancho_util_unidad ?? "cm"}</td>
                        <td className="px-3 py-2 text-right">{c.uniones}</td>
                        <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{c.sku_sap ?? "—"}</td>
                        <td className="px-3 py-2">{c.estatus_liberacion ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.observaciones ?? "—"}</td>
                        <td className="px-3 py-2">
                          {(c.version_etiqueta ?? 1) > 1
                            ? <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">Ver {c.version_etiqueta}.0</span>
                            : <span className="text-muted-foreground">1.0</span>}
                        </td>
                        {puede && !editando && (
                          <td className="px-3 py-2 text-right">
                            <button type="button" disabled={!!imprimiendo} onClick={() => void imprimir(c.id)}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">
                              {imprimiendo === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Etiqueta
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {cintas.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Sin cintas registradas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {editando && (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Motivo de la corrección (mínimo 10 caracteres)</label>
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={guardando} onClick={() => setEditando(false)} className="h-9 rounded-md border px-3 text-sm">Cancelar</button>
                  <button type="button" disabled={guardando} onClick={() => void guardar()}
                    className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar cambios
                  </button>
                </div>
              </div>
            )}
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
