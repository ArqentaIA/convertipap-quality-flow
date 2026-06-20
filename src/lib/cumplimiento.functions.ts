import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * ============================================================
 * Cumplimiento — Fase 1 v2 (cutover Convertipap · 17-Jun-2026)
 * ============================================================
 *
 * Dos métricas SEPARADAS (regla D autorizada):
 *
 *  1) Cumplimiento de LIBERACIÓN / TURNO  → getCumplimientoIndicador
 *     = (rollos con estatus_liberacion ∈ {L, C}) / (rollos capturados) × 100
 *     Refleja la decisión OFICIAL del Gerente/Capturista de Calidad.
 *
 *  2) Cumplimiento de VARIABLES           → getCumplimientoVariables
 *     = (mediciones conformes) / (mediciones evaluadas) × 100
 *     Refleja qué tan dentro de especificación están las mediciones físicas.
 *
 * Ambas son válidas y se reportan por separado — NO se fusionan.
 */

export type CumplimientoIndicador = {
  liberados: number;
  capturados: number;
  pct: number;
  // Mensaje pre-formateado p.ej. "35 liberados de 40 capturados (87.5%)"
  texto: string;
};

export type CumplimientoVariables = {
  variablesEvaluadas: number;
  variablesConformes: number;
  pct: number;
  texto: string;
};

const inputSchema = z.object({
  maquina_id: z.string().uuid().optional().nullable(),
  turno: z.enum(["1", "2", "3"]).optional().nullable(),
  from: z.string().min(1),
  to: z.string().min(1),
});

/**
 * Cumplimiento de LIBERACIÓN / TURNO.
 * Fuente única de verdad: `muestras_calidad.estatus_liberacion` (L o C cuentan).
 */
export const getCumplimientoIndicador = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // Paginación: PostgREST limita a 1000 filas por respuesta. Recorremos
    // todas las páginas para que `capturados` refleje el total real, no el
    // length truncado de la primera página.
    const PAGE = 1000;
    let from = 0;
    const rows: { id: string; estatus_liberacion: string | null }[] = [];
    let totalCount: number | null = null;
    for (let p = 0; p < 100; p++) {
      let q = sb
        .from("muestras_calidad")
        .select("id, estatus_liberacion", { count: "exact" })
        .gte("capturado_at", data.from)
        .lte("capturado_at", data.to)
        .range(from, from + PAGE - 1);
      if (data.maquina_id) q = q.eq("maquina_id", data.maquina_id);
      if (data.turno) q = q.eq("turno", data.turno);
      const { data: page, error, count } = await q;
      if (error) throw new Error(error.message);
      if (totalCount === null) totalCount = count ?? null;
      const chunk = (page ?? []) as typeof rows;
      rows.push(...chunk);
      if (chunk.length < PAGE) break;
      from += PAGE;
    }

    const capturados = totalCount ?? rows.length;
    const liberados = rows.filter(
      (r) => r.estatus_liberacion === "L" || r.estatus_liberacion === "C",
    ).length;
    const pct = capturados > 0 ? (liberados / capturados) * 100 : 0;
    const pctRounded = Number(pct.toFixed(1));

    const out: CumplimientoIndicador = {
      liberados,
      capturados,
      pct: pctRounded,
      texto: `${liberados} liberados/concesión de ${capturados} capturados (${pctRounded}%)`,
    };
    return out;
  });

/**
 * Cumplimiento de VARIABLES (mediciones físicas dentro de especificación).
 * NO sustituye al estatus oficial; se reporta como métrica complementaria.
 */
export const getCumplimientoVariables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    let mq = sb
      .from("muestras_calidad")
      .select("id")
      .gte("capturado_at", data.from)
      .lte("capturado_at", data.to);
    if (data.maquina_id) mq = mq.eq("maquina_id", data.maquina_id);
    if (data.turno) mq = mq.eq("turno", data.turno);
    const { data: muestras, error: eM } = await mq;
    if (eM) throw new Error(eM.message);

    const ids = (muestras ?? []).map((m) => m.id);
    if (ids.length === 0) {
      return {
        variablesEvaluadas: 0,
        variablesConformes: 0,
        pct: 0,
        texto: "0 variables conformes de 0 evaluadas (0%)",
      } as CumplimientoVariables;
    }

    const { data: meds, error: eMed } = await sb
      .from("mediciones_calidad")
      .select("estado")
      .in("muestra_id", ids);
    if (eMed) throw new Error(eMed.message);

    const evaluables = (meds ?? []).filter(
      (m) =>
        m.estado === "conforme" ||
        m.estado === "no_conforme" ||
        m.estado === "fuera_rango_critico",
    );
    const conformes = evaluables.filter((m) => m.estado === "conforme").length;
    const pct = evaluables.length > 0 ? (conformes / evaluables.length) * 100 : 0;
    const pctRounded = Number(pct.toFixed(1));

    const out: CumplimientoVariables = {
      variablesEvaluadas: evaluables.length,
      variablesConformes: conformes,
      pct: pctRounded,
      texto: `${conformes} variables conformes de ${evaluables.length} evaluadas (${pctRounded}%)`,
    };
    return out;
  });
