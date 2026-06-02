// =====================================================================
// Dashboard — agregaciones reales contra Supabase
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  rango: z.enum(["dia", "semana", "mes", "año", "custom"]),
  start: z.string(), // ISO
  end: z.string(),   // ISO
});

export type DashboardPayload = {
  serie: {
    label: string;
    cumplimiento: Record<string, number>;
    rollos: Record<string, number>;
    oee: Record<string, number>;
  }[];
  maquinas: string[];
  noConformidades: { name: string; value: number }[];
};

function bucketsForRango(
  rango: "dia" | "semana" | "mes" | "año" | "custom",
  start: Date,
  end: Date,
): { label: string; start: Date; end: Date }[] {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  if (rango === "dia") {
    // 6 buckets de 4h
    const hours = ["00h", "04h", "08h", "12h", "16h", "20h"];
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const s = new Date(dayStart); s.setHours(i * 4);
      const e = new Date(dayStart); e.setHours(i * 4 + 4);
      buckets.push({ label: hours[i], start: s, end: e });
    }
  } else if (rango === "semana") {
    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const weekStart = new Date(start);
    weekStart.setHours(0, 0, 0, 0);
    // start from Monday
    const dow = weekStart.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    weekStart.setDate(weekStart.getDate() + offset);
    for (let i = 0; i < 7; i++) {
      const s = new Date(weekStart); s.setDate(weekStart.getDate() + i);
      const e = new Date(s); e.setDate(s.getDate() + 1);
      buckets.push({ label: dayNames[s.getDay()], start: s, end: e });
    }
  } else if (rango === "mes") {
    // 4 semanas
    const mStart = new Date(start.getFullYear(), start.getMonth(), 1);
    for (let i = 0; i < 4; i++) {
      const s = new Date(mStart); s.setDate(1 + i * 7);
      const e = new Date(mStart); e.setDate(1 + (i + 1) * 7);
      buckets.push({ label: `S${i + 1}`, start: s, end: e });
    }
  } else {
    // año / custom → meses
    const MES_ABBR = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const stop = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= stop) {
      const s = new Date(cursor);
      const e = new Date(cursor); e.setMonth(e.getMonth() + 1);
      buckets.push({ label: MES_ABBR[s.getMonth()], start: s, end: e });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return buckets;
}

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => inputSchema.parse(i))
  .handler(async ({ data, context }): Promise<DashboardPayload> => {
    const sb = context.supabase;
    const start = new Date(data.start);
    const end = new Date(data.end);

    const [{ data: maquinas }, { data: muestras }, { data: mediciones }, { data: rollos }, { data: ordenes }, { data: paros }] =
      await Promise.all([
        sb.from("maquinas").select("id, codigo").order("codigo"),
        sb
          .from("muestras_calidad")
          .select("id, maquina_id, hora_muestreo, dictamen")
          .gte("hora_muestreo", start.toISOString())
          .lte("hora_muestreo", end.toISOString()),
        sb
          .from("mediciones_calidad")
          .select("id, muestra_id, variable_clave, estado, created_at")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString()),
        sb
          .from("rollos_producidos")
          .select("id, orden_id, registrado_at")
          .gte("registrado_at", start.toISOString())
          .lte("registrado_at", end.toISOString()),
        sb.from("ordenes_fabricacion").select("id, maquina_id"),
        sb
          .from("paros_maquina")
          .select("maquina_id, duracion_min, inicio")
          .gte("inicio", start.toISOString())
          .lte("inicio", end.toISOString()),
      ]);

    const maquinaList = (maquinas ?? []).map((m) => m.codigo);
    const maquinaCodeById = new Map((maquinas ?? []).map((m) => [m.id, m.codigo]));
    const ordenMaquinaById = new Map((ordenes ?? []).map((o) => [o.id, o.maquina_id]));

    const buckets = bucketsForRango(data.rango, start, end);

    const serie = buckets.map((b) => {
      const cumplimiento: Record<string, number> = {};
      const rollosMap: Record<string, number> = {};
      const oeeMap: Record<string, number> = {};

      for (const codigo of maquinaList) {
        const muestrasBucket = (muestras ?? []).filter((m) => {
          const t = new Date(m.hora_muestreo).getTime();
          return maquinaCodeById.get(m.maquina_id) === codigo && t >= b.start.getTime() && t < b.end.getTime();
        });
        const liberadas = muestrasBucket.filter((m) => m.dictamen === "liberada").length;
        cumplimiento[codigo] = muestrasBucket.length ? Math.round((liberadas / muestrasBucket.length) * 1000) / 10 : 0;

        const rollosBucket = (rollos ?? []).filter((r) => {
          const t = new Date(r.registrado_at).getTime();
          const mqId = ordenMaquinaById.get(r.orden_id);
          return mqId && maquinaCodeById.get(mqId) === codigo && t >= b.start.getTime() && t < b.end.getTime();
        });
        rollosMap[codigo] = rollosBucket.length;

        const parosBucket = (paros ?? []).filter((p) => {
          const t = new Date(p.inicio).getTime();
          return maquinaCodeById.get(p.maquina_id) === codigo && t >= b.start.getTime() && t < b.end.getTime();
        });
        const parosMin = parosBucket.reduce((a, p) => a + Number(p.duracion_min ?? 0), 0);
        const bucketMin = Math.max(1, (b.end.getTime() - b.start.getTime()) / 60000);
        const disponibilidad = Math.max(0, 1 - parosMin / bucketMin);
        const calidad = muestrasBucket.length ? liberadas / muestrasBucket.length : 1;
        oeeMap[codigo] = Math.round(disponibilidad * 0.95 * calidad * 1000) / 10;
      }

      return { label: b.label, cumplimiento, rollos: rollosMap, oee: oeeMap };
    });

    // No conformidades por variable
    const ncMap = new Map<string, number>();
    for (const med of mediciones ?? []) {
      if (med.estado === "no_conforme" || med.estado === "fuera_rango_critico") {
        ncMap.set(med.variable_clave, (ncMap.get(med.variable_clave) ?? 0) + 1);
      }
    }
    const noConformidades = Array.from(ncMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return { serie, maquinas: maquinaList, noConformidades };
  });
