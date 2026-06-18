// =============================================================================
// Estatus EFECTIVO de un rollo / muestra (UI · etiqueta · QR · reportes).
// -----------------------------------------------------------------------------
// Regla de oro (cutover 18-Jun-2026):
//
//  A) La fuente única de verdad del estatus oficial es `estatus_liberacion`,
//     que es DERIVADO automáticamente por la BD (trigger `qc_recalc_estatus_muestra`)
//     a partir de las 3 variables críticas (Peso Base / Tensión MD / Tensión CD).
//  B) Si `estatus_liberacion = 'L'` y `liberado_con_justificacion = true` y no
//     hay dictamen autorizado → estatus efectivo `LIBERADO_CON_JUSTIFICACION`
//     (chip amarillo). Cuenta como liberado para cumplimiento, pero visible aparte.
//  C) Dictamen autorizado por Gerencia de Calidad sigue teniendo precedencia
//     absoluta sobre cualquier otro valor.
//  D) Mediciones fuera de spec sin justificación → estatus oficial `'NC'`.
// =============================================================================

export type EffectiveStatusKey =
  | "LIBERADO"
  | "CONFORME"
  | "CONCESION"
  | "LIBERADO_CON_JUSTIFICACION"
  | "NO_CONFORME";

export interface EffectiveStatusInfo {
  key: EffectiveStatusKey;
  label: string;
  /** Source that produced the value, for audit/tooltip. */
  source:
    | "dictamen_autorizado"
    | "estatus_capturado"
    | "liberacion_justificada"
    | "mediciones"
    | "default";
  /** True cuando el estatus está bloqueado a la espera de liberación del Gerente. */
  lockedNoConforme: boolean;
  /**
   * Información COMPLEMENTARIA: verdadero cuando la muestra tiene mediciones
   * no_conforme / fuera_rango_critico, aun si su estatus oficial es L o C.
   */
  tieneVariablesFueraSpec: boolean;
  /** Texto del motivo cuando aplica liberación con justificación. */
  justificacion?: string | null;
}

export interface EffectiveStatusInput {
  dictamen?: string | null;
  autorizado_por?: string | null;
  estatus_liberacion?: string | null;
  liberado_con_justificacion?: boolean | null;
  liberacion_justificacion?: string | null;
  mediciones_calidad?: Array<{ estado?: string | null }> | null;
  variables_fuera_spec?: unknown;
}

export function getEffectiveStatus(m: EffectiveStatusInput): EffectiveStatusInfo {
  const tieneFuera =
    (m.mediciones_calidad ?? []).some(
      (md) => md?.estado === "no_conforme" || md?.estado === "fuera_rango_critico",
    ) ||
    (Array.isArray(m.variables_fuera_spec) && m.variables_fuera_spec.length > 0);

  // 1) Dictamen autorizado por Gerencia de Calidad.
  if (m.autorizado_por && m.dictamen) {
    if (m.dictamen === "liberada")
      return {
        key: "LIBERADO",
        label: "Liberado",
        source: "dictamen_autorizado",
        lockedNoConforme: false,
        tieneVariablesFueraSpec: tieneFuera,
      };
    if (m.dictamen === "concesion")
      return {
        key: "CONCESION",
        label: "Concesión",
        source: "dictamen_autorizado",
        lockedNoConforme: false,
        tieneVariablesFueraSpec: tieneFuera,
      };
    if (m.dictamen === "rechazada")
      return {
        key: "NO_CONFORME",
        label: "No conforme",
        source: "dictamen_autorizado",
        lockedNoConforme: true,
        tieneVariablesFueraSpec: tieneFuera,
      };
  }

  // 2) Liberación con justificación del capturista (regla de oro).
  if (m.estatus_liberacion === "L" && m.liberado_con_justificacion) {
    return {
      key: "LIBERADO_CON_JUSTIFICACION",
      label: "Liberado con justificación",
      source: "liberacion_justificada",
      lockedNoConforme: false,
      tieneVariablesFueraSpec: true,
      justificacion: m.liberacion_justificacion ?? null,
    };
  }

  // 3) Estatus oficial capturado/derivado.
  if (m.estatus_liberacion === "L")
    return {
      key: "LIBERADO",
      label: "Liberado",
      source: "estatus_capturado",
      lockedNoConforme: false,
      tieneVariablesFueraSpec: tieneFuera,
    };
  if (m.estatus_liberacion === "C")
    return {
      key: "CONCESION",
      label: "Concesión",
      source: "estatus_capturado",
      lockedNoConforme: false,
      tieneVariablesFueraSpec: tieneFuera,
    };
  if (m.estatus_liberacion === "NC")
    return {
      key: "NO_CONFORME",
      label: "No conforme",
      source: "estatus_capturado",
      lockedNoConforme: true,
      tieneVariablesFueraSpec: tieneFuera,
    };

  // 4) Sin estatus oficial: las mediciones determinan NC tentativo.
  if (tieneFuera) {
    return {
      key: "NO_CONFORME",
      label: "No conforme",
      source: "mediciones",
      lockedNoConforme: true,
      tieneVariablesFueraSpec: true,
    };
  }

  return {
    key: "CONFORME",
    label: "Conforme",
    source: "default",
    lockedNoConforme: false,
    tieneVariablesFueraSpec: false,
  };
}

/** Convierte el estatus efectivo al string usado por la etiqueta impresa. */
export function toEtiquetaEstatus(
  k: EffectiveStatusKey,
): "CONFORME" | "NO CONFORME" | "LIBERADO" | "CONDICIONAL" | "LIBERADO C/JUSTIF" {
  switch (k) {
    case "LIBERADO":
      return "LIBERADO";
    case "LIBERADO_CON_JUSTIFICACION":
      return "LIBERADO C/JUSTIF";
    case "NO_CONFORME":
      return "NO CONFORME";
    case "CONCESION":
      return "CONDICIONAL";
    case "CONFORME":
    default:
      return "CONFORME";
  }
}

/**
 * Paleta semántica del estatus efectivo (Tailwind classes + hex).
 * Usar `colorClass` en componentes React y `hex` en PDFs/canvas.
 */
export function getEffectiveStatusPalette(k: EffectiveStatusKey) {
  switch (k) {
    case "LIBERADO":
      return {
        colorClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
        hex: "#15803d",
        bgHex: "#dcfce7",
      };
    case "CONCESION":
      return {
        colorClass: "bg-amber-100 text-amber-900 border-amber-400",
        hex: "#a16207",
        bgHex: "#fef3c7",
      };
    case "LIBERADO_CON_JUSTIFICACION":
      return {
        colorClass: "bg-yellow-200 text-yellow-900 border-yellow-500",
        hex: "#854d0e",
        bgHex: "#fef08a",
      };
    case "NO_CONFORME":
      return {
        colorClass: "bg-red-100 text-red-800 border-red-300",
        hex: "#b91c1c",
        bgHex: "#fee2e2",
      };
    case "CONFORME":
    default:
      return {
        colorClass: "bg-slate-100 text-slate-700 border-slate-300",
        hex: "#475569",
        bgHex: "#f1f5f9",
      };
  }
}
