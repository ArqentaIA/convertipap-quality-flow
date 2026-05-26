import { useSyncExternalStore } from "react";

// Sesión de captura simulada. En producción vendría del login real.
type Session = { user: string | null; role: "operador" | "direccion" | null };

let state: Session = { user: null, role: null };
const listeners = new Set<() => void>();

export function getSession() { return state; }
export function setSession(next: Session) {
  state = next;
  listeners.forEach((l) => l());
}
export function clearSession() { setSession({ user: null, role: null }); }

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useSession() {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
