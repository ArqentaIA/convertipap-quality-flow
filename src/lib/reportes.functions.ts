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

    // --------- Muestras del periodo (paginado) ---------
    async function fetchAllPaged<T>(
      builder: () => any,
    ): Promise<T[]> {
      const PAGE = 1000;
      const out: T[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await builder().range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return out;
    }

    const muestras = await fetchAllPaged<{
      id: string; planta_id: string; maquina_id: string; turno: string;
      hora_muestreo: string; dictamen: string | null; estado: string | null;
      estatus_liberacion: string | null;
    }>(() => sb
      .from("muestras_calidad")
      .select("id, planta_id, maquina_id, turno, hora_muestreo, dictamen, estado, estatus_liberacion")
      .gte("hora_muestreo", start)
      .lte("hora_muestreo", end));

    const muestrasPrev = await fetchAllPaged<{
      id: string; planta_id: string; dictamen: string | null; estatus_liberacion: string | null;
    }>(() => sb
      .from("muestras_calidad")
      .select("id, planta_id, dictamen, estatus_liberacion")
      .gte("hora_muestreo", prevStart)
      .lt("hora_muestreo", prevEnd));


    // --------- Mediciones del periodo (paginado: PostgREST limita a 1000) ---------
    type MedRow = {
      id: string;
      muestra_id: string;
      variable_clave: string;
      valor: number;
      min_snapshot: number;
      max_snapshot: number;
      estado: string;
      created_at: string;
    };
    const muestraIds = (muestras ?? []).map((m) => m.id);
    const mediciones: MedRow[] = [];
    if (muestraIds.length > 0) {
      const PAGE = 1000;
      const ID_CHUNK = 200; // evita URLs demasiado largas en .in()
      for (let i = 0; i < muestraIds.length; i += ID_CHUNK) {
        const idsSlice = muestraIds.slice(i, i + ID_CHUNK);
        let from = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: page, error } = await sb
            .from("mediciones_calidad")
            .select(
              "id, muestra_id, variable_clave, valor, min_snapshot, max_snapshot, estado, created_at",
            )
            .in("muestra_id", idsSlice)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const rows = (page ?? []) as MedRow[];
          mediciones.push(...rows);
          if (rows.length < PAGE) break;
          from += PAGE;
        }
      }
    }

    // --------- Rollos del periodo (paginado) ---------
    const rollos = await fetchAllPaged<{ id: string; orden_id: string; registrado_at: string }>(
      () => sb.from("rollos_producidos")
        .select("id, orden_id, registrado_at")
        .gte("registrado_at", start)
        .lte("registrado_at", end),
    );

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
    // Desempeño por planta — Fase 1 v2 (reglas A/B/E)
    // "Cumplimiento de liberación" = estatus_liberacion ∈ {L, C}.
    // NC oficial = estatus_liberacion = 'NC' (o dictamen rechazada cuando
    // no hay estatus oficial). NO se degrada por mediciones fuera de spec.
    // ====================================================
    const esLiberadoOficial = (m: { estatus_liberacion?: string | null; dictamen?: string | null }) =>
      m.estatus_liberacion === "L" || m.estatus_liberacion === "C" ||
      (m.estatus_liberacion == null && m.dictamen === "liberada");
    const esNcOficial = (m: { estatus_liberacion?: string | null; dictamen?: string | null }) =>
      m.estatus_liberacion === "NC" ||
      (m.estatus_liberacion == null && m.dictamen === "rechazada");

    const desempenoMap = new Map<
      string,
      { total: number; conformes: number; rollos: number; nc: number }
    >();
    for (const m of muestras ?? []) {
      const k = m.planta_id;
      const entry =
        desempenoMap.get(k) ?? { total: 0, conformes: 0, rollos: 0, nc: 0 };
      entry.total++;
      if (esLiberadoOficial(m)) entry.conformes++;
      if (esNcOficial(m)) entry.nc++;
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
      if (esLiberadoOficial(m)) e.conformes++;
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
    // Cumplimiento por máquina y semana — Fase 1 v2
    // Reportamos DOS columnas separadas (regla D/E):
    //   - cumplimiento_pct          → liberación oficial (L+C)/total
    //   - cumplimiento_variables_pct → mediciones conformes/evaluadas
    // ====================================================
    function weekKey(iso: string) {
      const d = new Date(iso);
      const onejan = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(
        ((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7,
      );
      return `S${week}`;
    }
    // Índice de mediciones por muestra (para cumplimiento de variables)
    const medsConfByMuestra = new Map<string, { eval: number; conf: number }>();
    for (const med of mediciones ?? []) {
      if (med.estado !== "conforme" && med.estado !== "no_conforme" && med.estado !== "fuera_rango_critico") continue;
      const e = medsConfByMuestra.get(med.muestra_id) ?? { eval: 0, conf: 0 };
      e.eval++;
      if (med.estado === "conforme") e.conf++;
      medsConfByMuestra.set(med.muestra_id, e);
    }
    const cumplMap = new Map<
      string,
      { semana: string; planta: string; maquina: string; total: number; conformes: number; varsEval: number; varsConf: number }
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
          varsEval: 0,
          varsConf: 0,
        };
      e.total++;
      if (esLiberadoOficial(m)) e.conformes++;
      const ms = medsConfByMuestra.get(m.id);
      if (ms) {
        e.varsEval += ms.eval;
        e.varsConf += ms.conf;
      }
      cumplMap.set(key, e);
    }
    const cumplRows = Array.from(cumplMap.values()).map((v) => ({
      semana: v.semana,
      planta: v.planta,
      maquina: v.maquina,
      cumplimiento_pct: v.total ? Number(((v.conformes / v.total) * 100).toFixed(1)) : 0,
      cumplimiento_variables_pct: v.varsEval ? Number(((v.varsConf / v.varsEval) * 100).toFixed(1)) : 0,
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
    // Ordenar por fecha descendente (más reciente primero)
    ncRows.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    // Reasignar IDs según el nuevo orden
    ncRows.forEach((r, i) => {
      r.id = `NC-${String(i + 1).padStart(4, "0")}`;
    });

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

    // Marcar como usados (los datasets ya no se exponen pero se conservan los cálculos por compatibilidad)
    void cumplRows; void oeeRows;

    // ====================================================
    // Reporte General: todos los rollos del periodo con sus variables
    // ====================================================
    const SIN_INFO = "NO CAPTURADO";
    const txt = (v: unknown): string => {
      if (v === null || v === undefined) return SIN_INFO;
      const s = String(v).trim();
      if (!s || s === "—") return SIN_INFO;
      return s;
    };
    const num = (v: unknown): string | number => {
      if (v === null || v === undefined || v === "") return SIN_INFO;
      const n = Number(v);
      return Number.isFinite(n) ? n : SIN_INFO;
    };

    // Conversión a hora local México (America/Mexico_City) para evitar
    // mostrar el UTC crudo del timestamp y que parezca inconsistente con el turno.
    const MX_TZ = "America/Mexico_City";
    const fmtFechaMX = new Intl.DateTimeFormat("en-CA", {
      timeZone: MX_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    });
    const fmtHoraMX = new Intl.DateTimeFormat("es-MX", {
      timeZone: MX_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const fechaLocal = (iso: string | null | undefined): string => {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
      return fmtFechaMX.format(d);
    };
    const horaLocal = (iso: string | null | undefined): string => {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(11, 16);
      return fmtHoraMX.format(d).replace(/^24:/, "00:");
    };


    // Catálogo canónico de variables (etiqueta + unidad) — evita columnas duplicadas
    const { data: varsCat } = await sb
      .from("variables_calidad")
      .select("clave, etiqueta, unidad")
      .order("etiqueta", { ascending: true });
    const etiquetaPorClave = new Map<string, string>();
    for (const v of varsCat ?? []) {
      const u = (v as any).unidad ? ` (${(v as any).unidad})` : "";
      etiquetaPorClave.set((v as any).clave, `${(v as any).etiqueta ?? (v as any).clave}${u}`);
    }

    const muestrasFull = await fetchAllPaged<any>(() => sb
      .from("muestras_calidad")
      .select(
        `id, numero_rollo, hora_muestreo, turno, operador, jefe_maquina, prensero, analista,
         estatus_liberacion, dictamen, defectos, liberado_con_justificacion, liberacion_justificacion,
         fuera_de_turno, fuera_de_turno_motivo,
         maquina_id, planta_id, orden_id, producto_id,
         productos!muestras_calidad_producto_id_fkey(nombre, codigo, capas, gramaje, tipos_producto(codigo, nombre, familias_producto(codigo, nombre))),
         ordenes_fabricacion(folio)`,
      )
      .gte("hora_muestreo", start)
      .lte("hora_muestreo", end)
      .order("hora_muestreo", { ascending: false }));

    const medsByMuestra = new Map<string, Array<{ variable_clave: string; valor: number | null }>>();
    for (const med of mediciones ?? []) {
      const arr = medsByMuestra.get(med.muestra_id) ?? [];
      arr.push({ variable_clave: med.variable_clave, valor: med.valor === null ? null : Number(med.valor) });
      medsByMuestra.set(med.muestra_id, arr);
    }

    // Asegura etiqueta para cualquier clave presente en mediciones que no esté en catálogo
    for (const arr of medsByMuestra.values()) {
      for (const med of arr) {
        if (!etiquetaPorClave.has(med.variable_clave)) {
          etiquetaPorClave.set(med.variable_clave, med.variable_clave);
        }
      }
    }
    const EXCLUDED_VAR_CLAVES = new Set(["tensionRH"]);
    const clavesOrden = Array.from(etiquetaPorClave.keys())
      .filter((c) => !EXCLUDED_VAR_CLAVES.has(c))
      .sort();

    // Variables aplicables por producto (especificación) — para distinguir "No aplica" vs "Pendiente"
    const productoIdsScope = Array.from(
      new Set((muestrasFull ?? []).map((m: any) => m.producto_id as string | null).filter((x): x is string => !!x)),
    );
    const aplicablesPorProducto = new Map<string, Set<string>>();
    if (productoIdsScope.length > 0) {
      const { data: specs } = await sb
        .from("producto_especificaciones")
        .select("id, producto_id")
        .in("producto_id", productoIdsScope);
      const specIds = (specs ?? []).map((s) => s.id as string);
      const specToProd = new Map<string, string>((specs ?? []).map((s) => [s.id as string, s.producto_id as string]));
      if (specIds.length > 0) {
        const { data: pvars } = await sb
          .from("producto_variables")
          .select("especificacion_id, variables_calidad(clave)")
          .in("especificacion_id", specIds);
        for (const pv of (pvars ?? []) as any[]) {
          const prodId = specToProd.get(pv.especificacion_id);
          const clave = pv.variables_calidad?.clave;
          if (!prodId || !clave) continue;
          const s = aplicablesPorProducto.get(prodId) ?? new Set<string>();
          s.add(clave);
          aplicablesPorProducto.set(prodId, s);
        }
      }
    }

    const generalRows: Record<string, string | number>[] = (muestrasFull ?? []).map((m: any) => {
      const maq = maquinaById.get(m.maquina_id);
      const planta = plantaById.get(m.planta_id);
      const producto = m.productos;
      const tipo = producto?.tipos_producto;
      const meds = medsByMuestra.get(m.id) ?? [];
      const medsByClave = new Map(meds.map((x) => [x.variable_clave, x]));
      const aplicables = m.producto_id ? (aplicablesPorProducto.get(m.producto_id) ?? new Set<string>()) : new Set<string>();

      // Diagnóstico de muestreo: CON CALIDAD si midió todas las aplicables; MUESTRA INCOMPLETA si faltan
      let pendientes = 0;
      for (const clave of aplicables) {
        const med = medsByClave.get(clave);
        if (!med || med.valor === null || med.valor === undefined) pendientes++;
      }
      const estatusMuestreo = aplicables.size === 0
        ? "SIN ESPECIFICACIÓN"
        : pendientes === 0
          ? "CON CALIDAD"
          : `MUESTRA INCOMPLETA (${pendientes} NO CAPTURADO${pendientes === 1 ? "" : "S"})`;

      const row: Record<string, string | number> = {
        fecha: fechaLocal(m.hora_muestreo) || SIN_INFO,
        hora: horaLocal(m.hora_muestreo) || SIN_INFO,

        planta: txt(planta?.nombre),
        maquina: txt(maq?.codigo),
        turno: txt(m.turno),
        tipo_producto: txt(tipo?.nombre),
        tipo_codigo: txt(tipo?.codigo),
        codigo_producto: txt(producto?.codigo),

        rollo: txt(m.numero_rollo),
        operador: txt(m.operador),
        jefe_maquina: txt(m.jefe_maquina),
        prensero: txt(m.prensero),
        analista: txt(m.analista),

        estatus: txt(
          m.liberado_con_justificacion
            ? (typeof m.liberacion_justificacion === "string" &&
              m.liberacion_justificacion.trim().length > 0
                ? m.liberacion_justificacion.trim()
                : "SIN JUSTIFICACIÓN")
            : (m.estatus_liberacion ?? m.dictamen ?? "pendiente"),
        ),
      };
      for (const clave of clavesOrden) {
        const etiqueta = etiquetaPorClave.get(clave) ?? clave;
        const med = medsByClave.get(clave);
        if (med && med.valor !== null && med.valor !== undefined) {
          row[etiqueta] = med.valor;
        } else if (aplicables.has(clave)) {
          row[etiqueta] = "NO CAPTURADO";
        } else if (aplicables.size === 0) {
          row[etiqueta] = "NO CAPTURADO";
        } else {
          row[etiqueta] = "No aplica";
        }
      }
      row["Justificacion_usuario"] = m.fuera_de_turno ? txt(m.fuera_de_turno_motivo) : SIN_INFO;
      row["capturado_fuera_de_tiempo"] = m.fuera_de_turno ? "Sí" : "No";
      return row;
    });



    // ====================================================
    // Costo de No Calidad
    // ====================================================
    const { data: cfgRow } = await sb
      .from("app_settings")
      .select("costo_no_calidad_kg")
      .limit(1)
      .maybeSingle();
    const costoKg = Number((cfgRow as any)?.costo_no_calidad_kg ?? 18.0);

    const pesoPorMuestra = new Map<string, number>();
    for (const med of mediciones ?? []) {
      if (med.variable_clave === "peso" && med.valor != null) {
        const v = Number(med.valor);
        if (!Number.isNaN(v)) pesoPorMuestra.set(med.muestra_id, v);
      }
    }
    const esNoLiberado = (m: any) =>
      !(m.dictamen === "liberada" || m.estatus_liberacion === "L");

    const noLibBase: Array<{ m: any; pesoKg: number; costoMxn: number }> = [];
    let totalKg = 0;
    for (const m of muestrasFull ?? []) {
      if (!esNoLiberado(m)) continue;
      const pesoKg = pesoPorMuestra.get(m.id) ?? 0;
      const costoMxn = Math.round(pesoKg * costoKg * 100) / 100;
      totalKg += pesoKg;
      noLibBase.push({ m, pesoKg, costoMxn });
    }
    const costoTotal = Math.round(totalKg * costoKg * 100) / 100;
    const costoPromedio =
      noLibBase.length > 0
        ? Math.round((costoTotal / noLibBase.length) * 100) / 100
        : 0;

    const fmtMxn = (n: number) =>
      `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const resumenRows: Record<string, string | number>[] = [
      {
        rollos_no_liberados: noLibBase.length,
        kg_no_liberados: Math.round(totalKg * 100) / 100,
        costo_kg_mxn: fmtMxn(costoKg),
        costo_total_mxn: fmtMxn(costoTotal),
        costo_promedio_mxn: fmtMxn(costoPromedio),
        periodo_inicio: start.slice(0, 10),
        periodo_fin: end.slice(0, 10),
      },
    ];

    const rollosNoLibBasic: Record<string, string | number>[] = noLibBase.map(
      ({ m, pesoKg, costoMxn }) => {
        const maq = maquinaById.get(m.maquina_id);
        const planta = plantaById.get(m.planta_id);
        const orden = m.ordenes_fabricacion;
        return {
          fecha: fechaLocal(m.hora_muestreo),
          hora: horaLocal(m.hora_muestreo),

          planta: planta?.nombre ?? "—",
          maquina: maq?.codigo ?? "—",
          turno: m.turno ?? "—",
          orden: orden?.folio ?? "—",
          producto: orden?.productos?.nombre ?? "—",
          rollo: m.numero_rollo ?? "—",
          operador: m.operador ?? "—",
          analista: m.analista ?? "—",
          peso_kg: Math.round(pesoKg * 100) / 100,
          costo_mxn: fmtMxn(costoMxn),
          estatus: m.estatus_liberacion ?? m.dictamen ?? "pendiente",
        };
      },
    );

    const rollosNoLibFull: Record<string, string | number>[] = noLibBase.map(
      ({ m, pesoKg, costoMxn }) => {
        const maq = maquinaById.get(m.maquina_id);
        const planta = plantaById.get(m.planta_id);
        const orden = m.ordenes_fabricacion;
        const meds = medsByMuestra.get(m.id) ?? [];
        const medsByClave = new Map(meds.map((x) => [x.variable_clave, x]));
        const row: Record<string, string | number> = {
          fecha: fechaLocal(m.hora_muestreo),
          hora: horaLocal(m.hora_muestreo),

          planta: planta?.nombre ?? "—",
          maquina: maq?.codigo ?? "—",
          turno: m.turno ?? "—",
          orden: orden?.folio ?? "—",
          producto: orden?.productos?.nombre ?? "—",
          codigo_producto: orden?.productos?.codigo ?? "—",
          rollo: m.numero_rollo ?? "—",
          operador: m.operador ?? "—",
          analista: m.analista ?? "—",
          peso_kg: Math.round(pesoKg * 100) / 100,
          costo_mxn: fmtMxn(costoMxn),
          estatus: m.estatus_liberacion ?? m.dictamen ?? "pendiente",
        };
        for (const clave of clavesOrden) {
          const etiqueta = etiquetaPorClave.get(clave) ?? clave;
          const med = medsByClave.get(clave);
          row[etiqueta] = med && med.valor !== null ? med.valor : "";
        }
        return row;
      },
    );

    const datasets: ReportePayload["datasets"] = {
      "Detalle de no conformidades": [
        { sheet: "No conformidades", rows: ncRows.length ? ncRows : [{ aviso: "Sin no conformidades en el periodo" }] },
      ],
      "Tendencia de variables críticas": [
        { sheet: "Tendencia", rows: tendRows.length ? tendRows : [{ aviso: "Sin datos" }] },
      ],
      "Reporte General": [
        { sheet: "Rollos producidos", rows: generalRows.length ? generalRows : [{ aviso: "Sin rollos en el periodo" }] },
      ],
      "Costo de No Calidad": [
        { sheet: "Resumen", rows: resumenRows },
        { sheet: "Rollos no liberados", rows: rollosNoLibBasic.length ? rollosNoLibBasic : [{ aviso: "Sin rollos no liberados en el periodo" }] },
      ],
      "Costo de No Calidad (detalle)": [
        { sheet: "Resumen", rows: resumenRows },
        { sheet: "Rollos no liberados", rows: rollosNoLibFull.length ? rollosNoLibFull : [{ aviso: "Sin rollos no liberados en el periodo" }] },
      ],
    };

    return { desempenoPlanta, datasets };
  });
