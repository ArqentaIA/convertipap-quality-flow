// Guarda de inactividad: permite que módulos críticos (captura de calidad)
// declaren una operación en curso para que el cierre automático por
// inactividad NUNCA interrumpa un guardado ni pierda un formulario en edición.
//
// No amplía la duración de la sesión: sólo evita cerrarla mientras hay una
// operación viva en pantalla. Al terminar la operación, el temporizador de
// inactividad vuelve a correr con su valor normal.

let busyCount = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** Marca inicio de operación crítica (guardado en vuelo, formulario con datos). */
export function beginCriticalWork(): void {
  busyCount += 1;
  notify();
}

/** Marca fin de operación crítica. */
export function endCriticalWork(): void {
  busyCount = Math.max(0, busyCount - 1);
  notify();
}

/** Sincroniza el estado crítico a partir de un booleano (idempotente). */
export function setCriticalWork(key: string, active: boolean): void {
  const has = activeKeys.has(key);
  if (active && !has) {
    activeKeys.add(key);
    beginCriticalWork();
  } else if (!active && has) {
    activeKeys.delete(key);
    endCriticalWork();
  }
}

const activeKeys = new Set<string>();

export function isCriticalWorkActive(): boolean {
  return busyCount > 0;
}

export function subscribeCriticalWork(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
