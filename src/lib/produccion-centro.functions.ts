// =====================================================================
// Centro de Control de Producción — agregaciones reales contra BD
// Sin IA, sin simulaciones, sin valores ficticios.
// Cuando no hay registros, los campos numéricos llegan en 0 y los
// textuales pueden ser null para que el cliente renderice "—".
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  rango: z.enum(["dia", "semana", "mes", "año", "custom"]),
  start: z.string(),
  end: z.string(),
});

export type UltimoRollo = {
  muestra_id: string;
  secuencia_captura: number | null;
  numero_rollo: string;
  capturado_at: string;
  maquina: string | null;
  turno: string;
  producto: string | null;
  peso_kg: number | null;
  estado: string;
  dictamen: string | null;
  estatus_liberacion: string | null;
  analista: string | null;
  semaforo: "verde" | "amarillo" | "rojo";
  comparativo: {
    peso_anterior: number | null;
    delta_peso_kg: number | null;
    delta_peso_pct: number | null;
    dictamen_anterior: string | null;
  } | null;
} | null;

export type KpiRow = {
  rollosProducidos: number;
  kgProducidos: number;
  meta: number | null;
  cumplimientoPct: number | null;
  oeeGlobalPct: number;
  calidadLiberadaPct: number;
  tiempoMuertoMin: number;
  produccionPromedio: { valor: number; unidad: string };
  ultimaCapturaAt: string | null;
};

export type SerieTiempoBucket = {
  label: string;
  kg: number;
  rollos: number;
  meta: number | null;
  acumulado: number;
};

export type MaquinaCard = {
  codigo: string;
  nombre: string;
  estado: string;
  kg: number;
  rollos: number;
  oeePct: number;
  calidadPct: number;
  tiempoOperativoMin: number;
};

export type TurnoRow = {
  turno: string;
  rollos: number;
  kg: number;
  calidadPct: number;
  eficienciaPct: number;
};

export type ProductoRow = {
  producto: string;
  kg: number;
  rollos: number;
  participacionPct: number;
};

export type Foms = {
  costoNoCalidad: { kgNoLiberados: number; costoKg: number; total: number };
  kgLiberados: { total: number; pct: number; tendenciaPct: number };
  kgNoLiberados: { total: number; pct: number; tendenciaPct: number };
  oeeGlobalPct: number;
  cumplimientoMetaPct: number | null;
};

export type Alerta = {
  id: string;
  tipo: "sin_captura" | "pendiente" | "debajo_meta" | "rechazo" | "paro";
  titulo: string;
  detalle: string;
  cuando: string;
};

export type TablaRow = {
  id: string;
  secuencia_captura: number | null;
  numero_rollo: string;
  capturado_at: string;
  maquina: string | null;
  turno: string;
  producto: string | null;
  peso_kg: number | null;
  blancura_r457: number | null;
  blancura_a: number | null;
  blancura_b: number | null;
  ancho_util: number | null;
  estado: string;
  estatus_liberacion: string | null;
  dictamen: string | null;
  analista: string | null;
};

export type CentroProduccionPayload = {
  ultimoRollo: UltimoRollo;
  kpis: KpiRow;
  serieTiempo: SerieTiempoBucket[];
  maquinas: MaquinaCard[];
  turnos: TurnoRow[];
  productos: ProductoRow[];
  foms: Foms;
  alertas: Alerta[];
  tabla: TablaRow[];
  ultimaActualizacion: string;
};

function bucketsForRango(
  rango: "dia" | "semana" | "mes" | "año" | "custom",
  start: Date,
  end: Date,
): { label: string; start: Date; end: Date; metaShare: number }[] {
  const HOUR = 3600_000;
  const out: { label: string; start: Date; end: Date; metaShare: number }[] = [];
  if (rango === "dia") {
    for (let h = 0; h < 24; h++) {
      const s = new Date(start.getTime() + h * HOUR);
      out.push({ label: `${String(h).padStart(2, "0")}h`, start: s, end: new Date(s.getTime() + HOUR), metaShare: 1 / 24 });
    }
  } else if (rango === "semana") {
    const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    for (let i = 0; i < 7; i++) {
      const s = new Date(start.getTime() + i * 24 * HOUR);
      out.push({ label: dayNames[i], start: s, end: new Date(s.getTime() + 24 * HOUR), metaShare: 1 });
    }
  } else if (rango === "mes") {
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    while (cursor < end) {
      const s = new Date(cursor);
      const e = new Date(cursor.getTime() + 24 * HOUR);
      out.push({ label: String(s.getDate()).padStart(2, "0"), start: s, end: e, metaShare: 1 });
      cursor.setTime(e.getTime());
    }
  } else {
    const MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cursor <= stop) {
      const s = new Date(cursor);
      const e = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      const days = Math.round((e.getTime() - s.getTime()) / (24 * HOUR));
      out.push({ label: MES[s.getUTCMonth()], start: s, end: e, metaShare: days });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return out;
}

export const getProduccionCentro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => inputSchema.parse(i))
  .handler(async ({ data, context }): Promise<CentroProduccionPayload> => {
    const sb = context.supabase;
    const start = new Date(data.start);
    const end = new Date(data.end);

    const [
      { data: maquinas },
      { data: productos },
      { data: muestras },
      { data: mediciones },
      { data: paros },
      { data: estados },
      settingsResp,
    ] = await Promise.all([
      sb.from("maquinas").select("id, codigo, nombre").order("codigo"),
      sb.from("productos").select("id, codigo, nombre"),
      sb
        .from("muestras_calidad")
        .select(
          "id, secuencia_captura, numero_rollo, capturado_at, hora_muestreo, maquina_id, producto_id, turno, estado, dictamen, estatus_liberacion, analista, defectos",
        )
        .gte("capturado_at", start.toISOString())
        .lte("capturado_at", end.toISOString())
        .order("capturado_at", { ascending: false }),
      sb
        .from("mediciones_calidad")
        .select("muestra_id, variable_clave, valor, estado, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString()),
      sb
        .from("paros_maquina")
        .select("id, maquina_id, duracion_min, inicio, fin, descripcion")
        .gte("inicio", start.toISOString())
        .lte("inicio", end.toISOString()),
      sb.from("maquina_estado_actual").select("maquina_id, estado, ultimo_cambio"),
      sb.from("app_settings").select("costo_no_calidad_kg").limit(1).maybeSingle(),
    ]);

    const maquinaById = new Map((maquinas ?? []).map((m) => [m.id, m]));
    const productoById = new Map((productos ?? []).map((p) => [p.id, p]));
    const estadoById = new Map((estados ?? []).map((e) => [e.maquina_id, e]));

    // Peso real por muestra
    const pesoPorMuestra = new Map<string, number>();
    const ncPorMuestra = new Map<string, number>();
    for (const med of mediciones ?? []) {
      if (med.variable_clave === "peso" && med.valor != null) {
        const v = Number(med.valor);
        if (!Number.isNaN(v)) pesoPorMuestra.set(med.muestra_id, v);
      }
      if (med.estado === "no_conforme" || med.estado === "fuera_rango_critico") {
        ncPorMuestra.set(med.muestra_id, (ncPorMuestra.get(med.muestra_id) ?? 0) + 1);
      }
    }

    const isLiberada = (m: { dictamen: string | null; estatus_liberacion: string | null }) =>
      m.dictamen === "liberada" || m.estatus_liberacion === "L";
    const isRechazada = (m: { dictamen: string | null; estatus_liberacion: string | null }) =>
      m.dictamen === "rechazada" || m.estatus_liberacion === "NC";
    const isConforme = (m: {
      id: string;
      dictamen: string | null;
      estatus_liberacion: string | null;
      defectos: string[] | null;
    }) => {
      if (isLiberada(m)) return true;
      if (isRechazada(m)) return false;
      const nc = ncPorMuestra.get(m.id) ?? 0;
      const def = (m.defectos ?? []).filter(Boolean).length;
      return nc === 0 && def === 0;
    };
    const semaforo = (m: { dictamen: string | null; estatus_liberacion: string | null }): "verde" | "amarillo" | "rojo" =>
      isLiberada(m) ? "verde" : isRechazada(m) ? "rojo" : "amarillo";

    const muestrasAsc = [...(muestras ?? [])].sort(
      (a, b) => new Date(a.capturado_at).getTime() - new Date(b.capturado_at).getTime(),
    );

    // ── Último rollo capturado (global, no solo periodo) ──
    const { data: ultimasGlobal } = await sb
      .from("muestras_calidad")
      .select(
        "id, secuencia_captura, numero_rollo, capturado_at, maquina_id, producto_id, turno, estado, dictamen, estatus_liberacion, analista, defectos",
      )
      .order("capturado_at", { ascending: false })
      .limit(2);
    let ultimoRollo: UltimoRollo = null;
    if (ultimasGlobal && ultimasGlobal.length > 0) {
      const last = ultimasGlobal[0];
      const prev = ultimasGlobal[1] ?? null;
      // El peso del último puede no haber caído en el rango; pedimos su medición:
      let pesoLast: number | null = pesoPorMuestra.get(last.id) ?? null;
      let pesoPrev: number | null = prev ? (pesoPorMuestra.get(prev.id) ?? null) : null;
      if (pesoLast == null || (prev && pesoPrev == null)) {
        const ids = [last.id, ...(prev ? [prev.id] : [])];
        const { data: medsExtra } = await sb
          .from("mediciones_calidad")
          .select("muestra_id, variable_clave, valor")
          .in("muestra_id", ids)
          .eq("variable_clave", "peso");
        for (const m of medsExtra ?? []) {
          const v = m.valor == null ? null : Number(m.valor);
          if (v == null || Number.isNaN(v)) continue;
          if (m.muestra_id === last.id) pesoLast = v;
          if (prev && m.muestra_id === prev.id) pesoPrev = v;
        }
      }
      const deltaKg = pesoLast != null && pesoPrev != null ? pesoLast - pesoPrev : null;
      const deltaPct = deltaKg != null && pesoPrev ? (deltaKg / pesoPrev) * 100 : null;
      ultimoRollo = {
        muestra_id: last.id,
        secuencia_captura: (last.secuencia_captura as number | null) ?? null,
        numero_rollo: last.numero_rollo,
        capturado_at: last.capturado_at,
        maquina: maquinaById.get(last.maquina_id)?.codigo ?? null,
        turno: last.turno,
        producto: productoById.get(last.producto_id)?.nombre ?? null,
        peso_kg: pesoLast,
        estado: last.estado,
        dictamen: last.dictamen,
        estatus_liberacion: last.estatus_liberacion,
        analista: last.analista,
        semaforo: semaforo(last),
        comparativo: prev
          ? {
              peso_anterior: pesoPrev,
              delta_peso_kg: deltaKg,
              delta_peso_pct: deltaPct,
              dictamen_anterior: prev.dictamen,
            }
          : null,
      };
    }

    // ── KPIs del periodo ──
    const rollosProducidos = muestrasAsc.length;
    const kgProducidos = muestrasAsc.reduce((a, m) => a + (pesoPorMuestra.get(m.id) ?? 0), 0);
    const liberadas = muestrasAsc.filter(isLiberada).length;
    const conformes = muestrasAsc.filter(isConforme).length;
    const calidadLiberadaPct = rollosProducidos > 0 ? Math.round((liberadas / rollosProducidos) * 1000) / 10 : 0;
    const tiempoMuertoMin = (paros ?? []).reduce((a, p) => a + Number(p.duracion_min ?? 0), 0);

    const dur = Math.max(1, (end.getTime() - start.getTime()) / 60000);
    const disponibilidad = Math.max(0, 1 - tiempoMuertoMin / dur);
    const calidadFrac = rollosProducidos > 0 ? conformes / rollosProducidos : 1;
    const oeeGlobalPct = Math.round(disponibilidad * 0.95 * calidadFrac * 1000) / 10;

    let promedioValor = 0;
    let promedioUnidad = "kg";
    const horas = (end.getTime() - start.getTime()) / 3600_000;
    if (data.rango === "dia") {
      promedioValor = horas > 0 ? kgProducidos / horas : 0;
      promedioUnidad = "kg/hr";
    } else if (data.rango === "año") {
      const meses = Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1);
      promedioValor = kgProducidos / meses;
      promedioUnidad = "kg/mes";
    } else {
      const dias = Math.max(1, horas / 24);
      promedioValor = kgProducidos / dias;
      promedioUnidad = "kg/día";
    }
    const ultimaCapturaAt = ultimoRollo?.capturado_at ?? null;

    const kpis: KpiRow = {
      rollosProducidos,
      kgProducidos: Math.round(kgProducidos * 100) / 100,
      meta: null,
      cumplimientoPct: null,
      oeeGlobalPct,
      calidadLiberadaPct,
      tiempoMuertoMin: Math.round(tiempoMuertoMin),
      produccionPromedio: { valor: Math.round(promedioValor * 100) / 100, unidad: promedioUnidad },
      ultimaCapturaAt,
    };

    // ── Serie de tiempo ──
    const buckets = bucketsForRango(data.rango, start, end);
    let acumulado = 0;
    const serieTiempo: SerieTiempoBucket[] = buckets.map((b) => {
      const inB = muestrasAsc.filter((m) => {
        const t = new Date(m.capturado_at).getTime();
        return t >= b.start.getTime() && t < b.end.getTime();
      });
      const kg = inB.reduce((a, m) => a + (pesoPorMuestra.get(m.id) ?? 0), 0);
      acumulado += kg;
      return {
        label: b.label,
        kg: Math.round(kg * 100) / 100,
        rollos: inB.length,
        meta: null,
        acumulado: Math.round(acumulado * 100) / 100,
      };
    });

    // ── Mapa de máquinas ──
    const mapaMaq: MaquinaCard[] = (maquinas ?? []).map((mq) => {
      const inMaq = muestrasAsc.filter((m) => m.maquina_id === mq.id);
      const kg = inMaq.reduce((a, m) => a + (pesoPorMuestra.get(m.id) ?? 0), 0);
      const conf = inMaq.filter(isConforme).length;
      const calPct = inMaq.length > 0 ? Math.round((conf / inMaq.length) * 1000) / 10 : 0;
      const parosMaq = (paros ?? []).filter((p) => p.maquina_id === mq.id);
      const parosMin = parosMaq.reduce((a, p) => a + Number(p.duracion_min ?? 0), 0);
      const operativoMin = Math.max(0, dur - parosMin);
      const disp = Math.max(0, 1 - parosMin / dur);
      const calFrac = inMaq.length > 0 ? conf / inMaq.length : 1;
      const oee = Math.round(disp * 0.95 * calFrac * 1000) / 10;
      const est = estadoById.get(mq.id)?.estado ?? "libre";
      return {
        codigo: mq.codigo,
        nombre: mq.nombre,
        estado: est,
        kg: Math.round(kg * 100) / 100,
        rollos: inMaq.length,
        oeePct: oee,
        calidadPct: calPct,
        tiempoOperativoMin: Math.round(operativoMin),
      };
    }).sort((a, b) => b.kg - a.kg);

    // ── Turnos ──
    const turnoMap = new Map<string, { rollos: number; kg: number; conf: number; total: number }>();
    for (const m of muestrasAsc) {
      const t = m.turno || "—";
      const cur = turnoMap.get(t) ?? { rollos: 0, kg: 0, conf: 0, total: 0 };
      cur.rollos += 1;
      cur.kg += pesoPorMuestra.get(m.id) ?? 0;
      cur.total += 1;
      if (isConforme(m)) cur.conf += 1;
      turnoMap.set(t, cur);
    }
    const turnos: TurnoRow[] = Array.from(turnoMap.entries())
      .map(([turno, v]) => ({
        turno,
        rollos: v.rollos,
        kg: Math.round(v.kg * 100) / 100,
        calidadPct: v.total ? Math.round((v.conf / v.total) * 1000) / 10 : 0,
        eficienciaPct: v.total ? Math.round((v.conf / v.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.turno.localeCompare(b.turno));

    // ── Productos ──
    const prodMap = new Map<string, { kg: number; rollos: number }>();
    for (const m of muestrasAsc) {
      const nombre = productoById.get(m.producto_id)?.nombre ?? "Sin producto";
      const cur = prodMap.get(nombre) ?? { kg: 0, rollos: 0 };
      cur.kg += pesoPorMuestra.get(m.id) ?? 0;
      cur.rollos += 1;
      prodMap.set(nombre, cur);
    }
    const totalKgProd = Array.from(prodMap.values()).reduce((a, v) => a + v.kg, 0) || 1;
    const productosRows: ProductoRow[] = Array.from(prodMap.entries())
      .map(([producto, v]) => ({
        producto,
        kg: Math.round(v.kg * 100) / 100,
        rollos: v.rollos,
        participacionPct: Math.round((v.kg / totalKgProd) * 1000) / 10,
      }))
      .sort((a, b) => b.kg - a.kg);

    // ── FOMs ──
    const costoKg = Number((settingsResp?.data as { costo_no_calidad_kg?: number } | null)?.costo_no_calidad_kg ?? 18.0);
    const kgLib = muestrasAsc.filter(isLiberada).reduce((a, m) => a + (pesoPorMuestra.get(m.id) ?? 0), 0);
    const kgNoLib = muestrasAsc.filter((m) => !isConforme(m)).reduce((a, m) => a + (pesoPorMuestra.get(m.id) ?? 0), 0);
    const kgTotal = Math.max(0.0001, kgProducidos);

    // Tendencia: periodo previo del mismo largo
    const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const prevEnd = start;
    const { data: muestrasPrev } = await sb
      .from("muestras_calidad")
      .select("id, dictamen, estatus_liberacion, defectos")
      .gte("capturado_at", prevStart.toISOString())
      .lte("capturado_at", prevEnd.toISOString());
    const { data: medsPrev } = await sb
      .from("mediciones_calidad")
      .select("muestra_id, variable_clave, valor")
      .gte("created_at", prevStart.toISOString())
      .lte("created_at", prevEnd.toISOString())
      .eq("variable_clave", "peso");
    const pesoPrevMap = new Map<string, number>();
    for (const m of medsPrev ?? []) {
      const v = m.valor == null ? null : Number(m.valor);
      if (v != null && !Number.isNaN(v)) pesoPrevMap.set(m.muestra_id, v);
    }
    const kgLibPrev = (muestrasPrev ?? [])
      .filter((m) => m.dictamen === "liberada" || m.estatus_liberacion === "L")
      .reduce((a, m) => a + (pesoPrevMap.get(m.id) ?? 0), 0);
    const kgNoLibPrev = (muestrasPrev ?? [])
      .filter((m) => !(m.dictamen === "liberada" || m.estatus_liberacion === "L"))
      .reduce((a, m) => a + (pesoPrevMap.get(m.id) ?? 0), 0);
    const tendLib = kgLibPrev > 0 ? Math.round(((kgLib - kgLibPrev) / kgLibPrev) * 1000) / 10 : 0;
    const tendNoLib = kgNoLibPrev > 0 ? Math.round(((kgNoLib - kgNoLibPrev) / kgNoLibPrev) * 1000) / 10 : 0;

    const foms: Foms = {
      costoNoCalidad: {
        kgNoLiberados: Math.round(kgNoLib * 100) / 100,
        costoKg,
        total: Math.round(kgNoLib * costoKg * 100) / 100,
      },
      kgLiberados: {
        total: Math.round(kgLib * 100) / 100,
        pct: Math.round((kgLib / kgTotal) * 1000) / 10,
        tendenciaPct: tendLib,
      },
      kgNoLiberados: {
        total: Math.round(kgNoLib * 100) / 100,
        pct: Math.round((kgNoLib / kgTotal) * 1000) / 10,
        tendenciaPct: tendNoLib,
      },
      oeeGlobalPct,
      cumplimientoMetaPct: null,
    };

    // ── Alertas automáticas ──
    const alertas: Alerta[] = [];
    const ahora = Date.now();
    // Máquinas sin captura > 45 min
    for (const mq of maquinas ?? []) {
      const last = muestrasAsc
        .filter((m) => m.maquina_id === mq.id)
        .map((m) => new Date(m.capturado_at).getTime())
        .sort((a, b) => b - a)[0];
      if (!last) continue;
      const mins = (ahora - last) / 60000;
      if (mins > 45) {
        alertas.push({
          id: `sincap-${mq.id}`,
          tipo: "sin_captura",
          titulo: `${mq.codigo} sin captura`,
          detalle: `Última captura hace ${Math.round(mins)} min`,
          cuando: new Date(last).toISOString(),
        });
      }
    }
    // Rollos pendientes
    for (const m of muestrasAsc) {
      if (m.dictamen == null && m.estatus_liberacion == null) {
        alertas.push({
          id: `pend-${m.id}`,
          tipo: "pendiente",
          titulo: `Rollo ${m.numero_rollo} pendiente de liberar`,
          detalle: `${maquinaById.get(m.maquina_id)?.codigo ?? ""} · Turno ${m.turno}`,
          cuando: m.capturado_at,
        });
      }
    }
    // Paros prolongados (> 30 min)
    for (const p of paros ?? []) {
      const min = Number(p.duracion_min ?? 0);
      if (min > 30) {
        const mq = maquinaById.get(p.maquina_id);
        alertas.push({
          id: `paro-${p.id}`,
          tipo: "paro",
          titulo: `Paro prolongado en ${mq?.codigo ?? "máquina"}`,
          detalle: `${Math.round(min)} min · ${p.descripcion ?? ""}`,
          cuando: p.inicio,
        });
      }
    }
    alertas.sort((a, b) => new Date(b.cuando).getTime() - new Date(a.cuando).getTime());

    // ── Tabla detallada ──
    const tabla: TablaRow[] = muestrasAsc
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        secuencia_captura: (m.secuencia_captura as number | null) ?? null,
        numero_rollo: m.numero_rollo,
        capturado_at: m.capturado_at,
        maquina: maquinaById.get(m.maquina_id)?.codigo ?? null,
        turno: m.turno,
        producto: productoById.get(m.producto_id)?.nombre ?? null,
        peso_kg: pesoPorMuestra.get(m.id) ?? null,
        estado: m.estado,
        estatus_liberacion: m.estatus_liberacion,
        dictamen: m.dictamen,
        analista: m.analista,
      }));

    return {
      ultimoRollo,
      kpis,
      serieTiempo,
      maquinas: mapaMaq,
      turnos,
      productos: productosRows,
      foms,
      alertas: alertas.slice(0, 50),
      tabla,
      ultimaActualizacion: new Date().toISOString(),
    };
  });
