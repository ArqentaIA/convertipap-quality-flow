// =============================================================================
// Órdenes de Producción — importación desde SAP, listado y cierre manual.
// Tabla independiente (public.ordenes_produccion). NO toca calidad ni
// public.ordenes_fabricacion (ejecución/QC).
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrdenProduccion = {
  id: string;
  numero_orden: string;
  peso_registrado: number;
  estado: "activa" | "cerrada";
  fecha_registro: string;
  fecha_cierre: string | null;
  cerrada_por: string | null;
  archivo_origen: string | null;
  creado_por: string | null;
};

export type ImportRow = { numero_orden: string; peso_registrado: number };

export type ImportSummary = {
  total: number;
  insertadas: number;
  duplicadas: string[];
  errores: { numero_orden: string; motivo: string }[];
  archivo: string;
  fecha: string;
};

const rowSchema = z.object({
  numero_orden: z.string().trim().min(1).max(64),
  peso_registrado: z.number().finite().min(0),
});

const importSchema = z.object({
  archivo_origen: z.string().min(1).max(255),
  rows: z.array(rowSchema).min(1).max(5000),
});

/** Lista órdenes activas (más recientes primero). */
export const listOrdenesActivas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrdenProduccion[]> => {
    const { data, error } = await context.supabase
      .from("ordenes_produccion")
      .select("id, numero_orden, peso_registrado, estado, fecha_registro, fecha_cierre, cerrada_por, archivo_origen, creado_por")
      .eq("estado", "activa")
      .order("fecha_registro", { ascending: false });
    if (error) throw new Error(`No se pudieron cargar las órdenes: ${error.message}`);
    return (data ?? []) as OrdenProduccion[];
  });

/** Importa filas provenientes del archivo XLSX. Devuelve resumen. */
export const importarOrdenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => importSchema.parse(data))
  .handler(async ({ data, context }): Promise<ImportSummary> => {
    const sb = context.supabase;
    const numeros = Array.from(new Set(data.rows.map((r) => r.numero_orden)));

    // Detectar existentes
    const { data: existentes, error: exErr } = await sb
      .from("ordenes_produccion")
      .select("numero_orden")
      .in("numero_orden", numeros);
    if (exErr) throw new Error(`No se pudo validar duplicados: ${exErr.message}`);
    const setExistentes = new Set((existentes ?? []).map((r) => r.numero_orden));

    // Deduplicar dentro del mismo archivo (nos quedamos con la primera aparición)
    const vistos = new Set<string>();
    const duplicadas: string[] = [];
    const nuevas: ImportRow[] = [];
    for (const r of data.rows) {
      if (setExistentes.has(r.numero_orden) || vistos.has(r.numero_orden)) {
        if (!duplicadas.includes(r.numero_orden)) duplicadas.push(r.numero_orden);
        continue;
      }
      vistos.add(r.numero_orden);
      nuevas.push(r);
    }

    const errores: { numero_orden: string; motivo: string }[] = [];
    let insertadas = 0;

    if (nuevas.length > 0) {
      const payload = nuevas.map((r) => ({
        numero_orden: r.numero_orden,
        peso_registrado: r.peso_registrado,
        archivo_origen: data.archivo_origen,
        creado_por: context.userId,
      }));
      const { data: ins, error: insErr } = await sb
        .from("ordenes_produccion")
        .insert(payload)
        .select("numero_orden");
      if (insErr) {
        // Fallback: intento fila por fila para no perder todo el lote
        for (const row of payload) {
          const { error: e1 } = await sb.from("ordenes_produccion").insert(row);
          if (e1) {
            if (e1.code === "23505") {
              if (!duplicadas.includes(row.numero_orden)) duplicadas.push(row.numero_orden);
            } else {
              errores.push({ numero_orden: row.numero_orden, motivo: e1.message });
            }
          } else {
            insertadas += 1;
          }
        }
      } else {
        insertadas = ins?.length ?? nuevas.length;
      }
    }

    return {
      total: data.rows.length,
      insertadas,
      duplicadas,
      errores,
      archivo: data.archivo_origen,
      fecha: new Date().toISOString(),
    };
  });

/** Cierra una orden manualmente (estado 'activa' -> 'cerrada'). */
export const cerrarOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; id: string }> => {
    const { error } = await context.supabase
      .from("ordenes_produccion")
      .update({
        estado: "cerrada",
        fecha_cierre: new Date().toISOString(),
        cerrada_por: context.userId,
      })
      .eq("id", data.id)
      .eq("estado", "activa");
    if (error) throw new Error(`No se pudo cerrar la orden: ${error.message}`);
    return { ok: true, id: data.id };
  });
