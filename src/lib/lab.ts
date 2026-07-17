// Laboratorios Norte / Sur — MODO FUNCIONAL / MOCK.
// No persiste en BD. Toda la lógica de pertenencia capturista→laboratorio
// y máquina→laboratorio vive aquí para que sea fácil sustituirla por una
// columna real cuando se ejecute la migración.

import { useMemo } from "react";
import { useAuth } from "@/lib/auth";

export type LabZona = "norte" | "sur";

export const LAB_LABEL: Record<LabZona, string> = {
  norte: "Laboratorio Norte",
  sur: "Laboratorio Sur",
};

// Códigos cortos de máquina (los que se usan en UI: "MP-04", etc.)
export const LAB_MAQUINAS: Record<LabZona, string[]> = {
  norte: ["MP-06", "MP-07"],
  sur: ["MP-04", "MP-05"],
};

// IDs internos del mock de órdenes (qc-mock/seed.ts).
// Se mantienen sincronizados con el seed.
export const LAB_MAQUINA_IDS: Record<LabZona, string[]> = {
  norte: ["maq-mp06", "maq-mp07"],
  sur: ["maq-mp04", "maq-mp05"],
};

const MAQUINA_TO_LAB: Record<string, LabZona> = {
  "MP-04": "sur",
  "MP-05": "sur",
  "MP-06": "norte",
  "MP-07": "norte",
};

const MAQUINA_ID_TO_LAB: Record<string, LabZona> = {
  "maq-mp04": "sur",
  "maq-mp05": "sur",
  "maq-mp06": "norte",
  "maq-mp07": "norte",
};

export function getLabForMaquina(codigo: string | null | undefined): LabZona | null {
  if (!codigo) return null;
  return MAQUINA_TO_LAB[codigo.toUpperCase()] ?? null;
}

export function getLabForMaquinaId(maquinaId: string | null | undefined): LabZona | null {
  if (!maquinaId) return null;
  return MAQUINA_ID_TO_LAB[maquinaId] ?? null;
}

// Regla MOCK de asignación capturista → laboratorio
// (los 3 nuevos capturistasur* van a "sur"; el resto a "norte").
// Cuando se ejecute la migración real, esto se reemplazará por
// `profile.laboratorio` cargado desde la BD.
export function getLabForEmail(email: string | null | undefined): LabZona | null {
  if (!email) return null;
  const local = email.toLowerCase().split("@")[0];
  if (local.startsWith("capturistasur")) return "sur";
  if (local.startsWith("capturistanorte")) return "norte";
  if (local.startsWith("capturista")) return "norte"; // capturistas existentes
  return null;
}

const ROLES_VEN_TODOS = ["administrador", "gerente_general", "direccion", "calidad"] as const;

export interface LabFilter {
  /** Laboratorio asignado al usuario actual (null si no aplica). */
  lab: LabZona | null;
  /** true si el usuario es capturista (filtro automático). */
  isCapturista: boolean;
  /** true si el usuario ve ambos laboratorios. */
  canSeeAll: boolean;
  /** Códigos de máquina permitidos. null = todas. */
  allowedMachineCodes: string[] | null;
  /** IDs internos de máquina permitidos (para mock store). null = todas. */
  allowedMachineIds: string[] | null;
  /** Helper booleano por código (UI). */
  isMachineAllowed: (codigo: string | null | undefined) => boolean;
  /** Helper booleano por id interno (mock store). */
  isMachineIdAllowed: (id: string | null | undefined) => boolean;
}

export function useLabFilter(): LabFilter {
  const auth = useAuth();

  return useMemo<LabFilter>(() => {
    const isCapturista = auth.hasRole("capturista");
    // Restricción Norte/Sur eliminada: todos los roles (incluido capturista)
    // pueden ver y capturar en las 4 máquinas (MP-04 a MP-07).
    return {
      lab: null,
      isCapturista,
      canSeeAll: true,
      allowedMachineCodes: null,
      allowedMachineIds: null,
      isMachineAllowed: () => true,
      isMachineIdAllowed: () => true,
    };
  }, [auth]);
}

