// =============================================================================
// Fase 1 QC — Data layer real contra Supabase.
// =============================================================================
// Server functions que sustituyen al store mock (src/lib/qc-mock/*). En esta
// fase NO se tocan pantallas ni se elimina el mock; sólo se publica la API.
// Fase 2 cablea las rutas de calidad.* contra estos serverFns.
//
// Regla medular:
//  - El capturista captura mediciones.
//  - El sistema calcula automáticamente conforme/no_conforme contra el snapshot.
//  - Sólo Calidad / Gerencia de Calidad (rol calidad) — o Administrador /
//    Gerente General como excepción — pueden autorizar el dictamen final.
//  - resolveRolloStatus es la única fuente de verdad del estatus del rollo.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MOTIVOS_NO_VALIDOS, MOTIVO_MIN_LEN } from "./motivo-estatus";
import {
  resolveRolloStatusFrom,
  type ResolveRolloInput,
  type RolloStatusInfo,
} from "@/lib/roll-status";
import type { MuestraCalidad, AjusteCalidad } from "@/lib/qc-types";
import { evaluateCriticalRule } from "@/lib/qc-critical-rule";
import { allowedPlantaIds, maquinasPermitidasConPruebas } from "@/lib/planta-acceso";
import { ordenCatalogo } from "@/lib/qc-orden-variables";

type SB = SupabaseClient<Database>;

// ------------------------- Roles -------------------------

const ROLES_CAPTURA = ["capturista", "calidad", "gerente_general", "administrador"] as const;
// Solo Calidad y Administrador pueden dictaminar / autorizar / cambiar estatus.
const ROLES_DICTAMEN = ["administrador", "gerente_general", "calidad", "capturista"] as const;
const ROLES_ADMIN = ["gerente_general", "administrador"] as const;

const ACCESO_DENEGADO_ROLLO =
  "Acceso denegado. Solo el responsable de Calidad está autorizado para modificar el estatus de un rollo.";

async function getUserRoles(sb: SB, userId: string): Promise<string[]> {
  const { data, error } = await sb.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`No se pudieron leer roles: ${error.message}`);
  return (data ?? []).map((r) => r.role as string);
}

function requireAnyRole(roles: string[], allowed: readonly string[]) {
  if (!roles.some((r) => allowed.includes(r))) {
    throw new Error(`Acceso denegado. Roles requeridos: ${allowed.join(", ")}`);
  }
}

function requireRollStatusRole(roles: string[]) {
  if (!roles.some((r) => (ROLES_DICTAMEN as readonly string[]).includes(r))) {
    throw new Error(ACCESO_DENEGADO_ROLLO);
  }
}

// ------------------------- Estado de medición -------------------------

/**
 * Variables cuyo valor por ENCIMA del máximo NO es no-conforme.
 * Caso Blancura R457: a mayor blancura, mejor calidad — el "máx" es solo
 * referencia objetivo, no un tope crítico.
 */
function esVariableSinTopeSuperior(clave?: string | null): boolean {
  if (!clave) return false;
  const k = clave.toLowerCase().replace(/[\s_-]/g, "");
  // Blancura R457: a mayor mejor. Tensión Seca MD/CD: rebasar el MAX no es no-conforme
  // (regla operativa: valores altos de tensión no degradan la calidad del rollo).
  if (k === "tensionmd" || k === "tensioncd") return true;
  return k.includes("blancura") || k.includes("r457");
}

function calcularEstadoMedicion(
  valor: number,
  min: number,
  max: number,
  clave?: string | null,
): Database["public"]["Enums"]["qc_medicion_estado"] {
  if (!Number.isFinite(valor)) return "pendiente";
  const sinTope = esVariableSinTopeSuperior(clave);
  // fuera_rango_critico: >20% fuera de tolerancia
  const rango = max - min;
  const tol = Math.abs(rango) * 0.2;
  if (valor < min - tol) return "fuera_rango_critico";
  if (!sinTope && valor > max + tol) return "fuera_rango_critico";
  if (valor < min) return "no_conforme";
  if (!sinTope && valor > max) return "no_conforme";
  return "conforme";
}

// =============================================================================
// READS
// =============================================================================

export const listOrdenesContexto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;
    const { data, error } = await sb
      .from("ordenes_fabricacion")
      .select(
        `id, folio, estado, turno, planta_id, maquina_id, producto_id,
         especificacion_id, producido_rollos,
         productos(id, nombre, codigo),
         maquinas(id, nombre, codigo),
         plantas(id, nombre, codigo)`,
      )
      .in("estado", ["en_proceso", "pausada"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Captura libre (sin orden) --------------------------------------------

/**
 * Lista las máquinas activas del laboratorio del usuario actual.
 * - Capturista: filtra por su `profiles.laboratorio` (norte/sur) usando `area`.
 * - Otros roles (admin / gerencia / calidad / dirección): ve todas las activas.
 */
export const listMaquinasCaptura = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;

    // Restricción Norte/Sur eliminada. La única restricción vigente es por
    // planta asignada al usuario (tabla user_plantas).
    // MP-10 es máquina de PRUEBAS compartida entre TLX e IXT: se incluye
    // siempre que el usuario tenga acceso a cualquiera de esas plantas.
    return maquinasPermitidasConPruebas(sb, context.userId);
  });


/**
 * Productos activos que tienen al menos una especificación vigente,
 * con el id+versión de esa spec para precargar variables.
 */
export const listProductosConSpec = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;
    const { data, error } = await sb
      .from("producto_especificaciones")
      .select(
        `id, version, estado, producto_id, vigente_desde,
         productos(id, codigo, nombre, activo, tipo_id)`,
      )
      .eq("estado", "vigente")
      .order("vigente_desde", { ascending: false });
    if (error) throw new Error(error.message);

    // Un producto puede tener múltiples vigentes (perfiles por máquina).
    // Aquí devolvemos UNA entrada por producto; la resolución fina se hace
    // en getSpecPorProducto usando maquinaId + producto_especificacion_maquinas.
    // Filtro por planta: usuarios restringidos exclusivamente a Ixtapaluca solo
    // ven productos cuya especificación vigente esté ligada a máquinas de su planta.
    const { data: upRows } = await sb
      .from("user_plantas")
      .select("planta_id, plantas:planta_id (codigo)")
      .eq("user_id", context.userId);
    const codigos = (upRows ?? []).map(
      (r) => (r as unknown as { plantas?: { codigo?: string } }).plantas?.codigo ?? "",
    );
    const soloIxtapaluca = codigos.length > 0 && codigos.every((c) => c === "IXT");
    let specsPermitidos: Set<string> | null = null;
    if (soloIxtapaluca) {
      const plantaIds = (upRows ?? []).map((r) => r.planta_id as string);
      const { data: maqs } = await sb.from("maquinas").select("id").in("planta_id", plantaIds);
      const maqIds = (maqs ?? []).map((m) => m.id as string);
      const { data: links } = maqIds.length
        ? await sb
            .from("producto_especificacion_maquinas")
            .select("especificacion_id")
            .in("maquina_id", maqIds)
        : { data: [] as { especificacion_id: string }[] };
      specsPermitidos = new Set((links ?? []).map((l) => l.especificacion_id as string));
    }

    const byProd = new Map<
      string,
      { producto_id: string; codigo: string; nombre: string; especificacion_id: string; especificacion_version: string }
    >();
    for (const row of data ?? []) {
      if (!row.productos || !row.productos.activo) continue;
      if (specsPermitidos && !specsPermitidos.has(row.id)) continue;
      if (byProd.has(row.producto_id)) continue;
      byProd.set(row.producto_id, {
        producto_id: row.producto_id,
        codigo: row.productos.codigo,
        nombre: row.productos.nombre,
        especificacion_id: row.id,
        especificacion_version: row.version,
      });
    }
    return Array.from(byProd.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

  });

/**
 * Claves SKU SAP de un producto (variantes por ancho/medida).
 * Se usa en la captura (ambos módulos) para que el capturista elija la clave
 * real del rollo. Hoy solo Tlaxcala tiene claves cargadas; si el producto no
 * tiene ninguna, la pantalla no muestra el selector y la BD aplica su regla.
 */
export const listSkusPorProducto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productoId: string }) =>
    z.object({ productoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: rows, error } = await sb
      .from("producto_skus_sap")
      .select("clave_sku_sap, descripcion_sap, es_principal")
      .eq("producto_id", data.productoId)
      .order("es_principal", { ascending: false })
      .order("clave_sku_sap");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Devuelve la especificación vigente + variables (min/objetivo/max) de un producto.
 * Si el producto tiene múltiples perfiles vigentes (uno por máquina) y se
 * proporciona `maquinaId`, resuelve por `producto_especificacion_maquinas`.
 * Si no hay match por máquina, cae al perfil vigente sin `perfil_key` (default)
 * o al vigente más reciente.
 */
export const getSpecPorProducto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productoId: string; maquinaId?: string }) =>
    z
      .object({
        productoId: z.string().uuid(),
        maquinaId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;

    const { data: vigentes, error: eSpec } = await sb
      .from("producto_especificaciones")
      .select("id, version, estado, producto_id, perfil_key, vigente_desde")
      .eq("producto_id", data.productoId)
      .eq("estado", "vigente")
      .order("vigente_desde", { ascending: false });
    if (eSpec) throw new Error(eSpec.message);
    if (!vigentes || vigentes.length === 0) {
      throw new Error("El producto no tiene especificación vigente");
    }

    let spec: (typeof vigentes)[number] | undefined;

    if (data.maquinaId && vigentes.length > 1) {
      const specIds = vigentes.map((s) => s.id);
      const { data: maps, error: eMap } = await sb
        .from("producto_especificacion_maquinas")
        .select("especificacion_id")
        .eq("maquina_id", data.maquinaId)
        .in("especificacion_id", specIds);
      if (eMap) throw new Error(eMap.message);
      const mapId = maps?.[0]?.especificacion_id;
      if (mapId) spec = vigentes.find((s) => s.id === mapId);
    }

    if (!spec) {
      spec = vigentes.find((s) => s.perfil_key == null) ?? vigentes[0];
    }

    const { data: vars, error: eVars } = await sb
      .from("producto_variables")
      .select(
        `id, variable_id, min_valor, objetivo, max_valor, tolerancia,
         variables_calidad(id, clave, etiqueta, unidad, orden)`,
      )
      .eq("especificacion_id", spec.id);
    if (eVars) throw new Error(eVars.message);

    return { spec, variables: vars ?? [] };
  });


export const getOrdenSpec = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ordenId: string }) =>
    z.object({ ordenId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: orden, error: eOrden } = await sb
      .from("ordenes_fabricacion")
      .select("id, especificacion_id, producto_id, maquina_id, planta_id, turno")
      .eq("id", data.ordenId)
      .single();
    if (eOrden) throw new Error(eOrden.message);

    const { data: spec, error: eSpec } = await sb
      .from("producto_especificaciones")
      .select("id, version, estado")
      .eq("id", orden.especificacion_id)
      .single();
    if (eSpec) throw new Error(eSpec.message);

    const { data: vars, error: eVars } = await sb
      .from("producto_variables")
      .select(
        `id, variable_id, min_valor, objetivo, max_valor, tolerancia,
         variables_calidad(id, clave, etiqueta, unidad)`,
      )
      .eq("especificacion_id", spec.id);
    if (eVars) throw new Error(eVars.message);

    return { orden, spec, variables: vars ?? [] };
  });

export const listMuestras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ordenId?: string; desde?: string; hasta?: string }) =>
    z
      .object({
        ordenId: z.string().uuid().optional(),
        desde: z.string().optional(),
        hasta: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    let q = sb
      .from("muestras_calidad")
      .select(
        `*,
         productos(id, codigo, nombre),
         maquinas(id, codigo, nombre, plantas(id, codigo, nombre)),
         mediciones_calidad(*)`,
      )
      .order("secuencia_captura", { ascending: false })
      .limit(500);
    if (data.ordenId) q = q.eq("orden_id", data.ordenId);
    if (data.desde) q = q.gte("capturado_at", data.desde);
    if (data.hasta) q = q.lte("capturado_at", data.hasta);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Últimas muestras capturadas (para reimprimir etiquetas).
 * - Capturista: solo ve las suyas.
 * - Admin / Gerencia / Calidad / Dirección: ven TODAS sin filtro.
 */
export const listMisMuestrasRecientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;
    const userId = context.userId;
    const roles = await getUserRoles(sb, userId);
    const seesAll = roles.some((r) =>
      ["administrador", "gerente_general", "direccion", "calidad"].includes(r),
    );
    const isCapturista = roles.includes("capturista");
    let q = sb
      .from("muestras_calidad")
      .select(
        `id, hora_muestreo, capturado_at, secuencia_captura, numero_rollo, estado, observaciones_generales, lote_logistico,
         defecto_visual_conversion, variable_tecnica_dimensional, criterio_defecto,
         producto_id, maquina_id, capturado_por, turno,
         jefe_maquina, operador, prensero, analista,
         estatus_liberacion, defectos,
         liberado_con_justificacion, liberacion_justificacion, liberado_por, liberado_at, variables_fuera_spec,
         dictamen, dictamen_observaciones, dictamen_motivo, dictamen_at,
         autorizado_por, autorizado_at, rol_autorizador,
         productos(id, codigo, nombre),
         maquinas(id, codigo, nombre, planta_id, plantas(codigo, nombre)),
         mediciones_calidad(variable_id, variable_clave, valor, min_snapshot, objetivo_snapshot, max_snapshot, estado, variables_calidad(clave, etiqueta, unidad)),
         pesajes_bobina_madre!muestras_calidad_pesaje_id_fkey(peso_neto_kg)`,
      )
      .order("secuencia_captura", { ascending: false })
      .limit(seesAll ? 50 : isCapturista ? 30 : 20);

    // Máquinas visibles para captura incluyendo MP-10 como pruebas compartida.
    const maqRows = await maquinasPermitidasConPruebas(sb, userId);
    const allowedIds = maqRows.map((m) => m.id);

    if (!seesAll) {
      if (isCapturista) {
        // Capturista: historial reciente de las máquinas de SU planta
        // (no solo lo que él tecleó), porque varios capturistas se relevan
        // en el mismo turno y necesitan ver continuidad del rollo.
        if (allowedIds.length === 0) return [];
        q = q.in("maquina_id", allowedIds);
      } else {
        q = q.eq("capturado_por", userId);
      }
    } else if (allowedIds.length > 0) {
      // Usuarios con visión amplia: restringir a máquinas permitidas cuando
      // aplica; MP-10 se incluye como máquina de pruebas compartida.
      q = q.in("maquina_id", allowedIds);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAjustes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ordenId?: string }) =>
    z.object({ ordenId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    let q = sb
      .from("ajustes_calidad")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.ordenId) q = q.eq("orden_id", data.ordenId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listSpecAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { especificacionId?: string; productoId?: string }) =>
    z
      .object({
        especificacionId: z.string().uuid().optional(),
        productoId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    let q = sb
      .from("spec_audit_log")
      .select("*")
      .order("modificado_at", { ascending: false })
      .limit(500);
    if (data.especificacionId) q = q.eq("especificacion_id", data.especificacionId);
    if (data.productoId) q = q.eq("producto_id", data.productoId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// =============================================================================
// WRITES
// =============================================================================

const medicionInputSchema = z.object({
  variable_id: z.string().uuid(),
  variable_clave: z.string().min(1),
  valor: z.number(),
  min_snapshot: z.number(),
  objetivo_snapshot: z.number(),
  max_snapshot: z.number(),
  observacion: z.string().default(""),
});

export const upsertMuestraConMediciones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        muestra_id: z.string().uuid().optional(),
        orden_id: z.string().uuid().nullable().optional(),
        especificacion_id: z.string().uuid(),
        especificacion_version: z.string(),
        planta_id: z.string().uuid(),
        maquina_id: z.string().uuid(),
        producto_id: z.string().uuid(),
        turno: z.string().min(1),
        operario_id: z.string().uuid(),
        numero_rollo: z
          .string()
          .trim()
          .min(1)
          .max(30)
          .regex(/^[A-Za-z0-9-]+$/, "Rollo inválido"),
        // Ixtapaluca: rollo ya pesado y pendiente de captura. Cuando viene, la
        // muestra toma ESE número y el consecutivo automático NO avanza.
        numero_rollo_pesaje: z
          .string()
          .trim()
          .max(30)
          .regex(/^[A-Za-z0-9-]+$/, "Rollo inválido")
          .nullable()
          .optional(),
        jefe_maquina: z.string().trim().max(120).nullable().optional(),
        operador: z.string().trim().max(120).nullable().optional(),
        prensero: z.string().trim().max(120).nullable().optional(),
        analista: z.string().trim().max(120).nullable().optional(),
        velocidad_maquina: z.number().min(0, "La velocidad de máquina no puede ser negativa").max(99999, "La velocidad de máquina es demasiado alta").nullable().optional(),
        velocidad_enrollador: z.number().min(0, "La velocidad de enrollador no puede ser negativa").max(99999, "La velocidad de enrollador es demasiado alta").nullable().optional(),
        crepado_pct: z.number().min(0, "El % Crepado debe ser al menos 0").max(100, "El % Crepado debe ser como máximo 100").nullable().optional(),
        cumplimiento_pct: z.number().min(0, "El Cumplimiento debe ser al menos 0").max(100, "El Cumplimiento debe ser como máximo 100").nullable().optional(),
        porcentaje_rupturas_pct: z.number().min(0, "El % Rupturas debe ser al menos 0").max(100, "El % Rupturas debe ser como máximo 100").nullable().optional(),
        destino: z.string().trim().max(200).nullable().optional(),
        // estatus_liberacion ya NO se acepta del cliente: lo deriva la regla de oro
        // server-side y el trigger BD `qc_recalc_estatus_muestra`.
        estatus_liberacion: z.enum(["L", "NC", "C"]).nullable().optional(),
        liberado_con_justificacion: z.boolean().default(false),
        liberacion_justificacion: z
          .string()
          .trim()
          .max(240, "La justificación no puede exceder 240 caracteres.")
          .nullable()
          .optional(),
        defectos: z.array(z.string().max(60)).max(20).default([]),
        tipo_muestreo: z.enum(["por_rollo", "por_tiempo"]),
        hora_muestreo: z.string().nullable().optional(),
        observaciones_generales: z.string().default(""),
        defecto_visual_conversion: z.string().trim().max(60).nullable().optional(),
        variable_tecnica_dimensional: z.string().trim().max(60).nullable().optional(),
        criterio_defecto: z
          .enum(["MENOR", "MAYOR", "CRÍTICO", "SIN DEFECTO"])
          .nullable()
          .optional(),
        // Estatus elegido por el capturista — EXCLUSIVO Planta Ixtapaluca.
        // Manda sobre el resultado automático de la sección F.
        estatus_capturista: z.enum(["L", "C", "NC"]).nullable().optional(),
        estatus_capturista_motivo: z.string().trim().max(240).nullable().optional(),
        variables_snapshot_json: z.record(z.string(), z.unknown()).default({}),
        mediciones: z.array(medicionInputSchema),
        enviar_a_revision: z.boolean().default(false),
        fuera_de_turno: z.boolean().optional().default(false),
        fuera_de_turno_motivo: z.string().trim().max(2000).nullable().optional(),
        // Lote Logístico (10 dígitos) — obligatorio en todas las plantas.
        lote_logistico: z
          .string()
          .trim()
          .regex(/^\d{10}$/, "El Lote Logístico debe tener exactamente 10 dígitos")
          .nullable()
          .optional(),
        // SKU SAP elegido por el capturista (productos con varios anchos, TLX).
        // La RPC lo valida contra el catálogo del producto; si no viene, la BD
        // aplica el autollenado vigente (principal o primero alfabético, solo TLX).
        sku_sap: z.string().trim().max(40).nullable().optional(),
        // Idempotencia del alta: la genera el cliente por intento de captura.
        // Un reintento (doble clic, timeout, refresh) con la misma clave devuelve
        // la misma muestra y el mismo consecutivo, sin consumir otro número.
        idempotency_key: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const userId = context.userId;
    const roles = await getUserRoles(sb, userId);
    requireAnyRole(roles, ROLES_CAPTURA);

    const medicionPeso = data.mediciones.find(
      (m) => m.variable_clave.trim().toLowerCase() === "peso",
    );
    if (!medicionPeso || !Number.isFinite(medicionPeso.valor) || medicionPeso.valor <= 0) {
      throw new Error(
        "El Peso del rollo es obligatorio y debe ser mayor a 0 kg. No se asignó ningún número de rollo.",
      );
    }

    if (data.numero_rollo_pesaje) {
      const { data: pesajeOrigen, error: pesajeError } = await sb
        .from("pesajes_bobina_madre")
        .select("id, maquina_id, numero_rollo, peso_neto_kg")
        .eq("maquina_id", data.maquina_id)
        .eq("numero_rollo", data.numero_rollo_pesaje.trim())
        .maybeSingle();
      if (pesajeError) throw new Error(pesajeError.message);
      if (!pesajeOrigen) {
        throw new Error("El pesaje seleccionado ya no está disponible. Actualiza la lista antes de guardar.");
      }
      if (Math.abs(Number(pesajeOrigen.peso_neto_kg) - medicionPeso.valor) > 0.01) {
        throw new Error(
          `El Peso debe coincidir con el pesaje de origen (${Number(pesajeOrigen.peso_neto_kg)} kg).`,
        );
      }
    }

    // Validación específica del módulo "Captura fuera de turno":
    // requiere motivo (≥10 chars) y limita la fecha a ±24h respecto a ahora.
    const motivoFueraTurnoTrim = (data.fuera_de_turno_motivo ?? "").trim();
    if (data.fuera_de_turno) {
      if (motivoFueraTurnoTrim.length < 10) {
        throw new Error(
          "Captura fuera de turno: el motivo es obligatorio y debe tener al menos 10 caracteres.",
        );
      }
      if (data.hora_muestreo) {
        const hm = new Date(data.hora_muestreo).getTime();
        const now = Date.now();
        const horasDiff = Math.abs(now - hm) / 3_600_000;
        if (!Number.isFinite(hm) || horasDiff > 24) {
          throw new Error(
            "Captura fuera de turno: la fecha y hora solo puede modificarse dentro de las últimas 24 horas.",
          );
        }
      }
    }

    // ¿Modificación posterior a dictamen autorizado? → marca trazabilidad.
    let dictamenPrevioAt: string | null = null;
    if (data.muestra_id) {
      const { data: prev } = await sb
        .from("muestras_calidad")
        .select("dictamen_at, autorizado_at")
        .eq("id", data.muestra_id)
        .maybeSingle();
      dictamenPrevioAt = prev?.autorizado_at ?? prev?.dictamen_at ?? null;
    }

    // -------------------------------------------------------------------------
    // POLÍTICA VIGENTE (29-Jul-2026) — Fuente única de verdad: backend.
    // - Si TODAS las variables cumplen [min,max]: estatus_liberacion='L', estado
    //   'borrador' (o 'pendiente_revision' si el capturista envía a revisión).
    // - Si CUALQUIER variable está fuera de spec: se exige motivo ≥10 chars y
    //   la muestra queda en estado 'pendiente_dictamen' con estatus_liberacion
    //   NULL. La captura NUNCA libera — solo Calidad vía change_roll_status
    //   (dictámenes: liberada / rechazada / correccion_solicitada).
    // La captura ignora `liberado_con_justificacion` del cliente (siempre false).
    // -------------------------------------------------------------------------
    const criticalEval = evaluateCriticalRule(
      data.mediciones.map((m) => ({
        variable_clave: m.variable_clave,
        valor: m.valor,
        min_snapshot: m.min_snapshot,
        max_snapshot: m.max_snapshot,
      })),
    );

    // Todas las variables fuera de spec (no solo críticas)
    const fueraSpecCapturista = data.mediciones
      .map((m) => {
        const est = calcularEstadoMedicion(
          m.valor,
          m.min_snapshot,
          m.max_snapshot,
          m.variable_clave,
        );
        return { m, est };
      })
      .filter(({ est }) => est === "no_conforme" || est === "fuera_rango_critico");

    const hayFueraSpec = fueraSpecCapturista.length > 0;
    const justifTrim = (data.liberacion_justificacion ?? "").trim();

    // Hallazgo real registrado por el capturista («Sin hallazgo» no cuenta).
    const hayHallazgoRegistrado = (data.defectos ?? []).some((d) => {
      const t = (d ?? "").trim().toUpperCase();
      return t !== "" && t !== "SIN HALLAZGO" && t !== "SIN DEFECTO";
    });

    if (hayFueraSpec) {
      if (justifTrim.length < 10) {
        throw new Error(
          "Hay variables fuera de especificación. Escribe el motivo (mínimo 10 caracteres) para que Calidad emita dictamen.",
        );
      }
      if (justifTrim.length > 240) {
        throw new Error("El motivo no puede exceder 240 caracteres.");
      }
    }

    // IXTAPALUCA — liberación manual (L) con hallazgo o variables fuera de spec:
    // la justificación (≥20 caracteres) es OBLIGATORIA. Aplica a Control de
    // Calidad y Captura fuera de turno.
    const liberacionManualConHallazgo =
      data.estatus_capturista === "L" && (hayFueraSpec || hayHallazgoRegistrado);
    if (
      liberacionManualConHallazgo &&
      (data.estatus_capturista_motivo ?? "").trim().length < 20
    ) {
      throw new Error(
        "Este rollo tiene hallazgo o variables fuera de especificación: para liberarlo debes registrar una justificación de al menos 20 caracteres.",
      );
    }


    // La evaluación canónica de liberación vive EXCLUSIVAMENTE en BD
    // (`qc_eval_liberacion` + `qc_recalc_estatus_muestra`). Aquí sólo se envía
    // un estado provisional; los triggers fijan estatus_liberacion/estado.
    const estatusLiberacionEfectivo: "L" | "NC" | "C" | null = null;
    const estadoMuestra: Database["public"]["Enums"]["qc_muestra_estado"] = hayFueraSpec
      ? ("pendiente_dictamen" as Database["public"]["Enums"]["qc_muestra_estado"])
      : data.enviar_a_revision
        ? "pendiente_revision"
        : "borrador";


    const muestraPayload = {
      orden_id: data.orden_id ?? null,
      especificacion_id: data.especificacion_id,
      especificacion_version: data.especificacion_version,
      planta_id: data.planta_id,
      maquina_id: data.maquina_id,
      producto_id: data.producto_id,
      turno: data.turno,
      operario_id: data.operario_id,
      numero_rollo: data.numero_rollo,
      numero_rollo_pesaje: data.numero_rollo_pesaje?.trim() || null,
      jefe_maquina: data.jefe_maquina?.trim() ? data.jefe_maquina.trim() : null,
      operador: data.operador?.trim() ? data.operador.trim() : null,
      prensero: data.prensero?.trim() ? data.prensero.trim() : null,
      analista: data.analista?.trim() ? data.analista.trim() : null,
      velocidad_maquina: data.velocidad_maquina ?? null,
      velocidad_enrollador: data.velocidad_enrollador ?? null,
      crepado_pct: data.crepado_pct ?? null,
      cumplimiento_pct: data.cumplimiento_pct ?? null,
      porcentaje_rupturas_pct: data.porcentaje_rupturas_pct ?? null,
      destino: data.destino?.trim() ? data.destino.trim() : null,
      estatus_liberacion: estatusLiberacionEfectivo,
      // La captura NUNCA libera (política 29-Jul-2026). El motivo del capturista
      // se persiste para dictamen posterior de Calidad; nunca se marca liberado.
      liberado_con_justificacion: liberacionManualConHallazgo,
      liberacion_justificacion: liberacionManualConHallazgo
        ? (data.estatus_capturista_motivo ?? "").trim()
        : hayFueraSpec
          ? justifTrim
          : null,
      liberado_por: null,
      liberado_at: null,
      // Snapshot completo de variables fuera de spec (todas, no sólo las críticas).
      variables_fuera_spec: fueraSpecCapturista.map(({ m, est }) => ({
        variable: m.variable_clave,
        valor: m.valor,
        min: m.min_snapshot,
        max: m.max_snapshot,
        objetivo: m.objetivo_snapshot,
        tipo: est,
      })) as never,
      defectos: data.defectos ?? [],
      tipo_muestreo: data.tipo_muestreo,
      hora_muestreo: data.hora_muestreo || new Date().toISOString(),
      // observaciones_generales mantiene compatibilidad con reportes/etiqueta/modal:
      // si hay hallazgos del rollo, los serializa como "[Defecto] | [Variable] | [Criterio]".
      // Si el criterio es CRÍTICO, se prefija "🔴 CRÍTICO · " para que destaque en exports
      // sin estilo de celda (xlsx community no soporta colores de fuente por celda).
      observaciones_generales: (() => {
        const esCritico = data.criterio_defecto === "CRÍTICO";
        const partes = [
          data.defecto_visual_conversion?.trim(),
          data.variable_tecnica_dimensional?.trim(),
          // Si es CRÍTICO se omite el criterio del cuerpo porque ya va en el prefijo
          // "🔴 CRÍTICO · ..." y evitamos que aparezca dos veces en el reporte.
          esCritico ? null : data.criterio_defecto?.trim(),
        ].filter((x): x is string => !!x && x.length > 0);
        if (partes.length === 0) return data.observaciones_generales ?? "";
        const txt = partes.join(" | ");
        return esCritico ? `🔴 CRÍTICO · ${txt}` : txt;
      })(),
      defecto_visual_conversion: data.defecto_visual_conversion ?? null,
      variable_tecnica_dimensional: data.variable_tecnica_dimensional ?? null,
      criterio_defecto: data.criterio_defecto ?? null,
      variables_snapshot_json: data.variables_snapshot_json as never,
      estado: estadoMuestra,
      capturado_por: userId,
      fuera_de_turno: data.fuera_de_turno === true,
      fuera_de_turno_motivo: data.fuera_de_turno === true ? motivoFueraTurnoTrim : null,
      lote_logistico: data.lote_logistico?.trim() || null,
      sku_sap: data.sku_sap?.trim() || null,
      ...(dictamenPrevioAt
        ? {
            mediciones_modificadas_at: new Date().toISOString(),
            mediciones_modificadas_por: userId,
            mediciones_modificacion_motivo:
              "Modificación posterior al dictamen — requiere nuevo dictamen",
          }
        : {}),
    };

    // Mensaje único y normalizado para violación de unicidad de número de rollo.
    const ROLLO_DUPLICADO_MSG =
      "El número de rollo ya se encuentra registrado en el sistema. Verifique la información antes de continuar.";

    // -------------------------------------------------------------------------
    // ALTA NUEVA — TRANSACCIÓN ÚNICA ATÓMICA (RPC `crear_muestra_con_mediciones`).
    // Dentro de UNA sola transacción PostgreSQL: bloqueo FOR UPDATE de la fila de
    // `numeracion_rollos` de ESA máquina → validación de colisión → INSERT muestra
    // → INSERT de TODAS las mediciones → `qc_recalc_estatus_muestra` → incremento
    // del contador. Si cualquier paso falla, ROLLBACK completo: no hay muestra,
    // no hay mediciones y el contador NO avanza. Sin compensación (nunca se resta).
    // Idempotencia: `idempotency_key` (único). Un reintento del mismo submit
    // devuelve la misma muestra y el mismo número, sin consumir otro consecutivo.
    // La rama de EDICIÓN nunca solicita consecutivo ni toca `numero_rollo`.
    // -------------------------------------------------------------------------
    let numeroRolloFinal = data.numero_rollo;
    let muestraId = data.muestra_id;
    // true cuando la RPC NO creó nada porque la clave de idempotencia ya fue
    // consumida: devuelve la muestra anterior. Debe avisarse al capturista.
    let reintentoIdempotente = false;
    // Salto automático de numeración aplicado por la RPC (colisión resuelta).
    let numeroSolicitado: string | null = null;
    let numerosOmitidos = 0;

    if (!muestraId) {
      const { data: res, error: eRpc } = await (
        sb as unknown as {
          rpc: (
            n: string,
            a: unknown,
          ) => Promise<{ data: unknown; error: { message: string } | null }>;
        }
      ).rpc("crear_muestra_con_mediciones", {
        _muestra: muestraPayload,
        _mediciones: data.mediciones.map((m) => ({
          variable_id: m.variable_id,
          variable_clave: m.variable_clave,
          valor: m.valor,
          min_snapshot: m.min_snapshot,
          objetivo_snapshot: m.objetivo_snapshot,
          max_snapshot: m.max_snapshot,
          observacion: m.observacion,
          estado: calcularEstadoMedicion(
            m.valor,
            m.min_snapshot,
            m.max_snapshot,
            m.variable_clave,
          ),
        })),
        _idempotency: data.idempotency_key,
      });
      if (eRpc) {
        if (/duplicate key|unique/i.test(eRpc.message)) throw new Error(ROLLO_DUPLICADO_MSG);
        throw new Error(eRpc.message);
      }
      const out = res as
        | {
            muestra_id: string;
            numero_rollo: string;
            reintento?: boolean;
            numero_solicitado?: string | null;
            numeros_omitidos?: number | null;
          }
        | null;
      if (!out?.muestra_id) throw new Error("No se pudo crear la muestra.");
      muestraId = out.muestra_id;
      numeroRolloFinal = out.numero_rollo;
      reintentoIdempotente = !!out.reintento;
      numerosOmitidos = out.numeros_omitidos ?? 0;
      numeroSolicitado = numerosOmitidos > 0 ? (out.numero_solicitado ?? null) : null;
    } else {
      // EDICIÓN: conserva su número de rollo; sólo se valida unicidad contra otras.
      const { data: dup, error: eDup } = await sb
        .from("muestras_calidad")
        .select("id")
        .eq("numero_rollo", numeroRolloFinal)
        .neq("id", muestraId)
        .limit(1)
        .maybeSingle();
      if (eDup) throw new Error(eDup.message);
      if (dup) throw new Error(ROLLO_DUPLICADO_MSG);

      // `numero_rollo_pesaje` es solo un hint para la RPC de alta; no es columna.
      const { numero_rollo_pesaje: _ignorado, ...muestraPayloadUpdate } = muestraPayload;
      const muestraPayloadSb = muestraPayloadUpdate as unknown as never;
      const { error } = await sb
        .from("muestras_calidad")
        .update(muestraPayloadSb)
        .eq("id", muestraId);
      if (error) {
        if (error.code === "23505" || /duplicate key|unique/i.test(error.message)) {
          throw new Error(ROLLO_DUPLICADO_MSG);
        }
        throw new Error(error.message);
      }
      const { error: eDel } = await sb
        .from("mediciones_calidad")
        .delete()
        .eq("muestra_id", muestraId);
      if (eDel) throw new Error(eDel.message);

      const medsPayload = data.mediciones.map((m) => ({
        muestra_id: muestraId!,
        variable_id: m.variable_id,
        variable_clave: m.variable_clave,
        valor: m.valor,
        min_snapshot: m.min_snapshot,
        objetivo_snapshot: m.objetivo_snapshot,
        max_snapshot: m.max_snapshot,
        observacion: m.observacion,
        estado: calcularEstadoMedicion(m.valor, m.min_snapshot, m.max_snapshot, m.variable_clave),
        capturado_por: userId,
      }));
      if (medsPayload.length > 0) {
        const { error: eMed } = await sb.from("mediciones_calidad").insert(medsPayload);
        if (eMed) throw new Error(eMed.message);
      }

      try {
        await (sb as unknown as { rpc: (n: string, a: unknown) => Promise<unknown> }).rpc(
          "qc_recalc_estatus_muestra",
          { _muestra_id: muestraId },
        );
      } catch {
        // Los triggers de BD ya aplican la regla; el RPC es refuerzo idempotente.
      }
    }




    // -------------------------------------------------------------------------
    // ESTATUS ELEGIDO POR EL CAPTURISTA — EXCLUSIVO PLANTA IXTAPALUCA.
    // Manda sobre el resultado automático de la sección F. Motivo obligatorio:
    // ≥20 caracteres si libera (L), ≥10 caracteres para C / NC.
    // Se aplica por la ÚNICA ruta autorizada: RPC `change_roll_status`.
    // -------------------------------------------------------------------------
    if (data.estatus_capturista && muestraId) {
      const { data: maq } = await sb
        .from("maquinas")
        .select("planta_id, plantas:planta_id(codigo)")
        .eq("id", data.maquina_id)
        .maybeSingle();
      const codigoPlanta = (
        (maq as unknown as { plantas?: { codigo?: string | null } | null })?.plantas?.codigo ?? ""
      ).toUpperCase();
      if (codigoPlanta !== "IXT") {
        throw new Error(
          "El estatus manual del capturista solo está habilitado en la planta Ixtapaluca.",
        );
      }
      const motivoEst = (data.estatus_capturista_motivo ?? "").trim();
      const minLen = data.estatus_capturista === "L" ? 20 : 10;
      if (motivoEst.length < minLen) {
        throw new Error(
          data.estatus_capturista === "L"
            ? "Para liberar el rollo debes registrar una justificación de al menos 20 caracteres."
            : "Debes registrar el motivo del estatus (mínimo 10 caracteres).",
        );
      }
      const mapa = {
        L: { estado: "liberada", dictamen: "liberada" },
        C: { estado: "concesion", dictamen: "concesion" },
        NC: { estado: "rechazada", dictamen: "rechazada" },
      } as const;
      const destino = mapa[data.estatus_capturista];
      const { error: eEstatus } = await (
        sb as unknown as {
          rpc: (n: string, a: unknown) => Promise<{ error: { message: string } | null }>;
        }
      ).rpc("change_roll_status", {
        p_muestra_id: muestraId,
        p_nuevo_estado: destino.estado,
        p_dictamen: destino.dictamen,
        p_motivo: motivoEst,
        p_observaciones: null,
        p_ip: null,
        p_user_agent: null,
      });
      if (eEstatus) throw new Error(eEstatus.message);
    }

    // Auditoría explícita de los hallazgos del rollo (creación o edición).
    if (
      data.defecto_visual_conversion ||
      data.variable_tecnica_dimensional ||
      data.criterio_defecto
    ) {
      try {
        await (sb as unknown as { rpc: (n: string, a: unknown) => Promise<unknown> }).rpc(
          "audit_action",
          {
            p_modulo: "control_calidad",
            p_descripcion: data.muestra_id
              ? "Edición de hallazgos del rollo"
              : "Captura de hallazgos del rollo",
            p_registro_id: muestraId,
            p_datos: {
              numero_rollo: data.numero_rollo,
              maquina_id: data.maquina_id,
              turno: data.turno,
              defecto_visual_conversion: data.defecto_visual_conversion ?? null,
              variable_tecnica_dimensional: data.variable_tecnica_dimensional ?? null,
              criterio_defecto: data.criterio_defecto ?? null,
            },
          },
        );
      } catch {
        // No bloquear la captura si la auditoría falla.
      }
    }

    // Auditoría de la regla crítica oficial cuando forzó NC automático.
    if (criticalEval.forzarNC) {
      try {
        await (sb as unknown as { rpc: (n: string, a: unknown) => Promise<unknown> }).rpc(
          "audit_action",
          {
            p_modulo: "control_calidad",
            p_descripcion:
              "Regla crítica oficial: estatus forzado a NC por incumplimiento de variable crítica",
            p_registro_id: muestraId,
            p_datos: {
              numero_rollo: data.numero_rollo,
              maquina_id: data.maquina_id,
              turno: data.turno,
              estatus_liberacion_solicitado: data.estatus_liberacion ?? null,
              estatus_liberacion_aplicado: "NC",
              fallas: criticalEval.fallas,
              resumen: criticalEval.resumen,
            },
          },
        );
      } catch {
        // No bloquear la captura si la auditoría falla.
      }
    }

    return {
      muestra_id: muestraId,
      numero_rollo: numeroRolloFinal,
      reabre_dictamen: !!dictamenPrevioAt,
      reintento: reintentoIdempotente,
      salto_numeracion:
        numerosOmitidos > 0
          ? { numero_solicitado: numeroSolicitado, numeros_omitidos: numerosOmitidos }
          : null,
      regla_critica: {
        forzado_nc: criticalEval.forzarNC,
        fallas: criticalEval.fallas,
        resumen: criticalEval.resumen,
      },
    };
  });

// -----------------------------------------------------------------------------
// Cambio de estatus / dictamen — ÚNICA RUTA AUTORIZADA.
// Se ejecuta exclusivamente vía la función de dominio `change_roll_status`:
// una sola transacción con auth.uid(), validación de rol server-side,
// bloqueo FOR UPDATE de la muestra, motivo real obligatorio y registro de
// auditoría indivisible (si la evidencia falla → ROLLBACK total).
// Prohibido volver a un UPDATE directo de estatus desde la aplicación.
// -----------------------------------------------------------------------------

export const dictaminarMuestra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const schema = z.object({
      muestra_id: z.string().uuid(),
      dictamen: z.enum(["liberada", "rechazada", "concesion", "correccion_solicitada"]),
      motivo: z
        .string()
        .trim()
        .min(MOTIVO_MIN_LEN, "El motivo del cambio de estatus es obligatorio (mín. 10 caracteres) y debe expresar la razón real de la decisión.")
        .refine(
          (v) => !MOTIVOS_NO_VALIDOS.has(v.toLowerCase()),
          "Motivo no válido: describe la razón real de la decisión, no el nombre del dictamen.",
        ),
      // Campo único en pantalla: la UI captura solo "Motivo del cambio de estatus".
      // `observaciones` queda opcional; si no viene, NO se duplica el texto:
      // `motivo` es la fuente única y las lecturas usan COALESCE.
      observaciones: z.string().trim().optional(),

    });
    const res = schema.safeParse(input);
    if (res.success) return res.data;
    // Mensaje legible para el usuario: nunca se devuelve el JSON crudo de Zod.
    const msgs = Array.from(new Set(res.error.issues.map((i) => i.message)));
    throw new Error(
      msgs.length === 1
        ? `No se pudo cambiar el estatus: ${msgs[0]}`
        : `No se pudo cambiar el estatus:\n• ${msgs.join("\n• ")}`,
    );
  })

  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    requireRollStatusRole(roles);

    const nuevoEstado =
      data.dictamen === "liberada"
        ? "liberada"
        : data.dictamen === "rechazada"
          ? "rechazada"
          : data.dictamen === "concesion"
            ? "concesion"
            : "pendiente_dictamen";

    // IP/dispositivo: solo si la infraestructura los provee. Nunca se inventan.
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      // IP auténtica de Cloudflare (cf-connecting-ip). No usar x-forwarded-for:
      // es manipulable por el cliente y puede falsificar la trazabilidad.
      ip = req?.headers.get("cf-connecting-ip") ?? null;
      ua = req?.headers.get("user-agent") ?? null;
    } catch {
      ip = null;
      ua = null;
    }

    const { error } = await sb.rpc("change_roll_status", {
      p_muestra_id: data.muestra_id,
      p_nuevo_estado: nuevoEstado,
      p_dictamen: data.dictamen,
      p_motivo: data.motivo,
      // No se duplica el texto: si la UI no envía observaciones propias,
      // `motivo` queda como fuente única y `observaciones` no se escribe.
      p_observaciones:
        data.observaciones && data.observaciones.length > 0 ? data.observaciones : undefined,

      p_ip: ip ?? undefined,
      p_user_agent: ua ?? undefined,
    });
    // Sin try/catch mudo: si la transacción (estatus + evidencia) falla, falla todo.
    if (error) {
      throw new Error(
        error.message ||
          "No fue posible completar el cambio de estatus. La operación no fue aplicada.",
      );
    }
    return { ok: true };
  });

export const autorizarMuestra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        muestra_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    requireRollStatusRole(roles);

    const rolAutorizador = roles.includes("calidad") ? "calidad" : "administrador";

    // Validar que tenga dictamen técnico
    const { data: prev, error: ePrev } = await sb
      .from("muestras_calidad")
      .select("dictamen")
      .eq("id", data.muestra_id)
      .single();
    if (ePrev) throw new Error(ePrev.message);
    if (!prev.dictamen) {
      throw new Error("La muestra no tiene dictamen técnico para autorizar.");
    }

    const { error } = await sb
      .from("muestras_calidad")
      .update({
        autorizado_por: context.userId,
        autorizado_at: new Date().toISOString(),
        rol_autorizador: rolAutorizador as never,
      })
      .eq("id", data.muestra_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const crearAjuste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        muestra_id: z.string().uuid().nullable().optional(),
        orden_id: z.string().uuid().nullable().optional(),
        maquina_id: z.string().uuid(),
        planta_id: z.string().uuid(),
        tipo_ajuste: z.enum([
          "ajuste_calidad",
          "ajuste_maquina",
          "ajuste_parametros",
          "cambio_materia_prima",
          "reproceso",
          "otro",
        ]),
        motivo: z.string().min(1),
        sla_objetivo_horas: z.number().default(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    requireAnyRole(roles, ROLES_CAPTURA);

    const { data: row, error } = await sb
      .from("ajustes_calidad")
      .insert({
        muestra_id: data.muestra_id ?? null,
        orden_id: data.orden_id ?? null,
        maquina_id: data.maquina_id,
        planta_id: data.planta_id,
        tipo_ajuste: data.tipo_ajuste,
        motivo: data.motivo,
        detectado_en: new Date().toISOString(),
        solicitado_por: context.userId,
        sla_objetivo_horas: data.sla_objetivo_horas,
        estado_flujo: "solicitado",
        resultado: "pendiente",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const actualizarAjuste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        estado_flujo: z
          .enum(["solicitado", "autorizado", "en_ejecucion", "cerrado", "rechazado"])
          .optional(),
        resultado: z.enum(["pendiente", "exitoso", "parcial", "fallido"]).optional(),
        accion_realizada: z.string().nullable().optional(),
        observacion_ajuste: z.string().nullable().optional(),
        muestra_verificacion_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    requireAnyRole(roles, ROLES_CAPTURA);

    const patch: Database["public"]["Tables"]["ajustes_calidad"]["Update"] = {};
    if (data.estado_flujo) patch.estado_flujo = data.estado_flujo;
    if (data.resultado) patch.resultado = data.resultado;
    if (data.accion_realizada !== undefined) patch.accion_realizada = data.accion_realizada;
    if (data.observacion_ajuste !== undefined) patch.observacion_ajuste = data.observacion_ajuste;
    if (data.muestra_verificacion_id !== undefined)
      patch.muestra_verificacion_id = data.muestra_verificacion_id;

    if (data.estado_flujo === "autorizado") {
      patch.autorizado_por = context.userId;
      patch.autorizado_at = new Date().toISOString();
    }
    if (data.estado_flujo === "cerrado") {
      patch.ajustado_por = context.userId;
      patch.ajustado_at = new Date().toISOString();
    }

    const { error } = await sb.from("ajustes_calidad").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const registrarSpecAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        especificacion_id: z.string().uuid(),
        producto_id: z.string().uuid(),
        variable_id: z.string().uuid().nullable().optional(),
        variable_clave: z.string().min(1),
        variable_etiqueta: z.string().min(1),
        campo: z.enum(["min", "objetivo", "max"]),
        valor_anterior: z.number().nullable(),
        valor_nuevo: z.number().nullable(),
        motivo: z.string().min(1),
        planta_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    requireAnyRole(roles, ["calidad", ...ROLES_ADMIN, "direccion"]);

    const { data: profile } = await sb
      .from("profiles")
      .select("nombre")
      .eq("id", context.userId)
      .maybeSingle();

    const rolAuditor = roles.includes("calidad")
      ? "calidad"
      : roles.includes("gerente_general")
        ? "gerente_general"
        : roles.includes("administrador")
          ? "administrador"
          : "direccion";

    const { error } = await sb.from("spec_audit_log").insert({
      especificacion_id: data.especificacion_id,
      producto_id: data.producto_id,
      variable_id: data.variable_id ?? null,
      variable_clave: data.variable_clave,
      variable_etiqueta: data.variable_etiqueta,
      campo: data.campo,
      valor_anterior: data.valor_anterior,
      valor_nuevo: data.valor_nuevo,
      motivo: data.motivo,
      modificado_por: context.userId,
      modificado_por_nombre: profile?.nombre ?? null,
      modificado_por_rol: rolAuditor as never,
      planta_id: data.planta_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Helpers para variables-calidad (catálogo estático con codigo) — resuelven
// producto_id / especificacion_id / variable_id por código/clave server-side.
// -----------------------------------------------------------------------------

export const listSpecAuditByProductCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { codigo: string }) =>
    z.object({ codigo: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: prod } = await sb
      .from("productos")
      .select("id")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (!prod) return [];
    const { data: rows, error } = await sb
      .from("spec_audit_log")
      .select("*")
      .eq("producto_id", prod.id)
      .order("modificado_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const registrarSpecAuditByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        producto_codigo: z.string().min(1),
        variable_clave: z.string().min(1),
        variable_etiqueta: z.string().min(1),
        campo: z.enum(["min", "objetivo", "max"]),
        valor_anterior: z.number().nullable(),
        valor_nuevo: z.number().nullable(),
        motivo: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    requireAnyRole(roles, ["calidad", ...ROLES_ADMIN, "direccion"]);

    const { data: prod } = await sb
      .from("productos")
      .select("id")
      .eq("codigo", data.producto_codigo)
      .maybeSingle();
    if (!prod) throw new Error(`Producto ${data.producto_codigo} no encontrado en BD`);

    // Fase 3: NUNCA escribir sobre la spec vigente. Resolver al borrador.
    const { data: borradorRow } = await sb
      .from("producto_especificaciones")
      .select("id, estado")
      .eq("producto_id", prod.id)
      .in("estado", ["borrador", "en_revision"])
      .maybeSingle();
    if (!borradorRow) {
      throw new Error(
        "Primero crea un borrador para modificar esta especificación.",
      );
    }
    if (borradorRow.estado === "en_revision") {
      throw new Error(
        "La especificación está en revisión; descarta o publica el borrador antes de editar.",
      );
    }
    const spec = { id: borradorRow.id as string };

    // Guard de evidencia documental (Fase 2/3): evaluada SOBRE EL BORRADOR.
    {
      const { data: flagRow } = await sb
        .from("app_settings")
        .select("spec_evidencia_obligatoria")
        .limit(1)
        .maybeSingle();
      const obligatoria =
        ((flagRow as unknown as { spec_evidencia_obligatoria?: boolean } | null)
          ?.spec_evidencia_obligatoria ?? false) === true;
      if (obligatoria) {
        const { data: ok, error: rErr } = await sb.rpc(
          "spec_tiene_evidencia_vigente",
          { _spec_id: spec.id },
        );
        if (rErr) throw new Error(rErr.message);
        if (ok !== true) {
          throw new Error(
            "El borrador no tiene evidencia documental vigente. Cárgala antes de modificar variables.",
          );
        }
      }
    }

    const { data: variable } = await sb
      .from("variables_calidad")
      .select("id")
      .eq("clave", data.variable_clave)
      .maybeSingle();

    const { data: profile } = await sb
      .from("profiles")
      .select("nombre")
      .eq("id", context.userId)
      .maybeSingle();

    const rolAuditor = roles.includes("calidad")
      ? "calidad"
      : roles.includes("gerente_general")
        ? "gerente_general"
        : roles.includes("administrador")
          ? "administrador"
          : "direccion";

    // Persistir el cambio en producto_variables (fuente de verdad de la spec)
    if (variable?.id && data.valor_nuevo !== null) {
      const { data: pv } = await sb
        .from("producto_variables")
        .select("id")
        .eq("especificacion_id", spec.id)
        .eq("variable_id", variable.id)
        .maybeSingle();
      if (pv?.id) {
        const colMap = { min: "min_valor", objetivo: "objetivo", max: "max_valor" } as const;
        const col = colMap[data.campo];
        const payload: Record<string, number> = { [col]: data.valor_nuevo };
        const { error: upErr } = await sb
          .from("producto_variables")
          .update(payload as never)
          .eq("id", pv.id);
        if (upErr) throw new Error(`No se pudo actualizar la especificación: ${upErr.message}`);
      }
    }

    const { error } = await sb.from("spec_audit_log").insert({
      especificacion_id: spec.id,
      producto_id: prod.id,
      variable_id: variable?.id ?? null,
      variable_clave: data.variable_clave,
      variable_etiqueta: data.variable_etiqueta,
      campo: data.campo,
      valor_anterior: data.valor_anterior,
      valor_nuevo: data.valor_nuevo,
      motivo: data.motivo,
      modificado_por: context.userId,
      modificado_por_nombre: profile?.nombre ?? null,
      modificado_por_rol: rolAuditor as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============================================================================
// listEspecsActivasConVariables — catálogo real de especificaciones
// =============================================================================

export const listEspecsActivasConVariables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;

    const { data: productos, error: pErr } = await sb
      .from("productos")
      .select(
        "id, codigo, nombre, tipo_id, activo, tipos_producto:tipo_id (id, nombre, familia_id, familias_producto:familia_id (id, nombre))",
      )
      .eq("activo", true)
      .order("codigo", { ascending: true });
    if (pErr) throw new Error(pErr.message);
    if (!productos || productos.length === 0) return [];

    const productoIds = productos.map((p) => p.id);
    const { data: specsRows, error: sErr } = await sb
      .from("producto_especificaciones")
      .select(
        "id, producto_id, version, estado, caracteristicas_atributos, created_at",
      )
      .in("producto_id", productoIds)
      .in("estado", ["vigente", "borrador", "en_revision"])
      .order("created_at", { ascending: false });
    if (sErr) throw new Error(sErr.message);

    // Fase 3: separar vigente (read-only) y borrador/en_revision (editable)
    const vigByProd = new Map<
      string,
      { id: string; version: string; caracteristicas: string | null }
    >();
    const bdfByProd = new Map<
      string,
      {
        id: string;
        version: string;
        estado: "borrador" | "en_revision";
        caracteristicas: string | null;
      }
    >();
    for (const s of specsRows ?? []) {
      const carac =
        (s as unknown as { caracteristicas_atributos?: string | null })
          .caracteristicas_atributos ?? null;
      if (s.estado === "vigente" && !vigByProd.has(s.producto_id)) {
        vigByProd.set(s.producto_id, {
          id: s.id as string,
          version: s.version as string,
          caracteristicas: carac,
        });
      } else if (
        (s.estado === "borrador" || s.estado === "en_revision") &&
        !bdfByProd.has(s.producto_id)
      ) {
        bdfByProd.set(s.producto_id, {
          id: s.id as string,
          version: s.version as string,
          estado: s.estado as "borrador" | "en_revision",
          caracteristicas: carac,
        });
      }
    }

    const specIds = [
      ...Array.from(vigByProd.values()).map((s) => s.id),
      ...Array.from(bdfByProd.values()).map((s) => s.id),
    ];
    type PVRow = {
      id: string;
      especificacion_id: string;
      variable_id: string;
      min_valor: number;
      objetivo: number;
      max_valor: number;
      variables_calidad: {
        id: string;
        clave: string;
        etiqueta: string;
        unidad: string | null;
        orden: number;
      } | null;
    };
    let pvRows: PVRow[] = [];
    if (specIds.length > 0) {
      const { data, error: vErr } = await sb
        .from("producto_variables")
        .select(
          "id, especificacion_id, variable_id, min_valor, objetivo, max_valor, variables_calidad:variable_id (id, clave, etiqueta, unidad, orden)",
        )
        .in("especificacion_id", specIds);
      if (vErr) throw new Error(vErr.message);
      pvRows = (data ?? []) as unknown as PVRow[];
    }

    const mapVars = (specId: string | undefined) =>
      (specId ? pvRows.filter((r) => r.especificacion_id === specId) : [])
        .map((r) => ({
          key: r.variables_calidad?.clave ?? "",
          label: r.variables_calidad?.etiqueta ?? r.variables_calidad?.clave ?? "—",
          unit: r.variables_calidad?.unidad ?? "",
          min: Number(r.min_valor),
          objective: Number(r.objetivo),
          max: Number(r.max_valor),
          orden: r.variables_calidad?.orden ?? 0,
        }))
        .sort(
          (a, b) =>
            ordenCatalogo(a.key, a.orden) - ordenCatalogo(b.key, b.orden),
        );

    // ---------------------------------------------------------------------
    // Filtro por planta: usuarios restringidos exclusivamente a Ixtapaluca
    // solo ven productos cuya especificación esté ligada a máquinas de su
    // planta. Tlaxcala y usuarios sin restricción no se ven afectados.
    // ---------------------------------------------------------------------
    let productosVisibles = productos;
    const { data: upRows } = await sb
      .from("user_plantas")
      .select("planta_id, plantas:planta_id (codigo)")
      .eq("user_id", context.userId);
    const codigosPlanta = (upRows ?? []).map(
      (r) => (r as unknown as { plantas?: { codigo?: string } }).plantas?.codigo ?? "",
    );
    const soloIxtapaluca =
      codigosPlanta.length > 0 && codigosPlanta.every((c) => c === "IXT");
    if (soloIxtapaluca) {
      const plantaIds = (upRows ?? []).map((r) => r.planta_id as string);
      const { data: maqs } = await sb
        .from("maquinas")
        .select("id")
        .in("planta_id", plantaIds);
      const maqIds = (maqs ?? []).map((m) => m.id as string);
      let specsPermitidos = new Set<string>();
      if (maqIds.length > 0 && specIds.length > 0) {
        const { data: links } = await sb
          .from("producto_especificacion_maquinas")
          .select("especificacion_id")
          .in("maquina_id", maqIds)
          .in("especificacion_id", specIds);
        specsPermitidos = new Set(
          (links ?? []).map((l) => l.especificacion_id as string),
        );
      }
      productosVisibles = productos.filter((p) => {
        const vig = vigByProd.get(p.id);
        const bdf = bdfByProd.get(p.id);
        return (
          (vig && specsPermitidos.has(vig.id)) ||
          (bdf && specsPermitidos.has(bdf.id))
        );
      });
    }


    return productosVisibles.map((p) => {
      const vig = vigByProd.get(p.id);
      const bdf = bdfByProd.get(p.id);
      const tipo = (
        p as { tipos_producto?: { nombre?: string; familias_producto?: { nombre?: string } } }
      ).tipos_producto;
      const familyName = tipo?.familias_producto?.nombre ?? tipo?.nombre ?? "Sin familia";
      return {
        code: p.codigo,
        name: p.nombre,
        family: familyName,
        specVersion: vig?.version ?? null,
        hasSpec: !!vig,
        caracteristicas: vig?.caracteristicas ?? "",
        variables: mapVars(vig?.id),
        // Fase 3
        vigenteSpecId: vig?.id ?? null,
        borrador: bdf
          ? {
              id: bdf.id,
              version: bdf.version,
              estado: bdf.estado,
              caracteristicas: bdf.caracteristicas ?? "",
              variables: mapVars(bdf.id),
            }
          : null,
      };
    });
  });

// =============================================================================
// CARACTERÍSTICAS DE LOS ATRIBUTOS — update por código de producto
// =============================================================================

export const updateCaracteristicasByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        producto_codigo: z.string().min(1),
        caracteristicas: z.string().max(700),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    requireAnyRole(roles, ["calidad", ...ROLES_ADMIN, "direccion"]);

    const { data: prod } = await sb
      .from("productos")
      .select("id")
      .eq("codigo", data.producto_codigo)
      .maybeSingle();
    if (!prod) throw new Error(`Producto ${data.producto_codigo} no encontrado`);

    // Fase 3: las características se editan SIEMPRE sobre el borrador.
    const { data: spec } = await sb
      .from("producto_especificaciones")
      .select("id, estado, caracteristicas_atributos")
      .eq("producto_id", prod.id)
      .in("estado", ["borrador", "en_revision"])
      .maybeSingle();
    if (!spec) {
      throw new Error(
        "Primero crea un borrador para modificar esta especificación.",
      );
    }
    if (spec.estado === "en_revision") {
      throw new Error(
        "La especificación está en revisión; descarta o publica el borrador antes de editar.",
      );
    }

    // Guard de evidencia (flag ON) sobre el borrador.
    {
      const { data: flagRow } = await sb
        .from("app_settings")
        .select("spec_evidencia_obligatoria")
        .limit(1)
        .maybeSingle();
      const obligatoria =
        ((flagRow as unknown as { spec_evidencia_obligatoria?: boolean } | null)
          ?.spec_evidencia_obligatoria ?? false) === true;
      if (obligatoria) {
        const { data: ok, error: rErr } = await sb.rpc(
          "spec_tiene_evidencia_vigente",
          { _spec_id: spec.id as string },
        );
        if (rErr) throw new Error(rErr.message);
        if (ok !== true) {
          throw new Error(
            "El borrador no tiene evidencia documental vigente. Cárgala antes de modificar características.",
          );
        }
      }
    }

    const anterior = ((spec as unknown as { caracteristicas_atributos?: string | null })
      .caracteristicas_atributos ?? "") as string;
    const nuevo = data.caracteristicas;

    if (anterior === nuevo) return { ok: true, changed: false };

    const { error: upErr } = await sb
      .from("producto_especificaciones")
      .update({ caracteristicas_atributos: nuevo } as never)
      .eq("id", spec.id);
    if (upErr) throw new Error(upErr.message);

    const { data: profile } = await sb
      .from("profiles")
      .select("nombre")
      .eq("id", context.userId)
      .maybeSingle();

    const rolAuditor = roles.includes("calidad")
      ? "calidad"
      : roles.includes("gerente_general")
        ? "gerente_general"
        : roles.includes("administrador")
          ? "administrador"
          : "direccion";

    const auditPayload = {
      especificacion_id: spec.id,
      producto_id: prod.id,
      variable_id: null,
      variable_clave: "caracteristicas",
      variable_etiqueta: "Características de los atributos",
      campo: "caracteristicas",
      valor_anterior: null,
      valor_nuevo: null,
      valor_anterior_texto: anterior || null,
      valor_nuevo_texto: nuevo || null,
      motivo: anterior ? "Modificación de características" : "Alta de características",
      modificado_por: context.userId,
      modificado_por_nombre: profile?.nombre ?? null,
      modificado_por_rol: rolAuditor as never,
    };
    const { error } = await sb
      .from("spec_audit_log")
      .insert(auditPayload as never);
    if (error) throw new Error(error.message);
    return { ok: true, changed: true };
  });

// =============================================================================
// resolveRolloStatus — server-side (lee de Supabase, no del mock)
// =============================================================================

/**
 * Carga muestras + ajustes mínimos necesarios y delega en el resolver puro
 * `resolveRolloStatusFrom`. Esta es la única función que cualquier consumidor
 * (etiqueta, QR, reporte, dashboard) debe usar para obtener el estatus actual.
 */
export const resolveRolloStatusServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ResolveRolloInput) =>
    z
      .object({
        rolloId: z.union([z.string(), z.number()]).nullable().optional(),
        folio: z.string().nullable().optional(),
        ordenId: z.string().uuid().nullable().optional(),
        legacyEstatus: z.enum(["L", "NC", "C"]).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RolloStatusInfo> => {
    const sb = context.supabase as SB;
    let q = sb.from("muestras_calidad").select("*").limit(200);
    if (data.ordenId) q = q.eq("orden_id", data.ordenId);
    const { data: muestras, error } = await q;
    if (error) throw new Error(error.message);

    const muestraIds = (muestras ?? []).map((m) => m.id);
    let ajustes: AjusteCalidad[] = [];
    if (muestraIds.length > 0) {
      const { data: aj, error: eAj } = await sb
        .from("ajustes_calidad")
        .select("*")
        .in("muestra_id", muestraIds);
      if (eAj) throw new Error(eAj.message);
      ajustes = (aj ?? []) as unknown as AjusteCalidad[];
    }

    return resolveRolloStatusFrom(
      {
        muestras: (muestras ?? []) as unknown as MuestraCalidad[],
        ajustes,
      },
      data,
    );
  });

// =============================================================================
// NUMERACIÓN AUTOMÁTICA DE ROLLO POR MÁQUINA (solo lectura)
// Vigencia efectiva: 14/08/2026 07:00:00 hora Planta Tlaxcala (America/Mexico_City).
// Esta consulta NO consume números; sólo informa a la UI si la regla ya está
// activa según el reloj del servidor/BD.
// =============================================================================

export type EstadoNumeracionRollo = {
  configurada: boolean;
  activa: boolean;
  vigente_desde?: string;
  sufijo?: string;
  proximo_numero?: string;
  /** Folio que correspondería al contador sin considerar colisiones. */
  sugerido_base?: string;
  /** true cuando el folio del contador ya está ocupado por una muestra existente. */
  ocupado?: boolean;
  /** Cantidad de números omitidos hasta encontrar uno libre. */
  saltos?: number;
  ahora_servidor?: string;
};

export const getEstadoNumeracionRollo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ maquina_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<EstadoNumeracionRollo> => {
    const { data: r, error } = await (
      context.supabase as unknown as {
        rpc: (
          n: string,
          a: unknown,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("estado_numeracion_rollo", { _maquina_id: data.maquina_id });
    if (error || !r) return { configurada: false, activa: false };
    return r as EstadoNumeracionRollo;
  });
