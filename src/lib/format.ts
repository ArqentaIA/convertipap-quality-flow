/** Formato visual N° Captura: 6 dígitos con ceros a la izquierda, sin símbolos. */
export const formatCaptura = (n?: number | null): string =>
  n == null ? "—" : String(n).padStart(6, "0");
