import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cumplimiento de liberación de rollos.
 *
 * Cumplimiento (%) = (Rollos Liberados / Total de Rollos Capturados) × 100
 *
 * - Usa exclusivamente datos reales de `muestras_calidad`.
 * - Considera el último estatus vigente (columna `estado`), que es lo que
 *   actualiza `change_roll_status` cuando un rollo cambia de liberación.
 * - El cálculo se hace en servidor; el cliente solo lo muestra.
 */
export type CumplimientoIndicador = {
  liberados: number;
  capturados: number;
  pct: number;
  // Mensaje pre-formateado p.ej. "35 liberados de 40 capturados (87.5%)"
  texto: string;
};

const inputSchema = z.object({
  maquina_id: z.string().uuid().optional().nullable(),
  turno: z.enum(["1", "2", "3"]).optional().nullable(),
  from: z.string().min(1),
  to: z.string().min(1),
});

export const getCumplimientoIndicador = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    let q = sb
      .from("muestras_calidad")
      .select("id, estado", { count: "exact" })
      .gte("hora_muestreo", data.from)
      .lte("hora_muestreo", data.to);
    if (data.maquina_id) q = q.eq("maquina_id", data.maquina_id);
    if (data.turno) q = q.eq("turno", data.turno);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const capturados = rows?.length ?? 0;
    const liberados = (rows ?? []).filter((r) => r.estado === "liberada").length;
    const pct = capturados > 0 ? (liberados / capturados) * 100 : 0;
    const pctRounded = Number(pct.toFixed(1));

    const out: CumplimientoIndicador = {
      liberados,
      capturados,
      pct: pctRounded,
      texto: `${liberados} liberados de ${capturados} capturados (${pctRounded}%)`,
    };
    return out;
  });
