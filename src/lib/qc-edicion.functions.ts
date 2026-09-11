// =====================================================================
// Edición autorizada de rollos capturados (Control de Calidad y
// Captura fuera de turno) desde el buscador de Producción.
//
// Reglas de negocio (validadas en base de datos):
//  - Solo usuarios dados de alta en qc_edicion_permisos, por máquina.
//  - Solo dentro de las 12 horas posteriores a la captura del rollo.
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
    .array(z.object({ clave: z.string().min(1), valor: z.number().finite() }))
    .max(60)
    .optional(),
  operador: z.string().max(120).optional(),
  jefe_maquina: z.string().max(120).optional(),
  analista: z.string().max(120).optional(),
  observaciones_generales: z.string().max(500).optional(),
  sku_sap: z.string().trim().max(64).optional(),
  dictamen: z.enum(["liberada", "concesion", "rechazada", "correccion_solicitada"]).optional(),
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
    if (data.mediciones?.length) cambios.mediciones = data.mediciones;
    if (data.operador !== undefined) cambios.operador = data.operador;
    if (data.jefe_maquina !== undefined) cambios.jefe_maquina = data.jefe_maquina;
    if (data.analista !== undefined) cambios.analista = data.analista;
    if (data.observaciones_generales !== undefined)
      cambios.observaciones_generales = data.observaciones_generales;
    if (data.sku_sap !== undefined) cambios.sku_sap = data.sku_sap;
    if (data.dictamen !== undefined) cambios.dictamen = data.dictamen;

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
