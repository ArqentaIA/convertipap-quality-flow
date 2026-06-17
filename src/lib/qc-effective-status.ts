// =============================================================================
// Estatus EFECTIVO de un rollo / muestra (UI · etiqueta · QR · reportes).
// -----------------------------------------------------------------------------
// Fase 1 v2 (cutover Convertipap · 17-Jun-2026)
//
// REGLAS OFICIALES (autorizadas para esta fase):
//
//  A) La fuente única de verdad del estatus oficial es `estatus_liberacion`.
//  B) Si `estatus_liberacion ∈ {L, C}` el estatus NO se degrada a NO_CONFORME
//     por mediciones fuera de especificación.
//  C) Las mediciones fuera de spec se reportan como información complementaria
//     (campo `tieneVariablesFueraSpec`), nunca sustituyen al estatus oficial.
//  D) Solo el Gerente de Calidad (`autorizado_por` + `dictamen` autorizado)
//     puede cambiar el estatus oficial — esa decisión sigue teniendo precedencia
//     sobre cualquier otro valor.
//
// Compatibilidad: la firma de `getEffectiveStatus` no cambia. Se añade el campo
// opcional `tieneVariablesFueraSpec` al resultado para que la UI pueda
// renderizar el chip secundario sin afectar consumidores existentes.
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
  /**
   * Información COMPLEMENTARIA (no degrada el estatus oficial).
   * Verdadero cuando la muestra tiene mediciones no_conforme / fuera_rango_critico,
   * aun si su estatus oficial es L o C. Úselo para renderizar el chip secundario.
   */
  tieneVariablesFueraSpec: boolean;
}

export interface EffectiveStatusInput {
  dictamen?: string | null;
  autorizado_por?: string | null;
  estatus_liberacion?: string | null;
  mediciones_calidad?: Array<{ estado?: string | null }> | null;
}

export function getEffectiveStatus(m: EffectiveStatusInput): EffectiveStatusInfo {
  const tieneFuera = (m.mediciones_calidad ?? []).some(
    (md) => md?.estado === "no_conforme" || md?.estado === "fuera_rango_critico",
  );

  // 1) Dictamen autorizado por Gerente de Calidad: única forma de cambiar NC.
  if (m.autorizado_por && m.dictamen) {
    if (m.dictamen === "liberada")
      return { key: "LIBERADO", label: "Liberado", source: "dictamen_autorizado", lockedNoConforme: false, tieneVariablesFueraSpec: tieneFuera };
    if (m.dictamen === "concesion")
      return { key: "CONCESION", label: "Concesión", source: "dictamen_autorizado", lockedNoConforme: false, tieneVariablesFueraSpec: tieneFuera };
    if (m.dictamen === "rechazada")
      return { key: "NO_CONFORME", label: "No conforme", source: "dictamen_autorizado", lockedNoConforme: true, tieneVariablesFueraSpec: tieneFuera };
  }

  // 2) Estatus oficial capturado: L y C son DEFINITIVOS, no se degradan por mediciones.
  if (m.estatus_liberacion === "L")
    return { key: "LIBERADO", label: "Liberado", source: "estatus_capturado", lockedNoConforme: false, tieneVariablesFueraSpec: tieneFuera };
  if (m.estatus_liberacion === "C")
    return { key: "CONCESION", label: "Concesión", source: "estatus_capturado", lockedNoConforme: false, tieneVariablesFueraSpec: tieneFuera };
  if (m.estatus_liberacion === "NC")
    return { key: "NO_CONFORME", label: "No conforme", source: "estatus_capturado", lockedNoConforme: true, tieneVariablesFueraSpec: tieneFuera };

  // 3) Sin estatus oficial: las mediciones determinan NC tentativo.
  if (tieneFuera) {
    return { key: "NO_CONFORME", label: "No conforme", source: "mediciones", lockedNoConforme: true, tieneVariablesFueraSpec: true };
  }

  return { key: "CONFORME", label: "Conforme", source: "default", lockedNoConforme: false, tieneVariablesFueraSpec: false };
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
