// Roster de personal por turno. Asignaciones automáticas que solo Dirección puede modificar.
import type { Shift } from "@/lib/qc-data";

export type RosterEntry = {
  jefeMaquina: string;
  operador: string;
  prensero: string;
};

// Al menos un equipo completo por turno. Editable solo por Dirección desde Configuración.
export const SHIFT_ROSTER: Record<Shift, RosterEntry> = {
  "1": { jefeMaquina: "Luis Hernández",  operador: "Marco Antonio", prensero: "Javier" },
  "2": { jefeMaquina: "Carlos Méndez",    operador: "José Luis",     prensero: "Tomás" },
  "3": { jefeMaquina: "Erick Ordoñez",    operador: "Palemón",       prensero: "Ricardo" },
};

let roster: Record<Shift, RosterEntry> = { ...SHIFT_ROSTER };
const listeners = new Set<() => void>();

export function getRoster() { return roster; }
export function getShiftAssignment(turno: Shift): RosterEntry {
  return roster[turno];
}
export function updateShiftAssignment(turno: Shift, entry: RosterEntry) {
  roster = { ...roster, [turno]: { ...entry } };
  listeners.forEach((l) => l());
}
export function subscribeRoster(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
