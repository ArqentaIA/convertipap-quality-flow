// =====================================================================
// Reporte CONSOLIDADO — por máquina (MP-04, MP-05, MP-06, MP-07) y día.
// Sin datos inventados; toma muestras_calidad + productos + mediciones_calidad.
// Filtro principal: hora_muestreo dentro del día seleccionado (TZ America/Mexico_City).
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MAQUINAS_CONSOLIDADO = ["MP-07", "MP-06", "MP-05", "MP-04"] as const;
export type MaquinaConsolidado = (typeof MAQUINAS_CONSOLIDADO)[number];

export const VARIABLES_PROMEDIO = [
  "pesoBase",
  "blancuraR457",
  "blancuraA",
  "blancuraB",
  "anchoUtil",
  "calibre",
  "diametro",
  "elongMD",
  "humedad",
  "relMDCD",
  "tensionCD",
  "tensionMD",
  "tensionRH",
  "peso",
] as const;

export type VariableClave = (typeof VARIABLES_PROMEDIO)[number] | "uniones";

export type ConsolidadoRow = {
  muestra_id: string;
  turno: string; // "1" | "2" | "3"
  hora_muestreo: string; // ISO
  codigo_producto: string | null;
  numero_rollo: string;
  observaciones: string | null;
  estatus_liberacion: string | null;
  estado: string | null;
  liberado_con_justificacion: boolean;
  liberacion_justificacion: string | null;
  mediciones: Partial<Record<VariableClave, number>>;
};

export type ConsolidadoMaquina = {
  codigo: MaquinaConsolidado;
  rows: ConsolidadoRow[];
};

export type ConsolidadoPayload = {
  fecha: string; // YYYY-MM-DD seleccionada
  generadoAt: string;
  maquinas: ConsolidadoMaquina[];
};

const inputSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado YYYY-MM-DD"),
});

// México (CDMX) — UTC-6, sin DST desde 2022.
const MX_OFFSET_HOURS = -6;

function diaMexicoToUtcRange(fecha: string): { startIso: string; endIso: string } {
  // Inicio local 00:00 en CDMX = 06:00 UTC del mismo día.
  // Fin = inicio + 24h.
  const [y, m, d] = fecha.split("-").map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d, -MX_OFFSET_HOURS, 0, 0, 0));
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() };
}

export const getConsolidado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<ConsolidadoPayload> => {
    const { supabase } = context;
    const { startIso, endIso } = diaMexicoToUtcRange(data.fecha);

    // 1) Buscar IDs de las 4 máquinas
    const { data: maqs, error: maqErr } = await supabase
      .from("maquinas")
      .select("id, codigo")
      .in("codigo", MAQUINAS_CONSOLIDADO as unknown as string[]);
    if (maqErr) throw maqErr;
    const maqMap = new Map<string, MaquinaConsolidado>();
    for (const m of maqs ?? []) maqMap.set(m.id as string, m.codigo as MaquinaConsolidado);

    // 2) Muestras en rango + producto
    const { data: muestras, error: muErr } = await supabase
      .from("muestras_calidad")
      .select(
        "id, turno, hora_muestreo, numero_rollo, observaciones_generales, estado, estatus_liberacion, liberado_con_justificacion, liberacion_justificacion, maquina_id, producto:productos(codigo)",
      )
      .in("maquina_id", Array.from(maqMap.keys()))
      .gte("hora_muestreo", startIso)
      .lt("hora_muestreo", endIso);
    if (muErr) throw muErr;

    const muestraIds = (muestras ?? []).map((m) => m.id as string);

    // 3) Mediciones para esas muestras
    let mediciones: { muestra_id: string; variable_clave: string; valor: number | null }[] = [];
    if (muestraIds.length > 0) {
      const { data: meds, error: medErr } = await supabase
        .from("mediciones_calidad")
        .select("muestra_id, variable_clave, valor")
        .in("muestra_id", muestraIds);
      if (medErr) throw medErr;
      mediciones = (meds ?? []) as typeof mediciones;
    }

    const medByMuestra = new Map<string, Partial<Record<VariableClave, number>>>();
    for (const m of mediciones) {
      if (m.valor == null) continue;
      const bag = medByMuestra.get(m.muestra_id) ?? {};
      bag[m.variable_clave as VariableClave] = Number(m.valor);
      medByMuestra.set(m.muestra_id, bag);
    }

    // 4) Agrupar por máquina, ordenar
    const grupos = new Map<MaquinaConsolidado, ConsolidadoRow[]>();
    for (const code of MAQUINAS_CONSOLIDADO) grupos.set(code, []);

    for (const mu of muestras ?? []) {
      const code = maqMap.get(mu.maquina_id as string);
      if (!code) continue;
      const productoRel = mu.producto as { codigo?: string | null } | null;
      grupos.get(code)!.push({
        muestra_id: mu.id as string,
        turno: String(mu.turno ?? ""),
        hora_muestreo: mu.hora_muestreo as string,
        codigo_producto: productoRel?.codigo ?? null,
        numero_rollo: (mu.numero_rollo as string) ?? "",
        observaciones: (mu.observaciones_generales as string | null) ?? null,
        estatus_liberacion: (mu.estatus_liberacion as string | null) ?? null,
        estado: (mu.estado as string | null) ?? null,
        mediciones: medByMuestra.get(mu.id as string) ?? {},
      });
    }

    for (const arr of grupos.values()) {
      arr.sort((a, b) => {
        if (a.turno !== b.turno) return a.turno.localeCompare(b.turno);
        if (a.hora_muestreo !== b.hora_muestreo)
          return a.hora_muestreo.localeCompare(b.hora_muestreo);
        return a.numero_rollo.localeCompare(b.numero_rollo);
      });
    }

    return {
      fecha: data.fecha,
      generadoAt: new Date().toISOString(),
      maquinas: MAQUINAS_CONSOLIDADO.map((codigo) => ({
        codigo,
        rows: grupos.get(codigo) ?? [],
      })),
    };
  });
