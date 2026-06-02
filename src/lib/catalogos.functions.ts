// =====================================================================
// Catálogos — CRUD para plantas, máquinas, productos y órdenes
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

const ROLES_ADMIN = ["administrador", "gerente_general"] as const;

async function requireAdmin(sb: SB, userId: string) {
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.some((r) => ROLES_ADMIN.includes(r as (typeof ROLES_ADMIN)[number]))) {
    throw new Error("Acceso denegado. Requiere rol administrador o gerente general.");
  }
}

// ============================ LISTS ============================

export const listCatalogos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;
    const [plantas, maquinas, productos, ordenes] = await Promise.all([
      sb.from("plantas").select("*").order("codigo"),
      sb.from("maquinas").select("*, plantas(nombre, codigo)").order("codigo"),
      sb.from("productos").select("*").order("codigo"),
      sb
        .from("ordenes_fabricacion")
        .select(
          "id, folio, estado, turno, planta_id, maquina_id, producto_id, objetivo_kg, objetivo_rollos, producido_kg, producido_rollos, fecha_programada, fecha_inicio, fecha_fin, notas, created_at, productos(codigo, nombre), maquinas(codigo, nombre), plantas(codigo, nombre)",
        )
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (plantas.error) throw new Error(plantas.error.message);
    if (maquinas.error) throw new Error(maquinas.error.message);
    if (productos.error) throw new Error(productos.error.message);
    if (ordenes.error) throw new Error(ordenes.error.message);
    return {
      plantas: plantas.data ?? [],
      maquinas: maquinas.data ?? [],
      productos: productos.data ?? [],
      ordenes: ordenes.data ?? [],
    };
  });

// ============================ PLANTAS ============================

const plantaSchema = z.object({
  id: z.string().uuid().optional(),
  codigo: z.string().min(1).max(30),
  nombre: z.string().min(1).max(200),
  ubicacion: z.string().max(300).nullable().optional(),
  activo: z.boolean().default(true),
});

export const upsertPlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => plantaSchema.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    await requireAdmin(sb, context.userId);
    if (data.id) {
      const { error } = await sb
        .from("plantas")
        .update({
          codigo: data.codigo,
          nombre: data.nombre,
          ubicacion: data.ubicacion ?? null,
          activo: data.activo,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sb
      .from("plantas")
      .insert({
        codigo: data.codigo,
        nombre: data.nombre,
        ubicacion: data.ubicacion ?? null,
        activo: data.activo,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const togglePlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), activo: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    await requireAdmin(sb, context.userId);
    const { error } = await sb
      .from("plantas")
      .update({ activo: data.activo })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================ MAQUINAS ============================

const maquinaSchema = z.object({
  id: z.string().uuid().optional(),
  codigo: z.string().min(1).max(30),
  nombre: z.string().min(1).max(200),
  planta_id: z.string().uuid(),
  area: z.string().max(100).nullable().optional(),
  activo: z.boolean().default(true),
});

export const upsertMaquina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => maquinaSchema.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    await requireAdmin(sb, context.userId);
    if (data.id) {
      const { error } = await sb
        .from("maquinas")
        .update({
          codigo: data.codigo,
          nombre: data.nombre,
          planta_id: data.planta_id,
          area: data.area ?? null,
          activo: data.activo,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sb
      .from("maquinas")
      .insert({
        codigo: data.codigo,
        nombre: data.nombre,
        planta_id: data.planta_id,
        area: data.area ?? null,
        activo: data.activo,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const toggleMaquina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), activo: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    await requireAdmin(sb, context.userId);
    const { error } = await sb
      .from("maquinas")
      .update({ activo: data.activo })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================ PRODUCTOS ============================

const productoSchema = z.object({
  id: z.string().uuid().optional(),
  codigo: z.string().min(1).max(50),
  nombre: z.string().min(1).max(200),
  tipo_id: z.string().uuid(),
  descripcion: z.string().max(500).nullable().optional(),
  gramaje: z.number().nullable().optional(),
  capas: z.number().int().nullable().optional(),
  activo: z.boolean().default(true),
});

export const upsertProducto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => productoSchema.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    await requireAdmin(sb, context.userId);
    const payload = {
      codigo: data.codigo,
      nombre: data.nombre,
      tipo_id: data.tipo_id,
      descripcion: data.descripcion ?? null,
      gramaje: data.gramaje ?? null,
      capas: data.capas ?? null,
      activo: data.activo,
    };
    if (data.id) {
      const { error } = await sb.from("productos").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sb
      .from("productos")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const toggleProducto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), activo: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    await requireAdmin(sb, context.userId);
    const { error } = await sb
      .from("productos")
      .update({ activo: data.activo })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTiposProducto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;
    const { data, error } = await sb
      .from("tipos_producto")
      .select("id, codigo, nombre")
      .eq("activo", true)
      .order("orden");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============================ ORDENES (cancelar como "desactivar") ============================

export const cancelarOrdenCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        motivo: z.string().min(3).max(500).default("Cancelada desde catálogos"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    await requireAdmin(sb, context.userId);
    const { data: orden, error } = await sb
      .from("ordenes_fabricacion")
      .select("id, estado, notas")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (["finalizada", "cancelada"].includes(orden.estado)) {
      throw new Error(`La orden ya está ${orden.estado}.`);
    }
    const notasFinales = `${orden.notas ? orden.notas + "\n" : ""}[CANCELADA] ${data.motivo}`;
    const { error: errUpd } = await sb
      .from("ordenes_fabricacion")
      .update({
        estado: "cancelada",
        fecha_fin: new Date().toISOString(),
        cerrado_por: context.userId,
        notas: notasFinales,
      })
      .eq("id", data.id);
    if (errUpd) throw new Error(errUpd.message);
    return { ok: true };
  });
