// =============================================================================
// Consolidado Diario T1 + T2 + T3 (server-only, READ ONLY).
//
// Se usa EXCLUSIVAMENTE cuando el reporte generado corresponde al turno 3.
// Reglas replicadas 1:1 de operator-vision.server.ts (fuente canónica de los
// visores y del reporte de cierre de turno):
//   · Rollos capturados  = muestras_calidad con fuera_de_turno = false
//   · Liberados          = estatus_liberacion IN ('L','C')
//   · Cumpl. oficial %   = liberados / capturados  (recalculado sobre el día)
//   · Cumpl. variables % = mediciones conformes / mediciones evaluables
//                          (evaluables = conforme | no_conforme | fuera_rango_critico)
//   · Kg producidos      = mediciones_calidad.valor con variable_clave = 'peso'
//                          (única fuente oficial; sin báscula, OCR, QR ni estimados)
// No escribe en base de datos ni altera el comportamiento de T1 / T2.
// =============================================================================
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PLANT_TZ_OFFSET_HOURS = -6;

export type ConsolidadoMaquina = {
  codigo: string;
  nombre: string;
  planta: string;
  rollosT1: number;
  rollosT2: number;
  rollosT3: number;
  rollos: number;
  liberados: number;
  kgProducidos: number;
  cumplimientoPct: number;
  cumplimientoVariablesPct: number;
  variablesEvaluadas: number;
  variablesConformes: number;
};

export type RolloDiario = {
  capturadoAt: string;
  rollo: string;
  skuSap: string;
  turno: string;
  operador: string;
  analista: string;
  estatus: string | null;
  mediciones: Array<{ clave: string; valor: number | null; min: number | null; max: number | null }>;
};

export type ConsolidadoDiario = {
  /** Rollos válidos del día (mismo universo que los KPIs) por código de máquina. */
  rollosPorMaquina: Record<string, RolloDiario[]>;
  /** Etiquetas de variables (clave → etiqueta/unidad/orden) para las hojas por máquina. */
  variables: Array<{ clave: string; etiqueta: string; unidad: string | null; orden: number }>;
  /** Día operativo (inicio de T1) en formato YYYY-MM-DD, hora planta. */
  diaOperativo: string;
  /** Etiqueta DD-MM-AA usada en el nombre de la hoja. */
  etiquetaCorta: string;
  /** Etiqueta DD/MM/AAAA usada en el correo. */
  etiquetaLarga: string;
  desde: Date;
  hasta: Date;
  maquinas: ConsolidadoMaquina[];
  /** Capturas "Fuera de turno" del periodo: solo informativas, no entran en KPIs. */
  fueraDeTurno: number;
  totales: {
    rollosT1: number;
    rollosT2: number;
    rollosT3: number;
    rollos: number;
    liberados: number;
    kgProducidos: number;
    cumplimientoPct: number;
    cumplimientoVariablesPct: number;
  };
};

const hhmmToMin = (s?: string | null): number | null => {
  if (!s) return null;
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

/** Rangos de turno vigentes en app_settings (misma fuente que los visores). */
export async function leerRangosTurno() {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("turno1_inicio, turno1_fin, turno2_inicio, turno2_fin, turno3_inicio, turno3_fin")
    .limit(1)
    .maybeSingle();
  return [
    { id: "1", ini: data?.turno1_inicio ?? "07:00", fin: data?.turno1_fin ?? "15:00" },
    { id: "2", ini: data?.turno2_inicio ?? "15:00", fin: data?.turno2_fin ?? "23:00" },
    { id: "3", ini: data?.turno3_inicio ?? "23:00", fin: data?.turno3_fin ?? "07:00" },
  ];
}

/**
 * Turno vigente + día operativo según la configuración de turnos y el reloj de
 * planta. El día operativo es la fecha en que inició T1 del ciclo en curso: si
 * T3 cruza medianoche, la madrugada pertenece al día anterior.
 */
export async function resolverTurnoYDiaOperativo(ahora: Date) {
  const rangos = await leerRangosTurno();
  const plant = new Date(ahora.getTime() + PLANT_TZ_OFFSET_HOURS * 3600 * 1000);
  const curMin = plant.getUTCHours() * 60 + plant.getUTCMinutes();

  let turno: string | null = null;
  let startsYesterday = false;
  for (const r of rangos) {
    const ini = hhmmToMin(r.ini);
    const fin = hhmmToMin(r.fin);
    if (ini === null || fin === null) continue;
    const inRange = ini <= fin ? curMin >= ini && curMin < fin : curMin >= ini || curMin < fin;
    if (inRange) {
      turno = r.id;
      startsYesterday = ini > fin && curMin < fin;
      break;
    }
  }

  // Día operativo = fecha (hora planta) del inicio de T1 del ciclo vigente.
  const t1Ini = hhmmToMin(rangos[0]!.ini) ?? 7 * 60;
  let y = plant.getUTCFullYear();
  let m = plant.getUTCMonth();
  let d = plant.getUTCDate();
  // Antes del arranque de T1 (madrugada, T3 en curso) el día operativo es el anterior.
  if (startsYesterday || curMin < t1Ini) d -= 1;
  const base = new Date(Date.UTC(y, m, d));
  y = base.getUTCFullYear();
  m = base.getUTCMonth();
  d = base.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const diaOperativo = `${y}-${pad(m + 1)}-${pad(d)}`;

  // Inicio del día operativo en UTC real.
  const desde = new Date(Date.UTC(y, m, d, 0, t1Ini, 0, 0) - PLANT_TZ_OFFSET_HOURS * 3600 * 1000);

  return {
    turno,
    diaOperativo,
    desde,
    etiquetaCorta: `${pad(d)}-${pad(m + 1)}-${String(y).slice(2)}`,
    etiquetaLarga: `${pad(d)}/${pad(m + 1)}/${y}`,
    rangos,
  };
}

/**
 * Ventana completa de un día operativo explícito (YYYY-MM-DD, hora planta):
 * desde el arranque de T1 de ese día hasta el arranque de T1 del día siguiente
 * (exclusivo). Usa los horarios vigentes de app_settings.
 */
export async function ventanaDiaOperativo(diaOperativo: string) {
  const rangos = await leerRangosTurno();
  const t1Ini = hhmmToMin(rangos[0]!.ini) ?? 7 * 60;
  const [y, m, d] = diaOperativo.split("-").map((x) => parseInt(x, 10)) as [number, number, number];
  const desde = new Date(Date.UTC(y, m - 1, d, 0, t1Ini, 0, 0) - PLANT_TZ_OFFSET_HOURS * 3600 * 1000);
  const hasta = new Date(desde.getTime() + 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    diaOperativo: `${y}-${pad(m)}-${pad(d)}`,
    desde,
    hasta,
    etiquetaCorta: `${pad(d)}-${pad(m)}-${String(y).slice(2)}`,
    etiquetaLarga: `${pad(d)}/${pad(m)}/${y}`,
  };
}

/** Día operativo anterior a la fecha (hora planta) de `ahora`. */
export function diaOperativoAnterior(ahora: Date): string {
  const plant = new Date(ahora.getTime() + PLANT_TZ_OFFSET_HOURS * 3600 * 1000);
  const base = new Date(Date.UTC(plant.getUTCFullYear(), plant.getUTCMonth(), plant.getUTCDate() - 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/**
 * Consolidado T1+T2+T3 por máquina. Sin `diaOperativo` usa el día operativo
 * vigente hasta `ahora`; con `diaOperativo` usa la ventana completa de ese día.
 */
export async function construirConsolidadoDiario(
  maquinas: readonly string[],
  ahora: Date,
  diaOperativo?: string,
): Promise<ConsolidadoDiario> {
  const ctx = diaOperativo
    ? await ventanaDiaOperativo(diaOperativo)
    : { ...(await resolverTurnoYDiaOperativo(ahora)), hasta: ahora };
  const hasta = ctx.hasta;
  const exclusivo = Boolean(diaOperativo);
  const sb = supabaseAdmin;
  let fueraDeTurno = 0;
  const rollosPorMaquina: Record<string, RolloDiario[]> = {};

  const { data: maqs } = await sb
    .from("maquinas")
    .select("id, codigo, nombre, plantas(codigo)")
    .in("codigo", maquinas as string[]);

  const filas: ConsolidadoMaquina[] = [];

  for (const codigo of maquinas) {
    const maq = (maqs ?? []).find((x: any) => x.codigo === codigo);
    const planta = maq ? ((Array.isArray((maq as any).plantas) ? (maq as any).plantas[0] : (maq as any).plantas)?.codigo ?? "") : "";
    const fila: ConsolidadoMaquina = {
      codigo,
      nombre: (maq?.nombre as string) ?? "",
      planta,
      rollosT1: 0,
      rollosT2: 0,
      rollosT3: 0,
      rollos: 0,
      liberados: 0,
      kgProducidos: 0,
      cumplimientoPct: 0,
      cumplimientoVariablesPct: 0,
      variablesEvaluadas: 0,
      variablesConformes: 0,
    };

    if (maq?.id) {
      let q = sb
        .from("muestras_calidad")
        .select("id, numero_rollo, sku_sap, capturado_at, operador, analista, turno, estatus_liberacion, fuera_de_turno, mediciones_calidad(variable_clave, valor, estado, min_snapshot, max_snapshot, observacion)")
        .eq("maquina_id", maq.id)
        .order("capturado_at", { ascending: true })
        .gte("capturado_at", ctx.desde.toISOString())
        .in("turno", ["1", "2", "3"]);
      q = exclusivo ? q.lt("capturado_at", hasta.toISOString()) : q.lte("capturado_at", hasta.toISOString());
      const { data: rows } = await q;

      fueraDeTurno += (rows ?? []).filter((r: any) => r.fuera_de_turno === true).length;
      const validos = (rows ?? []).filter((r: any) => r.fuera_de_turno === false);
      fila.rollosT1 = validos.filter((r: any) => String(r.turno) === "1").length;
      fila.rollosT2 = validos.filter((r: any) => String(r.turno) === "2").length;
      fila.rollosT3 = validos.filter((r: any) => String(r.turno) === "3").length;
      fila.rollos = validos.length;
      const num = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
      rollosPorMaquina[codigo] = validos.map((r: any) => ({
        capturadoAt: r.capturado_at,
        rollo: String(r.numero_rollo ?? "—"),
        skuSap: r.sku_sap || "—",
        turno: String(r.turno ?? "—"),
        operador: r.operador || "—",
        analista: r.analista || "—",
        estatus: r.estatus_liberacion ?? null,
        // Una medición por variable. Si existe el relleno automático ("Auto-relleno")
        // y además la captura real, prevalece la captura real del analista.
        mediciones: Object.values(
          ((r.mediciones_calidad ?? []) as Array<any>).reduce((acc: Record<string, any>, x) => {
            const auto = String(x.observacion ?? "").startsWith("Auto-relleno");
            if (!acc[x.variable_clave] || (acc[x.variable_clave].auto && !auto)) acc[x.variable_clave] = { ...x, auto };
            return acc;
          }, {}),
        ).map((x: any) => ({
          clave: x.variable_clave, valor: num(x.valor), min: num(x.min_snapshot), max: num(x.max_snapshot),
        })),
      }));
      fila.liberados = validos.filter(
        (r: any) => r.estatus_liberacion === "L" || r.estatus_liberacion === "C",
      ).length;
      fila.cumplimientoPct =
        fila.rollos > 0 ? Number(((fila.liberados / fila.rollos) * 100).toFixed(1)) : 0;

      const meds = validos.flatMap((r: any) => (r.mediciones_calidad ?? []) as Array<any>);
      const evaluables = meds.filter(
        (m) => m.estado === "conforme" || m.estado === "no_conforme" || m.estado === "fuera_rango_critico",
      );
      fila.variablesEvaluadas = evaluables.length;
      fila.variablesConformes = evaluables.filter((m) => m.estado === "conforme").length;
      fila.cumplimientoVariablesPct =
        evaluables.length > 0
          ? Number(((fila.variablesConformes / evaluables.length) * 100).toFixed(1))
          : 0;

      // Kg: única fuente oficial = medición de calidad con clave 'peso'.
      // Se suma sobre EXACTAMENTE los mismos rollos válidos que cuentan para
      // rollos/liberados/cumplimiento, para que el consolidado sea coherente
      // consigo mismo. Un rollo sin peso de Calidad no se estima ni sustituye.
      const kg = validos.reduce((acc: number, r: any) => {
        const peso = ((r.mediciones_calidad ?? []) as Array<any>).find((x) => x.variable_clave === "peso")?.valor;
        const n = peso === null || peso === undefined ? NaN : Number(peso);
        return Number.isFinite(n) ? acc + n : acc;
      }, 0);
      fila.kgProducidos = Number(kg.toFixed(2));
    }

    filas.push(fila);
  }

  const sum = (f: (r: ConsolidadoMaquina) => number) => filas.reduce((a, r) => a + f(r), 0);
  const rollos = sum((r) => r.rollos);
  const liberados = sum((r) => r.liberados);
  const evaluadas = sum((r) => r.variablesEvaluadas);
  const conformes = sum((r) => r.variablesConformes);

  return {
    diaOperativo: ctx.diaOperativo,
    etiquetaCorta: ctx.etiquetaCorta,
    etiquetaLarga: ctx.etiquetaLarga,
    desde: ctx.desde,
    hasta,
    maquinas: filas,
    fueraDeTurno,
    rollosPorMaquina,
    variables: await (async () => {
      const claves = new Set(Object.values(rollosPorMaquina).flat().flatMap((r) => r.mediciones.map((m) => m.clave)));
      const { data } = await sb.from("variables_calidad").select("clave, etiqueta, unidad, orden");
      return [...claves].map((clave) => {
        const v = (data ?? []).find((x: any) => x.clave === clave) as any;
        return { clave, etiqueta: v?.etiqueta ?? clave, unidad: v?.unidad ?? null, orden: Number(v?.orden ?? 999) };
      }).sort((a, b) => a.orden - b.orden);
    })(),
    totales: {
      rollosT1: sum((r) => r.rollosT1),
      rollosT2: sum((r) => r.rollosT2),
      rollosT3: sum((r) => r.rollosT3),
      rollos,
      liberados,
      kgProducidos: Number(sum((r) => r.kgProducidos).toFixed(2)),
      cumplimientoPct: rollos > 0 ? Number(((liberados / rollos) * 100).toFixed(1)) : 0,
      cumplimientoVariablesPct:
        evaluadas > 0 ? Number(((conformes / evaluadas) * 100).toFixed(1)) : 0,
    },
  };
}
