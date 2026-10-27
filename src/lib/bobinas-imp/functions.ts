import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { readAllReportPages } from '@/lib/report-query-pages';
import { impFormSchema, impNormalizeLookup, impSkuConfirmationSchema } from './rules';
import type { Database } from '@/integrations/supabase/types';
export type ImpBobina = Database['public']['Tables']['imp_bobinas']['Row'];
export type ImpProducto = Database['public']['Tables']['imp_productos']['Row'];
export const impBuscarEdicion = createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator((d)=>z.object({folio:z.string().trim().max(64).optional(),fecha:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),maquina:z.string().max(20).optional(),offset:z.number().int().min(0).max(100000).default(0)}).parse(d))
 .handler(async({data,context})=>{
  const permiso=await context.supabase.rpc('imp_permiso',{_accion:'editar'});
  if(permiso.error)throw new Error(permiso.error.message);
  if(!permiso.data)return {rows:[] as ImpBobina[],hayMas:false};
  if(data.maquina&&data.maquina!=='MP-00')return {rows:[] as ImpBobina[],hayMas:false};
  let q=context.supabase.from('imp_bobinas').select('*').order('numero',{ascending:false}).range(data.offset,data.offset+200);
  if(data.folio){
   if(!/^\d+(?:-00)?$/.test(data.folio))return {rows:[] as ImpBobina[],hayMas:false};
   q=q.eq('numero',Number(data.folio.split('-')[0]));
  }
  if(data.fecha)q=q.eq('fecha',data.fecha);
  const {data:rows,error}=await q;
  if(error)throw new Error(error.message);
  return {rows:(rows??[]).slice(0,200),hayMas:(rows??[]).length>200};
 });
export const impGetCatalogos = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth]).handler(async ({context}) => {
 const permissions = await Promise.all(['leer','capturar','editar','catalogo','importar'].map(async a => { const {data,error}=await context.supabase.rpc('imp_permiso',{_accion:a}); if(error) throw new Error(error.message); return [a,Boolean(data)] as const; }));
 const permisos=Object.fromEntries(permissions);
 if(!permisos.leer) throw new Error('No tiene acceso a Bobinas Madre Imp.');
 const [proveedores,productos,contador]=await Promise.all([
  context.supabase.from('imp_proveedores').select('*').order('nombre'), context.supabase.from('imp_productos').select('*').order('codigo'), context.supabase.from('imp_contador').select('siguiente').eq('id',true).maybeSingle()
 ]);
 for(const r of [proveedores,productos,contador]) if(r.error) throw new Error(r.error.message);
 const alineados=await context.supabase.from('productos').select('id,codigo');if(alineados.error)throw new Error(alineados.error.message);
 const skus=await context.supabase.from('producto_skus_sap').select('producto_id,clave_sku_sap');if(skus.error)throw new Error(skus.error.message);
 const productosConSku=(productos.data??[]).map(p=>{if(p.sku_referencia)return p;const ids=(alineados.data??[]).filter(x=>x.codigo===p.codigo).map(x=>x.id);const candidatos=[...new Set((skus.data??[]).filter(x=>ids.includes(x.producto_id)).map(x=>x.clave_sku_sap).filter(Boolean))];return {...p,sku_referencia:candidatos.length===1?candidatos[0]??null:null};});
 return {permisos,proveedores:proveedores.data??[],productos:productosConSku,siguiente:contador.data?.siguiente??760};
});
const filters = z.object({desde:z.string().optional(),hasta:z.string().optional(),folio:z.string().trim().max(40).optional(),estado:z.enum(['liberada','rechazada','concesion']).optional()});
export const impListar = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>filters.parse(d)).handler(async({data,context})=> {
 return readAllReportPages<ImpBobina>((from,to)=> { let q=context.supabase.from('imp_bobinas').select('*').order('numero').range(from,to); if(data.desde) q=q.gte('fecha',data.desde); if(data.hasta) q=q.lte('fecha',data.hasta); if(data.folio){ if(!/^\d+(?:-00)?$/.test(data.folio)) throw new Error('Folio inválido.'); q=q.eq('numero',Number(data.folio.split('-')[0])); } if(data.estado) q=q.eq('estado',data.estado); return q; });
});
export const impDetalle = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>z.object({id:z.string().uuid()}).parse(d)).handler(async({data,context})=> {
 const {data:row,error}=await context.supabase.from('imp_bobinas').select('*').eq('id',data.id).single(); if(error) throw new Error('No se pudo consultar la bobina.');
 const eventos=await readAllReportPages((from,to)=>context.supabase.from('imp_eventos').select('*').eq('bobina_id',data.id).order('created_at').order('id').range(from,to));
 return {row,eventos};
});
export const impGuardar = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>z.object({id:z.string().uuid(),datos:impFormSchema,revision:z.number().int().nullable(),motivo:z.string().max(2000).nullable()}).parse(d)).handler(async({data,context})=> {
 const {data:id,error}=await context.supabase.rpc('imp_guardar',{_id:data.id,_datos:data.datos,_revision:data.revision as unknown as number,_motivo:data.motivo as unknown as string}); if(error) throw new Error(error.message); return id;
});
export const impCatalogoGuardar = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>z.object({tipo:z.enum(['proveedor','producto']),nombre:z.string().trim().min(2).max(64),sku:z.string().trim().max(64).nullable(),id:z.string().uuid().nullable(),revision:z.number().int().nullable()}).parse(d)).handler(async({data,context})=> {
 const {data:id,error}=await context.supabase.rpc('imp_catalogo_guardar',{_tipo:data.tipo,_nombre:data.nombre,_sku:data.sku as unknown as string,_id:data.id as unknown as string,_revision:data.revision as unknown as number}); if(error) throw new Error(error.message); return id;
});
export const impImportar = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>z.object({sha:z.string().regex(/^[a-f0-9]{64}$/),filas:z.array(z.record(z.string(),z.unknown())).length(759),excepciones:z.array(z.record(z.string(),z.unknown()))}).parse(d)).handler(async({data,context})=> {
 const {data:n,error}=await context.supabase.rpc('imp_importar_excel',{_sha:data.sha,_filas:data.filas as Database['public']['Functions']['imp_importar_excel']['Args']['_filas'],_excepciones:data.excepciones as Database['public']['Functions']['imp_importar_excel']['Args']['_excepciones']}); if(error) throw new Error(error.message); return n;
});
export const impBuscarFolio=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>z.object({folio:z.string().trim().max(64)}).parse(d)).handler(async({data,context})=>{
 const folio=impNormalizeLookup(data.folio); if(!folio)return null;
 const {data:row,error}=await context.supabase.from('imp_bobinas').select('*').eq('folio',folio).maybeSingle(); if(error)throw new Error(error.message); return row;
});
export const impAsignarSku=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>z.object({id:z.string().uuid(),sku:z.string().trim().min(1).max(64),revision:z.number().int(),motivo:z.string().trim().min(10).max(2000)}).parse(d)).handler(async({data,context})=>{
 const {data:id,error}=await context.supabase.rpc('imp_asignar_sku',{_id:data.id,_sku:data.sku,_revision:data.revision,_motivo:data.motivo});if(error)throw new Error(error.message);return id;
});
export const impSkuPendientes=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>z.object({producto_id:z.string().uuid()}).parse(d)).handler(async({data,context})=>{
 const {data:result,error}=await context.supabase.rpc('imp_sku_pendientes',{_producto_id:data.producto_id});if(error)throw new Error(error.message);return z.object({cantidad:z.number().int().min(0),esperado:z.string()}).parse(result);
});
export const impSkuConfirmar=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d)=>impSkuConfirmationSchema.parse(d)).handler(async({data,context})=>{
 const {data:count,error}=await context.supabase.rpc('imp_sku_confirmado',{_producto_id:data.producto_id,_sku:data.sku,_esperado:data.esperado,_motivo:data.motivo,_bobina_id:data.bobina_id,_revision:data.revision,_codigo:data.codigo,_catalogo_revision:data.catalogo_revision});if(error)throw new Error(error.message);return count;
});
