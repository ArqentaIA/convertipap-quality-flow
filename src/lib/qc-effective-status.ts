// =============================================================================
// Estatus EFECTIVO de un rollo / muestra (UI · etiqueta · QR · reportes).
// -----------------------------------------------------------------------------
// Regla de negocio (acordada con operación):
//
//  1. Si la muestra fue CAPTURADA como "No Conforme" (estatus_liberacion='NC'),
//     o si alguna medición resulta no_conforme / fuera_rango_critico,
//     el estatus se MANTIENE "No Conforme" en TODA representación
//     (badge, etiqueta impresa, QR/trazabilidad, reportes).
//
//  2. Solo el Gerente de Calidad (rol 'calidad' o 'administrador') puede
//     cambiar ese estatus, registrando dictamen + observaciones obligatorias.
//     Cuando dicho dictamen está AUTORIZADO (autorizado_por != null), el
//     nuevo estatus toma precedencia sobre el legacy.
//
//  3. Re-imprimir una etiqueta nunca degrada el estatus: si el dictamen
//     autorizado dice LIBERADO, la reimpresión muestra LIBERADO; si no hay
//     dictamen autorizado y el legacy es NC, sigue mostrando NO CONFORME.
// =============================================================================

export type EffectiveStatusKey =
  | "LIBERADO"
  | "CONFORME"
  | "CONCESION"
  | "NO_CONFORME";

export interface EffectiveStatusInfo {
  key: EffectiveStatusKey;
  label: string;
  /** Source that produced the value, for audit/tooltip. */
  source: "dictamen_autorizado" | "estatus_capturado" | "mediciones" | "default";
  /** True cuando el estatus está bloqueado a la espera de liberación del Gerente. */
  lockedNoConforme: boolean;
}

export interface EffectiveStatusInput {
  dictamen?: string | null;
  autorizado_por?: string | null;
  estatus_liberacion?: string | null;
  mediciones_calidad?: Array<{ estado?: string | null }> | null;
}

export function getEffectiveStatus(m: EffectiveStatusInput): EffectiveStatusInfo {
  // 1) Dictamen autorizado por Gerente de Calidad: única forma de cambiar NC.
  if (m.autorizado_por && m.dictamen) {
    if (m.dictamen === "liberada")
      return { key: "LIBERADO", label: "Liberado", source: "dictamen_autorizado", lockedNoConforme: false };
    if (m.dictamen === "concesion")
      return { key: "CONCESION", label: "Concesión", source: "dictamen_autorizado", lockedNoConforme: false };
    if (m.dictamen === "rechazada")
      return { key: "NO_CONFORME", label: "No conforme", source: "dictamen_autorizado", lockedNoConforme: true };
  }

  // 2) Sin autorización formal: NC pegajoso (capturista o mediciones).
  const tieneFuera = (m.mediciones_calidad ?? []).some(
    (md) => md?.estado === "no_conforme" || md?.estado === "fuera_rango_critico",
  );
  if (m.estatus_liberacion === "NC" || tieneFuera) {
    return {
      key: "NO_CONFORME",
      label: "No conforme",
      source: m.estatus_liberacion === "NC" ? "estatus_capturado" : "mediciones",
      lockedNoConforme: true,
    };
  }
  if (m.estatus_liberacion === "C")
    return { key: "CONCESION", label: "Concesión", source: "estatus_capturado", lockedNoConforme: false };
  if (m.estatus_liberacion === "L")
    return { key: "LIBERADO", label: "Liberado", source: "estatus_capturado", lockedNoConforme: false };

  return { key: "CONFORME", label: "Conforme", source: "default", lockedNoConforme: false };
}

/** Convierte el estatus efectivo al string usado por la etiqueta impresa. */
export function toEtiquetaEstatus(
  k: EffectiveStatusKey,
): "CONFORME" | "NO CONFORME" | "LIBERADO" | "CONDICIONAL" {
  switch (k) {
    case "LIBERADO":
      return "LIBERADO";
    case "NO_CONFORME":
      return "NO CONFORME";
    case "CONCESION":
      return "CONDICIONAL";
    case "CONFORME":
    default:
      return "CONFORME";
  }
}
