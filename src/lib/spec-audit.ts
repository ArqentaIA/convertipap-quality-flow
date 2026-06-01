// Bitácora simulada de cambios en especificaciones (persistida en localStorage).
// En producción: tabla auditada en BD, append-only.

export interface SpecChangeRecord {
  id: string;
  timestamp: string; // ISO
  username: string;
  fullName: string;
  role: "Direccion" | "Calidad Senior" | "Administrador";
  plant: string;
  productCode: string;
  productName: string;
  variableKey: string;
  variableLabel: string;
  field: "min" | "objective" | "max";
  oldValue: number;
  newValue: number;
  reason: string;
}

const KEY = "spec-audit-log-v1";

export function loadAudit(): SpecChangeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function appendAudit(records: SpecChangeRecord[]) {
  if (typeof window === "undefined") return;
  const current = loadAudit();
  localStorage.setItem(KEY, JSON.stringify([...current, ...records]));
}

export function auditFor(productCode: string): SpecChangeRecord[] {
  return loadAudit().filter((r) => r.productCode === productCode);
}

// Roles autorizados simulados — clave única: "direccion"
export const AUTHORIZED_USERS: Record<
  string,
  { fullName: string; role: SpecChangeRecord["role"] }
> = {
  "jonathan.pelaez": { fullName: "Ing. Jonathan Alberto Peláez", role: "Direccion" },
  "calidad.senior": { fullName: "Ing. María Fernanda Ruiz", role: "Calidad Senior" },
  "admin.sistema": { fullName: "Admin del Sistema", role: "Administrador" },
};

export const AUTH_PASSWORD = "direccion";
