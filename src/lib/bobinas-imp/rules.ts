import { z } from 'zod';
export const IMP_VARIABLES = [
  { key: 'peso_base', label: 'Peso base' }, { key: 'r457', label: 'R457' },
  { key: 'a', label: 'a*' }, { key: 'b', label: 'b*' },
  { key: 'peso_bobina', label: 'Peso bobina (kg)' }, { key: 'ancho_util', label: 'Ancho útil' },
] as const;
export const IMP_ESTADOS = { liberada: 'Liberado', rechazada: 'No conforme', concesion: 'Concesión' } as const;
export const impValoresSchema = z.object({ peso_base: z.number().finite().nullable().optional(), r457: z.number().finite().nullable().optional(), a: z.number().finite().nullable().optional(), b: z.number().finite().nullable().optional(), peso_bobina: z.number().finite().nullable().optional(), ancho_util: z.number().finite().nullable().optional() }).strict();
export const impFormSchema = z.object({ proveedor_id: z.string().uuid(), producto_id: z.string().uuid(), sku: z.string().trim().max(64), analista: z.string().trim().min(1).max(200), observaciones: z.string().max(2000), turno: z.enum(['1','2','3']), planta_codigo: z.enum(['TLX','IXT']), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), estado: z.enum(['liberada','rechazada','concesion']), valores: impValoresSchema });
export function impFolio(numero: number) { return `${String(numero).padStart(5, '0')}-00`; }
export function impCanEdit(captured: string | null, now = Date.now()) { if (!captured) return false; const t = Date.parse(captured); return Number.isFinite(t) && now >= t && now <= t + 36 * 3600000; }
export function impSkuMismatch(reference: string | null, entered: string) { return Boolean(reference && reference !== entered.trim()); }
export function impSkuQr(sku: string | null) { return sku ?? ''; }
export function impDateLabel(date: string) { const [y, m, d] = date.split('-'); return `${d}/${m}/${y}`; }
