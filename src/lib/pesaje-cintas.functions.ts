// =============================================================================
// Pesaje de Cintas — server functions (wrappers de RPC SECURITY DEFINER)
// =============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------- Tipos de dominio ---------------------------- //

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type ContextoRollo = {
  muestra: {
    id: string;
    numero_rollo: string;
    fabricacion: string;
    producto_id: string;
    producto_codigo: string | null;
    producto_nombre: string | null;
    turno: string;
    jefe_maquina: string | null;
    operador: string | null;
    prensero: string | null;
    analista: string | null;
    capturado_at: string;
    observaciones: string;
    mediciones: Record<string, { valor: number; min: number; obj: number; max: number }>;
  };
  pesaje: {
    id: string;
    peso_neto_kg: number;
    fecha_hora_pesaje: string;
    orden_produccion_id: string | null;
    numero_orden: string | null;
    maquina_id: string;
    maquina_codigo: string;
  };
  datos_origen?: {
    peso_neto_kg: number | null;
    peso_origen: string | null;
    peso_pesaje_id: string | null;
    diametro_cm: number | null;
    diametro_medicion_id: string | null;
    diametro_origen: string | null;
    diametro_duplicados: number;
    uniones: number | null;
    uniones_medicion_id: string | null;
    uniones_origen: string | null;
    uniones_duplicados: number;
    muestra_id: string;
    recuperado_at: string;
  } | null;
  lote: null | {
    id: string;
    estado: "abierto" | "finalizado" | "anulado";
    /** N.º de bajada (los lotes históricos se leen como Bajada 1). */
    numero_bajada?: number | null;
    cantidad_cintas: number;
    peso_total_cintas_kg: number;
    peso_pendiente_kg: number;
    merma_kg: number | null;
    merma_porcentaje: number | null;
    conductor_id: string | null;
    conductor_nombre_snapshot: string;
    bobinadora_id: string;
    bobinadora_nombre_snapshot: string;
  };
  /** Estado de bajadas del rollo (aditivo). */
  rollo?: RolloBajadas | null;
};

/** Resumen de bajadas de un rollo (entidad ancla `rollos_cintas`). */
export type RolloBajadas = {
  numero_rollo: string;
  rollo_id: string | null;
  cerrado: boolean;
  cerrado_at: string | null;
  motivo_cierre: string | null;
  total_bajadas: number;
  lote_abierto_id: string | null;
  ultima_posicion: number;
  proxima_posicion: number;
  puede_nueva_bajada: boolean;
  bajadas: Array<{
    lote_id: string;
    numero_bajada: number;
    historica: boolean;
    estado: "abierto" | "finalizado" | "anulado";
    cantidad_cintas: number;
    peso_total_cintas_kg: number;
    peso_mermas_kg: number | null;
    es_manual: boolean;
    created_at: string;
    finalizado_at: string | null;
    posicion_min: number | null;
    posicion_max: number | null;
  }>;
};


export type CintaRegistrada = {
  id: string;
  lote_id: string;
  posicion: number;
  uniones: number;
  peso_cinta_kg: number;
  ancho_util: number;
  ancho_util_unidad: string | null;
  observaciones: string | null;
  estado: "registrada" | "sustituida" | "anulada";
  /** Estatus de liberación de la cinta: L (Liberado), C (Condicionado), NC (No conforme). */
  estatus_liberacion: "L" | "C" | "NC" | null;
  /** Lote Logístico pza. (por cinta, máx. 10 caracteres). Históricos: null. */
  lote_logistico_pza?: string | null;
  version_etiqueta: number | null;
  created_at: string;
};



export type LoteCintas = {
  id: string;
  numero_rollo: string;
  fabricacion: string;
  producto_codigo: string | null;
  producto_nombre: string | null;
  conductor_id: string | null;
  conductor_nombre_snapshot: string;
  bobinadora_id: string;
  bobinadora_nombre_snapshot: string;
  peso_bobina_madre_neto_kg: number;
  cantidad_cintas: number;
  peso_total_cintas_kg: number;
  peso_pendiente_kg: number;
  merma_kg: number | null;
  merma_porcentaje: number | null;
  merma_real_kg: number | null;
  /** Campo canónico vigente: Peso de Mermas (kg). */
  peso_mermas_kg: number | null;
  estado: "abierto" | "finalizado" | "anulado";
  /** N.º de bajada (histórico = null, se lee como Bajada 1). */
  numero_bajada?: number | null;
  es_manual: boolean;

  numero_orden: string | null;
  datos_calidad_snapshot: Json;
  fecha_produccion: string | null;
};

// ------------------------------ Catálogos --------------------------------- //

export const listConductores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("operarios")
      .select("id, nombre, puesto")
      .eq("activo", true)
      .order("nombre");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listBobinadoras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("catalogo_bobinadoras")
      .select("id, codigo, nombre")
      .eq("activo", true)
      .order("nombre");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// -------------------------------- Contexto -------------------------------- //

export const buscarContextoRollo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ numero_rollo: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }): Promise<ContextoRollo | null> => {
    const { data: res, error } = await context.supabase.rpc("buscar_contexto_rollo_cintas", {
      _numero_rollo: data.numero_rollo,
    });
    if (error) {
      const m = (error.message ?? "").toLowerCase();
      if (m.includes("no se encontró") || m.includes("no se encontro") || m.includes("not found")) {
        return null;
      }
      throw new Error(error.message);
    }
    const ctx = res as unknown as ContextoRollo | null;
    if (!ctx || !ctx.muestra?.id) return null;
    return ctx;
  });

// ---------------------------------- Lote ---------------------------------- //

export const crearLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    numero_rollo: z.string().trim().min(1),
    conductor_id: z.string().uuid(),
    bobinadora_id: z.string().uuid(),
    idempotency_key: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("crear_lote_pesaje_cintas", {
      _numero_rollo: data.numero_rollo,
      _conductor_id: (data.conductor_id ?? null) as unknown as string,
      _bobinadora_id: (data.bobinadora_id ?? null) as unknown as string,
      _idempotency: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return { lote_id: id as unknown as string };
  });

export const crearLoteManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    numero_rollo: z.string().trim().min(1).max(64),
    peso_neto_kg: z.number().positive().max(3000),
    conductor_id: z.string().uuid().nullable().optional(),
    bobinadora_id: z.string().uuid().nullable().optional(),
    idempotency_key: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("crear_lote_pesaje_cintas_manual", {
      _numero_rollo: data.numero_rollo,
      _peso_neto_kg: data.peso_neto_kg,
      _conductor_id: (data.conductor_id ?? null) as unknown as string,
      _bobinadora_id: (data.bobinadora_id ?? null) as unknown as string,
      _idempotency: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return { lote_id: id as unknown as string };
  });

export const crearLoteManualV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    numero_rollo: z.string().trim().min(1).max(64),
    peso_neto_kg: z.number().positive().max(3000),
    diametro_cm: z.number().positive().max(1000),
    uniones: z.number().int().min(0).max(999),
    orden_manual: z.string().trim().max(64).optional().nullable(),
    idempotency_key: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("crear_lote_pesaje_cintas_manual_v2", {
      _numero_rollo: data.numero_rollo,
      _peso_neto_kg: data.peso_neto_kg,
      _diametro_cm: data.diametro_cm,
      _uniones: data.uniones,
      _orden_manual: (data.orden_manual ?? "") as string,
      _idempotency: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return { lote_id: id as unknown as string };
  });

/**
 * Inicia una nueva bajada heredando TODOS los datos de la bajada anterior
 * del mismo rollo (peso, diámetro, uniones, orden, conductor, máquina/bobinadora
 * y nombre del bobinador). No vuelve a solicitar captura al usuario.
 */
export const iniciarBajadaHeredada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    numero_rollo: z.string().trim().min(1).max(64),
    idempotency_key: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const rolloNorm = data.numero_rollo.trim().toUpperCase();

    // Última bajada no anulada del rollo (fuente de los datos a heredar)
    const { data: previo, error: ePrev } = await context.supabase
      .from("pesajes_cintas_lotes")
      .select("*")
      .ilike("numero_rollo", rolloNorm)
      .neq("estado", "anulado")
      .order("numero_bajada", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ePrev) throw new Error(ePrev.message);
    if (!previo) throw new Error("No existe una bajada previa para heredar los datos.");
    const prev = previo as unknown as LoteCintas & { bobinador_nombre?: string | null };

    let loteId: string;
    if (prev.es_manual) {
      const snap = prev.datos_calidad_snapshot as {
        datos_origen?: { diametro_origen_cm?: number | null; diametro_cm?: number | null; uniones_origen?: number | null; uniones?: number | null };
      } | null;
      const o = snap?.datos_origen ?? {};
      const diametro = o.diametro_origen_cm ?? o.diametro_cm ?? null;
      const uniones = o.uniones_origen ?? o.uniones ?? null;
      if (!(diametro != null && diametro > 0) || uniones == null || uniones < 0) {
        throw new Error("La bajada anterior no tiene diámetro/uniones de origen; capture la bajada manualmente.");
      }
      const { data: id, error } = await rpc("crear_lote_pesaje_cintas_manual_v2", {
        _numero_rollo: rolloNorm,
        _peso_neto_kg: prev.peso_bobina_madre_neto_kg,
        _diametro_cm: diametro,
        _uniones: uniones,
        _orden_manual: prev.numero_orden ?? "",
        _idempotency: data.idempotency_key,
      });
      if (error) throw new Error(error.message);
      loteId = id as string;
    } else {
      if (!prev.bobinadora_id) throw new Error("La bajada anterior no tiene máquina/bobinadora registrada.");
      const { data: id, error } = await rpc("crear_lote_pesaje_cintas", {
        _numero_rollo: rolloNorm,
        _conductor_id: prev.conductor_id ?? null,
        _bobinadora_id: prev.bobinadora_id,
        _idempotency: data.idempotency_key,
      });
      if (error) throw new Error(error.message);
      loteId = id as string;
    }

    // Heredar nombres operativos (conductor, máquina y bobinador en texto)
    const limpio = (v: string | null | undefined) =>
      v && v.trim() && v.trim().toUpperCase() !== "SIN DATOS REGISTRADOS" ? v.trim() : "";
    const conductor = limpio(prev.conductor_nombre_snapshot);
    const maquina = limpio(prev.bobinadora_nombre_snapshot);
    if (conductor || maquina) {
      await rpc("pc_set_nombres_operativos", { _lote_id: loteId, _conductor: conductor, _maquina: maquina });
    }
    const bobinador = limpio(prev.bobinador_nombre ?? null);
    if (bobinador) {
      await rpc("pc_set_bobinador_nombre", { _lote_id: loteId, _nombre: bobinador });
    }

    return { lote_id: loteId };
  });

export const guardarOrdenManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    orden: z.string().trim().max(64),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("pc_set_orden_manual", {
      _lote_id: data.lote_id,
      _orden: data.orden,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const obtenerLoteYCintas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lote_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: lote, error: e1 }, { data: cintas, error: e2 }] = await Promise.all([
      context.supabase.from("pesajes_cintas_lotes").select("*").eq("id", data.lote_id).maybeSingle(),
      context.supabase.from("pesajes_cintas").select("*").eq("lote_id", data.lote_id).order("posicion"),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return { lote: lote as unknown as LoteCintas | null, cintas: (cintas ?? []) as unknown as CintaRegistrada[] };
  });

// --------------------------------- Cintas --------------------------------- //

export const registrarCinta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    uniones: z.number().int().min(0),
    peso_cinta_kg: z.number().positive(),
    ancho_util: z.number().positive(),
    observaciones: z.string().max(500).optional().nullable(),
    lote_logistico_pza: z.string().trim().min(1).max(10).optional().nullable(),
    idempotency_key: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data: res, error } = await rpc("registrar_cinta_v2", {
      _lote_id: data.lote_id,
      _uniones: data.uniones,
      _peso_cinta_kg: data.peso_cinta_kg,
      _ancho_util: data.ancho_util,
      _observaciones: (data.observaciones ?? "") as string,
      _lote_logistico_pza: data.lote_logistico_pza ?? null,
      _idempotency: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return res as unknown as {
      cinta_id: string;
      posicion?: number;
      peso_total_cintas_kg?: number;
      peso_pendiente_kg?: number;
      cantidad_cintas?: number;
      idempotent?: boolean;
    };
  });

/** Bajadas registradas de un rollo + estado de cierre definitivo. */
export const bajadasRollo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ numero_rollo: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }): Promise<RolloBajadas> => {
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data: res, error } = await rpc("pc_bajadas_rollo", { _numero_rollo: data.numero_rollo });
    if (error) throw new Error(error.message);
    return res as RolloBajadas;
  });

/** Cierre definitivo del rollo: bloquea nuevas bajadas (no toca las bajadas). */
export const cerrarRolloDefinitivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    numero_rollo: z.string().trim().min(1).max(64),
    motivo: z.string().trim().min(5).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data: res, error } = await rpc("cerrar_rollo_cintas", {
      _numero_rollo: data.numero_rollo,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { rollo_id: string; numero_rollo: string; cerrado: boolean };
  });

export const corregirCinta = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    cinta_id: z.string().uuid(),
    uniones: z.number().int().min(0),
    peso_cinta_kg: z.number().positive(),
    ancho_util: z.number().positive(),
    observaciones: z.string().max(500).optional().nullable(),
    motivo: z.string().min(5).max(500),
    idempotency_key: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("corregir_cinta", {
      _cinta_id: data.cinta_id,
      _uniones: data.uniones,
      _peso_cinta_kg: data.peso_cinta_kg,
      _ancho_util: data.ancho_util,
      _observaciones: (data.observaciones ?? "") as string,
      _motivo: data.motivo,
      _idempotency: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { cinta_id: string; posicion?: number };
  });

/** Estatus de liberación por cinta (hereda el del rollo; editable por el usuario). */
export const asignarEstatusCinta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    cinta_id: z.string().uuid(),
    estatus: z.enum(["L", "C", "NC"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("pc_set_estatus_cinta", {
      _cinta_id: data.cinta_id,
      _estatus: data.estatus,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const anularCinta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cinta_id: z.string().uuid(), motivo: z.string().min(5).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("anular_cinta", {
      _cinta_id: data.cinta_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const actualizarDatosOperativos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    conductor_id: z.string().uuid(),
    bobinadora_id: z.string().uuid(),
    motivo: z.string().min(5).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("actualizar_datos_operativos_lote_cintas", {
      _lote_id: data.lote_id,
      _conductor_id: data.conductor_id,
      _bobinadora_id: data.bobinadora_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean; lote_id: string };
  });

export const asignarBobinadoraLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    bobinadora_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc.bind(context.supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("pc_set_bobinadora", {
      _lote_id: data.lote_id,
      _bobinadora_id: data.bobinadora_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const asignarBobinadorNombre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    nombre: z.string().trim().min(3).max(80),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc.bind(context.supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("pc_set_bobinador_nombre", {
      _lote_id: data.lote_id,
      _nombre: data.nombre,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const asignarNombresOperativos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    conductor: z.string().trim().max(20),
    maquina: z.string().trim().max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc.bind(context.supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("pc_set_nombres_operativos", {
      _lote_id: data.lote_id,
      _conductor: data.conductor,
      _maquina: data.maquina,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ------------------------------- Finalizar -------------------------------- //

export const finalizarLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    peso_mermas_kg: z.number().min(0).max(3000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("finalizar_lote_cintas", {
      _lote_id: data.lote_id,
      _peso_mermas_kg: data.peso_mermas_kg,
    });
    if (error) throw new Error(error.message);
    return res as unknown as {
      cantidad_cintas: number;
      peso_total_cintas_kg: number;
      peso_mermas_kg: number;
      porcentaje_peso_mermas: number | null;
    };
  });

export const reabrirLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    motivo: z.string().min(5).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("reabrir_lote_cintas", {
      _lote_id: data.lote_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { estado: string; cintas_vigentes: number };
  });



// -------------------------------- Impresión ------------------------------- //

export const prepararImpresion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    motivo: z.string().max(500).optional().nullable(),
    cinta_id: z.string().uuid().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("preparar_impresion_etiquetas", {
      _lote_id: data.lote_id,
      _motivo: (data.motivo ?? "") as string,
      _cinta_id: (data.cinta_id ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);

    // Lote Logístico: dato canónico capturado en Calidad (muestras_calidad).
    // Se adjunta al snapshot para que la etiqueta de cinta lo codifique en QR.
    const out = res as unknown as {
      snapshot?: {
        muestra_calidad_id?: string | null;
        lote_logistico?: string | null;
        cintas?: Array<{ id: string; lote_logistico_pza?: string | null }>;
      };
    };
    const muestraId = out?.snapshot?.muestra_calidad_id ?? null;
    if (out?.snapshot) {
      out.snapshot.lote_logistico = null;
      if (muestraId) {
        const { data: m } = await context.supabase
          .from("muestras_calidad")
          .select("lote_logistico")
          .eq("id", muestraId)
          .maybeSingle();
        out.snapshot.lote_logistico = (m as { lote_logistico: string | null } | null)?.lote_logistico ?? null;
      }
      // Lote Logístico pza.: el RPC no lo incluye en el snapshot; se adjunta
      // por cinta para que la etiqueta/QR use el dato capturado en cada cinta.
      const cintasSnap = out.snapshot.cintas ?? [];
      const cintaIds = cintasSnap.map((c) => c.id);
      if (cintaIds.length > 0) {
        const { data: pcs } = await context.supabase
          .from("pesajes_cintas")
          .select("id, lote_logistico_pza")
          .in("id", cintaIds);
        const pzaPorCinta = new Map(
          ((pcs ?? []) as { id: string; lote_logistico_pza: string | null }[]).map((r) => [r.id, r.lote_logistico_pza]),
        );
        for (const c of cintasSnap) c.lote_logistico_pza = pzaPorCinta.get(c.id) ?? null;
      }
    }

    return res as unknown as {
      impresion_id: string;
      folio: string;
      tipo: "ORIGINAL" | "REIMPRESION";
      cantidad_etiquetas: number;
      numero_impresion: number;
      version_etiqueta: number;
      total_uniones_cintas: number;
      cintas_excluidas: number;
      snapshot: {
        lote_id: string;
        muestra_calidad_id: string | null;
        lote_logistico: string | null;
        numero_orden: string | null;
        numero_rollo: string;
        fabricacion: string;
        producto_codigo: string | null;
        producto_nombre: string | null;
        fecha_produccion: string | null;
        conductor: string;
        bobinadora: string;
        origen_rollo: "sistema" | "captura_manual";
        peso_neto_rollo_kg: number | null;
        diametro_rollo_cm: number | null;
        uniones_rollo: number | null;
        total_uniones_cintas: number;
        cintas_excluidas: number;
        folio: string;
        version_etiqueta: number;
        generado_at: string;
        datos_calidad: Json;
        cintas: Array<{
          id: string;
          posicion: number;
          uniones: number;
          peso_cinta_kg: number;
          ancho_util: number;
          ancho_util_unidad: string | null;
          observaciones: string | null;
          estado: string;
          version_etiqueta: number;
          created_at: string;
        }>;
      };
    };
  });


// --------------------- Reporte mensual de bobinadoras ---------------------- //
// Campo oficial de periodo: pesajes_cintas_lotes.fecha_produccion (fecha
// operativa del lote). Solo lectura; RLS del usuario autenticado.

export type ReporteMensualCintasData = {
  year: number;
  month: number;
  rangoInicio: string;
  rangoFinExclusivo: string;
  planta: string;
  usuario: string;
  generadoAt: string;
  lotes: LoteCintas[];
  cintas: CintaRegistrada[];
  snapshots: Record<string, Json>;
};

export const obtenerReporteMensualCintas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ReporteMensualCintasData> => {
    const pad = (v: number) => String(v).padStart(2, "0");
    const inicio = `${data.year}-${pad(data.month)}-01`;
    const finY = data.month === 12 ? data.year + 1 : data.year;
    const finM = data.month === 12 ? 1 : data.month + 1;
    const finExcl = `${finY}-${pad(finM)}-01`;

    const { data: lotes, error } = await context.supabase
      .from("pesajes_cintas_lotes")
      .select("*")
      .gte("fecha_produccion", inicio)
      .lt("fecha_produccion", finExcl)
      .neq("estado", "anulado")
      .order("fecha_produccion")
      .order("numero_rollo");
    if (error) throw new Error(error.message);

    const filas = (lotes ?? []) as unknown as (LoteCintas & { datos_calidad_snapshot: Json })[];
    const ids = filas.map((l) => l.id);

    let cintas: CintaRegistrada[] = [];
    if (ids.length > 0) {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
      const res = await Promise.all(
        chunks.map((c) =>
          context.supabase
            .from("pesajes_cintas")
            .select("*")
            .in("lote_id", c)
            .order("posicion"),
        ),
      );
      for (const r of res) {
        if (r.error) throw new Error(r.error.message);
        cintas = cintas.concat((r.data ?? []) as unknown as CintaRegistrada[]);
      }
    }

    const { data: plantas } = await context.supabase
      .from("plantas")
      .select("nombre")
      .eq("activo", true)
      .order("nombre")
      .limit(1);

    const snapshots: Record<string, Json> = {};
    for (const l of filas) snapshots[l.id] = l.datos_calidad_snapshot;

    return {
      year: data.year,
      month: data.month,
      rangoInicio: inicio,
      rangoFinExclusivo: finExcl,
      planta: plantas?.[0]?.nombre ?? "PLANTA TLAXCALA",
      usuario: (context.claims?.["email"] as string | undefined) ?? "—",
      generadoAt: new Date().toISOString(),
      lotes: filas as unknown as LoteCintas[],
      cintas,
      snapshots,
    };
  });

// ------------------- Últimos rollos cortados (por planta) ------------------ //
// Alcance estricto de planta: un lote pertenece a la planta de su muestra de
// calidad o de su pesaje de bobina madre; los lotes manuales se ubican por el
// sufijo del número de rollo (MP-04 → "-4"), que es único por máquina/planta.

export type LoteResumen = {
  id: string;
  numero_rollo: string;
  fabricacion: string;
  producto_codigo: string | null;
  producto_nombre: string | null;
  estado: "abierto" | "finalizado" | "anulado";
  es_manual: boolean;
  cantidad_cintas: number;
  peso_bobina_madre_neto_kg: number;
  peso_total_cintas_kg: number;
  peso_pendiente_kg: number;
  peso_mermas_kg: number | null;
  merma_porcentaje: number | null;
  numero_orden: string | null;
  conductor_nombre_snapshot: string;
  bobinadora_nombre_snapshot: string;
  bobinador_nombre: string | null;
  fecha_produccion: string | null;
  created_at: string;
};

export const listarUltimosLotesCintas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planta: z.string().nullable().optional(),
        buscar: z.string().trim().max(64).nullable().optional(),
        limite: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<LoteResumen[]> => {
    const { resolvePlantaScope } = await import("@/lib/planta-scope");
    const scope = await resolvePlantaScope(context.supabase, context.userId, data.planta ?? null);
    if (scope.plantaIds.length === 0) return [];

    const limite = data.limite ?? 50;
    let q = context.supabase
      .from("pesajes_cintas_lotes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.max(limite * 6, 300));
    const term = (data.buscar ?? "").trim();
    if (term) q = q.ilike("numero_rollo", `%${term}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const lotes = (rows ?? []) as unknown as (LoteResumen & {
      muestra_calidad_id: string | null;
      pesaje_bobina_madre_id: string | null;
    })[];
    if (lotes.length === 0) return [];

    const muestraIds = [...new Set(lotes.map((l) => l.muestra_calidad_id).filter(Boolean))] as string[];
    const pesajeIds = [...new Set(lotes.map((l) => l.pesaje_bobina_madre_id).filter(Boolean))] as string[];

    const [muestras, pesajes] = await Promise.all([
      muestraIds.length
        ? context.supabase.from("muestras_calidad").select("id, planta_id").in("id", muestraIds)
        : Promise.resolve({ data: [], error: null }),
      pesajeIds.length
        ? context.supabase.from("pesajes_bobina_madre").select("id, maquina_id").in("id", pesajeIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const plantaPorMuestra = new Map<string, string>();
    for (const m of (muestras.data ?? []) as { id: string; planta_id: string }[]) {
      plantaPorMuestra.set(m.id, m.planta_id);
    }
    const maquinaPorPesaje = new Map<string, string>();
    for (const p of (pesajes.data ?? []) as { id: string; maquina_id: string }[]) {
      maquinaPorPesaje.set(p.id, p.maquina_id);
    }

    const sufijos = new Set(
      scope.maquinaCodigos.map((c) => (c.split("-")[1] ?? "").replace(/^0+/, "") || c).filter(Boolean),
    );

    const visibles = lotes.filter((l) => {
      const plantaMuestra = l.muestra_calidad_id ? plantaPorMuestra.get(l.muestra_calidad_id) : undefined;
      if (plantaMuestra) return scope.plantaIds.includes(plantaMuestra);
      const maquina = l.pesaje_bobina_madre_id ? maquinaPorPesaje.get(l.pesaje_bobina_madre_id) : undefined;
      if (maquina) return scope.maquinaIds.includes(maquina);
      const suf = (l.numero_rollo.split("-")[1] ?? "").replace(/^0+/, "");
      return suf ? sufijos.has(suf) : false;
    });

    return visibles.slice(0, limite) as LoteResumen[];
  });
