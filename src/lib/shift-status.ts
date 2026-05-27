// Estados de turno y trazabilidad (mock en memoria).
// La implementación real con backend, permisos y auditoría se hará después
// en Visual Studio Code + base de datos. Esta capa solo modela los estados
// y el flujo de corrección para que la UI los respete.

import { useSyncExternalStore } from "react";

export type ShiftStatus = "borrador" | "cerrado" | "correccion_auditada";

export type CorrectionEntry = {
  id: string;
  ts: string;             // ISO timestamp del registro de corrección
  user: string;           // Usuario que solicita / autoriza
  motivo: string;         // Justificación obligatoria
  campos: string;         // Campos / secciones afectadas (texto libre por ahora)
  folio: string;          // Folio de la corrección (mock)
};

export type ShiftRecord = {
  key: string;            // Identificador lógico del turno (planta-maquina-fecha-turno)
  status: ShiftStatus;
  closedAt?: string;      // ISO al cerrar
  closedBy?: string;      // Usuario que cerró
  corrections: CorrectionEntry[];
};

// Store en memoria con un solo turno activo (suficiente para la UI demo).
let state: ShiftRecord = {
  key: "tlx-MP-06-default",
  status: "borrador",
  corrections: [],
};

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

export function getShift(): ShiftRecord { return state; }

export function closeShift(user: string) {
  if (state.status !== "borrador") return;
  state = {
    ...state,
    status: "cerrado",
    closedAt: new Date().toISOString(),
    closedBy: user || "—",
  };
  emit();
}

export function addCorrection(entry: Omit<CorrectionEntry, "id" | "ts" | "folio">) {
  // Una corrección no sobrescribe datos: queda registrada y marca el turno
  // como "correccion_auditada". El detalle de qué se corrige se gestionará
  // en backend; aquí solo guardamos la metadata.
  const corr: CorrectionEntry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    folio: `COR-${Date.now().toString().slice(-6)}`,
    ...entry,
  };
  state = {
    ...state,
    status: "correccion_auditada",
    corrections: [...state.corrections, corr],
  };
  emit();
}

export function resetShift() {
  // Solo para demo / pruebas visuales.
  state = { key: state.key, status: "borrador", corrections: [] };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useShiftStatus() {
  return useSyncExternalStore(subscribe, getShift, getShift);
}

export const STATUS_META: Record<ShiftStatus, { label: string; tone: string; desc: string }> = {
  borrador: {
    label: "Borrador",
    tone: "bg-warning/15 text-foreground border-warning/40",
    desc: "Captura abierta. Los datos pueden modificarse libremente hasta cerrar el turno.",
  },
  cerrado: {
    label: "Cerrado",
    tone: "bg-success/15 text-success border-success/40",
    desc: "Turno cerrado. Datos en solo lectura. Toda modificación requiere flujo de corrección auditada.",
  },
  correccion_auditada: {
    label: "Corrección auditada",
    tone: "bg-primary/10 text-primary border-primary/40",
    desc: "El turno tiene una o más correcciones registradas. Los datos originales se preservan; las correcciones quedan en bitácora.",
  },
};
