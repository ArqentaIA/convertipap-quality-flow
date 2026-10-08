// =====================================================================
// Edición autorizada de rollos capturados (Control de Calidad y
// Captura fuera de turno) desde el buscador de Producción.
//
// Reglas de negocio (validadas en base de datos):
//  - Solo usuarios dados de alta en qc_edicion_permisos, por máquina.
//  - Solo dentro de las 24 horas posteriores a la captura del rollo.
//  - Motivo obligatorio (mínimo 10 caracteres) y bitácora completa.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const muestraSchema = z.object({ muestra_id: z.string().uuid() });

const editarSchema = z.object({
  muestra_id: z.string().uuid(),
  motivo: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres."),
  mediciones: z
    .array(
      z.object({
        clave: z.string().min(1),
        valor: z.number().finite(),
        // Valor que el cliente vio al abrir el formulario: si en el servidor
        // ya no coincide, otro usuario editó la bobina (control de concurrencia).
        esperado: z.number().finite().nullable().optional(),
      }),
    )
    .max(60)
    .optional(),
  operador: z.string().max(120).optional(),
  jefe_maquina: z.string().max(120).optional(),
  analista: z.string().max(120).optional(),
  observaciones_generales: z
    .string()
    .trim()
    .min(10, "Observaciones obligatorias (mínimo 10 caracteres).")
    .max(500),
  sku_sap: z.string().trim().max(64).optional(),
  dictamen: z.enum(["liberada", "concesion", "rechazada", "correccion_solicitada"]).optional(),
  producto_id: z.string().uuid().optional(),
  producto_esperado: z.string().uuid().optional(),
});

export type PermisoEdicionRollo = {
  puede: boolean;
  motivo?: string;
  expira_at?: string;
  maquina?: string;
};

/** ¿El usuario actual puede editar este rollo ahora mismo? */
export const puedeEditarRollo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => muestraSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("qc_puede_editar_rollo", {
      _muestra_id: data.muestra_id,
    } as never);
    if (error) throw new Error(error.message);
    return (res ?? { puede: false }) as PermisoEdicionRollo;
  });

/** Aplica la edición del rollo con motivo y trazabilidad. */
export const editarRolloCalidad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => editarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const cambios: Record<string, unknown> = {};
    if (data.mediciones?.length)
      cambios.mediciones = data.mediciones.map((m) => ({
        clave: m.clave,
        valor: m.valor,
        ...(m.esperado != null ? { esperado: m.esperado } : {}),
      }));
    if (data.operador !== undefined) cambios.operador = data.operador;
    if (data.jefe_maquina !== undefined) cambios.jefe_maquina = data.jefe_maquina;
    if (data.analista !== undefined) cambios.analista = data.analista;
    if (data.observaciones_generales !== undefined)
      cambios.observaciones_generales = data.observaciones_generales;
    if (data.sku_sap !== undefined) cambios.sku_sap = data.sku_sap;
    if (data.dictamen !== undefined) cambios.dictamen = data.dictamen;
    if (data.producto_id) {
      cambios.producto_id = data.producto_id;
      if (data.producto_esperado) cambios.producto_esperado = data.producto_esperado;
    }

    const { data: res, error } = await context.supabase.rpc("qc_editar_rollo", {
      _muestra_id: data.muestra_id,
      _cambios: cambios,
      _motivo: data.motivo,
    } as never);
    if (error) throw new Error(error.message);
    return (res ?? { ok: true, cambios: 0 }) as { ok: boolean; cambios: number; mensaje?: string };
  });

/** Bitácora de ediciones de un rollo. */
export const listEdicionesRollo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => muestraSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("qc_ediciones_rollo")
      .select("campo, valor_anterior, valor_nuevo, motivo, usuario_email, created_at")
      .eq("muestra_id", data.muestra_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      campo: r.campo as string,
      valorAnterior: (r.valor_anterior as string) ?? "—",
      valorNuevo: (r.valor_nuevo as string) ?? "—",
      motivo: (r.motivo as string) ?? "",
      usuario: (r.usuario_email as string) ?? "—",
      fecha: r.created_at as string,
    }));
  });

/** Productos activos con especificación vigente (para cambio de producto). */
export const listProductosCambio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: specs, error } = await context.supabase
      .from("producto_especificaciones")
      .select("producto_id, productos!inner(id, codigo, nombre, activo)")
      .eq("estado", "vigente");
    if (error) throw new Error(error.message);
    const map = new Map<string, { id: string; codigo: string; nombre: string }>();
    for (const s of specs ?? []) {
      const p = (s as unknown as { productos: { id: string; codigo: string; nombre: string; activo: boolean } }).productos;
      if (p?.activo && !map.has(p.id)) map.set(p.id, { id: p.id, codigo: p.codigo, nombre: p.nombre });
    }
    return [...map.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  });

/** Variables y límites que aplicarían al rollo con el producto indicado. */
export const previewSpecProducto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ producto_id: z.string().uuid(), maquina_id: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: specId, error: e1 } = await sb.rpc("qc_resolver_spec_producto", {
      _producto_id: data.producto_id,
      _maquina_id: data.maquina_id,
    } as never);
    if (e1) throw new Error(e1.message);
    if (!specId) throw new Error("El producto seleccionado no tiene especificación vigente.");
    const [{ data: vars, error: e2 }, { data: skus }] = await Promise.all([
      sb
        .from("producto_variables")
        .select("min_valor, objetivo, max_valor, variables_calidad(clave, etiqueta, unidad, orden)")
        .eq("especificacion_id", specId as string),
      sb.from("producto_skus_sap").select("sku_sap").eq("producto_id", data.producto_id),
    ]);
    if (e2) throw new Error(e2.message);
    const variables = (vars ?? [])
      .map((v) => {
        const vc = (v as unknown as { variables_calidad: { clave: string; etiqueta: string; unidad: string | null; orden: number } }).variables_calidad;
        return {
          clave: vc.clave,
          etiqueta: vc.etiqueta,
          unidad: vc.unidad ?? "",
          orden: vc.orden ?? 0,
          min: Number(v.min_valor),
          objetivo: Number(v.objetivo),
          max: Number(v.max_valor),
        };
      })
      .sort((a, b) => a.orden - b.orden);
    return { variables, skus: (skus ?? []).map((s) => s.sku_sap as string) };
  });
