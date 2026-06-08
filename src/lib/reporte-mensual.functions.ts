// =====================================================================
// REPORTE MENSUAL / ANUAL — agregaciones reales contra BD
// - Filtros: año (obligatorio) y mes (opcional).
// - Sin datos mock. Sin precarga. Si no hay datos, los totales son 0
//   y los campos textuales son null para que el cliente muestre "—".
// - Regla obligatoria: el último día de cada mes solo se consideran
//   los registros del Primer Turno ("1"). El resto de los días incluye
//   todos los turnos.
// - Se excluyen muestras en estado borrador (registros inválidos /
//   pruebas no liberadas para reporte).
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
});

export type ReporteMensualBucket = {
  /** "Enero"…"Diciembre" en vista anual, "01"…"31" en vista mensual */
  label: string;
  /** Solo en vista mensual: máquina ("MP-04", etc.) — null en anual */
  maquina?: string | null;
  /** ISO date del bucket (primer día del mes / día) */
  fecha: string;
  rollos: number;
  kg: number;
  conformes: number;
  noConformes: number;
  pendientes: number;
  conformidadPct: number | null;
};

export type ReporteMensualNCMaquina = {
  maquina: string;
  rollos: number;
  noConformes: number;
  noConformidadPct: number;
  kgAfectados: number;
};

export type ReporteMensualTrace = {
  id: string;
  fecha: string;
  numero_rollo: string;
  maquina: string | null;
  turno: string;
  producto: string | null;
  capturista: string | null;
  estado: string;
  dictamen: string | null;
  folio: string;
};

export type ReporteMensualPayload = {
  modo: "anual" | "mensual";
  year: number;
  month: number | null;
  periodoTexto: string;
  resumen: {
    rollosTotal: number;
    kgTotal: number;
    conformes: number;
    noConformes: number;
    pendientes: number;
    conformidadPct: number | null;
  };
  buckets: ReporteMensualBucket[];
  ncPorMaquina: ReporteMensualNCMaquina[];
  trazabilidad: ReporteMensualTrace[];
  generadoEn: string;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export const getReporteMensual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => inputSchema.parse(i))
  .handler(async ({ data, context }): Promise<ReporteMensualPayload> => {
    const sb = context.supabase;
    const year = data.year;
    const month = data.month ?? null;
    const modo: "anual" | "mensual" = month == null ? "anual" : "mensual";

    const startDate = new Date(Date.UTC(year, month == null ? 0 : month - 1, 1));
    const endDate = month == null
      ? new Date(Date.UTC(year + 1, 0, 1))
      : new Date(Date.UTC(year, month, 1));

    // 1) Muestras del periodo (excluir borrador → registros inválidos)
    const muestrasAll: Array<{
      id: string;
      numero_rollo: string;
      capturado_at: string;
      maquina_id: string;
      producto_id: string | null;
      turno: string;
      estado: string;
      dictamen: string | null;
      estatus_liberacion: string | null;
      capturado_por: string | null;
    }> = [];
    {
      const pageSize = 1000;
      let from = 0;
      for (let i = 0; i < 100; i++) {
        const { data: page, error } = await sb
          .from("muestras_calidad")
          .select("id, numero_rollo, capturado_at, maquina_id, producto_id, turno, estado, dictamen, estatus_liberacion, capturado_por")
          .gte("capturado_at", startDate.toISOString())
          .lt("capturado_at", endDate.toISOString())
          .neq("estado", "borrador")
          .order("capturado_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (page ?? []) as typeof muestrasAll;
        muestrasAll.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }
    }

    // 2) Aplicar regla: último día de cada mes → solo Primer Turno ("1")
    const muestras = muestrasAll.filter((m) => {
      const d = new Date(m.capturado_at);
      const y = d.getUTCFullYear();
      const m0 = d.getUTCMonth();
      const day = d.getUTCDate();
      const last = lastDayOfMonth(y, m0);
      if (day === last) return String(m.turno) === "1";
      return true;
    });

    // 3) Catálogos
    const muestraIds = muestras.map((m) => m.id);
    const maquinaIds = Array.from(new Set(muestras.map((m) => m.maquina_id)));
    const productoIds = Array.from(new Set(muestras.map((m) => m.producto_id).filter((v): v is string => !!v)));
    const userIds = Array.from(new Set(muestras.map((m) => m.capturado_por).filter((v): v is string => !!v)));

    const [maqRes, prodRes, profRes] = await Promise.all([
      maquinaIds.length
        ? sb.from("maquinas").select("id, codigo, nombre").in("id", maquinaIds)
        : Promise.resolve({ data: [] as Array<{ id: string; codigo: string; nombre: string }>, error: null }),
      productoIds.length
        ? sb.from("productos").select("id, codigo, nombre").in("id", productoIds)
        : Promise.resolve({ data: [] as Array<{ id: string; codigo: string; nombre: string }>, error: null }),
      userIds.length
        ? sb.from("profiles").select("id, nombre, email").in("id", userIds)
        : Promise.resolve({ data: [] as Array<{ id: string; nombre: string | null; email: string | null }>, error: null }),
    ]);
    if (maqRes.error) throw maqRes.error;
    if (prodRes.error) throw prodRes.error;
    if (profRes.error) throw profRes.error;

    const maqById = new Map((maqRes.data ?? []).map((r) => [r.id, r]));
    const prodById = new Map((prodRes.data ?? []).map((r) => [r.id, r]));
    const userById = new Map((profRes.data ?? []).map((r) => [r.id, r]));

    // 4) Peso por muestra (mediciones_calidad, variable_clave="peso") paginado
    const pesoPorMuestra = new Map<string, number>();
    if (muestraIds.length) {
      const chunkSize = 500;
      for (let i = 0; i < muestraIds.length; i += chunkSize) {
        const slice = muestraIds.slice(i, i + chunkSize);
        let from = 0;
        for (let p = 0; p < 50; p++) {
          const { data: meds, error } = await sb
            .from("mediciones_calidad")
            .select("muestra_id, valor")
            .eq("variable_clave", "peso")
            .in("muestra_id", slice)
            .range(from, from + 999);
          if (error) throw error;
          for (const m of meds ?? []) {
            if (m.valor == null) continue;
            const v = Number(m.valor);
            if (!Number.isNaN(v)) pesoPorMuestra.set(m.muestra_id as string, v);
          }
          if ((meds ?? []).length < 1000) break;
          from += 1000;
        }
      }
    }

    // 5) Helpers conformidad
    const isConforme = (m: { dictamen: string | null; estatus_liberacion: string | null }) =>
      m.dictamen === "liberada" || m.estatus_liberacion === "L";
    const isNoConforme = (m: { dictamen: string | null; estatus_liberacion: string | null }) =>
      m.dictamen === "rechazada" || m.estatus_liberacion === "NC";

    // 6) Resumen ejecutivo
    let rollosTotal = 0, kgTotal = 0, confTotal = 0, ncTotal = 0, pendTotal = 0;
    for (const m of muestras) {
      rollosTotal += 1;
      kgTotal += pesoPorMuestra.get(m.id) ?? 0;
      if (isConforme(m)) confTotal += 1;
      else if (isNoConforme(m)) ncTotal += 1;
      else pendTotal += 1;
    }
    const conformidadPct = rollosTotal > 0
      ? Math.round((confTotal / rollosTotal) * 1000) / 10
      : null;

    // 7) Buckets
    const buckets: ReporteMensualBucket[] = [];
    if (modo === "anual") {
      for (let m0 = 0; m0 < 12; m0++) {
        const inMes = muestras.filter((s) => {
          const d = new Date(s.capturado_at);
          return d.getUTCFullYear() === year && d.getUTCMonth() === m0;
        });
        const rollos = inMes.length;
        const kg = inMes.reduce((a, s) => a + (pesoPorMuestra.get(s.id) ?? 0), 0);
        const conf = inMes.filter(isConforme).length;
        const nc = inMes.filter(isNoConforme).length;
        const pend = rollos - conf - nc;
        buckets.push({
          label: MESES[m0],
          fecha: new Date(Date.UTC(year, m0, 1)).toISOString(),
          rollos,
          kg: Math.round(kg * 100) / 100,
          conformes: conf,
          noConformes: nc,
          pendientes: pend,
          conformidadPct: rollos > 0 ? Math.round((conf / rollos) * 1000) / 10 : null,
        });
      }
    } else {
      // mensual: día × máquina
      const m0 = (month as number) - 1;
      const days = lastDayOfMonth(year, m0);
      for (let d = 1; d <= days; d++) {
        const inDia = muestras.filter((s) => {
          const dt = new Date(s.capturado_at);
          return dt.getUTCFullYear() === year && dt.getUTCMonth() === m0 && dt.getUTCDate() === d;
        });
        if (inDia.length === 0) {
          buckets.push({
            label: String(d).padStart(2, "0"),
            maquina: null,
            fecha: new Date(Date.UTC(year, m0, d)).toISOString(),
            rollos: 0, kg: 0, conformes: 0, noConformes: 0, pendientes: 0,
            conformidadPct: null,
          });
          continue;
        }
        const byMaq = new Map<string, typeof inDia>();
        for (const s of inDia) {
          const code = maqById.get(s.maquina_id)?.codigo ?? "—";
          const arr = byMaq.get(code) ?? [];
          arr.push(s);
          byMaq.set(code, arr);
        }
        for (const [code, arr] of Array.from(byMaq.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          const rollos = arr.length;
          const kg = arr.reduce((a, s) => a + (pesoPorMuestra.get(s.id) ?? 0), 0);
          const conf = arr.filter(isConforme).length;
          const nc = arr.filter(isNoConforme).length;
          const pend = rollos - conf - nc;
          buckets.push({
            label: String(d).padStart(2, "0"),
            maquina: code,
            fecha: new Date(Date.UTC(year, m0, d)).toISOString(),
            rollos,
            kg: Math.round(kg * 100) / 100,
            conformes: conf,
            noConformes: nc,
            pendientes: pend,
            conformidadPct: rollos > 0 ? Math.round((conf / rollos) * 1000) / 10 : null,
          });
        }
      }
    }

    // 8) Ranking de no conformidad por máquina (desc)
    const ncMap = new Map<string, { rollos: number; nc: number; kgAfect: number }>();
    for (const m of muestras) {
      const code = maqById.get(m.maquina_id)?.codigo ?? "—";
      const cur = ncMap.get(code) ?? { rollos: 0, nc: 0, kgAfect: 0 };
      cur.rollos += 1;
      if (isNoConforme(m)) {
        cur.nc += 1;
        cur.kgAfect += pesoPorMuestra.get(m.id) ?? 0;
      }
      ncMap.set(code, cur);
    }
    const ncPorMaquina: ReporteMensualNCMaquina[] = Array.from(ncMap.entries())
      .map(([maquina, v]) => ({
        maquina,
        rollos: v.rollos,
        noConformes: v.nc,
        noConformidadPct: v.rollos > 0 ? Math.round((v.nc / v.rollos) * 1000) / 10 : 0,
        kgAfectados: Math.round(v.kgAfect * 100) / 100,
      }))
      .sort((a, b) => b.noConformes - a.noConformes || b.noConformidadPct - a.noConformidadPct);

    // 9) Trazabilidad (registros base que componen los totales)
    const trazabilidad: ReporteMensualTrace[] = muestras
      .slice()
      .sort((a, b) => {
        const dtA = new Date(a.capturado_at).getTime();
        const dtB = new Date(b.capturado_at).getTime();
        if (dtA !== dtB) return dtA - dtB;
        const maqA = maqById.get(a.maquina_id)?.codigo ?? "";
        const maqB = maqById.get(b.maquina_id)?.codigo ?? "";
        return maqA.localeCompare(maqB);
      })
      .map((m) => {
        const u = m.capturado_por ? userById.get(m.capturado_por) : null;
        return {
          id: m.id,
          fecha: m.capturado_at,
          numero_rollo: m.numero_rollo,
          maquina: maqById.get(m.maquina_id)?.codigo ?? null,
          turno: m.turno,
          producto: m.producto_id ? (prodById.get(m.producto_id)?.nombre ?? null) : null,
          capturista: u?.nombre ?? u?.email ?? null,
          estado: m.estado,
          dictamen: m.dictamen,
          folio: m.numero_rollo,
        };
      });

    const periodoTexto = modo === "anual"
      ? `Año ${year}`
      : `${MESES[(month as number) - 1]} ${year}`;

    return {
      modo,
      year,
      month,
      periodoTexto,
      resumen: {
        rollosTotal,
        kgTotal: Math.round(kgTotal * 100) / 100,
        conformes: confTotal,
        noConformes: ncTotal,
        pendientes: pendTotal,
        conformidadPct,
      },
      buckets,
      ncPorMaquina,
      trazabilidad,
      generadoEn: new Date().toISOString(),
    };
  });
