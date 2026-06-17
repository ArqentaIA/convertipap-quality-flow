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
import {
  resolveRolloStatusFrom,
  type ResolveRolloInput,
  type RolloStatusInfo,
} from "@/lib/roll-status";
import type { MuestraCalidad, AjusteCalidad } from "@/lib/qc-types";

type SB = SupabaseClient<Database>;

// ------------------------- Roles -------------------------

const ROLES_CAPTURA = ["capturista", "calidad", "gerente_general", "administrador"] as const;
// Solo Calidad y Administrador pueden dictaminar / autorizar / cambiar estatus.
const ROLES_DICTAMEN = ["calidad", "administrador"] as const;
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
    const userId = context.userId;

    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      sb.from("profiles").select("laboratorio").eq("id", userId).maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const seesAll = roles.some((r) =>
      ["administrador", "gerente_general", "direccion", "calidad"].includes(r),
    );
    const isCapturista = roles.includes("capturista");

    let q = sb
      .from("maquinas")
      .select("id, nombre, codigo, area, planta_id, plantas(id, nombre, codigo)")
      .eq("activo", true)
      .order("codigo");

    if (!seesAll && isCapturista) {
      const lab = profile?.laboratorio as "norte" | "sur" | null | undefined;
      if (!lab) return [];
      // BD usa 'Laboratorio Nte.' / 'Laboratorio Sur' — matchear ambas variantes.
      const orExpr = lab === "norte" ? "area.ilike.%Nte%,area.ilike.%Norte%" : "area.ilike.%Sur%";
      q = q.or(orExpr);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
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
        `id, version, estado, producto_id,
         productos(id, codigo, nombre, activo, tipo_id)`,
      )
      .eq("estado", "vigente");
    if (error) throw new Error(error.message);

    return (data ?? [])
      .filter((row) => row.productos && row.productos.activo)
      .map((row) => ({
        producto_id: row.producto_id,
        codigo: row.productos!.codigo,
        nombre: row.productos!.nombre,
        especificacion_id: row.id,
        especificacion_version: row.version,
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  });

/**
 * Devuelve la especificación vigente + variables (min/objetivo/max) de un producto.
 */
export const getSpecPorProducto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productoId: string }) =>
    z.object({ productoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: spec, error: eSpec } = await sb
      .from("producto_especificaciones")
      .select("id, version, estado, producto_id")
      .eq("producto_id", data.productoId)
      .eq("estado", "vigente")
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eSpec) throw new Error(eSpec.message);
    if (!spec) throw new Error("El producto no tiene especificación vigente");

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
    let q = sb
      .from("muestras_calidad")
      .select(
        `id, hora_muestreo, capturado_at, secuencia_captura, numero_rollo, estado, observaciones_generales,
         producto_id, maquina_id, capturado_por, turno,
         jefe_maquina, operador, prensero, analista,
         estatus_liberacion, defectos,
         dictamen, dictamen_observaciones, dictamen_motivo, dictamen_at,
         autorizado_por, autorizado_at, rol_autorizador,
         productos(id, codigo, nombre),
         maquinas(id, codigo, nombre, planta_id, plantas(codigo, nombre)),
         mediciones_calidad(variable_id, variable_clave, valor, min_snapshot, objetivo_snapshot, max_snapshot, estado, variables_calidad(clave, etiqueta, unidad))`,
      )
      .order("secuencia_captura", { ascending: false })
      .limit(seesAll ? 50 : 20);
    if (!seesAll) q = q.eq("capturado_por", userId);
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
        estatus_liberacion: z.enum(["L", "NC", "C"]).nullable().optional(),
        defectos: z.array(z.string().max(60)).max(20).default([]),
        tipo_muestreo: z.enum(["por_rollo", "por_tiempo"]),
        hora_muestreo: z.string().nullable().optional(),
        observaciones_generales: z.string().default(""),
        defecto_visual_conversion: z.string().trim().max(60).nullable().optional(),
        variable_tecnica_dimensional: z.string().trim().max(60).nullable().optional(),
        criterio_defecto: z.enum(["MENOR", "MAYOR", "CRÍTICO"]).nullable().optional(),
        variables_snapshot_json: z.record(z.string(), z.unknown()).default({}),
        mediciones: z.array(medicionInputSchema),
        enviar_a_revision: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const userId = context.userId;
    const roles = await getUserRoles(sb, userId);
    requireAnyRole(roles, ROLES_CAPTURA);

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

    // NC capturado se envía automáticamente a Bandeja de Revisión de Calidad,
    // ya que solo el Gerente de Calidad puede liberarlo. Esto evita que rollos
    // No Conformes queden "ocultos" en estado borrador sin posibilidad de
    // dictamen autorizado.
    const estadoMuestra: Database["public"]["Enums"]["qc_muestra_estado"] =
      data.enviar_a_revision || data.estatus_liberacion === "NC"
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
      estatus_liberacion: data.estatus_liberacion ?? null,
      defectos: data.defectos ?? [],
      tipo_muestreo: data.tipo_muestreo,
      hora_muestreo: data.hora_muestreo || new Date().toISOString(),
      observaciones_generales: data.observaciones_generales,
      variables_snapshot_json: data.variables_snapshot_json as never,
      estado: estadoMuestra,
      capturado_por: userId,
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

    // Pre-validación: el número de rollo debe ser único en toda la plataforma.
    // Se excluye la propia muestra cuando se trata de una edición.
    {
      let q = sb
        .from("muestras_calidad")
        .select("id")
        .eq("numero_rollo", data.numero_rollo)
        .limit(1);
      if (data.muestra_id) q = q.neq("id", data.muestra_id);
      const { data: dup, error: eDup } = await q.maybeSingle();
      if (eDup) throw new Error(eDup.message);
      if (dup) throw new Error(ROLLO_DUPLICADO_MSG);
    }

    let muestraId = data.muestra_id;
    if (muestraId) {
      const { error } = await sb
        .from("muestras_calidad")
        .update(muestraPayload)
        .eq("id", muestraId);
      if (error) {
        if (error.code === "23505" || /duplicate key|unique/i.test(error.message)) {
          throw new Error(ROLLO_DUPLICADO_MSG);
        }
        throw new Error(error.message);
      }
      // borrar mediciones previas y reinsertar
      const { error: eDel } = await sb
        .from("mediciones_calidad")
        .delete()
        .eq("muestra_id", muestraId);
      if (eDel) throw new Error(eDel.message);
    } else {
      const { data: nueva, error } = await sb
        .from("muestras_calidad")
        .insert(muestraPayload)
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505" || /duplicate key|unique/i.test(error.message)) {
          throw new Error(ROLLO_DUPLICADO_MSG);
        }
        throw new Error(error.message);
      }
      muestraId = nueva.id;
    }

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
      const { error } = await sb.from("mediciones_calidad").insert(medsPayload);
      if (error) throw new Error(error.message);
    }

    return { muestra_id: muestraId, reabre_dictamen: !!dictamenPrevioAt };
  });

export const dictaminarMuestra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        muestra_id: z.string().uuid(),
        dictamen: z.enum(["liberada", "rechazada", "concesion"]),
        motivo: z.string().min(1),
        observaciones: z
          .string()
          .trim()
          .min(10, "Las observaciones del Gerente de Calidad son obligatorias (mín. 10 caracteres) y quedan registradas como evidencia."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    requireRollStatusRole(roles);

    // Snapshot previo — sirve como evidencia de qué se modificó.
    const { data: prev } = await sb
      .from("muestras_calidad")
      .select("dictamen, estatus_liberacion, estado, autorizado_por, planta_id, maquina_id, numero_rollo")
      .eq("id", data.muestra_id)
      .maybeSingle();

    const now = new Date().toISOString();
    const estatusLiberacion =
      data.dictamen === "liberada" ? "L" : data.dictamen === "concesion" ? "C" : "NC";
    const { error } = await sb
      .from("muestras_calidad")
      .update({
        dictamen: data.dictamen,
        dictamen_motivo: data.motivo,
        dictamen_observaciones: data.observaciones,
        dictamen_at: now,
        revisado_por: context.userId,
        revisado_at: now,
        autorizado_por: context.userId,
        autorizado_at: now,
        rol_autorizador: "calidad",
        estatus_liberacion: estatusLiberacion,
        estado:
          data.dictamen === "liberada"
            ? "liberada"
            : data.dictamen === "rechazada"
              ? "rechazada"
              : "concesion",
      })
      .eq("id", data.muestra_id);
    if (error) throw new Error(error.message);

    // Auditoría enriquecida: usuario, IP, dispositivo, planta, máquina, lab,
    // folio, estatus anterior/nuevo, motivo. Inalterable por RLS.
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      // IP auténtica de Cloudflare (cf-connecting-ip). No usar x-forwarded-for:
      // es manipulable por el cliente y puede falsificar la trazabilidad.
      const ip = req?.headers.get("cf-connecting-ip") ?? null;
      const ua = req?.headers.get("user-agent") ?? null;
      let lab: string | null = null;
      let codigoMaquina: string | null = null;
      if (prev?.maquina_id) {
        const { data: m } = await sb.from("maquinas").select("codigo").eq("id", prev.maquina_id).maybeSingle();
        codigoMaquina = m?.codigo ?? null;
        if (codigoMaquina === "MP-06" || codigoMaquina === "MP-07") lab = "norte";
        else if (codigoMaquina === "MP-04" || codigoMaquina === "MP-05") lab = "sur";
      }
      await (sb as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
        .from("audit_log")
        .insert({
          tabla_afectada: "muestras_calidad",
          operacion: "STATUS_CHANGE",
          registro_id: data.muestra_id,
          datos_anteriores: { estado: prev?.estado ?? null, dictamen: prev?.dictamen ?? null, estatus_liberacion: prev?.estatus_liberacion ?? null },
          datos_nuevos: { dictamen: data.dictamen, estatus_liberacion: estatusLiberacion },
          usuario_id: context.userId,
          modulo: "control_calidad",
          descripcion_accion: `Dictamen ${data.dictamen}`,
          ip_address: ip,
          user_agent: ua,
          planta_id: prev?.planta_id ?? null,
          maquina_id: prev?.maquina_id ?? null,
          laboratorio: lab,
          folio_rollo: prev?.numero_rollo ?? null,
          estatus_anterior: prev?.estatus_liberacion ?? prev?.estado ?? null,
          estatus_nuevo: estatusLiberacion,
          motivo: data.motivo,
        });
    } catch {
      /* audit best-effort */
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

    const { data: spec } = await sb
      .from("producto_especificaciones")
      .select("id")
      .eq("producto_id", prod.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!spec) throw new Error(`Sin especificación registrada para ${data.producto_codigo}`);

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
      .select("id, producto_id, version, estado, created_at")
      .in("producto_id", productoIds)
      .order("created_at", { ascending: false });
    if (sErr) throw new Error(sErr.message);

    // Última spec por producto
    const specByProd = new Map<string, { id: string; version: string }>();
    for (const s of specsRows ?? []) {
      if (!specByProd.has(s.producto_id)) {
        specByProd.set(s.producto_id, { id: s.id, version: s.version });
      }
    }

    const specIds = Array.from(specByProd.values()).map((s) => s.id);
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

    const specCaracMap = new Map<string, string | null>();
    for (const s of specsRows ?? []) {
      if (!specCaracMap.has(s.producto_id)) {
        const row = s as unknown as { caracteristicas_atributos?: string | null };
        specCaracMap.set(s.producto_id, row.caracteristicas_atributos ?? null);
      }
    }

    return productos.map((p) => {
      const spec = specByProd.get(p.id);
      const tipo = (
        p as { tipos_producto?: { nombre?: string; familias_producto?: { nombre?: string } } }
      ).tipos_producto;
      const familyName = tipo?.familias_producto?.nombre ?? tipo?.nombre ?? "Sin familia";
      const variables = (spec ? pvRows.filter((r) => r.especificacion_id === spec.id) : [])
        .map((r) => ({
          key: r.variables_calidad?.clave ?? "",
          label: r.variables_calidad?.etiqueta ?? r.variables_calidad?.clave ?? "—",
          unit: r.variables_calidad?.unidad ?? "",
          min: Number(r.min_valor),
          objective: Number(r.objetivo),
          max: Number(r.max_valor),
          orden: r.variables_calidad?.orden ?? 0,
        }))
        .sort((a, b) => a.orden - b.orden);
      return {
        code: p.codigo,
        name: p.nombre,
        family: familyName,
        specVersion: spec?.version ?? null,
        hasSpec: !!spec,
        caracteristicas: specCaracMap.get(p.id) ?? "",
        variables,
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

    const { data: spec } = await sb
      .from("producto_especificaciones")
      .select("id, caracteristicas_atributos")
      .eq("producto_id", prod.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!spec) throw new Error(`Sin especificación registrada para ${data.producto_codigo}`);

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
