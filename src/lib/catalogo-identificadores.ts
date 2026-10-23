import { z } from "zod";

export const codigoProductoSchema = z.string().trim().min(2).max(30)
  .regex(/^[\p{L}\p{N}\p{P}\p{S} ]+$/u, "Código inválido: usa 2 a 30 caracteres imprimibles.")
  .transform((v) => v.toUpperCase());

export const skuSapSchema = z.string().trim().max(64)
  .regex(/^[\p{L}\p{N}\p{P}\p{S} ]*$/u, "SKU inválido: no se permiten caracteres de control.");

export function mensajeErrorCatalogo(error: unknown): string {
  const message = error instanceof Error ? error.message : "No se pudo guardar el producto.";
  if (message.includes("SKU_VERSION_DUPLICADA")) {
    return "El SKU ya existe en otro producto con esa versión. Captura una versión distinta; tus datos permanecen en el formulario.";
  }
  return message;
}

export function criterioDefectoPersistido(value: string | null | undefined) {
  return value === 'MENOR' || value === 'MAYOR' || value === 'CRÍTICO' ? value : null;
}