// =====================================================================
// Reporte de Producción Mensual (dinámico) — data layer.
// Genera matriz: máquina × producto × día, con kg producidos por día
// dentro del mes seleccionado, aplicando reglas de turnos cerrados.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export type DiaTurnoKey = string; // YYYY-MM-DD

export type ProductoFila = {
  codigo: string;
  nombre: string;
  /** kg por día (YYYY-MM-DD → kg). Solo días incluidos. */
  porDia: Record<DiaTurnoKey, number>;
  total: number;
};

export type MaquinaBloque = {
  codigo: string;
  nombre: string;
  productos: ProductoFila[];
  totalesPorDia: Record<DiaTurnoKey, number>;
  totalMaquina: number;
};

export type ReporteProduccionMesPayload = {
  year: number;
  month: number; // 1-12
  /** Días operativos incluidos (cronológicos). */
  dias: DiaTurnoKey[];
  /** Detalle de qué turnos quedaron incluidos por día (T1/T2/T3). */
  diasDetalle: Record<DiaTurnoKey, { turnos: ("1" | "2" | "3")[] }>;
  /** Último turno cerrado considerado (texto humano). */
  ultimoTurnoCerrado: string | null;
  maquinas: MaquinaBloque[];
  totalGeneral: number;
  generadoAt: string; // ISO
};

const TZ = "America/Mexico_City";

// Convierte (fecha local YYYY-MM-DD, hora local HH) a Date UTC real.
function localToUtc(year: number, month1to12: number, day: number, hour: number): Date {
  // Construimos como si fuera UTC, luego pedimos el offset real en MX para ese momento.
  const naive = new Date(Date.UTC(year, month1to12 - 1, day, hour, 0, 0));
  // Offset en minutos del huso MX para ese instante (negativo en MX, p.ej. -360 = -6h)
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(naive);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-6";
  // tzPart es tipo "GMT-6" o "GMT-5"
  const m = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(tzPart);
  const offH = m ? parseInt(m[1], 10) : -6;
  const offM = m && m[2] ? parseInt(m[2], 10) : 0;
  const offsetMin = offH * 60 + (offH < 0 ? -offM : offM);
  // hora local = hora UTC + offset → UTC = local - offset
  return new Date(naive.getTime() - offsetMin * 60_000);
}

function ymd(year: number, month1to12: number, day: number): string {
  const mm = String(month1to12).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/**
 * Construye los pares (op_date, turno) incluidos en el reporte aplicando:
 *  - Incluye el último día del mes anterior (T1, T2, T3) como día previo.
 *  - Todos los días del mes seleccionado incluyen T1, T2 y T3.
 *  - Solo turnos cerrados (fin_ts <= now).
 */
function buildTurnosIncluidos(
  year: number,
  month: number,
  now: Date,
): {
  pairs: { opDate: string; turno: "1" | "2" | "3"; finTs: Date }[];
  ultimoTurnoCerrado: string | null;
} {
  const pairs: { opDate: string; turno: "1" | "2" | "3"; finTs: Date }[] = [];

  const pushDay = (y: number, m: number, d: number) => {
    const finT1 = localToUtc(y, m, d, 15);
    const finT2 = localToUtc(y, m, d, 23);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const finT3 = localToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 7);
    const opDate = ymd(y, m, d);
    const candidates: { turno: "1" | "2" | "3"; fin: Date }[] = [
      { turno: "1", fin: finT1 },
      { turno: "2", fin: finT2 },
      { turno: "3", fin: finT3 },
    ];
    for (const c of candidates) {
      if (c.fin.getTime() > now.getTime()) continue;
      pairs.push({ opDate, turno: c.turno, finTs: c.fin });
    }
  };

  // Día previo: último día del mes anterior
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const lastPrev = daysInMonth(prevYear, prevMonth);
  pushDay(prevYear, prevMonth, lastPrev);

  // Días del mes seleccionado
  const total = daysInMonth(year, month);
  for (let d = 1; d <= total; d++) pushDay(year, month, d);

  let ultimo: string | null = null;
  if (pairs.length) {
    const last = pairs[pairs.length - 1];
    ultimo = `${last.opDate} · Turno ${last.turno}`;
  }
  return { pairs, ultimoTurnoCerrado: ultimo };
}

export const getReporteProduccionMes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => input.parse(data))
  .handler(async ({ data, context }): Promise<ReporteProduccionMesPayload> => {
    const sb = context.supabase;
    const { year, month } = data;
    const now = new Date();

    const { pairs, ultimoTurnoCerrado } = buildTurnosIncluidos(year, month, now);

    // Conjunto de (opDate|turno) permitidos para filtrar resultados.
    const allowedSet = new Set(pairs.map((p) => `${p.opDate}|${p.turno}`));
    const diasSet = new Set<string>();
    for (const p of pairs) diasSet.add(p.opDate);
    const dias = Array.from(diasSet).sort();
    const diasDetalle: Record<string, { turnos: ("1" | "2" | "3")[] }> = {};
    for (const d of dias) diasDetalle[d] = { turnos: [] };
    for (const p of pairs) diasDetalle[p.opDate].turnos.push(p.turno);

    // Ventana amplia para query: desde inicio del mes (MX) hasta now+1día
    const winStart = localToUtc(year, month, 1, 0);
    const winEnd = new Date(now.getTime() + 24 * 3600_000);

    // 1) Catálogos máquinas (todas para orden estable)
    const { data: maquinasRaw, error: eMaq } = await sb
      .from("maquinas")
      .select("id, codigo, nombre")
      .order("codigo");
    if (eMaq) throw new Error(eMaq.message);

    // 2) Órdenes en la ventana
    const { data: ordenes, error: eOrd } = await sb
      .from("ordenes_fabricacion")
      .select("id, turno, fecha_inicio, maquina_id, producto_id")
      .gte("fecha_inicio", winStart.toISOString())
      .lt("fecha_inicio", winEnd.toISOString());
    if (eOrd) throw new Error(eOrd.message);
    if (!ordenes || ordenes.length === 0) {
      return {
        year, month, dias, diasDetalle, ultimoTurnoCerrado,
        maquinas: [],
        totalGeneral: 0,
        generadoAt: now.toISOString(),
      };
    }

    const ordenIds = ordenes.map((o) => o.id);
    const productoIds = Array.from(new Set(ordenes.map((o) => o.producto_id)));

    // 3) Rollos de esas órdenes
    const { data: rollos, error: eRol } = await sb
      .from("rollos_producidos")
      .select("orden_id, peso_kg")
      .in("orden_id", ordenIds);
    if (eRol) throw new Error(eRol.message);

    // 4) Catálogo productos
    const { data: productos, error: eProd } = await sb
      .from("productos")
      .select("id, codigo, nombre")
      .in("id", productoIds);
    if (eProd) throw new Error(eProd.message);
    const productoById = new Map(productos?.map((p) => [p.id, p]) ?? []);
    const maquinaById = new Map(maquinasRaw?.map((m) => [m.id, m]) ?? []);

    // Calcula op_date para una orden a partir de fecha_inicio + turno (regla shift_op_date).
    function opDateFor(fechaInicioIso: string, turno: string | null): string | null {
      if (!turno) return null;
      const dt = new Date(fechaInicioIso);
      // Hora local MX
      const localY = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(dt));
      const localM = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "2-digit" }).format(dt));
      const localD = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, day: "2-digit" }).format(dt));
      const localH = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(dt));
      // T3 ANTES de las 23:00 local pertenece al día anterior (regla shift_op_date)
      if (turno === "3" && localH < 23) {
        const prev = new Date(Date.UTC(localY, localM - 1, localD - 1));
        return ymd(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
      }
      return ymd(localY, localM, localD);
    }

    // Agrupar peso por (maquinaId, productoId, opDate)
    type Key = string;
    const keyOf = (mId: string, pId: string, opDate: string) => `${mId}|${pId}|${opDate}`;
    const sumByKey = new Map<Key, number>();
    const ordenInfo = new Map(ordenes.map((o) => [o.id, o]));

    for (const r of rollos ?? []) {
      const o = ordenInfo.get(r.orden_id);
      if (!o) continue;
      const opDate = opDateFor(o.fecha_inicio as string, o.turno);
      if (!opDate) continue;
      const allowedKey = `${opDate}|${o.turno}`;
      if (!allowedSet.has(allowedKey)) continue;
      const peso = Number(r.peso_kg ?? 0);
      if (!peso) continue;
      const k = keyOf(o.maquina_id, o.producto_id, opDate);
      sumByKey.set(k, (sumByKey.get(k) ?? 0) + peso);
    }

    // Identificar máquinas que tienen al menos un dato
    const maquinasConDatos = new Set<string>();
    for (const k of sumByKey.keys()) maquinasConDatos.add(k.split("|")[0]);

    const maquinas: MaquinaBloque[] = [];
    let totalGeneral = 0;
    const maquinasOrdenadas = (maquinasRaw ?? [])
      .filter((m) => maquinasConDatos.has(m.id))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    for (const m of maquinasOrdenadas) {
      // Productos únicos para esta máquina
      const prodsSet = new Set<string>();
      for (const k of sumByKey.keys()) {
        const [mId, pId] = k.split("|");
        if (mId === m.id) prodsSet.add(pId);
      }
      const productosFilas: ProductoFila[] = [];
      const totalesPorDia: Record<string, number> = {};
      for (const d of dias) totalesPorDia[d] = 0;
      let totalMaquina = 0;

      const prodList = Array.from(prodsSet)
        .map((pid) => productoById.get(pid))
        .filter((p): p is { id: string; codigo: string; nombre: string } => !!p)
        .sort((a, b) => a.codigo.localeCompare(b.codigo));

      for (const p of prodList) {
        const porDia: Record<string, number> = {};
        let total = 0;
        for (const d of dias) {
          const kg = sumByKey.get(keyOf(m.id, p.id, d)) ?? 0;
          if (kg) porDia[d] = Math.round(kg * 100) / 100;
          total += kg;
          totalesPorDia[d] = (totalesPorDia[d] ?? 0) + kg;
        }
        productosFilas.push({
          codigo: p.codigo,
          nombre: p.nombre,
          porDia,
          total: Math.round(total * 100) / 100,
        });
        totalMaquina += total;
      }

      // Redondear totales por día
      for (const d of dias) totalesPorDia[d] = Math.round((totalesPorDia[d] ?? 0) * 100) / 100;
      totalMaquina = Math.round(totalMaquina * 100) / 100;

      maquinas.push({
        codigo: m.codigo,
        nombre: m.nombre,
        productos: productosFilas,
        totalesPorDia,
        totalMaquina,
      });
      totalGeneral += totalMaquina;
    }

    return {
      year,
      month,
      dias,
      diasDetalle,
      ultimoTurnoCerrado,
      maquinas,
      totalGeneral: Math.round(totalGeneral * 100) / 100,
      generadoAt: now.toISOString(),
    };
  });
