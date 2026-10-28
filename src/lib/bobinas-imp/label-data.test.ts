import { describe, expect, it } from 'vitest';
import { impLabelData, type ImpLabelSnapshot } from './label-data';

const source = {
  id: 'c179b799-d4df-4a5e-bedd-c3e645c3080b', folio: '00248-0', maquina: 'MP-00',
  producto_codigo: 'PSK32', proveedor_nombre: 'Continental', sku: 'SSK103132260',
  estado: 'liberada', fecha: '2026-08-25', revision: 2,
  valores: { peso_base: 49.7, r457: 32.6, a: 1.69, b: 7.27, peso_bobina: 2118, ancho_util: 261 },
  observaciones: 'Dato registrado', planta_codigo: null, turno: null, analista: null, capturado_at: null,
} satisfies ImpLabelSnapshot;

describe('Datos de etiqueta importada', () => {
  it('incluye exactamente las seis variables propias sin límites de fabricación', () => {
    const { data } = impLabelData(source);
    expect(data.mediciones.map(m => [m.clave, m.valor])).toEqual([
      ['peso_base', 49.7], ['r457', 32.6], ['a', 1.69], ['b', 7.27], ['peso_bobina', 2118], ['ancho_util', 261],
    ]);
    expect(data.mediciones.some(m => 'min' in m || 'max' in m)).toBe(false);
  });
  it('mantiene identificador importado, folio -0 y SKU persistido', () => {
    const { data, context } = impLabelData(source);
    expect([data.muestraId, data.numeroRollo, data.skuSap, data.maquinaCodigo]).toEqual([
      'c179b799-d4df-4a5e-bedd-c3e645c3080b', '00248-0', 'SSK103132260', 'MP-00',
    ]);
    expect(context).toEqual({ proveedor: 'Continental', analista: null, planta: null, turno: null, captura: null, revision: 2 });
  });
  it('no inventa SKU ni valores ausentes y conserva el cero capturado', () => {
    const { data } = impLabelData({ ...source, sku: null, valores: { a: 0 } });
    expect(data.skuSap).toBe('');
    expect(data.mediciones.map(m => m.valor)).toEqual([null, null, 0, null, null, null]);
  });
  it('conserva los tres dictámenes de importadas', () => {
    expect(['liberada', 'rechazada', 'concesion'].map(estado => impLabelData({ ...source, estado }).data.estatus))
      .toEqual(['LIBERADO', 'NO CONFORME', 'CONCESIÓN']);
  });
});