// =============================================================================
// resolveRolloStatus — Fuente única de verdad para el estatus de un rollo.
// =============================================================================
//
// Reglas (acordadas con operación):
//
//  1. La fuente única de verdad es el dictamen de Calidad más reciente
//     asociado al rollo (`MuestraCalidad.dictamen` / `MuestraCalidad.estado`).
//  2. Estados permitidos:
//        pendiente_revision · liberado · liberado_concesion ·
//        en_ajuste · reproceso · rechazado · inconsistencia
//  3. El QR NO almacena el estatus. Solo guarda rollo_id / folio / orden_id /
//     url de consulta. Al escanearlo, la pantalla de trazabilidad invoca
//     resolveRolloStatus() en tiempo real.
//  4. Etiquetas impresas y reportes usan exactamente esta misma función.
//  5. Si hay diferencia entre estado_muestra, dictamen e historial de ajustes
//     se devuelve `inconsistencia` y se imprime una advertencia en consola.
//  6. Si se imprime la etiqueta antes del dictamen → `pendiente_revision`.
//     La reimpresión posterior recogerá el dictamen automáticamente.
//
// NO se modifican tablas, RLS ni migraciones.
// =============================================================================

import type { MuestraCalidad, AjusteCalidad } from "./qc-mock/types";
import { getQcSnapshot } from "./qc-mock/store";

export type RolloStatusKey =
  | "pendiente_revision"
  | "liberado"
  | "liberado_concesion"
  | "en_ajuste"
  | "reproceso"
  | "rechazado"
  | "inconsistencia";

export interface RolloStatusInfo {
  key: RolloStatusKey;
  /** Etiqueta operativa lista para UI / etiqueta / reporte. */
  label: string;
  /** Texto corto para badges y celdas. */
  short: string;
  /** Compatibilidad con componentes legados ReleaseBadge (L/NC/C). */
  legacyCode: "L" | "NC" | "C";
  /** Color principal (hex) — usado en PDFs e impresión. */
  color: string;
  /** Color de fondo (hex) — usado en PDFs e impresión. */
  bg: string;
  /** De dónde se derivó el estatus, para auditoría. */
  source:
    | "dictamen_calidad"
    | "estado_muestra"
    | "sin_dictamen"
    | "legacy_historial"
    | "inconsistencia";
  /** Advertencias detectadas (se imprimen en consola y se exponen al UI). */
  warnings: string[];
}

export interface ResolveRolloInput {
  /** Identificador del rollo (número o cadena tipo "4438-6"). */
  rolloId?: string | number | null;
  /** Folio del registro (p. ej. "MP-04-2026-05-26-4438-6" o "CAL-2026-04830"). */
  folio?: string | null;
  /** Orden de producción asociada, si se conoce. */
  ordenId?: string | null;
  /**
   * Estatus histórico (mock o registros previos al flujo de Calidad).
   * Se usa SOLO cuando no existe muestra en el store. Nunca pisa un dictamen.
   */
  legacyEstatus?: "L" | "NC" | "C" | null;
}

// -----------------------------------------------------------------------------
// Catálogo central de presentación
// -----------------------------------------------------------------------------

const STATUS_PRESENTATION: Record<
  RolloStatusKey,
  Omit<RolloStatusInfo, "source" | "warnings">
> = {
  pendiente_revision: {
    key: "pendiente_revision",
    label: "Pendiente de dictamen de calidad",
    short: "Pendiente dictamen",
    legacyCode: "C",
    color: "#0369a1",
    bg: "#e0f2fe",
  },
  liberado: {
    key: "liberado",
    label: "Liberado",
    short: "Liberado",
    legacyCode: "L",
    color: "#15803d",
    bg: "#dcfce7",
  },
  liberado_concesion: {
    key: "liberado_concesion",
    label: "Liberado con concesión",
    short: "Concesión",
    legacyCode: "C",
    color: "#a16207",
    bg: "#fef3c7",
  },
  en_ajuste: {
    key: "en_ajuste",
    label: "En ajuste",
    short: "En ajuste",
    legacyCode: "C",
    color: "#b45309",
    bg: "#fef3c7",
  },
  reproceso: {
    key: "reproceso",
    label: "Reproceso",
    short: "Reproceso",
    legacyCode: "NC",
    color: "#7c2d12",
    bg: "#fed7aa",
  },
  rechazado: {
    key: "rechazado",
    label: "Rechazado",
    short: "Rechazado",
    legacyCode: "NC",
    color: "#b91c1c",
    bg: "#fee2e2",
  },
  inconsistencia: {
    key: "inconsistencia",
    label: "Inconsistencia",
    short: "Inconsistencia",
    legacyCode: "NC",
    color: "#7e22ce",
    bg: "#f3e8ff",
  },
};

function present(
  key: RolloStatusKey,
  source: RolloStatusInfo["source"],
  warnings: string[] = [],
): RolloStatusInfo {
  return { ...STATUS_PRESENTATION[key], source, warnings };
}

// -----------------------------------------------------------------------------
// Búsqueda de muestra más reciente para un rollo
// -----------------------------------------------------------------------------

function extractRolloNumber(input: ResolveRolloInput): number | null {
  if (input.rolloId != null) {
    const n = Number(String(input.rolloId).split(/[^0-9]/).filter(Boolean)[0]);
    if (Number.isFinite(n)) return n;
  }
  if (input.folio) {
    // Captura el último grupo numérico del folio (p. ej. "...-4438-6" → 4438).
    const groups = input.folio.match(/(\d+)/g);
    if (groups && groups.length > 0) {
      const n = Number(groups[groups.length - 2] ?? groups[groups.length - 1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function findLatestMuestra(
  muestras: MuestraCalidad[],
  input: ResolveRolloInput,
): MuestraCalidad | null {
  const rolloNum = extractRolloNumber(input);
  const candidatas = muestras.filter((m) => {
    if (input.ordenId && m.orden_id !== input.ordenId) return false;
    if (rolloNum != null && m.numero_rollo !== rolloNum) return false;
    if (rolloNum == null && !input.ordenId) return false;
    return true;
  });
  if (candidatas.length === 0) return null;
  return candidatas.reduce((a, b) =>
    new Date(b.updated_at).getTime() > new Date(a.updated_at).getTime() ? b : a,
  );
}

function findAjustesRelacionados(
  ajustes: AjusteCalidad[],
  muestra: MuestraCalidad,
): AjusteCalidad[] {
  return ajustes.filter(
    (a) => a.muestra_id === muestra.id || a.orden_id === muestra.orden_id,
  );
}

// -----------------------------------------------------------------------------
// Mapeo dictamen / estado_muestra → estatus unificado
// -----------------------------------------------------------------------------

function fromMuestra(
  muestra: MuestraCalidad,
  ajustes: AjusteCalidad[],
): RolloStatusInfo {
  const warnings: string[] = [];

  // -- Regla A: medición modificada después de un dictamen autorizado → inconsistencia.
  if (
    muestra.dictamen_at &&
    muestra.mediciones_modificadas_at &&
    new Date(muestra.mediciones_modificadas_at).getTime() >
      new Date(muestra.dictamen_at).getTime()
  ) {
    warnings.push(
      `Medición modificada (${muestra.mediciones_modificadas_at}) después del dictamen (${muestra.dictamen_at}). Requiere nuevo dictamen.`,
    );
    // eslint-disable-next-line no-console
    console.warn("[resolveRolloStatus] Dictamen vencido por edición posterior:", {
      muestra_id: muestra.id,
      modificado_por: muestra.mediciones_modificadas_por,
      motivo: muestra.mediciones_modificacion_motivo,
    });
    return present("inconsistencia", "inconsistencia", warnings);
  }

  // -- Regla B: existe dictamen técnico pero NO está autorizado por Gerencia
  // de Calidad → siempre "Pendiente de dictamen de calidad".
  if (muestra.dictamen && !muestra.autorizado_por) {
    return present("pendiente_revision", "sin_dictamen", [
      "Dictamen técnico sin autorización formal de Gerencia de Calidad",
    ]);
  }

  // -- Regla C: dictamen vs estado vs ajustes abiertos.
  if (muestra.dictamen === "liberada" && muestra.estado !== "liberada") {
    warnings.push(
      `Dictamen=liberada pero estado=${muestra.estado} en muestra ${muestra.id}`,
    );
  }
  if (muestra.dictamen === "rechazada" && muestra.estado !== "rechazada") {
    warnings.push(
      `Dictamen=rechazada pero estado=${muestra.estado} en muestra ${muestra.id}`,
    );
  }
  const ajustesAbiertos = ajustes.filter((a) => a.estado_flujo !== "cerrado");
  if (muestra.dictamen === "liberada" && ajustesAbiertos.length > 0) {
    warnings.push(
      `Muestra liberada con ${ajustesAbiertos.length} ajuste(s) abierto(s)`,
    );
  }

  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("[resolveRolloStatus] Inconsistencia detectada:", {
      muestra_id: muestra.id,
      rollo: muestra.numero_rollo,
      dictamen: muestra.dictamen,
      estado: muestra.estado,
      warnings,
    });
    return present("inconsistencia", "inconsistencia", warnings);
  }

  // Prioridad 1: dictamen autorizado por Gerencia de Calidad.
  if (muestra.dictamen === "liberada") return present("liberado", "dictamen_calidad");
  if (muestra.dictamen === "rechazada") return present("rechazado", "dictamen_calidad");
  if (muestra.dictamen === "concesion") return present("liberado_concesion", "dictamen_calidad");

  // Prioridad 2: estado del workflow (sin dictamen aún).
  switch (muestra.estado) {
    case "pendiente_revision":
    case "borrador":
      return present("pendiente_revision", "estado_muestra");
    case "en_ajuste":
      return present("en_ajuste", "estado_muestra");
    case "reproceso":
      return present("reproceso", "estado_muestra");
    case "liberada":
      return present("liberado", "estado_muestra");
    case "rechazada":
      return present("rechazado", "estado_muestra");
    case "concesion":
      return present("liberado_concesion", "estado_muestra");
  }
}

function fromLegacy(code: "L" | "NC" | "C"): RolloStatusInfo {
  if (code === "L") return present("liberado", "legacy_historial");
  if (code === "NC") return present("rechazado", "legacy_historial");
  return present("liberado_concesion", "legacy_historial");
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

/**
 * Resuelve el estatus del rollo desde un contexto explícito (útil para SSR
 * o pruebas). En el navegador prefiera `resolveRolloStatus(input)`.
 */
export function resolveRolloStatusFrom(
  ctx: { muestras: MuestraCalidad[]; ajustes: AjusteCalidad[] },
  input: ResolveRolloInput,
): RolloStatusInfo {
  const muestra = findLatestMuestra(ctx.muestras, input);
  if (muestra) {
    const ajustes = findAjustesRelacionados(ctx.ajustes, muestra);
    return fromMuestra(muestra, ajustes);
  }
  if (input.legacyEstatus) return fromLegacy(input.legacyEstatus);
  return present("pendiente_revision", "sin_dictamen");
}

/**
 * Versión navegador: lee el snapshot actual del store de Calidad (mock).
 * Cuando se conecte el backend real, esta función pasará a hacer una consulta
 * a Supabase con la misma forma de retorno.
 */
export function resolveRolloStatus(input: ResolveRolloInput): RolloStatusInfo {
  const snap = getQcSnapshot();
  return resolveRolloStatusFrom(
    { muestras: snap.muestras, ajustes: snap.ajustes },
    input,
  );
}
