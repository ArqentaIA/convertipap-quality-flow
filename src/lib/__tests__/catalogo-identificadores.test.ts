import { describe, expect, it } from 'vitest';
import { codigoProductoSchema, skuSapSchema, mensajeErrorCatalogo, criterioDefectoPersistido } from '../catalogo-identificadores';

describe('Identificadores de producto y SKU independientes', () => {
  it('acepta los códigos compuestos solicitados y espacios/símbolos', () => {
    for (const codigo of ['11_SSK101101285', 'PSC01_SSK10110', 'PSC01 / 285+'])
      expect(codigoProductoSchema.parse(codigo)).toBe(codigo);
  });
  it('permite que código coincida con SKU sin confundir los campos', () => {
    expect(codigoProductoSchema.parse('SSK101101285')).toBe(skuSapSchema.parse('SSK101101285'));
  });
  it('no acepta caracteres de control ni más de 30 caracteres en código', () => {
    expect(codigoProductoSchema.safeParse('PS\nK01').success).toBe(false);
    expect(codigoProductoSchema.safeParse('X'.repeat(31)).success).toBe(false);
  });
  it('conserva SKU hasta 64 caracteres sin truncarlo', () => {
    expect(skuSapSchema.parse('S'.repeat(64))).toHaveLength(64);
    expect(skuSapSchema.safeParse('S'.repeat(65)).success).toBe(false);
  });
  it('un duplicado de versión no se confunde con un guardado exitoso', () => {
    expect(mensajeErrorCatalogo(new Error('SKU_VERSION_DUPLICADA'))).toContain('versión distinta');
  });
  it('sin criterio no inventa un defecto para poder guardar el SKU', () => {
    expect(criterioDefectoPersistido('SIN DEFECTO')).toBeNull();
    expect(criterioDefectoPersistido('MENOR')).toBe('MENOR');
  });
});