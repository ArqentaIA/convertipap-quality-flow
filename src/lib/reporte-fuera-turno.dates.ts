import { MX_TZ } from "./format";

/** Interpret a Mexico wall-clock time using the zone, not a fixed UTC offset. */
export function timeMX(date: string, hour: string): Date {
  const guess = new Date(`${date}T${hour}:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MX_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(guess);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return new Date(guess.getTime() - (wall - guess.getTime()));
}

export function fueraTurnoWindow(mode: "dia" | "mes", date: string) {
  const first = mode === "mes" ? `${date.slice(0, 7)}-01` : date;
  const endCalendar = new Date(`${first}T00:00:00Z`);
  if (mode === "mes") endCalendar.setUTCMonth(endCalendar.getUTCMonth() + 1);
  else endCalendar.setUTCDate(endCalendar.getUTCDate() + 1);
  const hour = mode === "dia" ? "07" : "00";
  return { start: timeMX(first, hour).toISOString(), end: timeMX(endCalendar.toISOString().slice(0, 10), hour).toISOString() };
}