// =============================================================================
// REGLA CRÍTICA OFICIAL DE CONFORMIDAD (Fase 3 · cutover 18-Jun-2026)
// -----------------------------------------------------------------------------
// Un rollo NO puede capturarse como Liberado (L) o Concesión (C) si incumple
// cualquiera de estas 3 condiciones críticas:
//
//   1) Peso Base       > máximo permitido  → NO CUMPLE
//   2) Tensión Seca MD < mínimo permitido  → NO CUMPLE
//   3) Tensión Seca CD < mínimo permitido  → NO CUMPLE
//
// Comparación ESTRICTA (>, <). Si el valor está exactamente en el límite,
// se considera dentro de especificación.
//
// Aplica para todos los productos que tengan definidas estas variables.
// Si el producto no tiene la variable en su especificación, esa condición
// simplemente no aplica (no bloquea ni invalida).
//
// La regla es la MISMA en captura (frontend) y en `upsertMuestraConMediciones`
// (backend). Esta función es la fuente única de verdad.
//
// NO modifica históricos. Sólo afecta el guardado de NUEVAS muestras o la
// edición de muestras existentes en su próximo upsert.
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
  limite: number;
  tipo: "max_excedido" | "min_no_alcanzado";
  /** Mensaje listo para mostrar al operador / registrar en auditoría. */
  mensaje: string;
}

export interface CriticalRuleResult {
  /** true si AL MENOS UNA de las 3 condiciones críticas se incumple. */
  forzarNC: boolean;
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
 * Evalúa la regla crítica oficial sobre el conjunto de mediciones de una muestra.
 * Sólo considera mediciones con `valor` finito (las celdas vacías no fuerzan NC).
 */
export function evaluateCriticalRule(
  mediciones: CriticalMedicionInput[],
): CriticalRuleResult {
  const fallas: CriticalFailure[] = [];

  for (const m of mediciones) {
    if (!esCritica(m.variable_clave)) continue;
    const v = Number(m.valor);
    if (!Number.isFinite(v)) continue;

    if (m.variable_clave === "pesoBase") {
      // Estricto: > max → NC. v === max permitido.
      if (Number.isFinite(m.max_snapshot) && v > m.max_snapshot) {
        fallas.push({
          variable_clave: "pesoBase",
          etiqueta: ETIQUETAS.pesoBase,
          valor: v,
          limite: m.max_snapshot,
          tipo: "max_excedido",
          mensaje: `Peso Base ${v} excede el máximo permitido (${m.max_snapshot}).`,
        });
      }
    } else {
      // tensionMD / tensionCD — Estricto: < min → NC. v === min permitido.
      if (Number.isFinite(m.min_snapshot) && v < m.min_snapshot) {
        fallas.push({
          variable_clave: m.variable_clave,
          etiqueta: ETIQUETAS[m.variable_clave],
          valor: v,
          limite: m.min_snapshot,
          tipo: "min_no_alcanzado",
          mensaje: `${ETIQUETAS[m.variable_clave]} ${v} es menor al mínimo permitido (${m.min_snapshot}).`,
        });
      }
    }
  }

  return {
    forzarNC: fallas.length > 0,
    fallas,
    resumen:
      fallas.length === 0
        ? ""
        : `Rollo marcado como NO CONFORME por incumplimiento de variable crítica:\n• ${fallas
            .map((f) => f.mensaje)
            .join("\n• ")}`,
  };
}
