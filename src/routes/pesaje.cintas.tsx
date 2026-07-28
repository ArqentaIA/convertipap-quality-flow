import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Printer, CheckCircle2, Ban, Lock, Pencil, UserCog } from "lucide-react";
import {
  buscarContextoRollo, listConductores, listBobinadoras,
  crearLote, obtenerLoteYCintas, registrarCinta, corregirCinta, anularCinta,
  finalizarLote, prepararImpresion, actualizarDatosOperativos,
  type ContextoRollo, type CintaRegistrada, type LoteCintas,
} from "@/lib/pesaje-cintas.functions";
import { abrirImpresionEtiquetas, type EtiquetaSnapshot } from "@/lib/etiqueta-cinta";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pesaje/cintas")({
  head: () => ({
    meta: [
      { title: "Pesaje de Cintas · Convertipap" },
      { name: "description", content: "Registro y etiquetado de cintas obtenidas de la bobina madre" },
      { property: "og:title", content: "Pesaje de Cintas · Convertipap" },
      { property: "og:description", content: "Registro y etiquetado de cintas obtenidas de la bobina madre" },
    ],
  }),
  component: () => (
    <AppLayout title="Control de Pesaje · Cintas">
      <PesajeCintasPage />
    </AppLayout>
  ),
});

function uuid(): string {
  return crypto.randomUUID();
}

function n(v: number | null | undefined, d = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

function PesajeCintasPage() {
  const qc = useQueryClient();
  const buscar = useServerFn(buscarContextoRollo);
  const crear = useServerFn(crearLote);
  const traer = useServerFn(obtenerLoteYCintas);
  const registrar = useServerFn(registrarCinta);
  const anular = useServerFn(anularCinta);
  const finalizar = useServerFn(finalizarLote);
  const preparar = useServerFn(prepararImpresion);

  const [rolloInput, setRolloInput] = useState("");
  const [contexto, setContexto] = useState<ContextoRollo | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [conductorId, setConductorId] = useState<string>("");
  const [bobinadoraId, setBobinadoraId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const requestGuard = useRef(false);

  const conductoresQ = useQuery({
    queryKey: ["cintas-conductores"],
    queryFn: () => listConductores(),
  });
  const bobinadorasQ = useQuery({
    queryKey: ["cintas-bobinadoras"],
    queryFn: () => listBobinadoras(),
  });

  const loteQ = useQuery({
    queryKey: ["cintas-lote", loteId],
    queryFn: () => (loteId ? traer({ data: { lote_id: loteId } }) : Promise.resolve({ lote: null, cintas: [] })),
    enabled: !!loteId,
    refetchOnWindowFocus: false,
  });

  const lote: LoteCintas | null = loteQ.data?.lote ?? null;
  const cintas: CintaRegistrada[] = (loteQ.data?.cintas ?? []).filter((c) => c.estado === "registrada");

  async function onBuscar() {
    const rollo = rolloInput.trim();
    if (!rollo) { toast.error("Ingrese un número de rollo."); return; }
    setBuscando(true);
    setContexto(null); setLoteId(null);
    try {
      const ctx = await buscar({ data: { numero_rollo: rollo } });
      setContexto(ctx);
      if (ctx.lote) {
        setLoteId(ctx.lote.id);
        setConductorId(ctx.lote.conductor_id ?? "");
        setBobinadoraId(ctx.lote.bobinadora_id);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al buscar el rollo.");
    } finally {
      setBuscando(false);
    }
  }

  async function onCrearLote() {
    if (!contexto) return;
    if (!conductorId || !bobinadoraId) { toast.error("Seleccione conductor y bobinadora."); return; }
    if (requestGuard.current) return;
    requestGuard.current = true;
    setSaving(true);
    try {
      const { lote_id } = await crear({
        data: {
          numero_rollo: contexto.muestra.numero_rollo,
          conductor_id: conductorId,
          bobinadora_id: bobinadoraId,
          idempotency_key: uuid(),
        },
      });
      setLoteId(lote_id);
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote_id] });
      toast.success("Lote iniciado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al iniciar el lote.");
    } finally {
      requestGuard.current = false;
      setSaving(false);
    }
  }

  const netoBM = lote?.peso_bobina_madre_neto_kg ?? contexto?.pesaje.peso_neto_kg ?? 0;
  const totalCintas = lote?.peso_total_cintas_kg ?? 0;
  const pendiente = lote ? lote.peso_pendiente_kg : netoBM;
  const merma = lote?.estado === "finalizado" ? lote.merma_kg : null;
  const mermaPct = lote?.estado === "finalizado" ? lote.merma_porcentaje : null;

  const siguientePos = useMemo(() => {
    if (!lote) return 0;
    if (cintas.length >= 12) return 0;
    return cintas.length + 1;
  }, [lote, cintas.length]);

  async function onRegistrar(peso: number, uniones: number, ancho: number, obs: string) {
    if (!lote) return;
    if (requestGuard.current) return;
    if (peso <= 0 || ancho <= 0 || uniones < 0) { toast.error("Valores inválidos."); return; }
    if (totalCintas + peso > netoBM + 0.001) {
      toast.error("El peso acumulado supera el peso disponible de la bobina madre.");
      return;
    }
    requestGuard.current = true;
    setSaving(true);
    try {
      await registrar({
        data: {
          lote_id: lote.id,
          uniones, peso_cinta_kg: peso, ancho_util: ancho,
          observaciones: obs || null,
          idempotency_key: uuid(),
        },
      });
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      toast.success(`Cinta registrada.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al registrar la cinta.");
    } finally {
      requestGuard.current = false;
      setSaving(false);
    }
  }

  async function onAnular(cintaId: string) {
    const motivo = window.prompt("Motivo de anulación (mínimo 5 caracteres):");
    if (!motivo || motivo.trim().length < 5) return;
    try {
      await anular({ data: { cinta_id: cintaId, motivo: motivo.trim() } });
      await qc.invalidateQueries({ queryKey: ["cintas-lote", loteId] });
      toast.success("Cinta anulada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al anular.");
    }
  }

  async function onFinalizar() {
    if (!lote) return;
    if (!window.confirm(`¿Finalizar rollo? El peso pendiente (${n(pendiente)} kg) se registrará como merma final.`)) return;
    try {
      await finalizar({ data: { lote_id: lote.id } });
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      toast.success("Rollo finalizado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al finalizar.");
    }
  }

  async function onImprimir() {
    if (!lote || cintas.length === 0) return;
    try {
      let motivo: string | null = null;
      if (lote.estado === "finalizado") {
        motivo = window.prompt("Motivo de reimpresión (mínimo 5 caracteres):") || null;
        if (!motivo || motivo.length < 5) { toast.error("Motivo requerido."); return; }
      }
      const res = await preparar({ data: { lote_id: lote.id, motivo } });
      abrirImpresionEtiquetas(res.snapshot as EtiquetaSnapshot);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al preparar impresión.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* Buscador */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Número de rollo</div>
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 font-mono text-lg"
            placeholder="Ej. 10057-4"
            value={rolloInput}
            onChange={(e) => setRolloInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onBuscar()}
            disabled={buscando}
          />
          <button
            onClick={onBuscar}
            disabled={buscando || !rolloInput.trim()}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
          >
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>
        </div>
      </div>

      {/* Contexto */}
      {contexto && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Datos recuperados</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
            <Field label="N.º Rollo" value={contexto.muestra.numero_rollo} />
            <Field label="Fabricación" value={contexto.muestra.fabricacion || "—"} />
            <Field label="Producto" value={contexto.muestra.producto_nombre ?? contexto.muestra.producto_codigo ?? "—"} />
            <Field label="Turno" value={contexto.muestra.turno} />
            <Field label="Peso neto bobina madre" value={`${n(contexto.pesaje.peso_neto_kg)} kg`} highlight />
            <Field label="Analista" value={contexto.muestra.analista ?? "—"} />
            <Field label="Supervisor" value={contexto.muestra.jefe_maquina ?? "—"} />
            <Field label="Operador" value={contexto.muestra.operador ?? "—"} />
          </div>
        </div>
      )}

      {/* Conductor / bobinadora */}
      {contexto && !lote && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Conductor y bobinadora</div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Conductor</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={conductorId}
                onChange={(e) => setConductorId(e.target.value)}
              >
                <option value="">— seleccionar —</option>
                {(conductoresQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.puesto ? ` · ${c.puesto}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Bobinadora</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={bobinadoraId}
                onChange={(e) => setBobinadoraId(e.target.value)}
              >
                <option value="">— seleccionar —</option>
                {(bobinadorasQ.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={onCrearLote}
                disabled={saving || !conductorId || !bobinadoraId}
                className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Iniciando…" : "Iniciar lote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lote activo */}
      {lote && (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <Card k="Neto bobina madre" v={`${n(netoBM)} kg`} />
            <Card k="Cintas registradas" v={`${cintas.length} / 12`} />
            <Card k="Peso acumulado" v={`${n(totalCintas)} kg`} />
            <Card k={merma == null ? "Peso pendiente" : "Merma final"} v={`${n(merma == null ? pendiente : merma)} kg`} highlight={merma != null} />
            <Card k="% merma" v={mermaPct == null ? "—" : `${n(mermaPct, 2)} %`} />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Lote</div>
                <div className="font-medium">Conductor: <span className="text-foreground">{lote.conductor_nombre_snapshot}</span> · Bobinadora: <span className="text-foreground">{lote.bobinadora_nombre_snapshot}</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onImprimir}
                  disabled={cintas.length === 0}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" /> Imprimir etiquetas ({cintas.length})
                </button>
                {lote.estado === "abierto" && (
                  <button
                    onClick={onFinalizar}
                    disabled={cintas.length === 0}
                    className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Finalizar rollo
                  </button>
                )}
                {lote.estado === "finalizado" && (
                  <span className="flex items-center gap-1 rounded-md bg-success/15 px-3 py-2 text-sm font-medium text-success">
                    <Lock className="h-4 w-4" /> Finalizado
                  </span>
                )}
              </div>
            </div>

            {/* Grid de 12 posiciones */}
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((pos) => {
                const c = cintas.find((x) => x.posicion === pos);
                const habilitada = !c && pos === siguientePos && lote.estado === "abierto";
                return (
                  <CintaCard
                    key={pos}
                    pos={pos}
                    cinta={c ?? null}
                    habilitada={habilitada}
                    disponibleKg={netoBM - totalCintas}
                    onRegistrar={onRegistrar}
                    onAnular={c ? () => onAnular(c.id) : undefined}
                    saving={saving}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm ${highlight ? "text-base font-bold text-primary" : "font-medium text-foreground"}`}>{value}</div>
    </div>
  );
}

function Card({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-lg font-bold text-foreground">{v}</div>
    </div>
  );
}

type CintaCardProps = {
  pos: number;
  cinta: CintaRegistrada | null;
  habilitada: boolean;
  disponibleKg: number;
  onRegistrar: (peso: number, uniones: number, ancho: number, obs: string) => Promise<void>;
  onAnular?: () => void;
  saving: boolean;
};

function CintaCard({ pos, cinta, habilitada, disponibleKg, onRegistrar, onAnular, saving }: CintaCardProps) {
  const [peso, setPeso] = useState("");
  const [uniones, setUniones] = useState("0");
  const [ancho, setAncho] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (habilitada) { setPeso(""); setUniones("0"); setAncho(""); setObs(""); }
  }, [habilitada]);

  if (cinta) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-3">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs uppercase text-muted-foreground">Posición</div>
          <div className="text-2xl font-black text-success">{pos}</div>
        </div>
        <div className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">Peso:</span> <b>{n(cinta.peso_cinta_kg)} kg</b></div>
          <div><span className="text-muted-foreground">Ancho:</span> <b>{n(cinta.ancho_util, 3)} {cinta.ancho_util_unidad ?? "cm"}</b></div>
          <div><span className="text-muted-foreground">Uniones:</span> <b>{cinta.uniones}</b></div>
          {cinta.observaciones && <div className="text-xs text-muted-foreground">{cinta.observaciones}</div>}
        </div>
        {onAnular && (
          <button
            onClick={onAnular}
            className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline"
          >
            <Ban className="h-3 w-3" /> Anular
          </button>
        )}
      </div>
    );
  }

  if (!habilitada) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 opacity-60">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs uppercase text-muted-foreground">Posición</div>
          <div className="text-2xl font-black text-muted-foreground">{pos}</div>
        </div>
        <div className="text-xs text-muted-foreground">Pendiente</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-primary bg-primary/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs uppercase font-semibold text-primary">Registrar</div>
        <div className="text-2xl font-black text-primary">{pos}</div>
      </div>
      <div className="space-y-2 text-sm">
        <div>
          <label className="mb-0.5 block text-[11px] text-muted-foreground">Peso (kg) · disp. {n(disponibleKg)}</label>
          <input
            type="number" inputMode="decimal" step="0.01"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[11px] text-muted-foreground">Ancho útil</label>
            <input
              type="number" inputMode="decimal" step="0.01"
              value={ancho}
              onChange={(e) => setAncho(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] text-muted-foreground">Uniones</label>
            <input
              type="number" inputMode="numeric" min="0" step="1"
              value={uniones}
              onChange={(e) => setUniones(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-muted-foreground">Observaciones (opcional)</label>
          <input
            type="text" maxLength={200}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={() => onRegistrar(Number(peso), Number(uniones || 0), Number(ancho), obs.trim())}
          disabled={saving || !peso || !ancho}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar y generar etiqueta"}
        </button>
      </div>
    </div>
  );
}
