// Hallazgos por rollo (Defectos Visuales / Variables Técnicas / Criterio).
// Formato uniforme para Visor, modal de antecedentes y reportes.

export const DEFECTOS_VISUALES_CONVERSION = [
  "Uniones",
  "Desfases",
  "Pintos",
  "Área sucia",
  "Picado",
  "Oscilación de la hoja",
  "Gomas",
  "Hoyos",
  "Adherencia",
  "Porosidad",
  "Embobinado flojo",
  "Tonalidad rosa",
  "Tonalidad verde",
  "Tonalidad azul",
  "Suciedad",
  "Arrugas",
  "Franja de humedad",
  "Franja de crepado",
  "Arrastre de agua",
  "Centro corrido",
  "Centro reducido",
  "Grumos",
] as const;

export const VARIABLES_TECNICAS_DIMENSIONALES = [
  "Blancura",
  "RH",
  "Diámetro <",
  "Ancho útil <",
  "Ancho útil >",
  "Calibre",
  "Elongación",
  "MD",
  "CD",
  "Peso Base",
  "Tensión Húmeda",
  "Suavidad",
  "Largo",
] as const;

/**
 * Alias de compatibilidad para registros históricos.
 * Mapea valores antiguos almacenados en BD a su etiqueta homologada actual.
 * No modifica datos en BD: solo afecta la visualización.
 */
export const HALLAZGO_LABEL_ALIASES: Record<string, string> = {
  Ancho: "Ancho útil <",
  Stretch: "Elongación",
};

export const SIN_DEFECTO_LABEL = "SIN DEFECTO";

/**
 * Devuelve la etiqueta visible homologada para un valor (histórico o actual).
 * Valores null/vacíos se muestran como "SIN DEFECTO" (regla de negocio:
 * los hallazgos son opcionales en captura pero los reportes deben rellenar el campo).
 */
export function displayHallazgoLabel(value: string | null | undefined): string {
  if (!value || !value.trim()) return SIN_DEFECTO_LABEL;
  const trimmed = value.trim();
  return HALLAZGO_LABEL_ALIASES[trimmed] ?? trimmed;
}

export const CRITERIOS_DEFECTO = ["MENOR", "MAYOR", "CRÍTICO"] as const;
export type CriterioDefecto = (typeof CRITERIOS_DEFECTO)[number];

export interface HallazgoSource {
  defecto_visual_conversion?: string | null;
  variable_tecnica_dimensional?: string | null;
  criterio_defecto?: string | null;
}

/**
 * Devuelve `[Defecto] | [Variable] | [Criterio]`.
 * Para reportes/visor: cualquier columna sin valor se rellena con "SIN DEFECTO".
 */
export function formatHallazgo(m: HallazgoSource | null | undefined): string | null {
  if (!m) return `${SIN_DEFECTO_LABEL} | ${SIN_DEFECTO_LABEL} | ${SIN_DEFECTO_LABEL}`;
  const partes = [
    displayHallazgoLabel(m.defecto_visual_conversion),
    displayHallazgoLabel(m.variable_tecnica_dimensional),
    m.criterio_defecto?.trim() ? m.criterio_defecto.trim() : SIN_DEFECTO_LABEL,
  ];
  return partes.join(" | ");
}

export function isHallazgoCritico(m: HallazgoSource | null | undefined): boolean {
  return (m?.criterio_defecto ?? "").trim().toUpperCase() === "CRÍTICO";
}
