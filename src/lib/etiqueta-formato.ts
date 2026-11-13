// Fixed rollout boundary: never use the printing date or production date.
export const FOR_CAL_05_DESDE = "2026-11-13T18:20:50Z";

export type FormatoEtiqueta = "FOR-CAL-04" | "FOR-CAL-05";

export function resolveFormatoEtiqueta(source: {
  capturado_at: string | null;
  fuera_de_turno: boolean | null;
}): FormatoEtiqueta {
  const registrado = Date.parse(source.capturado_at ?? "");
  return source.fuera_de_turno === false &&
    Number.isFinite(registrado) && registrado >= Date.parse(FOR_CAL_05_DESDE)
    ? "FOR-CAL-05"
    : "FOR-CAL-04";
}

/** Leyenda impresa en la etiqueta; ambos formatos conservan «Rev. 01». */
export function leyendaFormatoEtiqueta(formato: FormatoEtiqueta): string {
  return `${formato} · Rev. 01`;
}