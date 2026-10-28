import type { ImpBobina } from './functions';
import { IMP_VARIABLES, impDateLabel, impSkuQr } from './rules';
import { fechaHoraMX } from '@/lib/format';

/** Only persisted imported fields; never fabricate manufacturing identifiers or limits. */
export type ImpLabelSnapshot = Pick<ImpBobina, 'id' | 'folio' | 'maquina' | 'fecha' | 'producto_codigo' | 'proveedor_nombre' | 'sku' | 'estado' | 'revision' | 'valores' | 'observaciones' | 'analista' | 'planta_codigo' | 'turno' | 'capturado_at'>;
export function impLabelData(row: ImpLabelSnapshot) {
  const values = row.valores as Record<string, number | null>;
  const estatus = row.estado === 'rechazada' ? 'NO CONFORME' as const
    : row.estado === 'concesion' ? 'CONCESIÓN' as const : 'LIBERADO' as const;
  return {
    data: {
      muestraId: row.id, folio: row.folio ?? '', numeroRollo: row.folio ?? '',
      fecha: impDateLabel(row.fecha), maquinaCodigo: row.maquina, maquinaNombre: row.maquina,
      productoCodigo: row.producto_codigo, productoNombre: row.producto_codigo,
      skuSap: impSkuQr(row.sku), observacionesGenerales: row.observaciones ?? '', estatus,
      mediciones: IMP_VARIABLES.map(v => ({
        clave: v.key, etiqueta: v.key === 'peso_bobina' ? 'Peso bobina' : v.label, valor: values[v.key] ?? null,
        unidad: v.key === 'peso_bobina' ? 'kg' : '',
      })),
    },
    context: {
      proveedor: row.proveedor_nombre, analista: row.analista, planta: row.planta_codigo,
      turno: row.turno, captura: row.capturado_at ? fechaHoraMX(row.capturado_at) : null,
      revision: row.revision,
    },
  };
}