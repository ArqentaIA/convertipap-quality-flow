// =============================================================================
// App settings — Configuración global de la aplicación.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TurnosConfig = {
  turno1_inicio: string;
  turno1_fin: string;
  turno2_inicio: string;
  turno2_fin: string;
  turno3_inicio: string;
  turno3_fin: string;
};

const DEFAULT_TURNOS: TurnosConfig = {
  turno1_inicio: "07:00",
  turno1_fin: "15:00",
  turno2_inicio: "15:00",
  turno2_fin: "23:00",
  turno3_inicio: "23:00",
  turno3_fin: "07:00",
};

export const getTurnosConfig = createServerFn({ method: "GET" })
  .handler(async (): Promise<TurnosConfig> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const sb = supabaseAdmin;
      const { data } = await sb
        .from("app_settings")
        .select("turno1_inicio, turno1_fin, turno2_inicio, turno2_fin, turno3_inicio, turno3_fin")
        .eq("singleton", true)
        .maybeSingle();
      if (!data) return DEFAULT_TURNOS;
      return data as TurnosConfig;
    } catch {
      return DEFAULT_TURNOS;
    }
  });

export type AppSettings = {
  id: string;
  tolerancia_advertencia_pct: number;
  frecuencia_muestreo_min: number;
  turno1_inicio: string;
  turno1_fin: string;
  turno2_inicio: string;
  turno2_fin: string;
  turno3_inicio: string;
  turno3_fin: string;
  notif_fuera_rango: boolean;
  notif_resumen_diario: boolean;
  notif_no_conformidades: boolean;
  notif_resumen_semanal: boolean;
  ceo_report_enabled: boolean;
  ceo_report_hora: string;
  ceo_report_destinatarios: string;
  costo_no_calidad_kg: number;
  updated_at: string;
};

const SELECT_COLS =
  "id, tolerancia_advertencia_pct, frecuencia_muestreo_min, " +
  "turno1_inicio, turno1_fin, turno2_inicio, turno2_fin, turno3_inicio, turno3_fin, " +
  "notif_fuera_rango, notif_resumen_diario, notif_no_conformidades, notif_resumen_semanal, " +
  "ceo_report_enabled, ceo_report_hora, ceo_report_destinatarios, costo_no_calidad_kg, updated_at";

const HHMM = z.string().regex(/^\d{2}:\d{2}$/, "Formato esperado HH:MM");

const updateSchema = z.object({
  tolerancia_advertencia_pct: z.number().min(0).max(100),
  frecuencia_muestreo_min: z.number().int().min(1).max(720),
  turno1_inicio: HHMM,
  turno1_fin: HHMM,
  turno2_inicio: HHMM,
  turno2_fin: HHMM,
  turno3_inicio: HHMM,
  turno3_fin: HHMM,
  notif_fuera_rango: z.boolean(),
  notif_resumen_diario: z.boolean(),
  notif_no_conformidades: z.boolean(),
  notif_resumen_semanal: z.boolean(),
  ceo_report_enabled: z.boolean(),
  ceo_report_hora: HHMM,
  ceo_report_destinatarios: z.string().max(2000),
  costo_no_calidad_kg: z.number().min(0).max(10000),
});

export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppSettings> => {
    const sb = context.supabase;
    const { data, error } = await sb
      .from("app_settings")
      .select(SELECT_COLS)
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`);
    if (!data) {
      // Crea la fila si por alguna razón no existe
      const { data: created, error: insErr } = await sb
        .from("app_settings")
        .insert({ singleton: true })
        .select(SELECT_COLS)
        .single();
      if (insErr) throw new Error(`No se pudo crear la configuración: ${insErr.message}`);
      return created as unknown as AppSettings;
    }
    return data as unknown as AppSettings;
  });

export const updateAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateSchema.parse(data))
  .handler(async ({ data, context }): Promise<AppSettings> => {
    const sb = context.supabase;
    const { data: updated, error } = await sb
      .from("app_settings")
      .update({ ...data, updated_by: context.userId })
      .eq("singleton", true)
      .select(SELECT_COLS)
      .single();
    if (error) {
      // RLS: si no es admin, devuelve mensaje claro
      throw new Error(
        `No se pudo guardar la configuración: ${error.message}. ` +
          `Solo administradores o gerencia general pueden modificarla.`,
      );
    }
    return updated as unknown as AppSettings;
  });
