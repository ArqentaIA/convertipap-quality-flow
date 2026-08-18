// =============================================================================
// FUENTE CANÓNICA DE LECTURA DEL ESTADO OFICIAL DE CALIDAD (frontend/server fn).
// -----------------------------------------------------------------------------
// Espejo exacto de la vista `public.vw_muestras_calidad_estado_oficial`.
//
// Modelo canónico (deriva EXCLUSIVAMENTE de muestras_calidad.estatus_liberacion):
//   'L'   → Liberado                 (es_liberado, es_liberado_normal)
//   'C'   → Liberado con concesión   (es_liberado, es_concesion)
//   'NC'  → No Conforme              (es_no_conforme)
//   NULL  → Pendiente                (esta_pendiente)
//
// `dictamen` y `estado` son información COMPLEMENTARIA: nunca determinan si un
// rollo está liberado. Liberados totales = L + C.
// =============================================================================

export type EstatusLiberacion = "L" | "C" | "NC" | null;

export interface EstadoOficial {
  estatus_liberacion: EstatusLiberacion;
  /** Etiqueta larga: "Liberado" | "Liberado con concesión" | "No Conforme" | "Pendiente". */
  estado_nombre: string;
  /** Etiqueta corta en mayúsculas para visor/etiqueta/QR. */
  estado_corto: string;
  es_liberado: boolean;
  es_liberado_normal: boolean;
  es_concesion: boolean;
  es_no_conforme: boolean;
  esta_pendiente: boolean;
}

export interface EstadoOficialInput {
  estatus_liberacion?: string | null;
}

function norm(v: unknown): EstatusLiberacion {
  const s = typeof v === "string" ? v.trim().toUpperCase() : null;
  return s === "L" || s === "C" || s === "NC" ? (s as EstatusLiberacion) : null;
}

export function getEstadoOficial(m: EstadoOficialInput | null | undefined): EstadoOficial {
  const e = norm(m?.estatus_liberacion);
  return {
    estatus_liberacion: e,
    estado_nombre:
      e === "L"
        ? "Liberado"
        : e === "C"
          ? "Liberado con concesión"
          : e === "NC"
            ? "No Conforme"
            : "Pendiente",
    estado_corto:
      e === "L"
        ? "LIBERADO"
        : e === "C"
          ? "LIBERADO CON CONCESIÓN"
          : e === "NC"
            ? "NO CONFORME"
            : "PENDIENTE",
    es_liberado: e === "L" || e === "C",
    es_liberado_normal: e === "L",
    es_concesion: e === "C",
    es_no_conforme: e === "NC",
    esta_pendiente: e == null,
  };
}

/** Liberado oficial = L + C. Única condición válida en todo el sistema. */
export const esLiberadoOficial = (m: EstadoOficialInput | null | undefined) =>
  getEstadoOficial(m).es_liberado;

export const esConcesionOficial = (m: EstadoOficialInput | null | undefined) =>
  getEstadoOficial(m).es_concesion;

export const esNoConformeOficial = (m: EstadoOficialInput | null | undefined) =>
  getEstadoOficial(m).es_no_conforme;

export const estaPendienteOficial = (m: EstadoOficialInput | null | undefined) =>
  getEstadoOficial(m).esta_pendiente;

export interface ResumenEstadoOficial {
  total: number;
  liberados_totales: number;
  liberados_normales: number;
  concesiones: number;
  no_conformes: number;
  pendientes: number;
  /** % liberación = (L + C) / total. */
  pct_liberacion: number;
}

export function resumirEstadoOficial(
  rows: Array<EstadoOficialInput | null | undefined>,
): ResumenEstadoOficial {
  let l = 0, c = 0, nc = 0, p = 0;
  for (const r of rows) {
    const e = getEstadoOficial(r);
    if (e.es_liberado_normal) l++;
    else if (e.es_concesion) c++;
    else if (e.es_no_conforme) nc++;
    else p++;
  }
  const total = rows.length;
  return {
    total,
    liberados_totales: l + c,
    liberados_normales: l,
    concesiones: c,
    no_conformes: nc,
    pendientes: p,
    pct_liberacion: total > 0 ? ((l + c) / total) * 100 : 0,
  };
}

/**
 * Etiqueta impresa / QR: estatus derivado EXCLUSIVAMENTE de estatus_liberacion.
 * NULL → "PENDIENTE" (Pendiente de dictamen). Nunca devuelve undefined.
 */
export function toEtiquetaEstatusOficial(
  m: (EstadoOficialInput & { liberado_con_justificacion?: boolean | null }) | null | undefined,
):
  | "NO CONFORME"
  | "LIBERADO"
  | "LIBERADO CON CONCESIÓN"
  | "LIBERADO C/JUSTIF"
  | "PENDIENTE" {
  const e = getEstadoOficial(m);
  if (e.es_liberado_normal) {
    return m?.liberado_con_justificacion ? "LIBERADO C/JUSTIF" : "LIBERADO";
  }
  if (e.es_concesion) return "LIBERADO CON CONCESIÓN";
  if (e.es_no_conforme) return "NO CONFORME";
  return "PENDIENTE";
}
