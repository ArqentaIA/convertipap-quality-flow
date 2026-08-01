import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Printer, CheckCircle2, Ban, Lock, Unlock, Pencil, UserCog } from "lucide-react";
import {
  buscarContextoRollo, listConductores, listBobinadoras,
  crearLote, crearLoteManual, obtenerLoteYCintas, registrarCinta, corregirCinta, anularCinta,
  finalizarLote, reabrirLote, prepararImpresion, actualizarDatosOperativos,
  type ContextoRollo, type CintaRegistrada, type LoteCintas,
} from "@/lib/pesaje-cintas.functions";
import { abrirImpresionEtiquetas, type EtiquetaSnapshot } from "@/lib/etiqueta-cinta";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pesaje/cintas")({
  head: () => ({
    meta: [
      { title: "Pesaje de Cintas · Convertipap" },
      { name: "description", content: "Registro y etiquetado de cintas obtenidas del rollo de origen" },
      { property: "og:title", content: "Pesaje de Cintas · Convertipap" },
      { property: "og:description", content: "Registro y etiquetado de cintas obtenidas del rollo de origen" },
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
  const crearManual = useServerFn(crearLoteManual);
  const traer = useServerFn(obtenerLoteYCintas);
  const registrar = useServerFn(registrarCinta);
  const corregir = useServerFn(corregirCinta);
  const anular = useServerFn(anularCinta);
  const finalizar = useServerFn(finalizarLote);
  const reabrir = useServerFn(reabrirLote);
  const preparar = useServerFn(prepararImpresion);
  const actualizarOp = useServerFn(actualizarDatosOperativos);

  const [rolMe, setRolMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const list = (roles ?? []).map((r) => r.role as string);
      if (list.includes("administrador")) setRolMe("administrador");
      else if (list.includes("calidad")) setRolMe("calidad");
      else if (list.includes("gerente_general")) setRolMe("gerente_general");
      else setRolMe(list[0] ?? null);
    });
  }, []);
  const puedeCambiarOperativos = rolMe === "administrador" || rolMe === "calidad" || rolMe === "gerente_general";

  const [rolloInput, setRolloInput] = useState("");
  const [contexto, setContexto] = useState<ContextoRollo | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [conductorId, setConductorId] = useState<string>("");
  const [bobinadoraId, setBobinadoraId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRollo, setManualRollo] = useState("");
  const [manualPeso, setManualPeso] = useState("");
  const [manual, setManual] = useState<{ rollo: string; peso: number } | null>(null);
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
    setContexto(null); setLoteId(null); setManual(null); setManualOpen(false);
    try {
      const ctx = await buscar({ data: { numero_rollo: rollo } });
      setContexto(ctx);
      if (ctx.lote) {
        setLoteId(ctx.lote.id);
        setConductorId(ctx.lote.conductor_id ?? "");
        setBobinadoraId(ctx.lote.bobinadora_id);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al buscar el rollo.";
      if (msg.toLowerCase().includes("rollo no encontrado") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no encontrado")) {
        setManualRollo(rollo);
        setManualOpen(true);
        toast.info("Rollo no encontrado. Se activó la captura manual.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBuscando(false);
    }
  }

  function onUsarManual() {
    const rollo = manualRollo.trim();
    const peso = Number(manualPeso);
    if (!rollo) { toast.error("Ingrese el número de rollo."); return; }
    if (!(peso > 0) || peso > 3000) { toast.error("El peso debe ser mayor a 0 y no rebasar 3000 kg."); return; }
    setContexto(null); setLoteId(null);
    setManual({ rollo, peso });
    setManualOpen(false);
  }

  async function onCrearLote() {
    if (!contexto && !manual) return;
    if (!manual && (!conductorId || !bobinadoraId)) { toast.error("Seleccione conductor y bobinadora."); return; }
    if (requestGuard.current) return;
    requestGuard.current = true;
    setSaving(true);
    try {
      const { lote_id } = manual
        ? await crearManual({
            data: {
              numero_rollo: manual.rollo,
              peso_neto_kg: manual.peso,
              conductor_id: null,
              bobinadora_id: null,
              idempotency_key: uuid(),
            },
          })
        : await crear({
            data: {
              numero_rollo: contexto!.muestra.numero_rollo,
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

  const netoBM = lote?.peso_bobina_madre_neto_kg ?? contexto?.pesaje.peso_neto_kg ?? manual?.peso ?? 0;
  const totalCintas = lote?.peso_total_cintas_kg ?? 0;
  const pendiente = lote ? lote.peso_pendiente_kg : netoBM;
  const merma = lote?.estado === "finalizado" ? lote.merma_kg : null;
  const mermaPct = lote?.estado === "finalizado" ? lote.merma_porcentaje : null;

  const siguientePos = useMemo(() => {
    if (!lote) return 0;
    if (cintas.length >= 20) return 0;
    return cintas.length + 1;
  }, [lote, cintas.length]);

  async function onRegistrar(peso: number, uniones: number, ancho: number, obs: string) {
    if (!lote) return;
    if (requestGuard.current) return;
    if (peso <= 0 || ancho <= 0 || uniones < 0) { toast.error("Valores inválidos."); return; }
    if (totalCintas + peso > netoBM + 0.001) {
      toast.error("El peso acumulado de las cintas supera el peso neto del rollo de origen. Revise los pesos capturados.");
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

  async function onCorregir(c: CintaRegistrada) {
    if (!lote) return;
    const pesoStr = window.prompt(`Corregir posición ${c.posicion}\nNuevo peso real de la cinta en kg (báscula) [actual ${c.peso_cinta_kg}]:`, String(c.peso_cinta_kg));
    if (pesoStr == null) return;
    const anchoStr = window.prompt(`Nuevo ancho útil [actual ${c.ancho_util}]:`, String(c.ancho_util));
    if (anchoStr == null) return;
    const unionesStr = window.prompt(`Nuevas uniones [actual ${c.uniones}]:`, String(c.uniones));
    if (unionesStr == null) return;
    const obs = window.prompt(`Observaciones (opcional):`, c.observaciones ?? "") ?? "";
    const motivo = window.prompt("Motivo de la corrección (mínimo 5 caracteres):") ?? "";
    if (motivo.trim().length < 5) { toast.error("Motivo requerido."); return; }
    const peso = Number(pesoStr), ancho = Number(anchoStr), uniones = Number(unionesStr);
    if (!(peso > 0) || !(ancho > 0) || !(uniones >= 0)) { toast.error("Valores inválidos."); return; }
    if (!window.confirm(`Confirme el peso registrado: ${peso} kg`)) return;
    try {
      await corregir({ data: {
        cinta_id: c.id, peso_cinta_kg: peso, ancho_util: ancho, uniones,
        observaciones: obs.trim() || null, motivo: motivo.trim(), idempotency_key: uuid(),
      }});
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      toast.success(`Posición ${c.posicion} corregida.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al corregir la cinta.");
    }
  }

  async function onCambiarOperativos() {
    if (!lote) return;
    const conductores = conductoresQ.data ?? [];
    const bobinadoras = bobinadorasQ.data ?? [];
    if (conductores.length === 0 || bobinadoras.length === 0) {
      toast.error("Catálogos no disponibles."); return;
    }
    const listaC = conductores.map((c, i) => `${i + 1}. ${c.nombre}`).join("\n");
    const idxCStr = window.prompt(`Nuevo conductor (actual: ${lote.conductor_nombre_snapshot})\n${listaC}\n\nIngrese número:`);
    if (idxCStr == null) return;
    const idxC = Number(idxCStr) - 1;
    if (!conductores[idxC]) { toast.error("Selección inválida."); return; }
    const listaB = bobinadoras.map((b, i) => `${i + 1}. ${b.nombre}`).join("\n");
    const idxBStr = window.prompt(`Nueva bobinadora (actual: ${lote.bobinadora_nombre_snapshot})\n${listaB}\n\nIngrese número:`);
    if (idxBStr == null) return;
    const idxB = Number(idxBStr) - 1;
    if (!bobinadoras[idxB]) { toast.error("Selección inválida."); return; }
    const motivo = window.prompt("Motivo del cambio (mínimo 5 caracteres):") ?? "";
    if (motivo.trim().length < 5) { toast.error("Motivo requerido."); return; }
    try {
      await actualizarOp({ data: {
        lote_id: lote.id,
        conductor_id: conductores[idxC].id,
        bobinadora_id: bobinadoras[idxB].id,
        motivo: motivo.trim(),
      }});
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      toast.success("Datos operativos actualizados. Las impresiones futuras usarán los nuevos datos.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar datos operativos.");
    }
  }

  async function onFinalizar() {
    if (!lote) return;
    if (!window.confirm(`¿Finalizar rollo? El peso pendiente (${n(pendiente)} kg) se registrará como merma real.`)) return;
    try {
      await finalizar({ data: { lote_id: lote.id } });
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      toast.success("Rollo finalizado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al finalizar.");
    }
  }

  async function onReabrir() {
    if (!lote) return;
    if (cintas.length >= 20) { toast.error("El lote ya tiene el máximo de 20 cintas."); return; }
    const motivo = window.prompt("Motivo para agregar cintas al rollo finalizado (mínimo 5 caracteres):") ?? "";
    if (motivo.trim().length < 5) { toast.error("Motivo requerido."); return; }
    try {
      await reabrir({ data: { lote_id: lote.id, motivo: motivo.trim() } });
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      toast.success("Rollo reabierto. Puede registrar cintas adicionales.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al reabrir el rollo.");
    }
  }

  const [imprimiendo, setImprimiendo] = useState(false);

  async function ejecutarImpresion(motivo: string | null) {
    if (!lote) return;
    setImprimiendo(true);
    try {
      const res = await preparar({ data: { lote_id: lote.id, motivo } });
      abrirImpresionEtiquetas(res.snapshot as EtiquetaSnapshot);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al preparar impresión.");
    } finally {
      setImprimiendo(false);
    }
  }

  function onImprimir() {
    if (!lote || cintas.length === 0 || imprimiendo) return;
    void ejecutarImpresion(lote.estado === "finalizado" ? "Reimpresión de etiquetas desde módulo de cintas" : null);
  }



  return (
    <div className="w-full space-y-4 p-4">
      {/* Buscador */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Rollo de origen</div>
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 font-mono text-lg"
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

        {manualOpen && (
          <div className="mt-3 rounded-lg border-2 border-primary bg-primary/5 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              Captura manual · rollo no encontrado
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">N.º de rollo</label>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                  placeholder="Ej. 10057-4"
                  maxLength={64}
                  value={manualRollo}
                  onChange={(e) => setManualRollo(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Peso del rollo (kg) · máx. 3000</label>
                <input
                  type="number" inputMode="decimal" step="0.01" min="0" max="3000"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={manualPeso}
                  onChange={(e) => setManualPeso(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={onUsarManual}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        )}
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
            <Field label="Peso neto del rollo de origen" value={`${n(contexto.pesaje.peso_neto_kg)} kg`} highlight />
            <Field label="Analista" value={contexto.muestra.analista ?? "—"} />
            <Field label="Supervisor" value={contexto.muestra.jefe_maquina ?? "—"} />
            <Field label="Operador" value={contexto.muestra.operador ?? "—"} />
          </div>
        </div>
      )}

      {/* Contexto manual: solo etiquetas, sin datos no disponibles */}
      {manual && !contexto && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Datos capturados manualmente</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
            <Field label="N.º Rollo" value={manual.rollo} />
            <Field label="Fabricación" value="" />
            <Field label="Producto" value="" />
            <Field label="Turno" value="" />
            <Field label="Peso del rollo de origen" value={`${n(manual.peso)} kg`} highlight />
            <Field label="Analista" value="" />
            <Field label="Supervisor" value="" />
            <Field label="Operador" value="" />
          </div>
        </div>
      )}

      {/* Conductor / bobinadora */}
      {manual && !lote && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Conductor y bobinadora</div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Conductor" value="" />
            <Field label="Bobinadora" value="" />
            <div className="flex items-end">
              <button
                onClick={onCrearLote}
                disabled={saving}
                className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Iniciando…" : "Iniciar lote"}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <Card k="Neto rollo de origen" v={`${n(netoBM)} kg`} />
            <Card k="Cintas registradas" v={`${cintas.length} / 20`} />
            <Card k="Peso acumulado" v={`${n(totalCintas)} kg`} />
            <Card k={merma == null ? "Peso pendiente" : "Merma real"} v={`${n(merma == null ? pendiente : merma)} kg`} highlight={merma != null} />
            <Card k="% merma real" v={mermaPct == null ? "—" : `${n(mermaPct, 2)} %`} />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Lote</div>
                <div className="font-medium">Conductor: <span className="text-foreground">{lote.conductor_nombre_snapshot}</span> · Bobinadora: <span className="text-foreground">{lote.bobinadora_nombre_snapshot}</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {puedeCambiarOperativos && lote.estado === "abierto" && (
                  <button
                    onClick={onCambiarOperativos}
                    className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning hover:bg-warning/20"
                  >
                    <UserCog className="h-4 w-4" /> Cambiar conductor/bobinadora
                  </button>
                )}
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
                  <>
                    {cintas.length < 20 && (
                      <button
                        onClick={onReabrir}
                        className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                      >
                        <Unlock className="h-4 w-4" /> Agregar cintas
                      </button>
                    )}
                    <span className="flex items-center gap-1 rounded-md bg-success/15 px-3 py-2 text-sm font-medium text-success">
                      <Lock className="h-4 w-4" /> Finalizado
                    </span>
                  </>
                )}

              </div>
            </div>

            {/* Grid de 20 posiciones */}
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((pos) => {
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
                    onCorregir={c && lote.estado === "abierto" ? () => onCorregir(c) : undefined}
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
      <div className={`min-h-5 text-sm ${highlight ? "text-base font-bold text-primary" : "font-medium text-foreground"}`}>{value}</div>
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
  onCorregir?: () => void;
  saving: boolean;
};

function CintaCard({ pos, cinta, habilitada, disponibleKg, onRegistrar, onAnular, onCorregir, saving }: CintaCardProps) {
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
        <div className="mt-2 flex items-center gap-3">
          {onCorregir && (
            <button
              onClick={onCorregir}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Pencil className="h-3 w-3" /> Corregir
            </button>
          )}
          {onAnular && (
            <button
              onClick={onAnular}
              className="flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Ban className="h-3 w-3" /> Anular
            </button>
          )}
        </div>
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
          <label className="mb-0.5 block text-[11px] text-muted-foreground">Peso real de la cinta (kg) · disp. {n(disponibleKg)}</label>
          <input
            type="number" inputMode="decimal" step="0.001"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <p className="mt-0.5 text-[10px] text-muted-foreground">Capture el peso indicado por la báscula.</p>
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
          onClick={() => {
            const p = Number(peso);
            if (!(p > 0)) return;
            if (!window.confirm(`Confirme el peso registrado: ${p} kg\n\nAceptar para guardar · Cancelar para corregir.`)) return;
            void onRegistrar(p, Number(uniones || 0), Number(ancho), obs.trim());
          }}
          disabled={saving || !peso || !ancho}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar y generar etiqueta"}
        </button>
      </div>
    </div>
  );
}
