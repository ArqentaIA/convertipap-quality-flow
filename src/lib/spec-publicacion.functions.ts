// =============================================================================
// Spec Publicación — Fase 3
// Flujo: borrador → en_revision → vigente   (descartada como rama terminal)
// Las lecturas de QC/QR/Reportes/MP-04…MP-07 NO se tocan: siguen leyendo
// `producto_especificaciones.estado='vigente'`.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

async function resolverProductoId(sb: SB, codigo: string): Promise<string> {
  const { data, error } = await sb
    .from("productos")
    .select("id")
    .eq("codigo", codigo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Producto ${codigo} no encontrado`);
  return data.id as string;
}

// =============================================================================
// obtenerEstadoEspecificacion — para que la UI muestre vigente + borrador
// =============================================================================
export const obtenerEstadoEspecificacion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ producto_codigo: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const producto_id = await resolverProductoId(sb, data.producto_codigo);

    const { data: rows, error } = await sb
      .from("producto_especificaciones")
      .select(
        "id, version, estado, vigente_desde, vigente_hasta, caracteristicas_atributos, borrador_de, motivo_cambio, publicado_at, publicado_por, enviado_revision_at",
      )
      .eq("producto_id", producto_id)
      .in("estado", ["vigente", "borrador", "en_revision"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const vigente = (rows ?? []).find((r) => r.estado === "vigente") ?? null;
    const borrador =
      (rows ?? []).find(
        (r) => r.estado === "borrador" || r.estado === "en_revision",
      ) ?? null;

    return { producto_id, vigente, borrador };
  });

// =============================================================================
// crearBorrador
// =============================================================================
export const crearBorrador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        producto_codigo: z.string().min(1),
        motivo: z.string().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const producto_id = await resolverProductoId(sb, data.producto_codigo);
    const { data: id, error } = await sb.rpc("crear_borrador_especificacion", {
      _producto_id: producto_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { ok: true, borrador_id: id as string };
  });

// =============================================================================
// enviarARevision
// =============================================================================
export const enviarARevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        spec_id: z.string().uuid(),
        motivo: z.string().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { error } = await sb.rpc("enviar_a_revision", {
      _spec_id: data.spec_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============================================================================
// publicarVersion
// =============================================================================
export const publicarVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        spec_id: z.string().uuid(),
        motivo: z.string().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { error } = await sb.rpc("publicar_especificacion", {
      _spec_id: data.spec_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============================================================================
// descartarBorrador — NO elimina filas; cambia estado a 'descartada'
// =============================================================================
export const descartarBorrador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        spec_id: z.string().uuid(),
        motivo: z.string().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { error } = await sb.rpc("descartar_borrador", {
      _spec_id: data.spec_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
