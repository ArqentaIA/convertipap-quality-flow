// =====================================================================
// Dashboard — agregaciones reales contra Supabase
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllPaged } from "@/lib/paginate";

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
  costoNoCalidad: {
    costoKg: number;
    rollosNoLiberados: number;
    kgNoLiberados: number;
    costoTotal: number;
    costoPromedio: number;
  };
};

function bucketsForRango(
  rango: "dia" | "semana" | "mes" | "año" | "custom",
  start: Date,
  end: Date,
): { label: string; start: Date; end: Date }[] {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  const HOUR = 3600_000;
  if (rango === "dia") {
    // 6 buckets de 4h, relativos al inicio (preserva zona horaria del cliente)
    const hours = ["00h", "04h", "08h", "12h", "16h", "20h"];
    for (let i = 0; i < 6; i++) {
      const s = new Date(start.getTime() + i * 4 * HOUR);
      const e = new Date(start.getTime() + (i + 1) * 4 * HOUR);
      buckets.push({ label: hours[i], start: s, end: e });
    }
  } else if (rango === "semana") {
    const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    for (let i = 0; i < 7; i++) {
      const s = new Date(start.getTime() + i * 24 * HOUR);
      const e = new Date(start.getTime() + (i + 1) * 24 * HOUR);
      buckets.push({ label: dayNames[i], start: s, end: e });
    }
  } else if (rango === "mes") {
    // 4 semanas relativas
    for (let i = 0; i < 4; i++) {
      const s = new Date(start.getTime() + i * 7 * 24 * HOUR);
      const e = new Date(start.getTime() + (i + 1) * 7 * 24 * HOUR);
      buckets.push({ label: `S${i + 1}`, start: s, end: e });
    }
  } else {
    // año / custom → meses (basados en UTC del start)
    const MES_ABBR = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cursor <= stop) {
      const s = new Date(cursor);
      const e = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      buckets.push({ label: MES_ABBR[s.getUTCMonth()], start: s, end: e });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
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

    const [{ data: maquinas }, { data: muestras }, { data: mediciones }, { data: rollos }, { data: ordenes }, { data: paros }, settingsResp] =
      await Promise.all([
        sb.from("maquinas").select("id, codigo").order("codigo"),
        sb
          .from("muestras_calidad")
          .select("id, maquina_id, capturado_at, dictamen, estatus_liberacion, defectos, estado")
          .gte("capturado_at", start.toISOString())
          .lte("capturado_at", end.toISOString()),
        sb
          .from("mediciones_calidad")
          .select("id, muestra_id, variable_clave, valor, estado, created_at")
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
        sb.from("app_settings").select("costo_no_calidad_kg").limit(1).maybeSingle(),
      ]);

    const maquinaList = (maquinas ?? []).map((m) => m.codigo);
    const maquinaCodeById = new Map((maquinas ?? []).map((m) => [m.id, m.codigo]));
    const ordenMaquinaById = new Map((ordenes ?? []).map((o) => [o.id, o.maquina_id]));

    // Mediciones fuera de spec por muestra → inferir cumplimiento cuando no hay dictamen
    const ncPorMuestra = new Map<string, number>();
    for (const med of mediciones ?? []) {
      if (med.estado === "no_conforme" || med.estado === "fuera_rango_critico") {
        ncPorMuestra.set(med.muestra_id, (ncPorMuestra.get(med.muestra_id) ?? 0) + 1);
      }
    }

    // Una muestra cuenta como "conforme" si:
    //  - dictamen='liberada' o estatus_liberacion='L', O
    //  - sin dictamen pero ninguna medición fuera de spec y sin defectos marcados
    const isConforme = (m: {
      id: string;
      dictamen: string | null;
      estatus_liberacion: string | null;
      defectos: string[] | null;
    }) => {
      if (m.dictamen === "liberada" || m.estatus_liberacion === "L") return true;
      if (m.dictamen === "rechazada" || m.estatus_liberacion === "NC") return false;
      const nc = ncPorMuestra.get(m.id) ?? 0;
      const def = (m.defectos ?? []).filter(Boolean).length;
      return nc === 0 && def === 0;
    };
    const isRechazada = (m: { dictamen: string | null; estatus_liberacion: string | null }) =>
      m.dictamen === "rechazada" || m.estatus_liberacion === "NC";

    console.log("[getDashboard]", {
      rango: data.rango,
      start: data.start,
      end: data.end,
      maquinas: maquinaList.length,
      muestras: muestras?.length ?? 0,
      mediciones: mediciones?.length ?? 0,
      rollos: rollos?.length ?? 0,
      paros: paros?.length ?? 0,
    });

    const buckets = bucketsForRango(data.rango, start, end);

    const serie = buckets.map((b) => {
      const cumplimiento: Record<string, number> = {};
      const rollosMap: Record<string, number> = {};
      const oeeMap: Record<string, number> = {};

      for (const codigo of maquinaList) {
        const muestrasBucket = (muestras ?? []).filter((m) => {
          const t = new Date(m.capturado_at).getTime();
          return maquinaCodeById.get(m.maquina_id) === codigo && t >= b.start.getTime() && t < b.end.getTime();
        });
        const conformes = muestrasBucket.filter(isConforme).length;
        cumplimiento[codigo] = muestrasBucket.length ? Math.round((conformes / muestrasBucket.length) * 1000) / 10 : 0;

        // Rollos: usa rollos_producidos si existen, sino cada muestra capturada = 1 rollo
        const rollosBucket = (rollos ?? []).filter((r) => {
          const t = new Date(r.registrado_at).getTime();
          const mqId = ordenMaquinaById.get(r.orden_id);
          return mqId && maquinaCodeById.get(mqId) === codigo && t >= b.start.getTime() && t < b.end.getTime();
        });
        rollosMap[codigo] = rollosBucket.length > 0 ? rollosBucket.length : muestrasBucket.length;

        const parosBucket = (paros ?? []).filter((p) => {
          const t = new Date(p.inicio).getTime();
          return maquinaCodeById.get(p.maquina_id) === codigo && t >= b.start.getTime() && t < b.end.getTime();
        });
        const parosMin = parosBucket.reduce((a, p) => a + Number(p.duracion_min ?? 0), 0);
        const bucketMin = Math.max(1, (b.end.getTime() - b.start.getTime()) / 60000);
        const disponibilidad = Math.max(0, 1 - parosMin / bucketMin);
        const calidad = muestrasBucket.length ? conformes / muestrasBucket.length : 1;
        oeeMap[codigo] = Math.round(disponibilidad * 0.95 * calidad * 1000) / 10;
      }

      return { label: b.label, cumplimiento, rollos: rollosMap, oee: oeeMap };
    });

    // No conformidades: mediciones fuera de spec + defectos visuales reportados
    const ncMap = new Map<string, number>();
    for (const med of mediciones ?? []) {
      if (med.estado === "no_conforme" || med.estado === "fuera_rango_critico") {
        ncMap.set(med.variable_clave, (ncMap.get(med.variable_clave) ?? 0) + 1);
      }
    }
    for (const m of muestras ?? []) {
      for (const d of (m.defectos ?? []) as string[]) {
        if (!d) continue;
        ncMap.set(d, (ncMap.get(d) ?? 0) + 1);
      }
      if (isRechazada(m)) {
        ncMap.set("Rechazo", (ncMap.get("Rechazo") ?? 0) + 1);
      }
    }
    const noConformidades = Array.from(ncMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // ---- Costo de No Calidad ----
    // Toma el costo configurado en app_settings (MXN/kg), default 18.00
    const costoKg = Number((settingsResp?.data as any)?.costo_no_calidad_kg ?? 18.0);

    // Peso REAL por muestra: valor de la medición con variable_clave='peso'
    const pesoPorMuestra = new Map<string, number>();
    for (const med of mediciones ?? []) {
      if (med.variable_clave === "peso" && med.valor != null) {
        const v = Number(med.valor);
        if (!Number.isNaN(v)) pesoPorMuestra.set(med.muestra_id, v);
      }
    }

    // "Rollo no liberado": muestra cuyo estatus NO es liberado/conforme
    // (incluye rechazados y pendientes con mediciones fuera de spec o defectos)
    let rollosNoLiberados = 0;
    let kgNoLiberados = 0;
    for (const m of muestras ?? []) {
      if (isConforme(m as any)) continue;
      rollosNoLiberados += 1;
      const peso = pesoPorMuestra.get(m.id) ?? 0;
      kgNoLiberados += peso;
    }
    const costoTotal = Math.round(kgNoLiberados * costoKg * 100) / 100;
    const costoPromedio = rollosNoLiberados > 0 ? Math.round((costoTotal / rollosNoLiberados) * 100) / 100 : 0;

    console.log("[getDashboard] resultado", {
      buckets: serie.length,
      noConformidades: noConformidades.length,
      rollosNoLiberados,
      kgNoLiberados,
      costoTotal,
    });

    return {
      serie,
      maquinas: maquinaList,
      noConformidades,
      costoNoCalidad: {
        costoKg,
        rollosNoLiberados,
        kgNoLiberados: Math.round(kgNoLiberados * 100) / 100,
        costoTotal,
        costoPromedio,
      },
    };
  });

