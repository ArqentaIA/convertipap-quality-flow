// Orden de presentación de variables en el Catálogo Maestro de Especificaciones
// (tabla en pantalla e impresión). No afecta los formularios de captura.
export const ORDEN_VARIABLES_CATALOGO: string[] = [
  "peso",
  "anchoUtil",
  "diametro",
  "uniones",
  "pesoBase",
  "humedad",
  "tensionMD",
  "tensionCD",
  "tensionRH",
];

/** Índice de orden: las variables listadas van primero, el resto conserva su orden original. */
export function ordenCatalogo(clave: string, fallback: number): number {
  const i = ORDEN_VARIABLES_CATALOGO.indexOf(clave);
  return i >= 0 ? i : 1000 + fallback;
}
