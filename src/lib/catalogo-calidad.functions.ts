// =====================================================================
// Catálogo Maestro de Especificaciones — gestión de productos
// (Editar versión/SKU, Agregar producto, Eliminar = desactivar).
// Permiso validado en base de datos: administrador y Calidad autorizada.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SB = typeof import("@/integrations/supabase/client").supabase;

async function productoIdPorCodigo(sb: SB, codigo: string): Promise<string> {
  const { data, error } = await sb.from("productos").select("id").eq("codigo", codigo).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Producto no encontrado.");
  return data.id as string;
}

export const puedeGestionarCatalogo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as SB).rpc("puede_gestionar_catalogo_calidad", {
      _uid: context.userId,
    } as never);
    return { puede: data === true };
  });

/** Datos para los formularios: familias/tipos, variables del catálogo y SKUs del producto. */
export const datosFormularioCatalogo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ codigo: z.string().max(30).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const [tipos, vars] = await Promise.all([
      sb.from("tipos_producto").select("id, codigo, nombre").eq("activo", true).order("orden"),
      sb
        .from("variables_calidad")
        .select("id, clave, etiqueta, unidad, min_default, objetivo_default, max_default, orden")
        .eq("activo", true)
        .order("orden"),
    ]);
    if (tipos.error) throw new Error(tipos.error.message);
    if (vars.error) throw new Error(vars.error.message);
    let skus: string[] = [];
    if (data.codigo) {
      const id = await productoIdPorCodigo(sb, data.codigo);
      const { data: s } = await sb.from("producto_skus_sap").select("clave_sku_sap").eq("producto_id", id);
      skus = (s ?? []).map((x) => x.clave_sku_sap as string);
    }
    return { tipos: tipos.data ?? [], variables: vars.data ?? [], skus };
  });

export const editarProductoCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        codigo: z.string().min(1).max(30),
        version: z.string().trim().max(20).optional(),
        sku: z.string().trim().max(64).optional(),
        descripcion_sku: z.string().trim().max(200).optional(),
        motivo: z.string().trim().min(10, "Motivo obligatorio (mínimo 10 caracteres)."),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const id = await productoIdPorCodigo(sb, data.codigo);
    const { data: res, error } = await sb.rpc("catalogo_editar_producto", {
      _producto_id: id,
      _version: data.version ?? "",
      _sku: data.sku ?? "",
      _descripcion_sku: data.descripcion_sku ?? "",
      _motivo: data.motivo,
    } as never);
    if (error) throw new Error(error.message);
    return res as { ok: boolean; cambios: number };
  });

export const crearProductoCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        codigo: z.string().trim().min(2).max(30),
        nombre: z.string().trim().min(3).max(200),
        tipo_id: z.string().uuid(),
        version: z.string().trim().max(20).optional(),
        sku: z.string().trim().max(64).optional(),
        variables: z
          .array(
            z.object({
              variable_id: z.string().uuid(),
              min: z.number().finite(),
              objetivo: z.number().finite(),
              max: z.number().finite(),
            }),
          )
          .min(1, "Selecciona al menos una variable.")
          .max(60),
        motivo: z.string().trim().min(10, "Motivo obligatorio (mínimo 10 caracteres)."),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as SB).rpc("catalogo_crear_producto", {
      _codigo: data.codigo,
      _nombre: data.nombre,
      _tipo_id: data.tipo_id,
      _version: data.version ?? "",
      _sku: data.sku ?? "",
      _variables: data.variables,
      _motivo: data.motivo,
    } as never);
    if (error) throw new Error(error.message);
    return res as { ok: boolean; producto_id: string };
  });

export const eliminarProductoCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        codigo: z.string().min(1).max(30),
        motivo: z.string().trim().min(10, "Motivo obligatorio (mínimo 10 caracteres)."),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const id = await productoIdPorCodigo(sb, data.codigo);
    const { error } = await sb.rpc("catalogo_desactivar_producto", {
      _producto_id: id,
      _motivo: data.motivo,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
