import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Printer, CheckCircle2, Ban, Lock, Pencil, UserCog } from "lucide-react";
import {
  buscarContextoRollo, listConductores, listBobinadoras,
  crearLote, crearLoteManualV2, guardarOrdenManual, obtenerLoteYCintas, registrarCinta, corregirCinta, anularCinta,
  finalizarLote, prepararImpresion, actualizarDatosOperativos, asignarBobinadoraLote,
  asignarBobinadorNombre, asignarNombresOperativos, asignarEstatusCinta,
  bajadasRollo, cerrarRolloDefinitivo,
  type ContextoRollo, type CintaRegistrada, type LoteCintas,
} from "@/lib/pesaje-cintas.functions";


import { abrirImpresionEtiquetas, type EtiquetaSnapshot } from "@/lib/etiqueta-cinta";
import { supabase } from "@/integrations/supabase/client";
import { usePlantasPermitidas, usePlantaActivaCodigo } from "@/hooks/usePlantasPermitidas";
import { UltimosLotesCintas } from "@/components/cintas/UltimosLotesCintas";

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
  const crearManualV2 = useServerFn(crearLoteManualV2);
  const guardarOrden = useServerFn(guardarOrdenManual);
  const traer = useServerFn(obtenerLoteYCintas);
  const registrar = useServerFn(registrarCinta);
  const corregir = useServerFn(corregirCinta);
  const setEstatusCinta = useServerFn(asignarEstatusCinta);
  const anular = useServerFn(anularCinta);
  const finalizar = useServerFn(finalizarLote);
  const preparar = useServerFn(prepararImpresion);
  const actualizarOp = useServerFn(actualizarDatosOperativos);
  const asignarBobinadora = useServerFn(asignarBobinadoraLote);
  const asignarBobinador = useServerFn(asignarBobinadorNombre);
  const asignarNombresOp = useServerFn(asignarNombresOperativos);
  const traerBajadas = useServerFn(bajadasRollo);
  const cerrarRollo = useServerFn(cerrarRolloDefinitivo);



  const [rolMe, setRolMe] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: sess }) => {
      const user = sess.session?.user;
      if (!user) return;
      setAuthReady(true);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const list = (roles ?? []).map((r) => r.role as string);
      if (list.includes("administrador")) setRolMe("administrador");
      else if (list.includes("calidad")) setRolMe("calidad");
      else if (list.includes("gerente_general")) setRolMe("gerente_general");
      else setRolMe(list[0] ?? null);
    });
  }, []);

  const puedeCambiarOperativos = rolMe === "administrador" || rolMe === "calidad" || rolMe === "gerente_general";

  const [rolloInput, setRolloInput] = useState("");
  // Rollo consultado (identidad de la entidad ancla `rollos_cintas`).
  const [rolloActual, setRolloActual] = useState<string | null>(null);

  const [contexto, setContexto] = useState<ContextoRollo | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [conductorId, setConductorId] = useState<string>("");
  const [bobinadoraId, setBobinadoraId] = useState<string>("");
  const [bobinadorNombre, setBobinadorNombre] = useState<string>("");
  // Ixtapaluca: conductor y máquina se capturan como texto libre (máx. 20)
  const [conductorNombre, setConductorNombre] = useState<string>("");
  const [maquinaNombre, setMaquinaNombre] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRollo, setManualRollo] = useState("");
  const [manualPeso, setManualPeso] = useState("");
  const [manualDiametro, setManualDiametro] = useState("");
  const [manualUniones, setManualUniones] = useState("0");
  const [manualOrden, setManualOrden] = useState("");
  const [manualBobinadoraId, setManualBobinadoraId] = useState("");
  const [ordenSistema, setOrdenSistema] = useState("");
  const [confirmManual, setConfirmManual] = useState(false);
  const requestGuard = useRef(false);

  const traerConductores = useServerFn(listConductores);
  const traerBobinadoras = useServerFn(listBobinadoras);

  const conductoresQ = useQuery({
    queryKey: ["cintas-conductores"],
    queryFn: () => traerConductores(),
    enabled: authReady,
  });
  const bobinadorasQ = useQuery({
    queryKey: ["cintas-bobinadoras"],
    queryFn: () => traerBobinadoras(),
    enabled: authReady,
  });

  // Ixtapaluca usa su propio grupo de máquinas (JG01/JG02/RB01/RB02).
  const { data: plantasPermitidas } = usePlantasPermitidas();
  const plantaActiva = usePlantaActivaCodigo();
  const esIxtapaluca =
    plantaActiva === "IXT" ||
    ((plantasPermitidas ?? []).length > 0 &&
      (plantasPermitidas ?? []).every((p) => p.codigo?.toUpperCase() === "IXT"));
  const CODIGOS_IXT = ["JG01", "JG02", "RB01", "RB02"];
  const bobinadorasVisibles = useMemo(() => {
    const todas = bobinadorasQ.data ?? [];
    return esIxtapaluca
      ? todas.filter((b) => CODIGOS_IXT.includes((b.codigo ?? "").toUpperCase()))
      : todas.filter((b) => !CODIGOS_IXT.includes((b.codigo ?? "").toUpperCase()));
  }, [bobinadorasQ.data, esIxtapaluca]);

  const loteQ = useQuery({
    queryKey: ["cintas-lote", loteId],
    queryFn: () => (loteId ? traer({ data: { lote_id: loteId } }) : Promise.resolve({ lote: null, cintas: [] })),
    enabled: !!loteId,
    refetchOnWindowFocus: false,
  });

  // Bajadas del rollo (entidad ancla). Solo lectura, aditivo.
  const bajadasQ = useQuery({
    queryKey: ["cintas-bajadas", rolloActual],
    queryFn: () =>
      rolloActual ? traerBajadas({ data: { numero_rollo: rolloActual } }) : Promise.resolve(null),
    enabled: !!rolloActual && authReady,
    refetchOnWindowFocus: false,
  });
  const rolloInfo = bajadasQ.data ?? null;

  async function refrescarBajadas() {
    await qc.invalidateQueries({ queryKey: ["cintas-bajadas", rolloActual] });
  }



  const lote: LoteCintas | null = loteQ.data?.lote ?? null;
  const todasCintas: CintaRegistrada[] = loteQ.data?.cintas ?? [];
  const cintas: CintaRegistrada[] = todasCintas.filter((c) => c.estado === "registrada");
  
  // Total de uniones = suma de uniones de las cintas vigentes ('registrada').
  const totalUnionesCintas = cintas.reduce((acc, c) => acc + (c.uniones ?? 0), 0);

  const origenManual = (() => {
    const snap = lote?.datos_calidad_snapshot as
      | { datos_origen?: { origen?: string; diametro_origen_cm?: number | null; uniones_origen?: number | null; diametro_cm?: number | null; uniones?: number | null } }
      | null
      | undefined;
    const o = snap && typeof snap === "object" ? snap.datos_origen : null;
    return {
      diametro: o?.diametro_origen_cm ?? o?.diametro_cm ?? null,
      uniones: o?.uniones_origen ?? o?.uniones ?? null,
      origen: (o?.origen as string | undefined) ?? (lote?.es_manual ? "captura_manual" : "sistema"),
    };
  })();


  async function onBuscar() {
    const rollo = rolloInput.trim();
    if (!rollo) { toast.error("Ingrese un número de rollo."); return; }
    setBuscando(true);
    setContexto(null); setLoteId(null); setManualOpen(false);
    setRolloActual(rollo.toUpperCase());
    try {
      const ctx = await buscar({ data: { numero_rollo: rollo } });
      if (!ctx) {
        activarManual(rollo);
        return;
      }
      setContexto(ctx);
      const dup = ctx.datos_origen;
      if (dup && (dup.diametro_duplicados > 1 || dup.uniones_duplicados > 1)) {
        console.warn("[pesaje-cintas] Mediciones duplicadas para el rollo", rollo, {
          diametro_duplicados: dup.diametro_duplicados,
          uniones_duplicados: dup.uniones_duplicados,
          diametro_medicion_id: dup.diametro_medicion_id,
          uniones_medicion_id: dup.uniones_medicion_id,
        });
      }
      if (ctx.lote) {
        setLoteId(ctx.lote.id);
        setConductorId(ctx.lote.conductor_id ?? "");
        setBobinadoraId(ctx.lote.bobinadora_id);
        if (ctx.lote.estado === "finalizado") {
          toast.info(
            `Bajada ${ctx.lote.numero_bajada ?? 1} finalizada (${ctx.lote.cantidad_cintas} cintas). Consulte o inicie una nueva bajada.`,
          );
        } else {
          toast.info(`Bajada ${ctx.lote.numero_bajada ?? 1} abierta: se continúa la captura.`);
        }
      }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al buscar el rollo.";
      if (msg.toLowerCase().includes("rollo no encontrado") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no encontrado")) {
        activarManual(rollo);
      } else {
        toast.error(msg);
      }
    } finally {
      void refrescarBajadas();
      setBuscando(false);
    }
  }

  function activarManual(rollo: string) {
    setContexto(null);
    setLoteId(null);
    setManualRollo(rollo);
    setManualPeso("");
    setManualDiametro("");
    setManualUniones("0");
    setManualOrden("");
    setManualBobinadoraId("");
    setManualOpen(true);
    toast.info("Rollo no encontrado en la base de datos. Capture los datos mínimos del rollo de origen para continuar.");
  }

  /** Inicia una nueva bajada sobre el rollo consultado (no toca las anteriores). */
  function onIniciarNuevaBajada() {
    if (!rolloInfo?.puede_nueva_bajada) return;
    setLoteId(null);
    if (contexto) {
      toast.info(`Capture los datos operativos para la Bajada ${rolloInfo.total_bajadas + 1}.`);
    } else {
      activarManual(rolloActual ?? rolloInput.trim());
    }
  }

  async function onCerrarRolloDefinitivo() {
    if (!rolloActual) return;
    const motivo = window.prompt(
      `Cerrar definitivamente el rollo ${rolloActual}.\nNo se podrán iniciar más bajadas.\n\nMotivo (mínimo 5 caracteres):`,
    );
    if (!motivo || motivo.trim().length < 5) return;
    try {
      await cerrarRollo({ data: { numero_rollo: rolloActual, motivo: motivo.trim() } });
      await refrescarBajadas();
      toast.success("Rollo cerrado definitivamente.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cerrar el rollo.");
    }
  }



  function validarManual(): { peso: number; diametro: number; uniones: number } | null {
    const peso = Number(manualPeso);
    const diametro = Number(manualDiametro);
    const uniones = Number(manualUniones);
    if (!manualRollo.trim()) { toast.error("Capture el número de rollo."); return null; }
    if (!(peso > 0) || peso > 3000) { toast.error("Capture el peso neto del rollo."); return null; }
    if (!(diametro > 0)) { toast.error("Capture el diámetro del rollo."); return null; }
    if (!Number.isInteger(uniones) || uniones < 0) {
      toast.error("Las uniones deben ser un número entero igual o mayor que cero.");
      return null;
    }
    if (esIxtapaluca && maquinaNombre.trim().length < 2) { toast.error("Capture la máquina."); return null; }
    if (esIxtapaluca && bobinadorNombre.trim().length < 3) { toast.error("Capture el nombre del bobinador."); return null; }
    return { peso, diametro, uniones };
  }

  function onSolicitarLoteManual() {
    if (!validarManual()) return;
    setConfirmManual(true);
  }

  async function onCrearLoteManual() {
    const v = validarManual();
    if (!v) return;
    if (requestGuard.current) return;
    requestGuard.current = true;
    setSaving(true);
    try {
      // Segunda verificación: el rollo pudo darse de alta durante la captura
      const ctx = await buscar({ data: { numero_rollo: manualRollo.trim() } }).catch(() => null);
      if (ctx) {
        setConfirmManual(false);
        setManualOpen(false);
        setContexto(ctx);
        if (ctx.lote) setLoteId(ctx.lote.id);
        toast.info("El rollo fue localizado durante la validación. Se utilizarán los datos del sistema.");
        return;
      }
      const { lote_id } = await crearManualV2({
        data: {
          numero_rollo: manualRollo.trim(),
          peso_neto_kg: v.peso,
          diametro_cm: v.diametro,
          uniones: v.uniones,
          orden_manual: manualOrden.trim() || null,
          idempotency_key: uuid(),
        },
      });
      if (esIxtapaluca && bobinadorNombre.trim()) {
        await asignarBobinador({ data: { lote_id, nombre: bobinadorNombre.trim() } }).catch(() => {
          toast.warning("El lote se creó, pero no se pudo registrar el nombre del bobinador.");
        });
      }
      if (esIxtapaluca) {
        await asignarNombresOp({
          data: {
            lote_id,
            conductor: conductorNombre.trim().slice(0, 20),
            maquina: maquinaNombre.trim().slice(0, 20),
          },
        }).catch(() => {
          toast.warning("El lote se creó, pero no se pudieron registrar conductor y máquina.");
        });
      }

      setConfirmManual(false);
      setLoteId(lote_id);
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote_id] });
      await refrescarBajadas();
      toast.success("Bajada iniciada (captura manual).");

    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al crear el lote manual.");
    } finally {
      requestGuard.current = false;
      setSaving(false);
    }
  }

  async function onCrearLote() {
    if (!contexto) return;
    // Ixtapaluca: conductor y máquina son texto libre; se usan referencias base
    // del catálogo solo para satisfacer el registro y luego se guardan los nombres.
    const condRef = esIxtapaluca ? (conductoresQ.data ?? [])[0]?.id ?? "" : conductorId;
    const bobRef = esIxtapaluca ? bobinadorasVisibles[0]?.id ?? "" : bobinadoraId;
    if (esIxtapaluca) {
      if (conductorNombre.trim().length < 3) { toast.error("Capture el nombre del conductor."); return; }
      if (maquinaNombre.trim().length < 2) { toast.error("Capture la máquina."); return; }
      if (!condRef || !bobRef) { toast.error("No fue posible iniciar el lote. Intente de nuevo."); return; }
    } else if (!conductorId || !bobinadoraId) {
      toast.error("Seleccione conductor y bobinadora."); return;
    }
    if (esIxtapaluca && bobinadorNombre.trim().length < 3) { toast.error("Capture el nombre del bobinador."); return; }
    if (requestGuard.current) return;
    requestGuard.current = true;
    setSaving(true);
    try {
      const { lote_id } = await crear({
        data: {
          numero_rollo: contexto.muestra.numero_rollo,
          conductor_id: condRef,
          bobinadora_id: bobRef,
          idempotency_key: uuid(),
        },
      });
      if (esIxtapaluca) {
        await asignarNombresOp({
          data: { lote_id, conductor: conductorNombre.trim().slice(0, 20), maquina: maquinaNombre.trim().slice(0, 20) },
        }).catch(() => {
          toast.warning("El lote se creó, pero no se pudieron registrar conductor y máquina.");
        });
      }
      if (esIxtapaluca && bobinadorNombre.trim()) {
        await asignarBobinador({ data: { lote_id, nombre: bobinadorNombre.trim() } }).catch(() => {
          toast.warning("El lote se creó, pero no se pudo registrar el nombre del bobinador.");
        });
      }
      if (ordenSistema.trim()) {
        await guardarOrden({ data: { lote_id, orden: ordenSistema.trim() } }).catch(() => null);
      }
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
  const pesoMermasGuardado = lote?.peso_mermas_kg ?? lote?.merma_real_kg ?? null;
  // Componentes auxiliares de captura (SOLO estado local, nunca se persisten)
  const [mermaCapa, setMermaCapa] = useState("");
  const [mermaProceso, setMermaProceso] = useState("");
  const [mermaGallo, setMermaGallo] = useState("");

  const parseComp = (v: string) => {
    if (!v.trim()) return 0;
    const x = Number(v.replace(",", "."));
    return Number.isFinite(x) ? x : NaN;
  };
  const compCapa = parseComp(mermaCapa);
  const compProceso = parseComp(mermaProceso);
  const compGallo = parseComp(mermaGallo);
  const compsValidos =
    Number.isFinite(compCapa) && Number.isFinite(compProceso) && Number.isFinite(compGallo) &&
    compCapa >= 0 && compProceso >= 0 && compGallo >= 0;
  const hayCaptura = Boolean(mermaCapa.trim() || mermaProceso.trim() || mermaGallo.trim());
  const mermaPorPesoKg = compsValidos ? Math.round((compCapa + compProceso + compGallo) * 100) / 100 : NaN;
  const mermaPorPesoPct = netoBM > 0 && Number.isFinite(mermaPorPesoKg) ? (mermaPorPesoKg / netoBM) * 100 : null;

  const MAX_CINTAS_BAJADA = 50;
  const MAX_POSICION = 350;
  const numeroBajada = lote?.numero_bajada ?? 1;

  // Posición continua por rollo (no reinicia entre bajadas).
  const siguientePos = useMemo(() => {
    if (!lote || lote.estado !== "abierto") return 0;
    if (cintas.length >= MAX_CINTAS_BAJADA) return 0;
    const maxLocal = cintas.reduce((m, c) => Math.max(m, c.posicion), 0);
    const maxGlobal = Math.max(maxLocal, rolloInfo?.ultima_posicion ?? 0);
    const next = maxGlobal + 1;
    return next > MAX_POSICION ? 0 : next;
  }, [lote, cintas, rolloInfo?.ultima_posicion]);

  async function onRegistrar(peso: number, uniones: number, ancho: number, obs: string, pza: string) {
    if (!lote) return;
    if (requestGuard.current) return;
    if (peso <= 0 || ancho <= 0 || uniones < 0) { toast.error("Valores inválidos."); return; }
    if (!pza.trim() || pza.trim().length > 10) {
      toast.error("Capture el Lote Logístico pza. (máximo 10 caracteres).");
      return;
    }
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
          lote_logistico_pza: pza.trim(),
          idempotency_key: uuid(),
        },
      });
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      await refrescarBajadas();
      toast.success(`Cinta registrada.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al registrar la cinta.");
    } finally {
      requestGuard.current = false;
      setSaving(false);
    }
  }


  // Estatus de liberación por cinta (Ixtapaluca): hereda el del rollo y el
  // usuario puede cambiarlo según cómo salga el corte.
  async function onCambiarEstatusCinta(cintaId: string, estatus: "L" | "C" | "NC") {
    try {
      await setEstatusCinta({ data: { cinta_id: cintaId, estatus } });
      await qc.invalidateQueries({ queryKey: ["cintas-lote", loteId] });
      toast.success("Estatus de la cinta actualizado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar el estatus.");
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
    const bobinadoras = bobinadorasVisibles;
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
    if (!hayCaptura || !compsValidos || !Number.isFinite(mermaPorPesoKg) || mermaPorPesoKg < 0) {
      toast.error("Capture Merma Capa, Merma Proceso y Merma Gallo (valores numéricos ≥ 0).");
      return;
    }
    const real = mermaPorPesoKg;
    if (real > netoBM) { toast.error("El Peso de Mermas no puede superar el peso neto del rollo de origen."); return; }
    if (!window.confirm(
      `Peso de Mermas calculado: ${n(real)} kg.\n\n` +
      `Este total corresponde a la suma de Merma Capa, Merma Proceso y Merma Gallo. ` +
      `En el sistema se guardará únicamente el total.`,
    )) return;
    try {
      await finalizar({ data: { lote_id: lote.id, peso_mermas_kg: real } });
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      await refrescarBajadas();
      toast.success(`Bajada ${numeroBajada} finalizada.`);

    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al finalizar.");
    }
  }

  const [imprimiendo, setImprimiendo] = useState(false);

  async function ejecutarImpresion(motivo: string | null, cintaId: string | null) {
    if (!lote) return;
    setImprimiendo(true);
    try {
      // Los datos de pesaje no viajan por Realtime: refrescamos antes de imprimir.
      await qc.invalidateQueries({ queryKey: ["cintas-lote", lote.id] });
      await loteQ.refetch();
      const res = await preparar({ data: { lote_id: lote.id, motivo, cinta_id: cintaId } });
      const vigentes = (loteQ.data?.cintas ?? cintas) as CintaRegistrada[];
      const snap = res.snapshot as unknown as EtiquetaSnapshot;
      snap.cintas = (snap.cintas ?? []).map((c) => ({
        ...c,
        estatus_liberacion: vigentes.find((v) => v.id === c.id)?.estatus_liberacion ?? null,
      }));
      await abrirImpresionEtiquetas(snap);
      toast.success(
        `${res.tipo === "REIMPRESION" ? "Reimpresión" : "Impresión"} ${res.folio} · ${res.cantidad_etiquetas} etiqueta(s) · versión ${res.version_etiqueta}`,
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al preparar impresión.");
    } finally {
      setImprimiendo(false);
    }
  }

  function onImprimir() {
    if (!lote || cintas.length === 0 || imprimiendo) return;
    void ejecutarImpresion(null, null);
  }

  function onReimprimirCinta(c: CintaRegistrada) {
    if (!lote || imprimiendo) return;
    if (c.estado !== "registrada") {
      toast.error("La cinta no está vigente: no puede reimprimirse.");
      return;
    }
    void ejecutarImpresion(null, c.id);
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
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            Rollo no encontrado en la base de datos. Capture los datos mínimos del rollo de origen para continuar.
          </div>
        )}
      </div>

      {/* Contexto recuperado del sistema */}
      {contexto && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Datos recuperados del sistema</span>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">Recuperado del sistema</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
            <Field label="N.º Rollo" value={contexto.muestra.numero_rollo} />
            <Field label="Fabricación" value={contexto.muestra.fabricacion || "—"} />
            <Field label="Producto" value={contexto.muestra.producto_nombre ?? contexto.muestra.producto_codigo ?? "—"} />
            <Field label="Turno" value={contexto.muestra.turno} />
            <Field
              label="Peso neto del rollo de origen"
              value={`${n(contexto.pesaje.peso_neto_kg)} kg`}
              hint="Origen: Pesaje de Rollo"
              highlight
            />
            <Field
              label="Diámetro del rollo de origen"
              value={contexto.datos_origen?.diametro_cm == null ? "—" : `${n(contexto.datos_origen.diametro_cm)} cm`}
              hint={contexto.datos_origen?.diametro_cm == null ? undefined : "Origen: Control de Calidad"}
            />
            <Field
              label="Uniones del rollo de origen"
              value={contexto.datos_origen?.uniones == null ? "—" : String(contexto.datos_origen.uniones)}
              hint={contexto.datos_origen?.uniones == null ? undefined : "Origen: Control de Calidad"}
            />
            <Field label="Analista" value={contexto.muestra.analista ?? "—"} />
            <Field label="Supervisor" value={contexto.muestra.jefe_maquina ?? "—"} />
            <Field label="Operador" value={contexto.muestra.operador ?? "—"} />
            {lote ? (
              <Field label="Orden de Producción" value={lote.numero_orden || "—"} />
            ) : (
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Orden de Producción (opcional)</label>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={64}
                  value={ordenSistema}
                  onChange={(e) => setOrdenSistema(e.target.value)}
                  placeholder="Captura manual"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Captura manual del rollo de origen */}
      {manualOpen && !contexto && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Datos capturados manualmente</span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">Captura manual</span>
          </div>

          {lote ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
              <Field label="N.º Rollo" value={lote.numero_rollo} />
              <Field label="Orden de Producción" value={lote.numero_orden || "—"} />
              <Field label="Peso neto del rollo de origen" value={`${n(lote.peso_bobina_madre_neto_kg)} kg`} highlight />
              <Field label="Diámetro del rollo de origen" value={origenManual.diametro == null ? "—" : `${n(origenManual.diametro)} cm`} />
              <Field label="Uniones del rollo de origen" value={origenManual.uniones == null ? "—" : String(origenManual.uniones)} />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">N.º de rollo</label>
                  <input
                    readOnly
                    className="w-full rounded-md border border-input bg-muted px-3 py-2 font-mono text-sm"
                    value={manualRollo}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Orden de Producción (opcional)</label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    maxLength={64}
                    value={manualOrden}
                    onChange={(e) => setManualOrden(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Peso neto (kg) *</label>
                  <input
                    type="number" inputMode="decimal" step="0.01" min="0" max="3000"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={manualPeso}
                    onChange={(e) => setManualPeso(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Diámetro (cm) *</label>
                  <input
                    type="number" inputMode="decimal" step="0.01" min="0"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={manualDiametro}
                    onChange={(e) => setManualDiametro(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Uniones *</label>
                  <input
                    type="number" inputMode="numeric" step="1" min="0"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={manualUniones}
                    onChange={(e) => setManualUniones(e.target.value)}
                  />
                </div>
                {esIxtapaluca && (
                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Conductor *</label>
                    <input
                      type="text"
                      maxLength={20}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Nombre (máx. 20)"
                      value={conductorNombre}
                      onChange={(e) => setConductorNombre(e.target.value)}
                    />
                  </div>
                )}
                {esIxtapaluca && (
                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Máquina *</label>
                    <input
                      type="text"
                      maxLength={20}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Máquina (máx. 20)"
                      value={maquinaNombre}
                      onChange={(e) => setMaquinaNombre(e.target.value)}
                    />
                  </div>
                )}
                {esIxtapaluca && (
                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Nombre del bobinador *</label>
                    <input
                      type="text"
                      maxLength={80}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Nombre completo"
                      value={bobinadorNombre}
                      onChange={(e) => setBobinadorNombre(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <button
                onClick={onSolicitarLoteManual}
                disabled={saving}
                className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Creando…" : "Crear lote manual y continuar"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Confirmación de lote manual */}
      {confirmManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
            <div className="mb-2 text-sm font-semibold text-foreground">Confirmar lote manual</div>
            <p className="text-sm text-muted-foreground">
              El rollo no fue localizado en la base de datos. Se creará un lote manual con el peso, diámetro y uniones
              capturados. Verifique que la información sea correcta.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmManual(false)}
                disabled={saving}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={onCrearLoteManual}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Creando…" : "Confirmar y continuar"}
              </button>
            </div>
          </div>
        </div>
      )}


      {contexto && !lote && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Conductor y {esIxtapaluca ? "máquina" : "bobinadora"}</div>
          <div className={esIxtapaluca ? "grid gap-3 md:grid-cols-4" : "grid gap-3 md:grid-cols-3"}>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Conductor</label>
              {esIxtapaluca ? (
                <input
                  type="text"
                  maxLength={20}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Nombre (máx. 20)"
                  value={conductorNombre}
                  onChange={(e) => setConductorNombre(e.target.value)}
                />
              ) : (
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
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{esIxtapaluca ? "Máquina" : "Bobinadora"}</label>
              {esIxtapaluca ? (
                <input
                  type="text"
                  maxLength={20}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Máquina (máx. 20)"
                  value={maquinaNombre}
                  onChange={(e) => setMaquinaNombre(e.target.value)}
                />
              ) : (
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={bobinadoraId}
                  onChange={(e) => setBobinadoraId(e.target.value)}
                >
                  <option value="">— seleccionar —</option>
                  {bobinadorasVisibles.map((b) => (
                    <option key={b.id} value={b.id}>{b.nombre}{b.codigo ? ` (${b.codigo})` : ""}</option>
                  ))}
                </select>
              )}
            </div>
            {esIxtapaluca && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Nombre del bobinador</label>
                <input
                  type="text"
                  maxLength={80}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Nombre completo"
                  value={bobinadorNombre}
                  onChange={(e) => setBobinadorNombre(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-end">
              <button
                onClick={onCrearLote}
                disabled={
                  saving ||
                  (esIxtapaluca
                    ? conductorNombre.trim().length < 3 || maquinaNombre.trim().length < 2 || bobinadorNombre.trim().length < 3
                    : !conductorId || !bobinadoraId)
                }
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
          <div className="grid gap-3 md:grid-cols-4">
            <Card k="Neto rollo de origen" v={`${n(netoBM)} kg`} />
            <Card k="Cintas registradas" v={`${cintas.length} / 20`} />
            <Card k="Peso acumulado" v={`${n(totalCintas)} kg`} />
            {lote.estado === "finalizado" ? (
              <Card
                k="PESO DE MERMAS"
                v={
                  pesoMermasGuardado == null
                    ? "No registrado"
                    : `${n(pesoMermasGuardado)} kg${netoBM > 0 ? ` · ${n((pesoMermasGuardado / netoBM) * 100, 2)} %` : ""}`
                }
                highlight
              />
            ) : (
              <Card
                k="PESO DE MERMAS"
                v={
                  hayCaptura && compsValidos
                    ? `${n(mermaPorPesoKg)} kg${mermaPorPesoPct == null ? "" : ` · ${n(mermaPorPesoPct, 2)} %`}`
                    : pesoMermasGuardado == null
                      ? "No registrado"
                      : `${n(pesoMermasGuardado)} kg (guardado)`
                }
                highlight
              />
            )}
          </div>

          {lote.estado === "abierto" && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Captura del Peso de Mermas (componentes temporales, no se guardan por separado)
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ["Merma Capa (kg)", mermaCapa, setMermaCapa],
                  ["Merma Proceso (kg)", mermaProceso, setMermaProceso],
                  ["Merma Gallo (kg)", mermaGallo, setMermaGallo],
                ] as const).map(([label, val, set]) => (
                  <div key={label}>
                    <div className="mb-1 text-xs text-muted-foreground">{label}</div>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 font-semibold"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm font-semibold">
                Peso de Mermas:{" "}
                {compsValidos ? `${n(mermaPorPesoKg)} kg` : <span className="text-destructive">valores inválidos</span>}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Obligatorio para finalizar el lote.</div>
            </div>
          )}


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
                  disabled={cintas.length === 0 || imprimiendo || lote.estado !== "finalizado"}
                  title={lote.estado !== "finalizado" ? "Finalice el rollo para imprimir etiquetas" : undefined}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" /> Imprimir etiquetas ({cintas.length})
                </button>


                {lote.estado === "abierto" && (
                  <button
                    onClick={onFinalizar}
                    disabled={cintas.length === 0 || !hayCaptura || !compsValidos}
                    title={!hayCaptura || !compsValidos ? "Capture Merma Capa, Proceso y Gallo" : undefined}
                    className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Finalizar rollo
                  </button>
                )}
                {lote.estado === "finalizado" && (
                  <span className="flex items-center gap-1 rounded-md bg-success/15 px-3 py-2 text-sm font-medium text-success">
                    <Lock className="h-4 w-4" /> Finalizado · solo consulta e impresión
                  </span>
                )}


              </div>
            </div>


            {/* Grid de 20 posiciones (en lote finalizado solo se muestran las registradas) */}
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 20 }, (_, i) => i + 1)
                .filter((pos) => lote.estado === "abierto" || cintas.some((x) => x.posicion === pos))
                .map((pos) => {
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
                    onAnular={c && lote.estado === "abierto" ? () => onAnular(c.id) : undefined}

                    onCorregir={c && lote.estado === "abierto" ? () => onCorregir(c) : undefined}
                    onReimprimir={c ? () => onReimprimirCinta(c) : undefined}
                    mostrarEstatus={true}
                    onCambiarEstatus={c ? (e) => onCambiarEstatusCinta(c.id, e) : undefined}
                    saving={saving || imprimiendo}
                  />
                );
              })}

            </div>
          </div>
        </>
      )}

      <UltimosLotesCintas planta={plantaActiva} />
    </div>
  );
}


function Field({ label, value, highlight, hint }: { label: string; value: string; highlight?: boolean; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`min-h-5 text-sm ${highlight ? "text-base font-bold text-primary" : "font-medium text-foreground"}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
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
  onReimprimir?: () => void;
  mostrarEstatus?: boolean;
  onCambiarEstatus?: (estatus: "L" | "C" | "NC") => void | Promise<void>;
  saving: boolean;
};

const ESTATUS_OPCIONES: Array<{ v: "L" | "C" | "NC"; label: string; clase: string }> = [
  { v: "L", label: "Liberado", clase: "border-success/50 bg-success/10 text-success" },
  { v: "C", label: "Condicionado", clase: "border-warning/50 bg-warning/10 text-warning" },
  { v: "NC", label: "No conforme", clase: "border-destructive/50 bg-destructive/10 text-destructive" },
];

function CintaCard({ pos, cinta, habilitada, disponibleKg, onRegistrar, onAnular, onCorregir, onReimprimir, mostrarEstatus, onCambiarEstatus, saving }: CintaCardProps) {
  const [peso, setPeso] = useState("");
  const [uniones, setUniones] = useState("0");
  const [ancho, setAncho] = useState("");
  const [obs, setObs] = useState("");
  const anchoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (habilitada) {
      setPeso(""); setUniones("0"); setAncho(""); setObs("");
      // Posicionar el cursor en Ancho útil para la siguiente captura.
      anchoRef.current?.focus();
    }
  }, [habilitada]);

  if (cinta) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-3">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs uppercase text-muted-foreground">Posición</div>
          <div className="text-2xl font-black text-success">{pos}</div>
        </div>
        <div className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">Ancho útil:</span> <b>{n(cinta.ancho_util, 3)} {cinta.ancho_util_unidad ?? "cm"}</b></div>
          <div><span className="text-muted-foreground">Peso:</span> <b>{n(cinta.peso_cinta_kg)} kg</b></div>
          <div><span className="text-muted-foreground">Uniones:</span> <b>{cinta.uniones}</b></div>
          {cinta.observaciones && <div className="text-xs text-muted-foreground">{cinta.observaciones}</div>}
          {mostrarEstatus && (
            <div className="pt-1">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Estatus de liberación</div>
              <select
                value={cinta.estatus_liberacion ?? ""}
                onChange={(e) => onCambiarEstatus?.(e.target.value as "L" | "C" | "NC")}
                disabled={!onCambiarEstatus || saving}
                className={`w-full rounded-md border px-2 py-1.5 text-sm font-semibold disabled:opacity-60 ${
                  ESTATUS_OPCIONES.find((o) => o.v === cinta.estatus_liberacion)?.clase ??
                  "border-input bg-background text-foreground"
                }`}
              >
                <option value="">Sin estatus</option>
                {ESTATUS_OPCIONES.map((o) => (
                  <option key={o.v} value={o.v}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
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
          {onReimprimir && (
            <button
              onClick={onReimprimir}
              disabled={saving}
              className="flex items-center gap-1 text-xs text-foreground hover:underline disabled:opacity-50"
            >
              <Printer className="h-3 w-3" /> Reimprimir
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
          <label className="mb-0.5 block text-[11px] text-muted-foreground">Ancho útil (cm) *</label>
          <input
            ref={anchoRef}
            type="number" inputMode="decimal" step="0.01"
            value={ancho}
            onChange={(e) => setAncho(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
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
        <div>
          <label className="mb-0.5 block text-[11px] text-muted-foreground">Uniones</label>
          <input
            type="number" inputMode="numeric" min="0" step="1"
            value={uniones}
            onChange={(e) => setUniones(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
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
