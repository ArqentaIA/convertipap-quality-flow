/** Formato visual N° Captura: 6 dígitos con ceros a la izquierda, sin símbolos. */
export const formatCaptura = (n?: number | null): string =>
  n == null ? "—" : String(n).padStart(6, "0");

// ─────────────────────────────────────────────────────────────
// Helpers de zona horaria México (America/Mexico_City)
// Usar SIEMPRE en todos los reportes y exports para evitar que
// el Worker (UTC) muestre horas inconsistentes con el turno operativo.
// ─────────────────────────────────────────────────────────────
export const MX_TZ = "America/Mexico_City";

const _fmtFechaMX = new Intl.DateTimeFormat("en-CA", {
  timeZone: MX_TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
const _fmtFechaMXCorto = new Intl.DateTimeFormat("es-MX", {
  timeZone: MX_TZ, day: "2-digit", month: "2-digit", year: "numeric",
});
const _fmtHoraMX = new Intl.DateTimeFormat("es-MX", {
  timeZone: MX_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
});
const _fmtFechaHoraMX = new Intl.DateTimeFormat("es-MX", {
  timeZone: MX_TZ, day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const _fmtFechaHoraLargaMX = new Intl.DateTimeFormat("es-MX", {
  timeZone: MX_TZ, dateStyle: "long", timeStyle: "short",
});

function _toDate(iso: string | number | Date | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === "") return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD en hora local México. */
export function fechaMX(iso: string | number | Date | null | undefined): string {
  const d = _toDate(iso);
  return d ? _fmtFechaMX.format(d) : "";
}

/** DD/MM/YYYY en hora local México. */
export function fechaCortoMX(iso: string | number | Date | null | undefined): string {
  const d = _toDate(iso);
  return d ? _fmtFechaMXCorto.format(d) : "";
}

/** HH:MM (24h) en hora local México. */
export function horaMX(iso: string | number | Date | null | undefined): string {
  const d = _toDate(iso);
  if (!d) return "";
  return _fmtHoraMX.format(d).replace(/^24:/, "00:");
}

/** DD/MM/YYYY HH:MM en hora local México. */
export function fechaHoraMX(iso: string | number | Date | null | undefined): string {
  const d = _toDate(iso);
  return d ? _fmtFechaHoraMX.format(d) : "";
}

/** Fecha larga + hora corta en español-MX, hora local México. */
export function fechaHoraLargaMX(iso: string | number | Date | null | undefined): string {
  const d = _toDate(iso);
  return d ? _fmtFechaHoraLargaMX.format(d) : "";
}

