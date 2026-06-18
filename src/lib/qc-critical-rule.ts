// =============================================================================
// REGLA DE ORO OFICIAL DE CONFORMIDAD (cutover 18-Jun-2026)
// -----------------------------------------------------------------------------
// Un rollo se considera CUMPLE / NO CUMPLE evaluando SOLO 3 variables críticas
// con comparación ESTRICTA y SIMÉTRICA (min y max). Igual al límite SÍ cumple.
//
//   1) Peso Base       fuera de [min, max] → NO CUMPLE
//   2) Tensión Seca MD fuera de [min, max] → NO CUMPLE
//   3) Tensión Seca CD fuera de [min, max] → NO CUMPLE
//
// Si NO CUMPLE, el capturista puede liberar marcando
// `liberado_con_justificacion = true` y proporcionando un motivo (≥10 chars).
// El estatus efectivo resultante es "Liberado con justificación" (amarillo).
//
// Esta función es la fuente única de verdad para la UI; el backend (trigger
// `qc_recalc_estatus_muestra` + `upsertMuestraConMediciones`) aplica la misma
// regla de forma autoritativa.
// =============================================================================

export type CriticalVariableKey = "pesoBase" | "tensionMD" | "tensionCD";

export interface CriticalMedicionInput {
  variable_clave: string;
  valor: number;
  min_snapshot: number;
  max_snapshot: number;
}

export interface CriticalFailure {
  variable_clave: CriticalVariableKey;
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  tipo: "max_excedido" | "min_no_alcanzado";
  /** Mensaje listo para mostrar al operador / registrar en auditoría. */
  mensaje: string;
}

export interface CriticalRuleResult {
  /** true cuando al menos una de las 3 condiciones críticas se incumple. */
  forzarNC: boolean;
  /** Sinónimo semántico de !forzarNC (regla de oro). */
  cumple: boolean;
  fallas: CriticalFailure[];
  /** Mensaje multilínea apto para toasts y logs de auditoría. */
  resumen: string;
}

const ETIQUETAS: Record<CriticalVariableKey, string> = {
  pesoBase: "Peso Base",
  tensionMD: "Tensión Seca MD",
  tensionCD: "Tensión Seca CD",
};

function esCritica(clave: string): clave is CriticalVariableKey {
  return clave === "pesoBase" || clave === "tensionMD" || clave === "tensionCD";
}

/**
 * Evalúa la regla de oro sobre el conjunto de mediciones de una muestra.
 * Solo considera mediciones con `valor` finito.
 */
export function evaluateCriticalRule(
  mediciones: CriticalMedicionInput[],
): CriticalRuleResult {
  const fallas: CriticalFailure[] = [];

  for (const m of mediciones) {
    if (!esCritica(m.variable_clave)) continue;
    const v = Number(m.valor);
    if (!Number.isFinite(v)) continue;

    const etiqueta = ETIQUETAS[m.variable_clave];
    // Regla operativa: Tensión Seca MD/CD NO tienen tope superior crítico
    // (rebasar el MAX no degrada la calidad). Sólo el mínimo es vinculante.
    const sinTopeSuperior =
      m.variable_clave === "tensionMD" || m.variable_clave === "tensionCD";

    if (!sinTopeSuperior && Number.isFinite(m.max_snapshot) && v > m.max_snapshot) {
      fallas.push({
        variable_clave: m.variable_clave,
        etiqueta,
        valor: v,
        min: m.min_snapshot,
        max: m.max_snapshot,
        tipo: "max_excedido",
        mensaje: `${etiqueta} ${v} excede el máximo permitido (${m.max_snapshot}).`,
      });
    } else if (Number.isFinite(m.min_snapshot) && v < m.min_snapshot) {
      fallas.push({
        variable_clave: m.variable_clave,
        etiqueta,
        valor: v,
        min: m.min_snapshot,
        max: m.max_snapshot,
        tipo: "min_no_alcanzado",
        mensaje: `${etiqueta} ${v} es menor al mínimo permitido (${m.min_snapshot}).`,
      });
    }
  }

  return {
    forzarNC: fallas.length > 0,
    cumple: fallas.length === 0,
    fallas,
    resumen:
      fallas.length === 0
        ? "El rollo CUMPLE con la regla de oro."
        : `El rollo NO CUMPLE la regla de oro:\n• ${fallas
            .map((f) => f.mensaje)
            .join("\n• ")}`,
  };
}
