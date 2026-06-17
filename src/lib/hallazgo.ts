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
  "Grumos",
] as const;

export const VARIABLES_TECNICAS_DIMENSIONALES = [
  "Blancura",
  "RH",
  "Diámetro <",
  "Ancho",
  "Largo",
  "Tensión Húmeda",
  "Stretch",
  "Suavidad",
  "Otros",
] as const;

export const CRITERIOS_DEFECTO = ["MENOR", "MAYOR", "CRÍTICO"] as const;
export type CriterioDefecto = (typeof CRITERIOS_DEFECTO)[number];

export interface HallazgoSource {
  defecto_visual_conversion?: string | null;
  variable_tecnica_dimensional?: string | null;
  criterio_defecto?: string | null;
}

/** Devuelve `[Defecto] | [Variable] | [Criterio]` o null si los 3 están vacíos. */
export function formatHallazgo(m: HallazgoSource | null | undefined): string | null {
  if (!m) return null;
  const partes = [
    m.defecto_visual_conversion?.trim(),
    m.variable_tecnica_dimensional?.trim(),
    m.criterio_defecto?.trim(),
  ].filter((x): x is string => !!x && x.length > 0);
  if (partes.length === 0) return null;
  return partes.join(" | ");
}

export function isHallazgoCritico(m: HallazgoSource | null | undefined): boolean {
  return (m?.criterio_defecto ?? "").trim().toUpperCase() === "CRÍTICO";
}
