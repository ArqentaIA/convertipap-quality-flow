// =============================================================================
// Pesaje de Cintas — server functions (wrappers de RPC SECURITY DEFINER)
// =============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------- Tipos de dominio ---------------------------- //

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
  lote: null | {
    id: string;
    estado: "abierto" | "finalizado" | "anulado";
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
  estado: "abierto" | "finalizado" | "anulado";
  datos_calidad_snapshot: unknown;
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
  .handler(async ({ data, context }): Promise<ContextoRollo> => {
    const { data: res, error } = await context.supabase.rpc("buscar_contexto_rollo_cintas", {
      _numero_rollo: data.numero_rollo,
    });
    if (error) throw new Error(error.message);
    return res as unknown as ContextoRollo;
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
      _conductor_id: data.conductor_id,
      _bobinadora_id: data.bobinadora_id,
      _idempotency: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return { lote_id: id as unknown as string };
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
    idempotency_key: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("registrar_cinta", {
      _lote_id: data.lote_id,
      _uniones: data.uniones,
      _peso_cinta_kg: data.peso_cinta_kg,
      _ancho_util: data.ancho_util,
      _observaciones: data.observaciones ?? null,
      _idempotency: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return res as unknown as {
      cinta_id: string;
      posicion?: number;
      peso_total_cintas_kg?: number;
      peso_pendiente_kg?: number;
      idempotent?: boolean;
    };
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
      _observaciones: data.observaciones ?? null,
      _motivo: data.motivo,
      _idempotency: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { cinta_id: string; posicion?: number };
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

// ------------------------------- Finalizar -------------------------------- //

export const finalizarLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lote_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("finalizar_lote_cintas", {
      _lote_id: data.lote_id,
    });
    if (error) throw new Error(error.message);
    return res as unknown as {
      cantidad_cintas: number;
      peso_total_cintas_kg: number;
      merma_kg: number;
      merma_porcentaje: number;
    };
  });

// -------------------------------- Impresión ------------------------------- //

export const prepararImpresion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lote_id: z.string().uuid(),
    motivo: z.string().max(500).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("preparar_impresion_etiquetas", {
      _lote_id: data.lote_id,
      _motivo: data.motivo ?? null,
    });
    if (error) throw new Error(error.message);
    return res as unknown as {
      impresion_id: string;
      folio: string;
      tipo: "ORIGINAL" | "REIMPRESION";
      cantidad_etiquetas: number;
      snapshot: {
        lote_id: string;
        numero_rollo: string;
        fabricacion: string;
        producto_codigo: string | null;
        producto_nombre: string | null;
        fecha_produccion: string | null;
        conductor: string;
        bobinadora: string;
        datos_calidad: unknown;
        cintas: Array<{
          id: string;
          posicion: number;
          uniones: number;
          peso_cinta_kg: number;
          ancho_util: number;
          ancho_util_unidad: string | null;
          observaciones: string | null;
        }>;
      };
    };
  });
