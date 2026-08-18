// =============================================================================
// Validación del MOTIVO REAL para todo cambio manual de estatus de un rollo.
// Espejo exacto de la validación server-side en `public.change_roll_status`.
// Se usa en Control de Calidad, Captura fuera de turno y Revisión/Dictamen.
// =============================================================================

/** Longitud mínima de un motivo real de decisión. */
export const MOTIVO_MIN_LEN = 10;

/** Textos que NO constituyen un motivo real (nombre del dictamen o relleno). */
export const MOTIVOS_NO_VALIDOS = new Set([
  "liberada", "liberado", "liberacion", "liberación", "concesion", "concesión",
  "rechazada", "rechazado", "no conforme", "noconforme", "nc", "l", "c",
  "correccion_solicitada", "corrección solicitada", "sin motivo", "(sin motivo)",
  "n/a", "na",
]);

/** Devuelve null si el motivo es válido, o el mensaje de error a mostrar. */
export function validarMotivoEstatus(motivo: string): string | null {
  const v = motivo.trim();
  if (v.length < MOTIVO_MIN_LEN) {
    return `El motivo es obligatorio (mín. ${MOTIVO_MIN_LEN} caracteres) y debe expresar la razón real de la decisión.`;
  }
  if (MOTIVOS_NO_VALIDOS.has(v.toLowerCase())) {
    return "Motivo no válido: describe la razón real de la decisión, no el nombre del dictamen.";
  }
  return null;
}
