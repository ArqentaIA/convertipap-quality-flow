import { useEffect, useState } from "react";

/**
 * Reloj reactivo para recalcular el turno actual sin recargar la página.
 *
 * Devuelve una marca de tiempo (Date) que se actualiza cada `intervalMs`
 * milisegundos (por defecto cada 60 s). Úselo como dependencia en cualquier
 * `useMemo`/`useEffect` que derive el turno actual a partir del reloj del
 * cliente (p. ej. `computeTurnoActual(now, appSettings)` o `inferirTurno`).
 *
 * No reemplaza la lógica de cálculo del turno: sólo garantiza que los
 * componentes recalculen automáticamente cuando cambia la hora del sistema.
 */
export function useShiftTick(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Versión con función inyectable de cálculo de turno. Útil cuando el
 * componente ya tiene su propia función `computeTurnoActual` / `inferirTurno`
 * y sólo necesita un valor reactivo del turno vigente.
 */
export function useCurrentShift<TSettings, TShift>(
  settings: TSettings,
  compute: (now: Date, settings: TSettings) => TShift,
  intervalMs: number = 60_000,
): TShift {
  const now = useShiftTick(intervalMs);
  return compute(now, settings);
}
