// =====================================================================
// Reporte NO CONFORME — data layer.
// Devuelve rollos con estatus NC o liberados con justificación (CONDICIONADO)
// del mes vigente, desde el día 1 (a partir del Turno 2) hasta el último
// turno cerrado al momento de generar.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z
  .object({
    year: z.number().int().min(2020).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
  })
  .optional()
  .default({});

const TZ = "America/Mexico_City";

export type NoConformeRow = {
  id: string;
  turno: string; // "1ER TURNO" | "2DO TURNO" | "3ER TURNO"
  turnoNum: "1" | "2" | "3";
  fechaOperativa: string; // YYYY-MM-DD
  calidad: string; // codigo producto
  rollo: string;
  defecto: string;
  estatus: "NO CONFORME" | "CONDICIONADO";
  hora: string; // HH:mm (hora real local MX)
  pb: number | null;
  btR457: number | null;
  aStar: number | null;
  bStar: number | null;
  pesoRollo: number | null;
  anchoUtil: number | null;
  maquina: string; // ej "4" (último dígito) o código completo si no encaja
  maquinaCodigo: string; // MP-04
  destino: string;
  // Trazabilidad
  capturadoAt: string | null;
  capturadoPorNombre: string | null;
  modificadoAt: string | null;
  modificadoPorNombre: string | null;
};

export type NoConformePayload = {
  year: number;
  month: number;
  rangoInicio: string; // texto humano
  rangoFin: string;
  ultimoTurnoCerrado: string | null;
  rows: NoConformeRow[];
  generadoAt: string;
};

function localToUtc(year: number, month1to12: number, day: number, hour: number): Date {
  const naive = new Date(Date.UTC(year, month1to12 - 1, day, hour, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" });
  const parts = fmt.formatToParts(naive);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-6";
  const m = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(tzPart);
  const offH = m ? parseInt(m[1], 10) : -6;
  const offM = m && m[2] ? parseInt(m[2], 10) : 0;
  const offsetMin = offH * 60 + (offH < 0 ? -offM : offM);
  return new Date(naive.getTime() - offsetMin * 60_000);
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function buildAllowedPairs(year: number, month: number, now: Date) {
  const total = daysInMonth(year, month);
  const set = new Set<string>(); // "YYYY-MM-DD|T"
  let ultimo: { opDate: string; turno: "1" | "2" | "3"; fin: Date } | null = null;
  for (let d = 1; d <= total; d++) {
    const finT1 = localToUtc(year, month, d, 15);
    const finT2 = localToUtc(year, month, d, 23);
    const next = new Date(Date.UTC(year, month - 1, d + 1));
    const finT3 = localToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 7);
    const opDate = ymd(year, month, d);
    const cands: { t: "1" | "2" | "3"; fin: Date }[] = [
      { t: "1", fin: finT1 },
      { t: "2", fin: finT2 },
      { t: "3", fin: finT3 },
    ];
    for (const c of cands) {
      // Día 1: solo desde el Turno 2
      if (d === 1 && c.t === "1") continue;
      // Solo turnos cerrados
      if (c.fin.getTime() > now.getTime()) continue;
      set.add(`${opDate}|${c.t}`);
      if (!ultimo || c.fin.getTime() > ultimo.fin.getTime()) {
        ultimo = { opDate, turno: c.t, fin: c.fin };
      }
    }
  }
  return { set, ultimo };
}

function shiftOpDate(capturadoAtIso: string, turno: string | null): string | null {
  if (!turno) return null;
  const dt = new Date(capturadoAtIso);
  const y = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(dt));
  const m = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "2-digit" }).format(dt));
  const d = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, day: "2-digit" }).format(dt));
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(dt));
  if (turno === "3" && h < 23) {
    const prev = new Date(Date.UTC(y, m - 1, d - 1));
    return ymd(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
  }
  return ymd(y, m, d);
}

function localHHmm(iso: string): string {
  const dt = new Date(iso);
  const h = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(dt);
  const mi = new Intl.DateTimeFormat("en-US", { timeZone: TZ, minute: "2-digit" }).format(dt);
  return `${String(parseInt(h, 10)).padStart(2, "0")}:${String(parseInt(mi, 10)).padStart(2, "0")}`;
}

const TURNO_LABEL: Record<string, string> = {
  "1": "1ER TURNO",
  "2": "2DO TURNO",
  "3": "3ER TURNO",
};

export const getReporteNoConforme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => input.parse(data))
  .handler(async ({ data, context }): Promise<NoConformePayload> => {
    const sb = context.supabase;
    const now = new Date();
    const year =
      data?.year ??
      Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(now));
    const month =
      data?.month ??
      Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "2-digit" }).format(now));

    const { set: allowedSet, ultimo } = buildAllowedPairs(year, month, now);
    const ultimoTurnoCerrado = ultimo ? `${ultimo.opDate} · Turno ${ultimo.turno}` : null;

    const winStart = localToUtc(year, month, 1, 0);
    const winEndDay = daysInMonth(year, month);
    const next = new Date(Date.UTC(year, month - 1, winEndDay + 1));
    const winEnd = localToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 8);

    // 1) Muestras NC o liberadas con justificación dentro de la ventana
    const { data: muestras, error: eM } = await sb
      .from("muestras_calidad")
      .select(
        "id, turno, numero_rollo, capturado_at, hora_muestreo, defectos, defecto_visual_conversion, destino, estatus_liberacion, liberado_con_justificacion, producto_id, maquina_id, capturado_por, mediciones_modificadas_at, mediciones_modificadas_por",
      )
      .gte("capturado_at", winStart.toISOString())
      .lt("capturado_at", winEnd.toISOString())
      .or("estatus_liberacion.eq.NC,liberado_con_justificacion.eq.true");
    if (eM) throw new Error(eM.message);

    const muestrasFiltradas = (muestras ?? []).filter((mu) => {
      if (!mu.turno || !mu.capturado_at) return false;
      const opDate = shiftOpDate(mu.capturado_at as string, mu.turno);
      if (!opDate) return false;
      return allowedSet.has(`${opDate}|${mu.turno}`);
    });

    if (muestrasFiltradas.length === 0) {
      return {
        year,
        month,
        rangoInicio: `${ymd(year, month, 1)} · Turno 2`,
        rangoFin: ultimoTurnoCerrado ?? "—",
        ultimoTurnoCerrado,
        rows: [],
        generadoAt: now.toISOString(),
      };
    }

    const muestraIds = muestrasFiltradas.map((m) => m.id);
    const productoIds = Array.from(new Set(muestrasFiltradas.map((m) => m.producto_id).filter(Boolean) as string[]));
    const maquinaIds = Array.from(new Set(muestrasFiltradas.map((m) => m.maquina_id).filter(Boolean) as string[]));
    const userIds = Array.from(
      new Set(
        muestrasFiltradas
          .flatMap((m) => [m.capturado_por, m.mediciones_modificadas_por])
          .filter((v): v is string => !!v),
      ),
    );

    // Paginación: PostgREST limita a 1000 filas por respuesta. Particionamos
    // muestraIds en lotes para evitar truncamiento silencioso de mediciones.
    async function fetchMedicionesPaged(ids: string[]) {
      const VARS = ["pesoBase", "blancuraR457", "blancuraA", "blancuraB", "peso", "anchoUtil"];
      const ID_CHUNK = 150; // ~150 muestras × 6 vars ≈ 900 filas/lote (margen vs 1000)
      const PAGE = 1000;
      const out: { muestra_id: string; variable_clave: string; valor: number | null }[] = [];
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const slice = ids.slice(i, i + ID_CHUNK);
        let from = 0;
        for (let p = 0; p < 50; p++) {
          const { data, error } = await sb
            .from("mediciones_calidad")
            .select("muestra_id, variable_clave, valor")
            .in("muestra_id", slice)
            .in("variable_clave", VARS)
            .range(from, from + PAGE - 1);
          if (error) throw new Error(error.message);
          const chunk = (data ?? []) as typeof out;
          out.push(...chunk);
          if (chunk.length < PAGE) break;
          from += PAGE;
        }
      }
      return out;
    }

    const [medsRaw, { data: prods }, { data: maqs }, { data: profs }] = await Promise.all([
      fetchMedicionesPaged(muestraIds),
      productoIds.length
        ? sb.from("productos").select("id, codigo").in("id", productoIds)
        : Promise.resolve({ data: [] as { id: string; codigo: string }[] }),
      maquinaIds.length
        ? sb.from("maquinas").select("id, codigo").in("id", maquinaIds)
        : Promise.resolve({ data: [] as { id: string; codigo: string }[] }),
      userIds.length
        ? sb.from("profiles").select("id, nombre, email").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; nombre: string | null; email: string | null }[] }),
    ]);

    const prodById = new Map((prods ?? []).map((p) => [p.id, p.codigo]));
    const maqById = new Map((maqs ?? []).map((m) => [m.id, m.codigo]));
    const userById = new Map(
      (profs ?? []).map((p) => [p.id, p.nombre ?? p.email ?? "Dato no disponible"]),
    );

    // Indexar mediciones por muestra
    const medsByMuestra = new Map<string, Record<string, number>>();
    for (const m of medsRaw ?? []) {
      const k = m.muestra_id as string;
      const o = medsByMuestra.get(k) ?? {};
      o[m.variable_clave as string] = Number(m.valor);
      medsByMuestra.set(k, o);
    }

    const rows: NoConformeRow[] = muestrasFiltradas.map((mu) => {
      const meds = medsByMuestra.get(mu.id) ?? {};
      const opDate = shiftOpDate(mu.capturado_at as string, mu.turno) ?? "—";
      const horaIso = (mu.hora_muestreo as string) ?? (mu.capturado_at as string);
      const defs: string[] = Array.isArray(mu.defectos) ? (mu.defectos as string[]) : [];
      const defectoTxt =
        defs.length > 0
          ? defs.join(", ")
          : (mu.defecto_visual_conversion as string)?.trim() || "SIN DEFECTO";
      // Producto y Máquina son obligatorios en captura (NOT NULL); no se requiere fallback de "Dato no disponible"
      const maquinaCodigo = maqById.get(mu.maquina_id as string) ?? "—";
      const maquinaCorta = maquinaCodigo.startsWith("MP-")
        ? String(parseInt(maquinaCodigo.slice(3), 10))
        : maquinaCodigo;
      const estatus: "NO CONFORME" | "CONDICIONADO" =
        mu.estatus_liberacion === "NC" ? "NO CONFORME" : "CONDICIONADO";
      return {
        id: mu.id as string,
        turno: TURNO_LABEL[mu.turno as string] ?? `TURNO ${mu.turno}`,
        turnoNum: mu.turno as "1" | "2" | "3",
        fechaOperativa: opDate,
        calidad: prodById.get(mu.producto_id as string) ?? "—",
        rollo: (mu.numero_rollo as string) || "—",
        defecto: defectoTxt,
        estatus,
        hora: horaIso ? localHHmm(horaIso) : "—",
        pb: Number.isFinite(meds.pesoBase) ? meds.pesoBase : null,
        btR457: Number.isFinite(meds.blancuraR457) ? meds.blancuraR457 : null,
        aStar: Number.isFinite(meds.blancuraA) ? meds.blancuraA : null,
        bStar: Number.isFinite(meds.blancuraB) ? meds.blancuraB : null,
        pesoRollo: Number.isFinite(meds.peso) ? meds.peso : null,
        anchoUtil: Number.isFinite(meds.anchoUtil) ? meds.anchoUtil : null,
        maquina: maquinaCorta,
        maquinaCodigo,
        destino: (mu.destino as string) || "Sin destino registrado",
        capturadoAt: (mu.capturado_at as string) ?? null,
        capturadoPorNombre: mu.capturado_por ? (userById.get(mu.capturado_por) ?? null) : null,
        modificadoAt: (mu.mediciones_modificadas_at as string) ?? null,
        modificadoPorNombre: mu.mediciones_modificadas_por
          ? (userById.get(mu.mediciones_modificadas_por) ?? null)
          : null,
      };
    });

    // Orden cronológico por fecha operativa y luego hora real
    rows.sort((a, b) => {
      if (a.fechaOperativa !== b.fechaOperativa) return a.fechaOperativa.localeCompare(b.fechaOperativa);
      if (a.turnoNum !== b.turnoNum) return a.turnoNum.localeCompare(b.turnoNum);
      return a.hora.localeCompare(b.hora);
    });

    return {
      year,
      month,
      rangoInicio: `${ymd(year, month, 1)} · Turno 2`,
      rangoFin: ultimoTurnoCerrado ?? "—",
      ultimoTurnoCerrado,
      rows,
      generadoAt: now.toISOString(),
    };
  });
