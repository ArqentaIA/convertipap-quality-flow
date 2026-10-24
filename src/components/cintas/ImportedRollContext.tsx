import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { impAsignarSku, impGetCatalogos, type ImpBobina } from '@/lib/bobinas-imp/functions';
import { impCanContinue, IMP_ESTADOS } from '@/lib/bobinas-imp/rules';

export function ImportedRollContext({row,onUpdated,compact=false}:{row:ImpBobina;onUpdated:()=>void;compact?:boolean}) {
 const get=useServerFn(impGetCatalogos);const assign=useServerFn(impAsignarSku);
 const [allowed,setAllowed]=useState(false);const [sku,setSku]=useState('');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setSku('');setReason('');void get().then(c=>{if(active){setAllowed(Boolean(c.permisos.editar));setSku(c.productos.find(p=>p.id===row.producto_id)?.sku_referencia??'');}}).catch(()=>setAllowed(false));return()=>{active=false;};},[row.id,get]);
 async function save(){setBusy(true);try{await assign({data:{id:row.id,sku,revision:row.revision,motivo:reason}});toast.success('SKU asignado con trazabilidad.');onUpdated();}catch(e){toast.error(e instanceof Error?e.message:'No se pudo asignar SKU.');}finally{setBusy(false);}}
 return <section className="space-y-3 border-b border-border py-4">
 {!compact&&<><h2 className="font-semibold">Bobina importada · {row.folio}</h2>
 <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div>Calidad<p className="font-medium">{row.producto_codigo}</p></div><div>Proveedor<p className="font-medium">{row.proveedor_nombre}</p></div><div>SKU SAP<p className="font-medium">{row.sku??'—'}</p></div><div>Estado<p className="font-medium">{IMP_ESTADOS[row.estado as keyof typeof IMP_ESTADOS]}</p></div></div>
 <Button asChild variant="outline"><Link to="/bobinas-madre-imp" search={{bobina:row.id}}>Detalle, etiqueta e historial</Link></Button></>}
 {!impCanContinue(row.sku)&&<div role="alert" className="space-y-3 border border-warning p-3 text-sm"><p className="text-warning">necesita atención Calidad SKU</p>{allowed&&<form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void save();}}><label className="grid gap-1">SKU SAP<Input aria-label="SKU SAP importada" required maxLength={64} value={sku} onChange={e=>setSku(e.target.value)}/></label><label className="grid flex-1 gap-1">Motivo<Input aria-label="Motivo SKU importada" required minLength={10} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={busy} type="submit">{busy?'Guardando…':'Asignar SKU'}</Button></form>}</div>}
 </section>;
}