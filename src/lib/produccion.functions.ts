// =====================================================================
// Fase 4b — Server functions de transición de Producción
// =====================================================================
// Todas las funciones se ejecutan como el usuario autenticado (RLS aplica)
// y aplican además checks explícitos de rol y reglas de negocio.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

// ------------------------- Helpers -------------------------

const ROLES_OPERATIVOS = ["capturista", "calidad", "gerente_general", "administrador"] as const;
const ROLES_ADMIN = ["gerente_general", "administrador"] as const;

async function getUserRoles(sb: SB, userId: string): Promise<string[]> {
  const { data, error } = await sb.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`No se pudieron leer roles: ${error.message}`);
  return (data ?? []).map((r) => r.role as string);
}

function requireAnyRole(userRoles: string[], allowed: readonly string[]) {
  if (!userRoles.some((r) => allowed.includes(r))) {
    throw new Error(`Acceso denegado. Roles requeridos: ${allowed.join(", ")}`);
  }
}

async function generarFolio(sb: SB): Promise<string> {
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const prefix = `OF-${yyyy}${mm}${dd}`;

  const { count, error } = await sb
    .from("ordenes_fabricacion")
    .select("id", { count: "exact", head: true })
    .like("folio", `${prefix}-%`);
  if (error) throw new Error(`Error generando folio: ${error.message}`);

  const next = String((count ?? 0) + 1).padStart(4, "0");
  return `${prefix}-${next}`;
}

async function getEspecificacionVigente(sb: SB, productoId: string): Promise<string> {
  const { data, error } = await sb
    .from("producto_especificaciones")
    .select("id")
    .eq("producto_id", productoId)
    .eq("estado", "vigente")
    .order("vigente_desde", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Error leyendo especificación: ${error.message}`);
  if (!data) {
    throw new Error(
      "El producto no tiene una especificación vigente. Aprueba una versión antes de iniciar producción.",
    );
  }
  return data.id;
}

async function upsertEstadoMaquina(
  sb: SB,
  maquinaId: string,
  patch: {
    estado: Database["public"]["Enums"]["maquina_estado"];
    orden_activa_id?: string | null;
    paro_activo_id?: string | null;
    actualizado_por: string;
  },
) {
  const { error } = await sb.from("maquina_estado_actual").upsert(
    {
      maquina_id: maquinaId,
      estado: patch.estado,
      orden_activa_id: patch.orden_activa_id ?? null,
      paro_activo_id: patch.paro_activo_id ?? null,
      ultimo_cambio: new Date().toISOString(),
      actualizado_por: patch.actualizado_por,
    },
    { onConflict: "maquina_id" },
  );
  if (error) throw new Error(`No se pudo actualizar estado de máquina: ${error.message}`);
}

// =====================================================================
// 1) CREAR ORDEN
// =====================================================================
const crearOrdenSchema = z.object({
  producto_id: z.string().uuid(),
  maquina_id: z.string().uuid(),
  planta_id: z.string().uuid(),
  turno: z.string().min(1).max(30).optional(),
  unidad_objetivo: z.enum(["kg", "rollos", "ambos"]).default("kg"),
  objetivo_kg: z.number().positive().optional(),
  objetivo_rollos: z.number().int().positive().optional(),
  fecha_programada: z.string().datetime().optional(),
  notas: z.string().max(1000).optional(),
});

export const crearOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => crearOrdenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);
    requireAnyRole(roles, ROLES_OPERATIVOS);

    // Especificación vigente al momento de crear (se reconfirma al iniciar)
    const especificacion_id = await getEspecificacionVigente(supabase, data.producto_id);

    const folio = await generarFolio(supabase);
    const estado = data.fecha_programada ? "programada" : "borrador";

    const { data: orden, error } = await supabase
      .from("ordenes_fabricacion")
      .insert({
        folio,
        producto_id: data.producto_id,
        especificacion_id,
        maquina_id: data.maquina_id,
        planta_id: data.planta_id,
        turno: data.turno ?? null,
        estado,
        unidad_objetivo: data.unidad_objetivo,
        objetivo_kg: data.objetivo_kg ?? null,
        objetivo_rollos: data.objetivo_rollos ?? null,
        fecha_programada: data.fecha_programada ?? null,
        creado_por: userId,
        notas: data.notas ?? null,
      })
      .select("id, folio, estado")
      .single();
    if (error) throw new Error(`Error creando orden: ${error.message}`);
    return orden;
  });

// =====================================================================
// 2) INICIAR ORDEN
// =====================================================================
const idSchema = z.object({ orden_id: z.string().uuid() });

export const iniciarOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);
    requireAnyRole(roles, ROLES_OPERATIVOS);

    const { data: orden, error: errOrden } = await supabase
      .from("ordenes_fabricacion")
      .select("id, estado, maquina_id, producto_id")
      .eq("id", data.orden_id)
      .single();
    if (errOrden) throw new Error(errOrden.message);

    if (!["borrador", "programada"].includes(orden.estado)) {
      throw new Error(`No se puede iniciar una orden en estado '${orden.estado}'.`);
    }

    // Validar que la máquina no tenga otra orden activa
    const { data: activa, error: errActiva } = await supabase
      .from("ordenes_fabricacion")
      .select("id, folio")
      .eq("maquina_id", orden.maquina_id)
      .in("estado", ["en_proceso", "pausada"])
      .neq("id", orden.id)
      .maybeSingle();
    if (errActiva) throw new Error(errActiva.message);
    if (activa) {
      throw new Error(
        `La máquina ya tiene una orden activa: ${activa.folio}. Ciérrala antes de iniciar otra.`,
      );
    }

    // Congelar especificación vigente al momento de iniciar
    const especificacion_id = await getEspecificacionVigente(supabase, orden.producto_id);

    const nowIso = new Date().toISOString();
    const { data: updated, error: errUpd } = await supabase
      .from("ordenes_fabricacion")
      .update({
        estado: "en_proceso",
        especificacion_id,
        fecha_inicio: nowIso,
        iniciado_por: userId,
      })
      .eq("id", orden.id)
      .select("id, folio, estado, fecha_inicio, especificacion_id")
      .single();
    if (errUpd) throw new Error(errUpd.message);

    await upsertEstadoMaquina(supabase, orden.maquina_id, {
      estado: "produciendo",
      orden_activa_id: orden.id,
      paro_activo_id: null,
      actualizado_por: userId,
    });

    return updated;
  });

// =====================================================================
// 3) PAUSAR ORDEN POR PARO
// =====================================================================
const pausarSchema = z.object({
  orden_id: z.string().uuid(),
  tipo_paro_id: z.string().uuid(),
  descripcion: z.string().max(1000).optional(),
});

export const pausarOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => pausarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);
    requireAnyRole(roles, ROLES_OPERATIVOS);

    const { data: orden, error } = await supabase
      .from("ordenes_fabricacion")
      .select("id, estado, maquina_id")
      .eq("id", data.orden_id)
      .single();
    if (error) throw new Error(error.message);
    if (orden.estado !== "en_proceso") {
      throw new Error(`Solo se puede pausar una orden 'en_proceso' (actual: '${orden.estado}').`);
    }

    // Verificar que no haya paro abierto en la máquina
    const { data: paroAbierto, error: errParo } = await supabase
      .from("paros_maquina")
      .select("id")
      .eq("maquina_id", orden.maquina_id)
      .is("fin", null)
      .maybeSingle();
    if (errParo) throw new Error(errParo.message);
    if (paroAbierto) {
      throw new Error("La máquina ya tiene un paro abierto.");
    }

    const { data: paro, error: errIns } = await supabase
      .from("paros_maquina")
      .insert({
        maquina_id: orden.maquina_id,
        orden_id: orden.id,
        tipo_paro_id: data.tipo_paro_id,
        descripcion: data.descripcion ?? null,
        abierto_por: userId,
      })
      .select("id, inicio")
      .single();
    if (errIns) throw new Error(errIns.message);

    const { error: errUpd } = await supabase
      .from("ordenes_fabricacion")
      .update({ estado: "pausada" })
      .eq("id", orden.id);
    if (errUpd) throw new Error(errUpd.message);

    await upsertEstadoMaquina(supabase, orden.maquina_id, {
      estado: "paro",
      orden_activa_id: orden.id,
      paro_activo_id: paro.id,
      actualizado_por: userId,
    });

    return { orden_id: orden.id, paro_id: paro.id, inicio: paro.inicio };
  });

// =====================================================================
// 4) REANUDAR ORDEN (cierra paro activo)
// =====================================================================
export const reanudarOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);
    requireAnyRole(roles, ROLES_OPERATIVOS);

    const { data: orden, error } = await supabase
      .from("ordenes_fabricacion")
      .select("id, estado, maquina_id")
      .eq("id", data.orden_id)
      .single();
    if (error) throw new Error(error.message);
    if (orden.estado !== "pausada") {
      throw new Error(`Solo se puede reanudar una orden 'pausada' (actual: '${orden.estado}').`);
    }

    // Cerrar paro abierto de la máquina
    const { data: paro, error: errParo } = await supabase
      .from("paros_maquina")
      .select("id")
      .eq("maquina_id", orden.maquina_id)
      .is("fin", null)
      .maybeSingle();
    if (errParo) throw new Error(errParo.message);
    if (!paro) {
      throw new Error("No hay paro abierto que cerrar. Verifica el estado de la máquina.");
    }

    const nowIso = new Date().toISOString();
    const { error: errCierre } = await supabase
      .from("paros_maquina")
      .update({ fin: nowIso, cerrado_por: userId })
      .eq("id", paro.id);
    if (errCierre) throw new Error(errCierre.message);

    const { error: errUpd } = await supabase
      .from("ordenes_fabricacion")
      .update({ estado: "en_proceso" })
      .eq("id", orden.id);
    if (errUpd) throw new Error(errUpd.message);

    await upsertEstadoMaquina(supabase, orden.maquina_id, {
      estado: "produciendo",
      orden_activa_id: orden.id,
      paro_activo_id: null,
      actualizado_por: userId,
    });

    return { orden_id: orden.id, paro_id: paro.id, fin: nowIso };
  });

// =====================================================================
// 5) CERRAR ORDEN
// =====================================================================
const cerrarSchema = z.object({
  orden_id: z.string().uuid(),
  producido_kg: z.number().nonnegative().optional(),
  producido_rollos: z.number().int().nonnegative().optional(),
  notas: z.string().max(1000).optional(),
});

export const cerrarOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => cerrarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);
    requireAnyRole(roles, ROLES_OPERATIVOS);

    const { data: orden, error } = await supabase
      .from("ordenes_fabricacion")
      .select("id, estado, maquina_id, producido_kg, producido_rollos, notas")
      .eq("id", data.orden_id)
      .single();
    if (error) throw new Error(error.message);
    if (!["en_proceso", "pausada"].includes(orden.estado)) {
      throw new Error(
        `Solo se puede cerrar una orden 'en_proceso' o 'pausada' (actual: '${orden.estado}').`,
      );
    }

    // Si hay paro abierto en la máquina, ciérralo automáticamente
    const nowIso = new Date().toISOString();
    const { data: paroAbierto } = await supabase
      .from("paros_maquina")
      .select("id")
      .eq("maquina_id", orden.maquina_id)
      .is("fin", null)
      .maybeSingle();
    if (paroAbierto) {
      await supabase
        .from("paros_maquina")
        .update({ fin: nowIso, cerrado_por: userId })
        .eq("id", paroAbierto.id);
    }

    // Auto-calcular producido si no se envió, basándose en rollos_producidos
    let producido_kg = data.producido_kg;
    let producido_rollos = data.producido_rollos;
    if (producido_kg === undefined || producido_rollos === undefined) {
      const { data: agg } = await supabase
        .from("rollos_producidos")
        .select("peso_kg")
        .eq("orden_id", orden.id);
      if (agg) {
        producido_rollos ??= agg.length;
        producido_kg ??= agg.reduce((acc, r) => acc + (Number(r.peso_kg) || 0), 0);
      }
    }

    const { data: updated, error: errUpd } = await supabase
      .from("ordenes_fabricacion")
      .update({
        estado: "finalizada",
        fecha_fin: nowIso,
        cerrado_por: userId,
        producido_kg: producido_kg ?? orden.producido_kg,
        producido_rollos: producido_rollos ?? orden.producido_rollos,
        notas: data.notas ?? orden.notas,
      })
      .eq("id", orden.id)
      .select("id, folio, estado, fecha_fin, producido_kg, producido_rollos")
      .single();
    if (errUpd) throw new Error(errUpd.message);

    await upsertEstadoMaquina(supabase, orden.maquina_id, {
      estado: "libre",
      orden_activa_id: null,
      paro_activo_id: null,
      actualizado_por: userId,
    });

    return updated;
  });

// =====================================================================
// 6) CANCELAR ORDEN
// =====================================================================
const cancelarSchema = z.object({
  orden_id: z.string().uuid(),
  motivo: z.string().min(3).max(500),
});

export const cancelarOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => cancelarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);
    requireAnyRole(roles, ROLES_ADMIN);

    const { data: orden, error } = await supabase
      .from("ordenes_fabricacion")
      .select("id, estado, maquina_id, notas")
      .eq("id", data.orden_id)
      .single();
    if (error) throw new Error(error.message);
    if (["finalizada", "cancelada"].includes(orden.estado)) {
      throw new Error(`No se puede cancelar una orden en estado '${orden.estado}'.`);
    }

    // Cerrar paro abierto si existe
    const nowIso = new Date().toISOString();
    const { data: paroAbierto } = await supabase
      .from("paros_maquina")
      .select("id")
      .eq("maquina_id", orden.maquina_id)
      .is("fin", null)
      .maybeSingle();
    if (paroAbierto) {
      await supabase
        .from("paros_maquina")
        .update({ fin: nowIso, cerrado_por: userId })
        .eq("id", paroAbierto.id);
    }

    const notasFinales = `${orden.notas ? orden.notas + "\n" : ""}[CANCELADA] ${data.motivo}`;

    const { data: updated, error: errUpd } = await supabase
      .from("ordenes_fabricacion")
      .update({
        estado: "cancelada",
        fecha_fin: nowIso,
        cerrado_por: userId,
        notas: notasFinales,
      })
      .eq("id", orden.id)
      .select("id, folio, estado, fecha_fin")
      .single();
    if (errUpd) throw new Error(errUpd.message);

    // Liberar máquina solo si esta orden la tenía ocupada
    const { data: mea } = await supabase
      .from("maquina_estado_actual")
      .select("orden_activa_id")
      .eq("maquina_id", orden.maquina_id)
      .maybeSingle();
    if (mea?.orden_activa_id === orden.id) {
      await upsertEstadoMaquina(supabase, orden.maquina_id, {
        estado: "libre",
        orden_activa_id: null,
        paro_activo_id: null,
        actualizado_por: userId,
      });
    }

    return updated;
  });

// =====================================================================
// 7) LECTURAS — Estado de máquinas, OEE, historial
// =====================================================================

/**
 * Lista todas las máquinas con su estado actual, orden activa, paro abierto
 * y métricas del turno actual (rollos, OEE estimado).
 */
const rangoEnum = z.enum(["dia", "semana", "mes", "año", "todo"]).default("dia");

function rangoToDesde(r: "dia" | "semana" | "mes" | "año" | "todo"): string | null {
  const now = Date.now();
  const H = 3600_000;
  switch (r) {
    case "dia": return new Date(now - 24 * H).toISOString();
    case "semana": return new Date(now - 7 * 24 * H).toISOString();
    case "mes": return new Date(now - 30 * 24 * H).toISOString();
    case "año": return new Date(now - 365 * 24 * H).toISOString();
    default: return null;
  }
}

const maquinasInputSchema = z.object({ rango: rangoEnum.optional() }).optional();

export const listMaquinasConEstado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => maquinasInputSchema.parse(input ?? undefined))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const rango = data?.rango ?? "dia";

    const { data: maquinas, error: errMaq } = await sb
      .from("maquinas")
      .select("id, codigo, nombre, area, planta_id, activo, plantas(nombre, codigo)")
      .eq("activo", true)
      .order("codigo");
    if (errMaq) throw new Error(errMaq.message);

    const ids = (maquinas ?? []).map((m) => m.id);
    if (ids.length === 0) return [];

    const desde24h = rangoToDesde(rango) ?? new Date(Date.now() - 24 * 3600_000).toISOString();
    const [
      { data: estados },
      { data: ordenes },
      { data: paros },
      { data: rollos },
      { data: muestras },
    ] = await Promise.all([
      sb.from("maquina_estado_actual").select("*").in("maquina_id", ids),
      sb
        .from("ordenes_fabricacion")
        .select(
          "id, folio, estado, maquina_id, producto_id, turno, fecha_inicio, productos(nombre, codigo)",
        )
        .in("maquina_id", ids)
        .in("estado", ["en_proceso", "pausada"]),
      sb
        .from("paros_maquina")
        .select(
          "id, maquina_id, inicio, fin, tipo_paro_id, descripcion, tipos_paro:tipo_paro_id(codigo, nombre)",
        )
        .in("maquina_id", ids)
        .gte("inicio", desde24h),
      sb
        .from("rollos_producidos")
        .select(
          "id, orden_id, peso_kg, registrado_at, ordenes_fabricacion:orden_id(maquina_id, fecha_inicio)",
        )
        .gte("registrado_at", desde24h),
      sb
        .from("muestras_calidad")
        .select(
          "id, maquina_id, hora_muestreo, numero_rollo, mediciones_calidad(variable_clave, valor)",
        )
        .in("maquina_id", ids)
        .gte("hora_muestreo", desde24h),
    ]);

    return (maquinas ?? []).map((m) => {
      const estado = estados?.find((e) => e.maquina_id === m.id) ?? null;
      const orden =
        ordenes?.find((o) => o.id === estado?.orden_activa_id) ??
        ordenes?.find((o) => o.maquina_id === m.id) ??
        null;
      const paroActivo = paros?.find((p) => p.maquina_id === m.id && p.fin === null) ?? null;

      const rollosMaq = (rollos ?? []).filter(
        (r) =>
          (r as { ordenes_fabricacion?: { maquina_id?: string } | null })?.ordenes_fabricacion
            ?.maquina_id === m.id,
      );
      const muestrasMaq = (muestras ?? []).filter((ms) => ms.maquina_id === m.id);
      const rollosTurno = rollosMaq.length > 0 ? rollosMaq.length : muestrasMaq.length;
      const kgTurno =
        rollosMaq.length > 0
          ? rollosMaq.reduce((s, r) => s + (Number(r.peso_kg) || 0), 0)
          : muestrasMaq.reduce((s, ms) => {
              const peso = (ms.mediciones_calidad ?? []).find(
                (md) => md.variable_clave === "peso",
              )?.valor;
              return s + (Number(peso) || 0);
            }, 0);

      // OEE estimado simple: 1 - (minutos parados últimas 24h / 1440)
      const parosMaq = (paros ?? []).filter((p) => p.maquina_id === m.id);
      const minutosParo = parosMaq.reduce((s, p) => {
        const fin = p.fin ? new Date(p.fin).getTime() : Date.now();
        const ini = new Date(p.inicio).getTime();
        return s + Math.max(0, (fin - ini) / 60000);
      }, 0);
      const oee = Math.max(0, Math.min(100, (1 - minutosParo / 1440) * 100));

      let estadoUI: "operando" | "paro" | "mantenimiento" | "libre" = "libre";
      if (estado?.estado === "produciendo") estadoUI = "operando";
      else if (estado?.estado === "paro") estadoUI = "paro";
      else if (estado?.estado === "mantenimiento") estadoUI = "mantenimiento";

      return {
        id: m.id,
        codigo: m.codigo,
        nombre: m.nombre,
        planta: (m as { plantas?: { nombre?: string } | null }).plantas?.nombre ?? "—",
        estado: estadoUI,
        orden: orden
          ? {
              id: orden.id,
              folio: orden.folio,
              producto: orden.productos?.nombre ?? "—",
              turno: orden.turno ?? "—",
            }
          : null,
        paroActivo: paroActivo
          ? {
              id: paroActivo.id,
              inicio: paroActivo.inicio,
              tipo:
                (paroActivo as { tipos_paro?: { nombre?: string } | null }).tipos_paro?.nombre ??
                "—",
              descripcion: paroActivo.descripcion,
            }
          : null,
        rollosTurno,
        kgTurno: Math.round(kgTurno * 10) / 10,
        oee: Math.round(oee * 10) / 10,
        ultimoCambio: estado?.ultimo_cambio ?? null,
      };
    });
  });

/**
 * Historial de órdenes de una máquina, con métricas de calidad.
 */
const histSchema = z.object({ maquina_id: z.string().uuid() });
export const listHistorialMaquina = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => histSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: ordenes, error } = await sb
      .from("ordenes_fabricacion")
      .select(
        `id, folio, estado, turno, fecha_inicio, fecha_fin,
         producido_kg, producido_rollos,
         producto_id, productos(nombre, codigo),
         maquina_id, maquinas(codigo, nombre),
         planta_id, plantas(nombre)`,
      )
      .eq("maquina_id", data.maquina_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ordIds = (ordenes ?? []).map((o) => o.id);
    let muestrasPorOrden: Record<string, { total: number; liberadas: number; rechazadas: number }> =
      {};
    if (ordIds.length > 0) {
      const { data: muestras } = await sb
        .from("muestras_calidad")
        .select("orden_id, dictamen")
        .in("orden_id", ordIds);
      muestrasPorOrden = (muestras ?? []).reduce<typeof muestrasPorOrden>((acc, m) => {
        const k = m.orden_id;
        if (!k) return acc;
        acc[k] ??= { total: 0, liberadas: 0, rechazadas: 0 };
        acc[k].total++;
        if (m.dictamen === "liberada") acc[k].liberadas++;
        if (m.dictamen === "rechazada") acc[k].rechazadas++;
        return acc;
      }, {});
    }

    return (ordenes ?? []).map((o) => {
      const ms = muestrasPorOrden[o.id] ?? { total: 0, liberadas: 0, rechazadas: 0 };
      const cumplimiento = ms.total > 0 ? Math.round((ms.liberadas / ms.total) * 1000) / 10 : null;
      const estatus: "L" | "NC" | "C" = ms.rechazadas > 0 ? "NC" : ms.liberadas > 0 ? "L" : "C";
      return {
        ordenId: o.id,
        folio: o.folio,
        estado: o.estado,
        fecha: (o.fecha_inicio ?? o.fecha_fin ?? "").slice(0, 10),
        turno: o.turno ?? "—",
        producto: o.productos?.nombre ?? "—",
        maquina: o.maquinas?.codigo ?? "—",
        planta: o.plantas?.nombre ?? "—",
        rollos: o.producido_rollos ?? 0,
        kg: Number(o.producido_kg ?? 0),
        muestrasTotal: ms.total,
        muestrasLiberadas: ms.liberadas,
        muestrasRechazadas: ms.rechazadas,
        cumplimiento,
        estatus,
      };
    });
  });

/**
 * Catálogo de tipos de paro (para el modal de "registrar paro").
 */
export const listTiposParo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;
    const { data, error } = await sb
      .from("tipos_paro")
      .select("id, codigo, nombre, categoria")
      .eq("activo", true)
      .order("orden");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// =====================================================================
// 8) DETALLE DE CALIDAD POR ORDEN (todas las muestras + mediciones)
// =====================================================================
const detalleSchema = z.object({
  orden_id: z.string().uuid(),
  rango: z.enum(["dia", "semana", "mes", "año", "todo"]).default("todo"),
});

export const getDetalleCalidadOrden = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => detalleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;

    const now = Date.now();
    const HOUR = 3600_000;
    const desde =
      data.rango === "dia" ? new Date(now - 24 * HOUR).toISOString()
      : data.rango === "semana" ? new Date(now - 7 * 24 * HOUR).toISOString()
      : data.rango === "mes" ? new Date(now - 30 * 24 * HOUR).toISOString()
      : data.rango === "año" ? new Date(now - 365 * 24 * HOUR).toISOString()
      : null;

    const { data: orden, error: errOrden } = await sb
      .from("ordenes_fabricacion")
      .select(`id, folio, turno, fecha_inicio, fecha_fin, producido_kg, producido_rollos,
               productos(nombre, codigo), maquinas(codigo, nombre), plantas(nombre)`)
      .eq("id", data.orden_id)
      .single();
    if (errOrden) throw new Error(errOrden.message);

    let q = sb
      .from("muestras_calidad")
      .select(
        `id, numero_rollo, hora_muestreo, turno, operador, jefe_maquina, analista,
         dictamen, estatus_liberacion, defectos, observaciones_generales,
         mediciones_calidad(variable_clave, valor, min_snapshot, objetivo_snapshot, max_snapshot, estado, observacion)`,
      )
      .eq("orden_id", data.orden_id)
      .order("hora_muestreo", { ascending: false });
    if (desde) q = q.gte("hora_muestreo", desde);

    const { data: muestras, error: errM } = await q;
    if (errM) throw new Error(errM.message);

    const filas = (muestras ?? []).map((m: any) => {
      const meds = (m.mediciones_calidad ?? []) as any[];
      const peso = meds.find((x) => x.variable_clave === "peso")?.valor;
      const ncCount = meds.filter((x) => x.estado === "no_conforme" || x.estado === "fuera_rango_critico").length;
      const total = meds.length;
      const cumplimiento = total > 0 ? Math.round(((total - ncCount) / total) * 1000) / 10 : null;
      const estatus = m.estatus_liberacion ?? m.dictamen ?? "pendiente";
      return {
        muestraId: m.id as string,
        rollo: m.numero_rollo as string,
        capturadoAt: m.hora_muestreo as string,
        turno: (m.turno as string) ?? "—",
        operador: (m.operador as string) ?? "—",
        jefeMaquina: (m.jefe_maquina as string) ?? "—",
        analista: (m.analista as string) ?? "—",
        estatus,
        defectos: ((m.defectos ?? []) as string[]).filter(Boolean),
        observaciones: (m.observaciones_generales as string) ?? "",
        pesoKg: peso === null || peso === undefined ? null : Number(peso),
        ncCount,
        totalMediciones: total,
        cumplimiento,
        mediciones: meds.map((x) => ({
          clave: x.variable_clave as string,
          valor: x.valor === null ? null : Number(x.valor),
          min: x.min_snapshot === null ? null : Number(x.min_snapshot),
          objetivo: x.objetivo_snapshot === null ? null : Number(x.objetivo_snapshot),
          max: x.max_snapshot === null ? null : Number(x.max_snapshot),
          estado: x.estado as string,
          observacion: (x.observacion as string) ?? "",
        })),
      };
    });

    // Resumen
    const totalRollos = filas.length;
    const ncRollos = filas.filter((f) => f.estatus === "rechazada" || f.estatus === "NC" || f.ncCount > 0).length;
    const okRollos = totalRollos - ncRollos;
    const cumplimientoProm = filas.length
      ? Math.round(
          (filas.reduce((s, f) => s + (f.cumplimiento ?? 100), 0) / filas.length) * 10,
        ) / 10
      : null;
    const kgTotal = filas.reduce((s, f) => s + (f.pesoKg ?? 0), 0);

    return {
      orden: {
        folio: orden.folio as string,
        turno: (orden.turno as string) ?? "—",
        producto: (orden as any).productos?.nombre ?? "—",
        productoCodigo: (orden as any).productos?.codigo ?? "—",
        maquina: (orden as any).maquinas?.codigo ?? "—",
        planta: (orden as any).plantas?.nombre ?? "—",
        fechaInicio: orden.fecha_inicio as string | null,
        fechaFin: orden.fecha_fin as string | null,
      },
      resumen: { totalRollos, okRollos, ncRollos, cumplimientoProm, kgTotal: Math.round(kgTotal * 10) / 10 },
      filas,
    };
  });

export type DetalleCalidadOrden = Awaited<ReturnType<typeof getDetalleCalidadOrden>>;

// =====================================================================
// 8b) DETALLE DE CALIDAD POR ROLLO (una muestra · 14 variables)
// =====================================================================
const detalleRolloSchema = z.object({ muestra_id: z.string().uuid() });

export const getDetalleRollo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => detalleRolloSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;

    const { data: m, error } = await sb
      .from("muestras_calidad")
      .select(
        `id, numero_rollo, hora_muestreo, turno, operador, jefe_maquina, analista,
         dictamen, estatus_liberacion, defectos, observaciones_generales,
         variables_snapshot_json,
         ordenes_fabricacion(folio, productos(nombre, codigo), maquinas(codigo), plantas(nombre)),
         mediciones_calidad(variable_clave, valor, min_snapshot, objetivo_snapshot, max_snapshot, estado, observacion)`,
      )
      .eq("id", data.muestra_id)
      .single();
    if (error) throw new Error(error.message);

    const snap = (m.variables_snapshot_json ?? {}) as Record<
      string,
      { min: number; obj: number; max: number; unidad: string; etiqueta: string }
    >;
    const meds = ((m.mediciones_calidad ?? []) as any[]).map((x) => {
      const s = snap[x.variable_clave] ?? null;
      return {
        clave: x.variable_clave as string,
        etiqueta: s?.etiqueta ?? (x.variable_clave as string),
        unidad: s?.unidad ?? "",
        valor: x.valor === null ? null : Number(x.valor),
        min: x.min_snapshot === null ? null : Number(x.min_snapshot),
        objetivo: x.objetivo_snapshot === null ? null : Number(x.objetivo_snapshot),
        max: x.max_snapshot === null ? null : Number(x.max_snapshot),
        estado: x.estado as string,
        observacion: (x.observacion as string) ?? "",
      };
    });

    // Completar con variables del snapshot que aún no tengan medición
    const presentes = new Set(meds.map((x) => x.clave));
    for (const [clave, s] of Object.entries(snap)) {
      if (presentes.has(clave)) continue;
      meds.push({
        clave,
        etiqueta: s.etiqueta ?? clave,
        unidad: s.unidad ?? "",
        valor: null,
        min: s.min ?? null,
        objetivo: s.obj ?? null,
        max: s.max ?? null,
        estado: "pendiente",
        observacion: "",
      });
    }

    const ord = (m as any).ordenes_fabricacion;
    const ncCount = meds.filter((x) => x.estado === "no_conforme" || x.estado === "fuera_rango_critico").length;
    const totalConValor = meds.filter((x) => x.valor !== null).length;
    const cumplimiento = totalConValor > 0
      ? Math.round(((totalConValor - ncCount) / totalConValor) * 1000) / 10
      : null;

    return {
      rollo: {
        muestraId: m.id as string,
        numero: (m.numero_rollo as string) ?? "—",
        capturadoAt: m.hora_muestreo as string,
        turno: (m.turno as string) ?? "—",
        operador: (m.operador as string) ?? "—",
        jefeMaquina: (m.jefe_maquina as string) ?? "—",
        analista: (m.analista as string) ?? "—",
        estatus: (m.estatus_liberacion ?? m.dictamen ?? "pendiente") as string,
        defectos: ((m.defectos ?? []) as string[]).filter(Boolean),
        observaciones: (m.observaciones_generales as string) ?? "",
        folioOrden: ord?.folio ?? "—",
        producto: ord?.productos?.nombre ?? "—",
        productoCodigo: ord?.productos?.codigo ?? "—",
        maquina: ord?.maquinas?.codigo ?? "—",
        planta: ord?.plantas?.nombre ?? "—",
        ncCount,
        cumplimiento,
      },
      mediciones: meds,
    };
  });

export type DetalleRollo = Awaited<ReturnType<typeof getDetalleRollo>>;


// =====================================================================
// 9) LISTAR ROLLOS INDIVIDUALES POR MÁQUINA + RANGO
// =====================================================================
const rollosSchema = z.object({
  maquina_id: z.string().uuid(),
  rango: rangoEnum.optional(),
});

export const listRollosMaquina = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rollosSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const desde = rangoToDesde(data.rango ?? "dia");

    let q = sb
      .from("muestras_calidad")
      .select(
        `id, numero_rollo, hora_muestreo, turno, operador, jefe_maquina, analista,
         dictamen, estatus_liberacion, defectos, orden_id,
         ordenes_fabricacion:orden_id(folio, productos(nombre, codigo)),
         mediciones_calidad(variable_clave, valor, estado)`,
      )
      .eq("maquina_id", data.maquina_id)
      .order("hora_muestreo", { ascending: false })
      .limit(500);
    if (desde) q = q.gte("hora_muestreo", desde);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r: any) => {
      const meds = (r.mediciones_calidad ?? []) as any[];
      const peso = meds.find((x) => x.variable_clave === "peso")?.valor;
      const total = meds.length;
      const nc = meds.filter((x) => x.estado === "no_conforme" || x.estado === "fuera_rango_critico").length;
      const cumplimiento = total > 0 ? Math.round(((total - nc) / total) * 1000) / 10 : null;
      const estatus: "L" | "NC" | "C" =
        r.estatus_liberacion === "rechazada" || r.dictamen === "rechazada" || nc > 0
          ? "NC"
          : r.estatus_liberacion === "liberada" || r.dictamen === "liberada"
          ? "L"
          : "C";
      return {
        muestraId: r.id as string,
        ordenId: r.orden_id as string,
        folioOrden: r.ordenes_fabricacion?.folio ?? "—",
        rollo: r.numero_rollo as string,
        capturadoAt: r.hora_muestreo as string,
        turno: (r.turno as string) ?? "—",
        operador: (r.operador as string) ?? "—",
        producto: r.ordenes_fabricacion?.productos?.nombre ?? "—",
        pesoKg: peso === null || peso === undefined ? null : Number(peso),
        cumplimiento,
        ncCount: nc,
        totalMediciones: total,
        estatus,
      };
    });
  });

// ------------------------- Buscador global por folio de rollo -------------------------
const buscarRolloSchema = z.object({
  q: z.string().trim().min(1).max(64),
});

export const buscarRolloPorFolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => buscarRolloSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: rows, error } = await sb
      .from("muestras_calidad")
      .select(
        `id, numero_rollo, hora_muestreo, orden_id, maquina_id,
         ordenes_fabricacion:orden_id(folio),
         maquinas:maquina_id(codigo, nombre)`,
      )
      .ilike("numero_rollo", `%${data.q}%`)
      .order("hora_muestreo", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      muestraId: r.id as string,
      ordenId: r.orden_id as string | null,
      rollo: r.numero_rollo as string,
      folioOrden: r.ordenes_fabricacion?.folio ?? "—",
      maquinaCodigo: r.maquinas?.codigo ?? "—",
      maquinaNombre: r.maquinas?.nombre ?? "",
      capturadoAt: r.hora_muestreo as string,
    }));
  });
