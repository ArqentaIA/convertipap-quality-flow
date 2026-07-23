// =============================================================================
// Pesaje de Bobina Madre — RPC server functions
// - Guarda pesajes (con evidencia ya subida al bucket privado).
// - Firma URL temporal de la evidencia.
// - Vincula pesaje ↔ muestra_calidad por Número de Rollo con validaciones.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PESO_EJE = 300;

export type PesajeBobina = {
  id: string;
  numero_rollo: string;
  maquina_id: string;
  maquina_codigo: string;
  orden_produccion_id: string | null;
  numero_orden: string | null;
  peso_bruto_kg: number;
  peso_eje_kg: number;
  peso_neto_kg: number;
  fecha_hora_pesaje: string;
  evidencia_path: string;
  ocr_confianza: number | null;
  created_at: string;
};

const createSchema = z.object({
  numero_rollo: z.string().trim().min(1).max(64),
  maquina_id: z.string().uuid(),
  numero_orden: z.string().trim().max(64).optional().nullable(),
  peso_bruto_kg: z.number().finite().gt(PESO_EJE),
  evidencia_path: z.string().min(1),
  ocr_confianza: z.number().min(0).max(100).optional().nullable(),
  ocr_raw: z.unknown().optional().nullable(),
  fecha_hora_pesaje: z.string().optional(),
});

/** Crea un registro de pesaje. La evidencia debe estar ya en el bucket privado. */
export const crearPesaje = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }): Promise<PesajeBobina> => {
    const sb = context.supabase;

    // Máquina
    const { data: maq, error: mErr } = await sb
      .from("maquinas")
      .select("id, codigo")
      .eq("id", data.maquina_id)
      .maybeSingle();
    if (mErr || !maq) throw new Error("Máquina no encontrada.");

    // Duplicado (rollo + máquina)
    const { data: dup } = await sb
      .from("pesajes_bobina_madre")
      .select("id")
      .eq("maquina_id", data.maquina_id)
      .eq("numero_rollo", data.numero_rollo)
      .maybeSingle();
    if (dup) throw new Error(`El rollo ${data.numero_rollo} ya tiene un pesaje registrado en ${maq.codigo}.`);

    // Orden de producción (opcional)
    let orden_produccion_id: string | null = null;
    let numero_orden: string | null = data.numero_orden?.trim() || null;
    if (numero_orden) {
      const { data: ord } = await sb
        .from("ordenes_produccion")
        .select("id, numero_orden")
        .eq("numero_orden", numero_orden)
        .maybeSingle();
      if (ord) orden_produccion_id = ord.id;
    }

    const peso_neto = Number((data.peso_bruto_kg - PESO_EJE).toFixed(2));

    const { data: ins, error: insErr } = await sb
      .from("pesajes_bobina_madre")
      .insert({
        numero_rollo: data.numero_rollo,
        maquina_id: data.maquina_id,
        maquina_codigo: maq.codigo,
        orden_produccion_id,
        numero_orden,
        peso_bruto_kg: data.peso_bruto_kg,
        peso_eje_kg: PESO_EJE,
        peso_neto_kg: peso_neto,
        fecha_hora_pesaje: data.fecha_hora_pesaje ?? new Date().toISOString(),
        evidencia_path: data.evidencia_path,
        ocr_confianza: data.ocr_confianza ?? null,
        ocr_raw: (data.ocr_raw ?? null) as never,
        capturado_por: context.userId,
      })
      .select("*")
      .single();
    if (insErr || !ins) throw new Error(`No se pudo guardar el pesaje: ${insErr?.message ?? "desconocido"}`);

    return ins as PesajeBobina;
  });

/** Lista los últimos pesajes. */
export const listPesajes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PesajeBobina[]> => {
    const { data, error } = await context.supabase
      .from("pesajes_bobina_madre")
      .select("*")
      .order("fecha_hora_pesaje", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as PesajeBobina[];
  });

/** Firma URL temporal (60s) para descargar/mostrar la evidencia. */
export const firmarEvidencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: signed, error } = await context.supabase.storage
      .from("pesajes-evidencia")
      .createSignedUrl(data.path, 60);
    if (error || !signed) throw new Error(error?.message ?? "No se pudo firmar la URL.");
    return { url: signed.signedUrl };
  });

/** Vincula un pesaje a una muestra por número de rollo. */
export const vincularPesajeMuestra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      muestra_id: z.string().uuid(),
      pesaje_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // Carga previa para validaciones amistosas antes del RPC
    const [{ data: m }, { data: p }] = await Promise.all([
      sb.from("muestras_calidad")
        .select("id, numero_rollo, maquina_id, orden_id, pesaje_id")
        .eq("id", data.muestra_id).maybeSingle(),
      sb.from("pesajes_bobina_madre")
        .select("id, numero_rollo, maquina_id, orden_produccion_id")
        .eq("id", data.pesaje_id).maybeSingle(),
    ]);
    if (!m) throw new Error("Muestra no encontrada.");
    if (!p) throw new Error("Pesaje no encontrado.");
    if (m.pesaje_id) throw new Error("La muestra ya tiene un pesaje vinculado.");
    if (m.numero_rollo !== p.numero_rollo) {
      throw new Error(`No coincide el número de rollo (muestra ${m.numero_rollo} vs pesaje ${p.numero_rollo}).`);
    }
    if (m.maquina_id !== p.maquina_id) {
      throw new Error("La máquina del pesaje no coincide con la de la muestra.");
    }
    // Órdenes: si ambas existen y difieren, bloquear
    if (m.orden_id && p.orden_produccion_id && m.orden_id !== p.orden_produccion_id) {
      throw new Error("La Orden de Producción del pesaje no coincide con la de la muestra.");
    }

    const { error } = await sb.rpc("vincular_pesaje_a_muestra", {
      _muestra_id: data.muestra_id,
      _pesaje_id: data.pesaje_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
