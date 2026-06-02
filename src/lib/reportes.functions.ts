// =============================================================================
// Reportes — Data layer real contra Supabase.
// =============================================================================
// Server functions que sustituyen los DATASETS hardcodeados en /reportes.
// Cada función agrega información de muestras_calidad, mediciones_calidad,
// ordenes_fabricacion, paros_maquina y catálogos.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangoInput = z.object({
  start: z.string(), // ISO
  end: z.string(),   // ISO
});

export type ReportePayload = {
  desempenoPlanta: {
    planta: string;
    cumpl: number;
    rollos: number;
    nc: number;
    delta: number;
  }[];
  datasets: Record<
    string,
    { sheet: string; rows: Record<string, string | number>[] }[]
  >;
};

// ---------------------------------------------------------------------------

export const getReportes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => rangoInput.parse(data))
  .handler(async ({ data, context }): Promise<ReportePayload> => {
    const sb = context.supabase;
    const start = data.start;
    const end = data.end;

    // Periodo previo (mismo largo) para delta
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const span = endMs - startMs;
    const prevStart = new Date(startMs - span).toISOString();
    const prevEnd = start;

    // --------- Catálogos ---------
    const [{ data: plantas }, { data: maquinas }] = await Promise.all([
      sb.from("plantas").select("id, codigo, nombre"),
      sb.from("maquinas").select("id, codigo, nombre, planta_id"),
    ]);
    const plantaById = new Map((plantas ?? []).map((p) => [p.id, p]));
    const maquinaById = new Map((maquinas ?? []).map((m) => [m.id, m]));

    // --------- Muestras del periodo ---------
    const { data: muestras } = await sb
      .from("muestras_calidad")
      .select(
        "id, planta_id, maquina_id, turno, hora_muestreo, dictamen, estado",
      )
      .gte("hora_muestreo", start)
      .lte("hora_muestreo", end);

    const { data: muestrasPrev } = await sb
      .from("muestras_calidad")
      .select("id, planta_id, dictamen")
      .gte("hora_muestreo", prevStart)
      .lt("hora_muestreo", prevEnd);

    // --------- Mediciones del periodo (para tendencia / NC) ---------
    const muestraIds = (muestras ?? []).map((m) => m.id);
    const { data: mediciones } = muestraIds.length
      ? await sb
          .from("mediciones_calidad")
          .select(
            "id, muestra_id, variable_clave, valor, min_snapshot, max_snapshot, estado, created_at",
          )
          .in("muestra_id", muestraIds)
      : { data: [] as Array<{
          id: string;
          muestra_id: string;
          variable_clave: string;
          valor: number;
          min_snapshot: number;
          max_snapshot: number;
          estado: string;
          created_at: string;
        }> };

    // --------- Rollos del periodo ---------
    const { data: rollos } = await sb
      .from("rollos_producidos")
      .select("id, orden_id, registrado_at")
      .gte("registrado_at", start)
      .lte("registrado_at", end);

    const { data: ordenes } = await sb
      .from("ordenes_fabricacion")
      .select("id, planta_id, maquina_id");
    const ordenById = new Map((ordenes ?? []).map((o) => [o.id, o]));

    // --------- Paros (para OEE) ---------
    const { data: paros } = await sb
      .from("paros_maquina")
      .select("id, maquina_id, inicio, fin, duracion_min")
      .gte("inicio", start)
      .lte("inicio", end);

    // ====================================================
    // Desempeño por planta (cumplimiento, rollos, NC, delta)
    // ====================================================
    const desempenoMap = new Map<
      string,
      { total: number; conformes: number; rollos: number; nc: number }
    >();
    for (const m of muestras ?? []) {
      const k = m.planta_id;
      const entry =
        desempenoMap.get(k) ?? { total: 0, conformes: 0, rollos: 0, nc: 0 };
      entry.total++;
      if (m.dictamen === "liberada") entry.conformes++;
      if (m.dictamen === "rechazada") entry.nc++;
      desempenoMap.set(k, entry);
    }
    for (const r of rollos ?? []) {
      const o = ordenById.get(r.orden_id);
      if (!o) continue;
      const entry = desempenoMap.get(o.planta_id) ?? {
        total: 0,
        conformes: 0,
        rollos: 0,
        nc: 0,
      };
      entry.rollos++;
      desempenoMap.set(o.planta_id, entry);
    }

    const prevByPlanta = new Map<string, { total: number; conformes: number }>();
    for (const m of muestrasPrev ?? []) {
      const e = prevByPlanta.get(m.planta_id) ?? { total: 0, conformes: 0 };
      e.total++;
      if (m.dictamen === "liberada") e.conformes++;
      prevByPlanta.set(m.planta_id, e);
    }

    const desempenoPlanta = Array.from(desempenoMap.entries()).map(
      ([plantaId, v]) => {
        const planta = plantaById.get(plantaId);
        const cumpl = v.total ? (v.conformes / v.total) * 100 : 0;
        const prev = prevByPlanta.get(plantaId);
        const cumplPrev = prev && prev.total ? (prev.conformes / prev.total) * 100 : cumpl;
        return {
          planta: planta?.nombre ?? "—",
          cumpl: Number(cumpl.toFixed(1)),
          rollos: v.rollos,
          nc: v.nc,
          delta: Number((cumpl - cumplPrev).toFixed(1)),
        };
      },
    );

    // ====================================================
    // Cumplimiento por máquina y semana
    // ====================================================
    function weekKey(iso: string) {
      const d = new Date(iso);
      const onejan = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(
        ((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7,
      );
      return `S${week}`;
    }
    const cumplMap = new Map<
      string,
      { semana: string; planta: string; maquina: string; total: number; conformes: number }
    >();
    for (const m of muestras ?? []) {
      const maq = maquinaById.get(m.maquina_id);
      const planta = plantaById.get(m.planta_id);
      const sem = weekKey(m.hora_muestreo);
      const key = `${sem}|${maq?.codigo ?? "?"}`;
      const e =
        cumplMap.get(key) ?? {
          semana: sem,
          planta: planta?.nombre ?? "—",
          maquina: maq?.codigo ?? "—",
          total: 0,
          conformes: 0,
        };
      e.total++;
      if (m.dictamen === "liberada") e.conformes++;
      cumplMap.set(key, e);
    }
    const cumplRows = Array.from(cumplMap.values()).map((v) => ({
      semana: v.semana,
      planta: v.planta,
      maquina: v.maquina,
      cumplimiento_pct: Number(((v.conformes / v.total) * 100).toFixed(1)),
      meta_pct: 90,
    }));

    // ====================================================
    // No conformidades (mediciones fuera de spec)
    // ====================================================
    const ncRows: Record<string, string | number>[] = [];
    let ncIdx = 1;
    for (const med of mediciones ?? []) {
      if (med.estado !== "no_conforme" && med.estado !== "fuera_rango_critico") continue;
      const muestra = (muestras ?? []).find((s) => s.id === med.muestra_id);
      if (!muestra) continue;
      const maq = maquinaById.get(muestra.maquina_id);
      const severidad =
        med.estado === "fuera_rango_critico" ? "Alta" : "Media";
      const baseRow: Record<string, string | number> = {
        id: `NC-${String(ncIdx++).padStart(4, "0")}`,
        fecha: med.created_at.slice(0, 10),
        maquina: maq?.codigo ?? "—",
        variable: med.variable_clave,
        valor: Number(med.valor),
        severidad,
      };
      if (med.valor > med.max_snapshot) baseRow.limite_sup = Number(med.max_snapshot);
      else baseRow.limite_inf = Number(med.min_snapshot);
      ncRows.push(baseRow);
    }

    // ====================================================
    // Tendencia de variables críticas (agregado por mes)
    // ====================================================
    const MES_ABBR = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const tendMap = new Map<
      string,
      { mes: string; variable: string; values: number[]; fuera: number }
    >();
    for (const med of mediciones ?? []) {
      const mes = MES_ABBR[new Date(med.created_at).getMonth()];
      const key = `${mes}|${med.variable_clave}`;
      const e =
        tendMap.get(key) ?? { mes, variable: med.variable_clave, values: [], fuera: 0 };
      e.values.push(Number(med.valor));
      if (med.estado === "no_conforme" || med.estado === "fuera_rango_critico") e.fuera++;
      tendMap.set(key, e);
    }
    const tendRows = Array.from(tendMap.values()).map((v) => {
      const avg = v.values.reduce((a, b) => a + b, 0) / v.values.length;
      const variance =
        v.values.reduce((a, b) => a + (b - avg) ** 2, 0) / v.values.length;
      return {
        mes: v.mes,
        variable: v.variable,
        promedio: Number(avg.toFixed(2)),
        desviacion: Number(Math.sqrt(variance).toFixed(2)),
        fuera_spec_pct: Number(((v.fuera / v.values.length) * 100).toFixed(1)),
      };
    });

    // ====================================================
    // OEE por máquina y turno (aproximado)
    // disponibilidad = 1 - (paros_min / total_min)
    // calidad = conformes / total muestras de la máquina/turno
    // desempeño = 0.95 fijo (sin datos de velocidad teórica real)
    // ====================================================
    const oeeMap = new Map<
      string,
      {
        fecha: string;
        maquina: string;
        turno: string;
        muestras_total: number;
        muestras_ok: number;
      }
    >();
    for (const m of muestras ?? []) {
      const maq = maquinaById.get(m.maquina_id);
      const fecha = m.hora_muestreo.slice(0, 10);
      const key = `${fecha}|${maq?.codigo ?? "?"}|${m.turno}`;
      const e =
        oeeMap.get(key) ?? {
          fecha,
          maquina: maq?.codigo ?? "—",
          turno: m.turno,
          muestras_total: 0,
          muestras_ok: 0,
        };
      e.muestras_total++;
      if (m.dictamen === "liberada") e.muestras_ok++;
      oeeMap.set(key, e);
    }
    const parosPorMaq = new Map<string, number>();
    for (const p of paros ?? []) {
      const maq = maquinaById.get(p.maquina_id);
      if (!maq) continue;
      parosPorMaq.set(
        maq.codigo,
        (parosPorMaq.get(maq.codigo) ?? 0) + Number(p.duracion_min ?? 0),
      );
    }
    const TURNO_MIN = 480;
    const oeeRows = Array.from(oeeMap.values()).map((v) => {
      const paroMin = parosPorMaq.get(v.maquina) ?? 0;
      const disponibilidad = Math.max(0, 1 - paroMin / TURNO_MIN);
      const calidad = v.muestras_total ? v.muestras_ok / v.muestras_total : 1;
      const desempeno = 0.95;
      return {
        fecha: v.fecha,
        maquina: v.maquina,
        turno: v.turno,
        disponibilidad: Number(disponibilidad.toFixed(2)),
        desempeno,
        calidad: Number(calidad.toFixed(2)),
        oee: Number((disponibilidad * desempeno * calidad).toFixed(3)),
      };
    });

    // ====================================================
    // Reporte ejecutivo
    // ====================================================
    const totalMuestras = (muestras ?? []).length;
    const totalLiberadas = (muestras ?? []).filter((m) => m.dictamen === "liberada").length;
    const totalRechazadas = (muestras ?? []).filter((m) => m.dictamen === "rechazada").length;
    const cumplGlobal = totalMuestras ? (totalLiberadas / totalMuestras) * 100 : 0;
    const oeeAvg = oeeRows.length
      ? oeeRows.reduce((a, r) => a + r.oee, 0) / oeeRows.length
      : 0;

    const periodoLabel = `${start.slice(0, 10)} → ${end.slice(0, 10)}`;
    const ejecutivoKpis = [
      { kpi: "Cumplimiento promedio", valor: Number(cumplGlobal.toFixed(1)), unidad: "%", periodo: periodoLabel },
      { kpi: "OEE promedio", valor: Number((oeeAvg * 100).toFixed(1)), unidad: "%", periodo: periodoLabel },
      { kpi: "Rollos producidos", valor: (rollos ?? []).length, unidad: "rollos", periodo: periodoLabel },
      { kpi: "No conformidades", valor: totalRechazadas, unidad: "incidencias", periodo: periodoLabel },
    ];

    const datasets: ReportePayload["datasets"] = {
      Cumplimiento: [{ sheet: "Cumplimiento", rows: cumplRows.length ? cumplRows : [{ aviso: "Sin datos" }] }],
      "Detalle de no conformidades": [
        { sheet: "No conformidades", rows: ncRows.length ? ncRows : [{ aviso: "Sin no conformidades en el periodo" }] },
      ],
      "Tendencia de variables críticas": [
        { sheet: "Tendencia", rows: tendRows.length ? tendRows : [{ aviso: "Sin datos" }] },
      ],
      "OEE por máquina y turno": [
        { sheet: "OEE", rows: oeeRows.length ? oeeRows : [{ aviso: "Sin datos" }] },
      ],
      "Reporte ejecutivo de calidad": [
        { sheet: "KPIs", rows: ejecutivoKpis },
        {
          sheet: "Resumen por planta",
          rows: desempenoPlanta.length
            ? desempenoPlanta.map((p) => ({
                planta: p.planta,
                cumplimiento_pct: p.cumpl,
                rollos: p.rollos,
                no_conformes: p.nc,
                delta_pct: p.delta,
              }))
            : [{ aviso: "Sin datos" }],
        },
      ],
    };

    return { desempenoPlanta, datasets };
  });
