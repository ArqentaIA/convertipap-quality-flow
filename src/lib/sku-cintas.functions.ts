// Gestión del Catálogo SKU SAP de cintas (alta/edición/desactivación).
// Permisos y validaciones viven en las RPC SECURITY DEFINER `sku_cintas_*`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SkuCintaRow = {
  id: string;
  clave: string;
  descripcion: string;
  producto_codigo: string;
  ancho_corte_cm: number | null;
  planta_codigo: string | null;
  activo: boolean;
  updated_at: string;
};

export const obtenerCatalogoSkuCintas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: gestion, error: e0 } = await context.supabase.rpc("sku_cintas_planta_gestion");
    if (e0) throw new Error(e0.message);
    const g = (gestion as string | null) ?? null;
    if (!g) return { gestion: null as string | null, items: [] as SkuCintaRow[], productos: [] as string[] };
    let q = context.supabase
      .from("catalogo_sku_sap_cintas")
      .select("id, clave, descripcion, producto_codigo, ancho_corte_cm, planta_codigo, activo, updated_at")
      .order("clave");
    if (g !== "ALL") q = q.or(`planta_codigo.is.null,planta_codigo.eq.${g}`);
    const [{ data, error }, { data: prods, error: e2 }] = await Promise.all([
      q,
      context.supabase.from("productos").select("codigo").eq("activo", true).order("codigo"),
    ]);
    if (error) throw new Error(error.message);
    if (e2) throw new Error(e2.message);
    return {
      gestion: g,
      items: (data ?? []) as SkuCintaRow[],
      productos: Array.from(new Set(((prods ?? []) as { codigo: string }[]).map((p) => p.codigo))),
    };
  });

export const guardarSkuCinta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().nullable(),
    clave: z.string().trim().min(4).max(30),
    descripcion: z.string().trim().min(3).max(200),
    producto_codigo: z.string().trim().min(2).max(30),
    ancho_corte_cm: z.number().positive().max(1000),
    planta_codigo: z.enum(["TLX", "IXT"]).nullable(),
    motivo: z.string().trim().min(10).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("sku_cintas_guardar", {
      _id: data.id as unknown as string,
      _clave: data.clave,
      _descripcion: data.descripcion,
      _producto_codigo: data.producto_codigo,
      _ancho_corte_cm: data.ancho_corte_cm,
      _planta_codigo: (data.planta_codigo ?? "") as string,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { id: string };
  });

export const cambiarActivoSkuCinta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    activo: z.boolean(),
    motivo: z.string().trim().min(10).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("sku_cintas_set_activo", {
      _id: data.id, _activo: data.activo, _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
