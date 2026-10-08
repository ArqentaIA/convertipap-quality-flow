import { MX_TZ } from "./format";

/** Interpret a calendar midnight in Mexico, deriving its offset from the zone. */
function midnightMX(date: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
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
  return { start: midnightMX(first).toISOString(), end: midnightMX(endCalendar.toISOString().slice(0, 10)).toISOString() };
}