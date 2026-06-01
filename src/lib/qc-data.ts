// Domain types for QC Production Registry
export type Plant = { id: string; name: string; code: string };
export type Shift = "1" | "2" | "3";
export type ReleaseStatus = "L" | "NC" | "C";

export interface QualityVariable {
  key: string;
  label: string;
  unit: string;
  min: number;
  objective: number;
  max: number;
  tolerance?: string;
}

export interface Measurement {
  id: string;
  hora: string;
  rollo: string;
  calibre: number | null;
  blancuraR457: number | null;
  blancuraA: number | null;
  blancuraB: number | null;
  tensionMD: number | null;
  tensionCD: number | null;
  relMDCD: number | null;
  elongMD: number | null;
  humedad: number | null;
  pesoBase: number | null;
  anchoUtil: number | null;
  diametro: number | null;
  uniones: number | null;
  estatus: ReleaseStatus;
  pesoRollo: number | null;
  notas: string;
  /** Evidencia cuando Control de Calidad sobreescribe el estatus sugerido */
  estatusOverride?: {
    sugerido: ReleaseStatus;
    final: ReleaseStatus;
    by: string;
    at: string;
    motivo: string;
  } | null;
}

export interface GeneralInfo {
  plantId: string;
  area: string;
  maquina: string;
  fabricacion: string;
  jefeMaquina: string;
  operador: string;
  prensero: string;
  analista: string;
  fecha: string;
  turno: Shift;
  horaInicio: string;
  horaFin: string;
  velocidadMaquina: number;
  velocidadEnrollador: number;
  crepado: number;
  cumplimiento: number;
  notas: string;
}

export const PLANTS: Plant[] = [
  { id: "tlx", name: "Planta Tlaxcala", code: "TLX" },
];

export const QUALITY_VARIABLES: QualityVariable[] = [
  { key: "calibre", label: "Calibre", unit: "mm", min: 0.75, objective: 0.85, max: 0.95 },
  { key: "blancuraR457", label: "Blancura R457", unit: "%", min: 72, objective: 74, max: 76 },
  { key: "blancuraA", label: "Blancura a*", unit: "", min: -1, objective: 0, max: 1 },
  { key: "blancuraB", label: "Blancura b*", unit: "", min: -2, objective: 1, max: 4 },
  { key: "tensionMD", label: "Tensión seca MD", unit: "g/in", min: 405, objective: 450, max: 495 },
  { key: "tensionCD", label: "Tensión seca CD", unit: "g/in", min: 250, objective: 280, max: 310 },
  { key: "relMDCD", label: "Relación MD/CD", unit: "", min: 1.4, objective: 1.6, max: 1.8 },
  { key: "elongMD", label: "Elongación MD", unit: "%", min: 12, objective: 14, max: 16 },
  { key: "humedad", label: "Humedad", unit: "%", min: 5, objective: 6, max: 7 },
  { key: "pesoBase", label: "Peso base", unit: "g/m²", min: 12.7, objective: 13, max: 13.3 },
  { key: "anchoUtil", label: "Ancho útil", unit: "cm", min: 284, objective: 285, max: 286 },
  { key: "diametro", label: "Diámetro", unit: "cm", min: 170, objective: 190, max: 210 },
];

export const SAMPLE_MEASUREMENTS: Measurement[] = [
  { id: "m1", hora: "23:40", rollo: "4438-6", calibre: 0.80, blancuraR457: 77.02, blancuraA: 0.16, blancuraB: 1.14, tensionMD: 449, tensionCD: 284, relMDCD: 1.58, elongMD: 15.35, humedad: 6.0, pesoBase: 13.28, anchoUtil: 284, diametro: 198, uniones: 1, estatus: "L", pesoRollo: 2006, notas: "Lig. hoyos" },
  { id: "m2", hora: "00:10", rollo: "4439-6", calibre: 0.84, blancuraR457: 77.19, blancuraA: 0.23, blancuraB: 1.02, tensionMD: 493, tensionCD: 267, relMDCD: 1.84, elongMD: 16.39, humedad: 6.2, pesoBase: 13.19, anchoUtil: 284, diametro: 170, uniones: 1, estatus: "C", pesoRollo: 1500, notas: "Lig. hoyos, lig. desfase" },
  { id: "m3", hora: "00:45", rollo: "4440-6", calibre: 0.77, blancuraR457: 77.64, blancuraA: 0.16, blancuraB: 0.88, tensionMD: 427, tensionCD: 220, relMDCD: 1.94, elongMD: 15.35, humedad: 6.8, pesoBase: 12.52, anchoUtil: 284, diametro: 208, uniones: 0, estatus: "C", pesoRollo: 2280, notas: "Ligeros hoyos, lig. suciedad" },
  { id: "m4", hora: "01:25", rollo: "4441-6", calibre: 0.77, blancuraR457: 77.75, blancuraA: 0.16, blancuraB: 0.87, tensionMD: 461, tensionCD: 250, relMDCD: 1.84, elongMD: 15.39, humedad: 7.1, pesoBase: 13.07, anchoUtil: 284, diametro: 198, uniones: 2, estatus: "L", pesoRollo: 2050, notas: "Lig. hoyos / lig. suciedad" },
  { id: "m5", hora: "01:55", rollo: "4442-6", calibre: 0.75, blancuraR457: 77.82, blancuraA: 0.15, blancuraB: 0.90, tensionMD: 486, tensionCD: 257, relMDCD: 1.89, elongMD: 14.93, humedad: 6.5, pesoBase: 12.86, anchoUtil: 283.8, diametro: 163, uniones: 2, estatus: "NC", pesoRollo: 1400, notas: "Destase, lig. hoyos, lig. suciedad" },
];

export const DEFAULT_GENERAL: GeneralInfo = {
  plantId: "tlx",
  area: "Conversión Tissue",
  maquina: "MP-06",
  fabricacion: "PHR01",
  jefeMaquina: "",
  operador: "",
  prensero: "",
  analista: "",
  fecha: new Date().toISOString().slice(0, 10),
  turno: "" as Shift,
  horaInicio: "",
  horaFin: "",
  velocidadMaquina: 0,
  velocidadEnrollador: 0,
  crepado: 0,
  cumplimiento: 0,
  notas: "",
};

export type VarStatus = "ok" | "warn" | "bad";
export function evaluateValue(v: QualityVariable, value: number | null): VarStatus {
  if (value === null || isNaN(value)) return "ok";
  if (value < v.min || value > v.max) return "bad";
  const range = v.max - v.min;
  const margin = range * 0.1;
  if (value < v.min + margin || value > v.max - margin) return "warn";
  return "ok";
}
